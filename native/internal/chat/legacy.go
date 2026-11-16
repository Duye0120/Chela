package chat

import (
	"bufio"
	"encoding/json"
	"errors"
	"io"
	"os"
	"path/filepath"
	"slices"
	"strings"
)

// Materialize the old message events on first desktop use; the original transcript stays intact.
func (c *Chat) legacySessions() ([]ChatSession, error) {
	rows := []ChatSession{}
	if filepath.Clean(c.profile) != filepath.Clean(c.config) {
		return rows, nil
	}
	root := filepath.Join(c.config, "data", "sessions")
	dirs, err := os.ReadDir(root)
	if errors.Is(err, os.ErrNotExist) {
		return rows, nil
	}
	if err != nil {
		return nil, err
	}
	for _, d := range dirs {
		if !d.IsDir() {
			continue
		}
		var meta struct {
			ChatSession
			LastModelEntryID string
			GroupID          string
		}
		if err := readOptional(filepath.Join(root, d.Name(), "session.json"), &meta); err != nil {
			return nil, err
		}
		if meta.ID == "" {
			continue
		}
		s := meta.ChatSession
		s.ModelID = meta.LastModelEntryID
		s.Group = meta.GroupID
		s.Messages = []ChatMessage{}
		f, err := os.Open(filepath.Join(root, d.Name(), "transcript.jsonl"))
		if err != nil && !errors.Is(err, os.ErrNotExist) {
			return nil, err
		}
		if f != nil {
			// Like the original transcript reader, recover valid events after a damaged line.
			reader := bufio.NewReader(f)
			for {
				line, readErr := reader.ReadBytes('\n')
				var ev struct {
					Type    string
					Message struct{ ID, Content, Timestamp string }
				}
				if json.Unmarshal(line, &ev) == nil && (ev.Type == "user_message" || ev.Type == "assistant_message") {
					s.Messages = append(s.Messages, ChatMessage{ID: ev.Message.ID, Role: strings.TrimSuffix(ev.Type, "_message"), Content: ev.Message.Content, CreatedAt: ev.Message.Timestamp})
				}
				if readErr != nil {
					f.Close()
					if !errors.Is(readErr, io.EOF) {
						return nil, readErr
					}
					break
				}
			}
		}
		rows = append(rows, s)
	}
	slices.SortFunc(rows, func(a, b ChatSession) int { return strings.Compare(b.UpdatedAt, a.UpdatedAt) })
	return rows, nil
}

func (c *Chat) Group(id, name string) (ChatSession, error) {
	name = strings.TrimSpace(name)
	if len([]rune(name)) > 100 {
		return ChatSession{}, errors.New("文件夹名不能超过 100 个字符")
	}
	return c.update(id, func(s *ChatSession) { s.Group = name })
}
