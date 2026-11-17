package git

import (
	"bytes"
	"context"
	"errors"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
)

type File struct {
	Path    string `json:"path"`
	OldPath string `json:"oldPath,omitempty"`
	Status  string `json:"status"`
}
type Repository struct {
	Path   string `json:"path"`
	Name   string `json:"name"`
	Branch string `json:"branch"`
	Files  []File `json:"files"`
}
type Patch struct {
	Text   string `json:"text"`
	Binary bool   `json:"binary"`
}

var configureProcess = func(*exec.Cmd) {}

type output struct {
	bytes.Buffer
	overflow bool
}

func (w *output) Write(p []byte) (int, error) {
	n := len(p)
	remaining := 1024*1024 - w.Len()
	if n > remaining {
		w.overflow = true
	}
	if remaining > 0 {
		w.Buffer.Write(p[:min(n, remaining)])
	}
	return n, nil
}
func command(dir string, args ...string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	prefix := []string{"--no-pager", "--literal-pathspecs", "-c", "core.fsmonitor=false", "-c", "core.untrackedCache=false", "-c", "core.hooksPath=" + os.DevNull, "-C", dir}
	if len(args) > 0 && (args[0] == "status" || args[0] == "diff" || args[0] == "restore" || args[0] == "rm") {
		keys, err := command(dir, "config", "--null", "--name-only", "--list")
		if err != nil {
			return "", err
		}
		for _, key := range strings.Split(keys, "\x00") {
			lower := strings.ToLower(key)
			if !strings.HasPrefix(lower, "filter.") {
				continue
			}
			for _, suffix := range []string{".clean", ".smudge", ".process", ".required"} {
				if strings.HasSuffix(lower, suffix) {
					value := ""
					if suffix == ".required" {
						value = "false"
					}
					prefix = append(prefix, "-c", key+"="+value)
					break
				}
			}
		}
	}
	argv := append(prefix, args...)
	cmd := exec.CommandContext(ctx, "git", argv...)
	configureProcess(cmd)
	cmd.Env = append(os.Environ(), "GIT_OPTIONAL_LOCKS=0")
	var stdout, stderr output
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		if ctx.Err() != nil {
			return "", errors.New("Git 读取超时，请缩小扫描范围")
		}
		return "", errors.New("Git 读取失败：" + stderr.String())
	}
	if stdout.overflow {
		return "", errors.New("Git 结果超过 1 MiB，请在编辑器中查看")
	}
	return stdout.String(), nil
}
func inside(root, target string) (string, error) {
	base, err := filepath.EvalSymlinks(root)
	if err != nil {
		return "", err
	}
	real, err := filepath.EvalSymlinks(target)
	if err != nil {
		return "", err
	}
	rel, err := filepath.Rel(base, real)
	if err != nil || !filepath.IsLocal(rel) {
		return "", errors.New("仓库必须位于当前项目目录内")
	}
	return real, nil
}
func validateRepository(root, repo string) (string, error) {
	if !filepath.IsAbs(root) || !filepath.IsAbs(repo) {
		return "", errors.New("请先选择项目目录")
	}
	real, err := inside(root, repo)
	if err != nil {
		return "", err
	}
	top, err := command(real, "rev-parse", "--show-toplevel")
	if err != nil {
		return "", err
	}
	a, e1 := os.Stat(real)
	b, e2 := os.Stat(strings.TrimSpace(top))
	if e1 != nil || e2 != nil || !os.SameFile(a, b) {
		return "", errors.New("请选择实际的 Git 仓库根目录")
	}
	return real, nil
}
func files(repo string) ([]File, error) {
	raw, err := command(repo, "status", "--porcelain=v1", "-z", "--untracked-files=all")
	if err != nil {
		return nil, err
	}
	parts := strings.Split(raw, "\x00")
	result := []File{}
	for i := 0; i < len(parts); i++ {
		part := parts[i]
		if part == "" {
			continue
		}
		if len(part) < 4 {
			return nil, errors.New("Git 状态格式无效")
		}
		f := File{Path: part[3:], Status: part[:2]}
		if strings.ContainsAny(f.Status, "RC") {
			i++
			if i >= len(parts) || parts[i] == "" {
				return nil, errors.New("Git 重命名记录不完整")
			}
			f.OldPath = parts[i]
		}
		result = append(result, f)
	}
	return result, nil
}
func List(root string, depth int) ([]Repository, error) {
	if !filepath.IsAbs(root) || depth < 0 || depth > 4 {
		return nil, errors.New("请选择项目目录，探测深度应为 0 至 4")
	}
	root, err := filepath.EvalSymlinks(root)
	if err != nil {
		return nil, err
	}
	paths := []string{}
	visited := 0
	var walk func(string, int) error
	walk = func(dir string, left int) error {
		visited++
		if visited > 4000 {
			return errors.New("目录过多，请缩小探测深度或项目范围")
		}
		if _, e := os.Stat(filepath.Join(dir, ".git")); e == nil {
			paths = append(paths, dir)
			if len(paths) > 32 {
				return errors.New("仓库超过 32 个，请缩小项目范围")
			}
		}
		if left == 0 {
			return nil
		}
		entries, e := os.ReadDir(dir)
		if e != nil {
			return e
		}
		for _, entry := range entries {
			if !entry.IsDir() || entry.Type()&os.ModeSymlink != 0 {
				continue
			}
			switch entry.Name() {
			case ".git", "node_modules", ".pnpm", ".cache", "vendor", "dist", "build", "bin", "output", "history":
				continue
			}
			if err := walk(filepath.Join(dir, entry.Name()), left-1); err != nil {
				return err
			}
		}
		return nil
	}
	if err = walk(root, depth); err != nil {
		return nil, err
	}
	result := []Repository{}
	for _, repo := range paths {
		if _, err := validateRepository(root, repo); err != nil {
			return nil, err
		}
		items, err := files(repo)
		if err != nil {
			return nil, err
		}
		branch, err := command(repo, "symbolic-ref", "--quiet", "--short", "HEAD")
		if err != nil {
			branch, _ = command(repo, "rev-parse", "--short", "HEAD")
		}
		if branch == "" {
			branch = "未提交"
		}
		result = append(result, Repository{Path: repo, Name: filepath.Base(repo), Branch: strings.TrimSpace(branch), Files: items})
	}
	return result, nil
}
func Diff(root, repo, path string) (Patch, error) {
	repo, err := validateRepository(root, repo)
	if err != nil {
		return Patch{}, err
	}
	if !filepath.IsLocal(path) {
		return Patch{}, errors.New("文件必须位于当前仓库内")
	}
	items, err := files(repo)
	if err != nil {
		return Patch{}, err
	}
	var file *File
	for i := range items {
		if items[i].Path == path {
			file = &items[i]
			break
		}
	}
	if file == nil {
		return Patch{}, errors.New("文件已无未提交变更，请刷新列表")
	}
	_, headErr := command(repo, "rev-parse", "--verify", "HEAD")
	if file.Status == "??" || headErr != nil {
		return newFilePatch(repo, path)
	}
	args := []string{"diff", "--no-ext-diff", "--no-textconv", "HEAD", "--", path}
	if file.OldPath != "" {
		args = append(args, file.OldPath)
	}
	text, err := command(repo, args...)
	if err != nil {
		return Patch{}, err
	}
	return Patch{Text: text, Binary: strings.Contains(text, "Binary files ")}, nil
}
func newFilePatch(repo, path string) (Patch, error) {
	target, err := inside(repo, filepath.Join(repo, path))
	if os.IsNotExist(err) {
		return Patch{}, nil
	}
	if err != nil {
		return Patch{}, err
	}
	f, err := os.Open(target)
	if err != nil {
		return Patch{}, err
	}
	defer f.Close()
	data, err := io.ReadAll(io.LimitReader(f, 1024*1024+1))
	if err != nil {
		return Patch{}, err
	}
	if len(data) > 1024*1024 {
		return Patch{}, errors.New("文件超过 1 MiB，请在编辑器中查看")
	}
	if !utf8.Valid(data) || bytes.ContainsRune(data, 0) {
		return Patch{Binary: true}, nil
	}
	text := "new file mode 100644\n--- /dev/null\n+++ b/" + path + "\n"
	if len(data) > 0 {
		lines := strings.Split(strings.TrimSuffix(string(data), "\n"), "\n")
		text += "@@ -0,0 +1," + strconv.Itoa(len(lines)) + " @@\n+" + strings.Join(lines, "\n+") + "\n"
		if data[len(data)-1] != '\n' {
			text += "\\ No newline at end of file\n"
		}
	}
	return Patch{Text: text}, nil
}
