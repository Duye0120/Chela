package chat

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"github.com/Duye0120/Chela/native/internal/desktop"
	"github.com/Duye0120/Chela/native/internal/storage"
	"net/url"
	"os"
	"path/filepath"
)

func (c *Chat) ChooseProject(ctx context.Context, id string) (ChatSession, error) {
	paths, err := desktop.ChooseDirectory("选择对话项目")
	if err != nil {
		return ChatSession{}, err
	}
	if len(paths) == 0 {
		c.mu.Lock()
		defer c.mu.Unlock()
		return c.find(id)
	}
	path := paths[0]
	if !filepath.IsAbs(path) {
		return ChatSession{}, errors.New("请选择本机目录")
	}
	return c.update(id, func(s *ChatSession) { s.Project = path; s.Group = filepath.Base(path) })
}

func (c *Chat) DefaultDirectory() (string, error) {
	db, err := c.store.DB()
	if err != nil {
		return "", err
	}
	assistant, err := c.store.Identity()
	if err != nil {
		return "", err
	}
	var raw, value string
	err = db.QueryRow("SELECT value_json FROM preferences WHERE assistant_id=? AND scope_type='assistant' AND scope_id=? AND preference_key='workspace.defaultDirectory'", assistant, assistant).Scan(&raw)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	if err = json.Unmarshal([]byte(raw), &value); err != nil {
		return "", err
	}
	return value, nil
}

func (c *Chat) SelectProject(id, path string) (ChatSession, error) {
	if path != "" {
		if !filepath.IsAbs(path) {
			return ChatSession{}, errors.New("请选择本机绝对目录")
		}
		info, err := os.Stat(path)
		if err != nil || !info.IsDir() {
			return ChatSession{}, errors.New("项目目录不存在")
		}
		path = filepath.Clean(path)
	}
	return c.update(id, func(s *ChatSession) {
		s.Project = path
		if path == "" {
			s.Group = ""
		} else {
			s.Group = filepath.Base(path)
		}
	})
}
func (c *Chat) SetDefaultDirectory(path string) error {
	if path != "" {
		if !filepath.IsAbs(path) {
			return errors.New("默认工作目录必须是绝对路径")
		}
		path = filepath.Clean(path)
		info, err := os.Stat(path)
		if err != nil || !info.IsDir() {
			return errors.New("默认工作目录不存在或不是文件夹")
		}
	}
	assistant, err := c.store.Identity()
	if err != nil {
		return err
	}
	raw, _ := json.Marshal(path)
	return c.store.Update(context.Background(), func(tx *sql.Tx) error {
		_, err := tx.Exec(`INSERT INTO preferences(assistant_id,scope_type,scope_id,preference_key,revision,value_json,updated_at) VALUES(?,'assistant',?,'workspace.defaultDirectory',1,?,?) ON CONFLICT(assistant_id,scope_type,scope_id,preference_key) DO UPDATE SET revision=preferences.revision+1,value_json=excluded.value_json,updated_at=excluded.updated_at`, assistant, assistant, string(raw), storage.Now())
		return err
	})
}
func (c *Chat) ChooseDefaultDirectory(ctx context.Context) (string, error) {
	paths, err := desktop.ChooseDirectory("选择默认工作目录")
	if err != nil {
		return "", err
	}
	if len(paths) == 0 {
		return c.DefaultDirectory()
	}
	if err = c.SetDefaultDirectory(paths[0]); err != nil {
		return "", err
	}
	return paths[0], nil
}
func (c *Chat) OpenEditor(id, editor string) error {
	if editor == "system" {
		return c.OpenProject(id)
	}
	if editor != "vscode" && editor != "cursor" && editor != "windsurf" {
		return errors.New("不支持的编辑器")
	}
	dir, err := c.projectDirectory(id)
	if err != nil {
		return err
	}
	if info, err := os.Stat(dir); err != nil || !info.IsDir() {
		return errors.New("项目目录不可用")
	}
	target := url.URL{Scheme: editor, Host: "file", Path: "/" + filepath.ToSlash(dir)}
	return desktop.OpenExternal(target.String())
}
func (c *Chat) OpenProject(id string) error {
	c.mu.Lock()
	session, err := c.find(id)
	c.mu.Unlock()
	if err != nil {
		return err
	}
	dir := session.Project
	if dir == "" {
		return errors.New("尚未选择项目")
	}
	info, err := os.Stat(dir)
	if err != nil {
		return err
	}
	if !info.IsDir() {
		return errors.New("项目目录已不存在")
	}
	return desktop.OpenPath(dir)
}
