package companion

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"

	"github.com/Duye0120/Chela/native/internal/storage"
)

// The old interaction choice is retained; historical signal counts are not new affect scores.
func ImportProfile(store *storage.Store, profile string) error {
	db, err := store.DB()
	if err != nil {
		return err
	}
	var imported int
	if err = db.QueryRow("SELECT count(*) FROM import_receipts WHERE source='electron-mode-v1'").Scan(&imported); err != nil || imported > 0 {
		return err
	}
	data, err := os.ReadFile(filepath.Join(profile, "data", "emotional-state.json"))
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	var old struct {
		CurrentMode string
		Locked      bool
	}
	if err = json.Unmarshal(data, &old); err != nil {
		return err
	}
	if !map[string]bool{"focused": true, "companion": true, "quiet": true, "encouraging": true, "creative": true}[old.CurrentMode] {
		return errors.New("旧互动模式无效，已保留原文件")
	}
	assistant, err := store.Identity()
	if err != nil {
		return err
	}
	return store.Update(context.Background(), func(tx *sql.Tx) error {
		if err := tx.QueryRow("SELECT count(*) FROM import_receipts WHERE source='electron-mode-v1'").Scan(&imported); err != nil || imported > 0 {
			return err
		}
		settings, err := LoadSettings(tx, assistant)
		if err != nil {
			return err
		}
		if settings.Revision == 0 {
			settings.Mode, settings.ModeLocked = old.CurrentMode, old.Locked
			if _, err = SaveSettings(tx, assistant, settings); err != nil {
				return err
			}
		}
		if _, err = tx.Exec("INSERT INTO legacy_import_map VALUES('electron-mode-v1','current',?,'preferences',?,?)", storage.Hash(data), assistant, storage.Now()); err != nil {
			return err
		}
		_, err = tx.Exec("INSERT INTO import_receipts VALUES('electron-mode-v1',?,1,?)", storage.Hash(data), storage.Now())
		return err
	})
}
