package chat

import (
	"context"
	"errors"
	"github.com/egoist/mygo"
	"os"
	"path/filepath"
)

func (c *Chat) ChooseProject(ctx context.Context, id string) (ChatSession, error) {
	paths, err := mygo.Dialog.Open(mygo.OpenDialogOptions{Parent: mygo.CallerWindow(ctx), Title: "选择对话项目", Directory: true})
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
	return mygo.Shell.OpenPath(dir)
}
