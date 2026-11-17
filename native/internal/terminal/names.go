package terminal

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"strings"

	"github.com/Duye0120/Chela/native/internal/storage"
)

func (t *Terminal) Rename(id, name string) error {
	name = strings.TrimSpace(name)
	if name == "" || len(name) > 240 || strings.ContainsAny(name, "\r\n\x00") {
		return errors.New("名称需为不超过 80 个汉字的单行文字")
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	if err := t.initialize(); err != nil {
		return err
	}
	var taskID string
	found := false
	for _, s := range t.sessions {
		if s.info.ID == id {
			taskID = s.info.TaskID
			found = true
			break
		}
	}
	if !found {
		return errors.New("终端会话已不存在")
	}
	key := "terminal:" + id
	if taskID != "" {
		key = "task:" + taskID
	}
	assistant, err := t.store.Identity()
	if err != nil {
		return err
	}
	value, _ := json.Marshal(name)
	err = t.store.Update(context.Background(), func(tx *sql.Tx) error {
		_, err := tx.Exec(`INSERT INTO preferences(assistant_id,scope_type,scope_id,preference_key,revision,value_json,updated_at) VALUES(?,'assistant',?,?,1,?,?) ON CONFLICT(assistant_id,scope_type,scope_id,preference_key) DO UPDATE SET revision=preferences.revision+1,value_json=excluded.value_json,updated_at=excluded.updated_at`, assistant, assistant, "terminal.name."+key, string(value), storage.Now())
		return err
	})
	if err != nil {
		return err
	}
	for _, s := range t.sessions {
		if s.info.ID == id || taskID != "" && s.info.TaskID == taskID {
			s.mu.Lock()
			s.info.Name = name
			s.mu.Unlock()
		}
	}
	return nil
}
