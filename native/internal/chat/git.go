package chat

import (
	"encoding/json"
	"errors"
	"github.com/Duye0120/Chela/native/internal/desktop"
	gitread "github.com/Duye0120/Chela/native/internal/git"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

func (c *Chat) projectDirectory(id string) (string, error) {
	c.mu.Lock()
	session, err := c.find(id)
	c.mu.Unlock()
	if err != nil {
		return "", err
	}
	if session.Project == "" {
		return "", errors.New("请先为当前对话选择项目目录")
	}
	return session.Project, nil
}

func (c *Chat) GitRestorePreview(session, repo, raw string) (gitread.RestorePlan, error) {
	root, err := c.projectDirectory(session)
	if err != nil {
		return gitread.RestorePlan{}, err
	}
	paths, err := restorePaths(raw)
	if err != nil {
		return gitread.RestorePlan{}, err
	}
	return gitread.PreviewRestore(root, repo, paths)
}
func restorePaths(raw string) ([]string, error) {
	var paths []string
	if len(raw) > 256*1024 {
		return nil, errors.New("还原范围过大")
	}
	err := json.Unmarshal([]byte(raw), &paths)
	return paths, err
}
func (c *Chat) GitRestore(session, repo, raw, token string) (gitread.RestoreResult, error) {
	root, err := c.projectDirectory(session)
	if err != nil {
		return gitread.RestoreResult{}, err
	}
	paths, err := restorePaths(raw)
	if err != nil {
		return gitread.RestoreResult{}, err
	}
	c.fileMu.Lock()
	defer c.fileMu.Unlock()
	return gitread.Restore(root, repo, paths, token, filepath.Join(c.profile, "git-restore-backups"))
}
func (c *Chat) OpenRestoreBackup(path string) error {
	root := filepath.Join(c.profile, "git-restore-backups")
	relative, err := filepath.Rel(root, path)
	if err != nil || !filepath.IsLocal(relative) || !strings.HasSuffix(relative, ".zip") {
		return errors.New("备份文件不在 Chela 还原目录内")
	}
	info, err := os.Stat(path)
	if err != nil || !info.Mode().IsRegular() {
		return errors.New("备份文件不存在")
	}
	return desktop.OpenPath(path)
}
func (c *Chat) GitRepositories(session, depth string) ([]gitread.Repository, error) {
	root, err := c.projectDirectory(session)
	if err != nil {
		return nil, err
	}
	n, err := strconv.Atoi(depth)
	if err != nil {
		return nil, errors.New("探测深度无效")
	}
	return gitread.List(root, n)
}
func (c *Chat) GitDiff(session, repo, path string) (gitread.Patch, error) {
	root, err := c.projectDirectory(session)
	if err != nil {
		return gitread.Patch{}, err
	}
	return gitread.Diff(root, repo, path)
}
