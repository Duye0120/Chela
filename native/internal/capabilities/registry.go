package capabilities

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"github.com/Duye0120/Chela/native/internal/storage"
)

type Resources struct {
	Extensions []string `json:"extensions"`
	Skills     []string `json:"skills"`
	Prompts    []string `json:"prompts"`
}
type Manifest struct {
	ID            string    `json:"id"`
	Name          string    `json:"name"`
	Version       string    `json:"version"`
	Hash          string    `json:"hash"`
	Root          string    `json:"root"`
	Source        string    `json:"source"`
	Project       string    `json:"project"`
	Namespace     string    `json:"namespace"`
	Compatibility string    `json:"compatibility"`
	Trust         string    `json:"trust"`
	Permissions   []string  `json:"permissions"`
	Requires      []string  `json:"requires"`
	Resources     Resources `json:"resources"`
	Enabled       bool      `json:"enabled"`
	Health        string    `json:"health"`
	Problem       string    `json:"problem"`
}
type Registry struct {
	Store   *storage.Store
	Profile string
}

var identifier = regexp.MustCompile(`^[a-z][a-z0-9_-]{0,63}$`)

func (r Registry) List() ([]Manifest, error) {
	db, err := r.Store.DB()
	if err != nil {
		return nil, err
	}
	rows, err := db.Query("SELECT manifest_json,enabled,health FROM capability_installations ORDER BY capability_id")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []Manifest{}
	for rows.Next() {
		var m Manifest
		var raw string
		var enabled bool
		var health string
		if err = rows.Scan(&raw, &enabled, &health); err != nil {
			return nil, err
		}
		if err = json.Unmarshal([]byte(raw), &m); err != nil {
			return nil, err
		}
		m.Enabled, m.Health = enabled, health
		result = append(result, m)
	}
	return result, rows.Err()
}

