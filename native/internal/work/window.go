package work

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"github.com/Duye0120/Chela/native/internal/desktop"
	"github.com/Duye0120/Chela/native/internal/storage"
)

func (w *Work) WindowCloseMode() (string, error) {
	db, err := w.store.DB()
	if err != nil {
		return "tray", err
	}
	assistant, err := w.store.Identity()
	if err != nil {
		return "tray", err
	}
	var raw, mode string
	err = db.QueryRow("SELECT value_json FROM preferences WHERE assistant_id=? AND scope_type='assistant' AND scope_id=? AND preference_key='window.closeMode'", assistant, assistant).Scan(&raw)
	if errors.Is(err, sql.ErrNoRows) {
		return "tray", nil
	}
	if err != nil {
		return "tray", err
	}
	if json.Unmarshal([]byte(raw), &mode) != nil || mode != "tray" && mode != "minimize" && mode != "quit" {
		return "tray", errors.New("窗口关闭设置无效")
	}
	return mode, nil
}
func (w *Work) SetWindowCloseMode(mode string) error {
	if mode != "tray" && mode != "minimize" && mode != "quit" {
		return errors.New("不支持的窗口关闭方式")
	}
	assistant, err := w.store.Identity()
	if err != nil {
		return err
	}
	value, _ := json.Marshal(mode)
	return w.store.Update(context.Background(), func(tx *sql.Tx) error {
		_, err := tx.Exec(`INSERT INTO preferences(assistant_id,scope_type,scope_id,preference_key,revision,value_json,updated_at) VALUES(?,'assistant',?,'window.closeMode',1,?,?) ON CONFLICT(assistant_id,scope_type,scope_id,preference_key) DO UPDATE SET revision=preferences.revision+1,value_json=excluded.value_json,updated_at=excluded.updated_at`, assistant, assistant, string(value), storage.Now())
		return err
	})
}
func (w *Work) Quit() error { return desktop.Invoke("App.Quit", nil) }
