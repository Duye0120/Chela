package chat

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"

	"github.com/Duye0120/Chela/native/internal/memory"
	"github.com/Duye0120/Chela/native/internal/storage"
)

func (c *Chat) LegacyMemories() ([]memory.LegacyCandidate, error) {
	if err := memory.ImportLegacy(c.store, c.profile); err != nil {
		return nil, err
	}
	db, err := c.store.DB()
	if err != nil {
		return nil, err
	}
	rows, err := db.Query("SELECT candidate_id,COALESCE(content,''),sources_json,state FROM legacy_memory_candidates WHERE state IN ('pending','sensitive') ORDER BY created_at,candidate_id LIMIT 50")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []memory.LegacyCandidate{}
	for rows.Next() {
		var item memory.LegacyCandidate
		var sources string
		if err = rows.Scan(&item.ID, &item.Content, &sources, &item.State); err != nil {
			return nil, err
		}
		item.Sources = json.RawMessage(sources)
		items = append(items, item)
	}
	return items, rows.Err()
}

func (c *Chat) ClassifyLegacyMemory(raw string) error {
	var p struct {
		ID, Session, Scope, Slot, Kind, Content string
		Dismiss                                 bool
	}
	if json.Unmarshal([]byte(raw), &p) != nil || p.ID == "" {
		return errors.New("旧记忆分类请求无效")
	}
	return c.store.Update(context.Background(), func(tx *sql.Tx) error {
		var state, hash string
		if err := tx.QueryRow("SELECT state,content_hash FROM legacy_memory_candidates WHERE candidate_id=?", p.ID).Scan(&state, &hash); err != nil {
			return err
		}
		if state == "accepted" || state == "dismissed" {
			return nil
		}
		if p.Dismiss {
			_, err := tx.Exec("UPDATE legacy_memory_candidates SET state='dismissed',content=NULL WHERE candidate_id=?", p.ID)
			return err
		}
		if state != "pending" {
			return errors.New("此旧记忆不可导入")
		}
		var branch string
		if err := tx.QueryRow("SELECT COALESCE(active_branch_id,session_id||'-main') FROM sessions WHERE session_id=? AND deleted_at IS NULL", p.Session).Scan(&branch); err != nil {
			return err
		}
		messageID := "memory-user-" + p.ID
		message, _ := json.Marshal(ChatMessage{ID: messageID, Role: "user", Content: p.Content, CreatedAt: storage.Now()})
		if _, err := tx.Exec("INSERT INTO messages(message_id,session_id,branch_id,role,content_json,created_at) VALUES(?,?,?,'user',?,?)", messageID, p.Session, branch, string(message), storage.Now()); err != nil {
			return err
		}
		item, err := memory.Publish(tx, memory.Proposal{CommandID: p.ID, SessionID: p.Session, MessageID: messageID, ScopeType: p.Scope, Subject: "user", Slot: p.Slot, Kind: p.Kind, Content: p.Content}, true)
		if err != nil {
			return err
		}
		if _, err = tx.Exec("INSERT INTO memory_provenance VALUES(?,1,'legacy',?,1,?,'imported',0,0)", item.ID, p.ID, hash); err != nil {
			return err
		}
		_, err = tx.Exec("UPDATE legacy_memory_candidates SET state='accepted',memory_id=? WHERE candidate_id=?", item.ID, p.ID)
		return err
	})
}