// Package data is copied once; a running worker never imports mutable source files.
func (r Registry) Install(source, project string) (Manifest, error) {
	var m Manifest
	source, err := filepath.Abs(source)
	if err != nil {
		return m, err
	}
	files, hash, err := packageFiles(source)
	if err != nil {
		return m, err
	}
	var pkg struct {
		Name         string
		Version      string
		Dependencies map[string]any
		Pi           Resources
		Chela        struct {
			ID            string
			Compatibility string
			Permissions   []string
			Requires      []string
		}
	}
	if err = json.Unmarshal(files["package.json"], &pkg); err != nil {
		return m, errors.New("扩展目录需要有效的 package.json 和 pi 资源清单")
	}
	if len(pkg.Dependencies) > 0 {
		return m, errors.New("请先将扩展的额外依赖打包；宿主提供 Pi SDK，不安装另一份 Pi 或在线安装依赖")
	}
	id := pkg.Chela.ID
	if id == "" {
		id = pkg.Name
	}
	if !identifier.MatchString(id) || pkg.Version == "" {
		return m, errors.New("chela.id 需为小写字母开头的稳定标识，package.version 不能为空")
	}
	if len(pkg.Pi.Extensions)+len(pkg.Pi.Skills)+len(pkg.Pi.Prompts) == 0 {
		return m, errors.New("pi 资源清单为空")
	}
	if project != "" {
		project, err = filepath.Abs(project)
		if err != nil {
			return m, err
		}
		info, e := os.Stat(project)
		if e != nil || !info.IsDir() {
			return m, errors.New("项目目录不存在")
		}
	}
	level := pkg.Chela.Compatibility
	if level == "" {
		level = "A"
		if len(pkg.Pi.Extensions) > 0 {
			level = "B"
		}
	}
	if !strings.Contains("ABCDE", level) || len(level) != 1 {
		return m, errors.New("兼容等级必须为 A–E")
	}
	if level == "A" && len(pkg.Pi.Extensions) > 0 {
		return m, errors.New("A 级只包含说明资源；执行扩展至少为 B 级")
	}
	for _, paths := range [][]string{pkg.Pi.Extensions, pkg.Pi.Skills, pkg.Pi.Prompts} {
		for _, p := range paths {
			if !filepath.IsLocal(p) || strings.ContainsAny(p, "*?[]") {
				return m, fmt.Errorf("资源路径必须为包内明确的相对路径: %s", p)
			}
			prefix := filepath.ToSlash(filepath.Clean(p))
			found := false
			for f := range files {
				if f == prefix || strings.HasPrefix(f, prefix+"/") {
					found = true
					break
				}
			}
			if !found {
				return m, fmt.Errorf("缺少声明资源: %s", p)
			}
		}
	}
	items, err := r.List()
	if err != nil {
		return m, err
	}
	for _, old := range items {
		if old.ID == id {
			return m, errors.New("扩展 ID 已安装；请停用并移除旧登记后重新安装，原版本文件会保留")
		}
	}
	destination := filepath.Join(r.Profile, "capabilities", id, hash)
	if err = os.MkdirAll(destination, 0700); err != nil {
		return m, err
	}
	for path, data := range files {
		target := filepath.Join(destination, filepath.FromSlash(path))
		if err = os.MkdirAll(filepath.Dir(target), 0700); err != nil {
			return m, err
		}
		if err = os.WriteFile(target, data, 0600); err != nil {
			return m, err
		}
	}
	m = Manifest{ID: id, Name: pkg.Name, Version: pkg.Version, Hash: hash, Root: destination, Source: source, Project: project, Namespace: id, Compatibility: level, Trust: "trusted-native", Permissions: pkg.Chela.Permissions, Requires: pkg.Chela.Requires, Resources: pkg.Pi, Health: "disabled"}
	if len(pkg.Pi.Extensions) == 0 {
		m.Trust = "managed"
	}
	if level == "D" || level == "E" {
		m.Health = "unsupported"
		m.Problem = "该等级需要单独适配，不能在 WebView 中直接启用"
	}
	if err = validateGraph(append(items, m), false); err != nil {
		return Manifest{}, err
	}
	raw, _ := json.Marshal(m)
	err = r.Store.Update(context.Background(), func(tx *sql.Tx) error {
		_, err := tx.Exec("INSERT INTO capability_installations VALUES(?,?,?,?,?,?,?,?)", m.ID, m.Version, m.Hash, m.Trust, string(raw), 0, m.Health, storage.Now())
		return err
	})
	return m, err
}

