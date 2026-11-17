package chat

import (
	"context"
	"errors"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"unicode/utf8"
)

type ProjectReference struct {
	Path string `json:"path"`
	Name string `json:"name"`
	Kind string `json:"kind"`
}

func (c *Chat) References(ctx context.Context, session, query string) ([]ProjectReference, error) {
	root, err := c.projectDirectory(session)
	if err != nil {
		return []ProjectReference{}, nil
	}
	if len(query) > 100 {
		return nil, errors.New("引用检索词过长")
	}
	result := []ProjectReference{}
	visited := 0
	query = strings.ToLower(query)
	err = filepath.WalkDir(root, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			if path == root {
				return err
			}
			return nil
		}
		if err = ctx.Err(); err != nil {
			return err
		}
		visited++
		if visited > 5000 || len(result) >= 80 {
			return fs.SkipAll
		}
		if path == root {
			return nil
		}
		if entry.Type()&os.ModeSymlink != 0 {
			return nil
		}
		if entry.IsDir() {
			switch entry.Name() {
			case ".git", "node_modules", ".pnpm", ".cache", "vendor", "dist", "build", "bin", "output", "history":
				return fs.SkipDir
			}
		}
		relative, err := filepath.Rel(root, path)
		if err != nil {
			return err
		}
		relative = filepath.ToSlash(relative)
		if strings.Contains(strings.ToLower(relative), query) {
			kind := "file"
			if entry.IsDir() {
				kind = "directory"
			}
			result = append(result, ProjectReference{relative, entry.Name(), kind})
		}
		return nil
	})
	return result, err
}
func (c *Chat) ReferenceContent(session, path string) (string, error) {
	if !filepath.IsLocal(path) || len(path) > 4096 {
		return "", errors.New("引用必须位于当前项目内")
	}
	dir, err := c.projectDirectory(session)
	if err != nil {
		return "", err
	}
	root, err := os.OpenRoot(dir)
	if err != nil {
		return "", err
	}
	defer root.Close()
	file, err := root.Open(path)
	if err != nil {
		return "", err
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil {
		return "", err
	}
	if info.IsDir() {
		entries, err := file.ReadDir(100)
		if err != nil && err != io.EOF {
			return "", err
		}
		lines := []string{"用户引用的目录：" + path}
		for _, entry := range entries {
			name := entry.Name()
			if entry.IsDir() {
				name += "/"
			}
			lines = append(lines, name)
		}
		if len(entries) == 100 {
			lines = append(lines, "（仅列出前 100 项）")
		}
		return strings.Join(lines, "\n"), nil
	}
	if !info.Mode().IsRegular() {
		return "", errors.New("只支持普通文本文件或目录")
	}
	data, err := io.ReadAll(io.LimitReader(file, 128*1024+1))
	if err != nil {
		return "", err
	}
	if len(data) > 128*1024 || !utf8.Valid(data) || strings.ContainsRune(string(data), 0) {
		return "", errors.New("请选择 128 KiB 以内的 UTF-8 文本文件")
	}
	return "用户引用的文件：" + path + "\n" + string(data), nil
}