func packageFiles(root string) (map[string][]byte, string, error) {
	files := map[string][]byte{}
	var size int64
	err := filepath.WalkDir(root, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.Type()&os.ModeSymlink != 0 {
			return errors.New("扩展包不能包含符号链接")
		}
		if entry.IsDir() {
			if path != root && (entry.Name() == ".git" || entry.Name() == "node_modules") {
				return filepath.SkipDir
			}
			return nil
		}
		if !entry.Type().IsRegular() {
			return errors.New("扩展包含不支持的文件类型")
		}
		info, err := entry.Info()
		if err != nil {
			return err
		}
		size += info.Size()
		if size > 16*1024*1024 || len(files) >= 1000 {
			return errors.New("扩展包超过 16 MiB 或 1000 个文件")
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		relative, err := filepath.Rel(root, path)
		if err != nil {
			return err
		}
		files[filepath.ToSlash(relative)] = data
		return nil
	})
	if err != nil {
		return nil, "", err
	}
	keys := make([]string, 0, len(files))
	for k := range files {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	var identity strings.Builder
	for _, k := range keys {
		fmt.Fprintf(&identity, "%s\x00%s\n", k, storage.Hash(files[k]))
	}
	return files, storage.Hash([]byte(identity.String())), nil
}

func validateGraph(items []Manifest, enabledOnly bool) error {
	byID := map[string]Manifest{}
	for _, m := range items {
		byID[m.ID] = m
	}
	seen := map[string]int{}
	var visit func(string) error
	visit = func(id string) error {
		if seen[id] == 1 {
			return errors.New("扩展依赖存在循环")
		}
		if seen[id] == 2 {
			return nil
		}
		m, ok := byID[id]
		if !ok {
			return fmt.Errorf("缺少依赖: %s", id)
		}
		if enabledOnly && !m.Enabled {
			return fmt.Errorf("依赖尚未启用: %s", id)
		}
		seen[id] = 1
		for _, dep := range m.Requires {
			if err := visit(dep); err != nil {
				return err
			}
			if byID[dep].Project != "" && !strings.EqualFold(byID[dep].Project, m.Project) {
				return errors.New("依赖的项目作用域不匹配")
			}
		}
		seen[id] = 2
		return nil
	}
	for _, m := range items {
		if !enabledOnly || m.Enabled {
			if err := visit(m.ID); err != nil {
				return err
			}
		}
	}
	return nil
}

func (r Registry) Change(id, action string) error {
	items, err := r.List()
	if err != nil {
		return err
	}
	index := -1
	for i := range items {
		if items[i].ID == id {
			index = i
		}
	}
	if index < 0 {
		return errors.New("扩展不存在")
	}
	m := &items[index]
	switch action {
	case "enable", "reload":
		if m.Compatibility == "D" || m.Compatibility == "E" {
			return errors.New(m.Problem)
		}
		_, hash, err := packageFiles(m.Root)
		if err != nil {
			return err
		}
		if hash != m.Hash {
			return errors.New("安装内容校验失败，请重新安装")
		}
		m.Enabled = true
		m.Health = "ready"
		m.Problem = ""
	case "disable":
		m.Enabled = false
		m.Health = "disabled"
	case "remove":
		if m.Enabled {
			return errors.New("请先停用扩展")
		}
		for _, other := range items {
			for _, dep := range other.Requires {
				if dep == id {
					return fmt.Errorf("%s 仍依赖此扩展", other.ID)
				}
			}
		}
	default:
		return errors.New("不支持的扩展操作")
	}
	if err = validateGraph(items, true); err != nil {
		return err
	}
	raw, _ := json.Marshal(m)
	return r.Store.Update(context.Background(), func(tx *sql.Tx) error {
		if action == "remove" {
			_, err := tx.Exec("DELETE FROM capability_installations WHERE capability_id=?", id)
			return err
		}
		_, err := tx.Exec("UPDATE capability_installations SET enabled=?,health=?,manifest_json=? WHERE capability_id=?", m.Enabled, m.Health, string(raw), id)
		return err
	})
}

func (r Registry) Snapshot(project string) ([]Manifest, error) {
	items, err := r.List()
	if err != nil {
		return nil, err
	}
	result := []Manifest{}
	for _, m := range items {
		if !m.Enabled || m.Health == "failed" || (m.Project != "" && !strings.EqualFold(m.Project, project)) {
			continue
		}
		_, hash, err := packageFiles(m.Root)
		if err != nil || hash != m.Hash {
			_ = r.Report(m.ID, "failed", "安装内容校验失败；本轮未加载")
			continue
		}
		result = append(result, m)
	}
	byID := map[string]Manifest{}
	for _, m := range result {
		byID[m.ID] = m
	}
	ordered := []Manifest{}
	visited := map[string]bool{}
	var visit func(string) bool
	visit = func(id string) bool {
		if visited[id] {
			_, ok := byID[id]
			return ok
		}
		visited[id] = true
		m, ok := byID[id]
		if !ok {
			return false
		}
		for _, dependency := range m.Requires {
			if !visit(dependency) {
				delete(byID, id)
				_ = r.Report(id, "failed", "依赖未加载: "+dependency)
				return false
			}
		}
		ordered = append(ordered, m)
		return true
	}
	for _, m := range result {
		visit(m.ID)
	}
	return ordered, nil
}
func (r Registry) Report(id, health, problem string) error {
	return r.Store.Update(context.Background(), func(tx *sql.Tx) error {
		_, err := tx.Exec("UPDATE capability_installations SET health=?,manifest_json=json_set(manifest_json,'$.problem',?) WHERE capability_id=?", health, problem, id)
		return err
	})
}
