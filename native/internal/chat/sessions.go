package chat

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/Duye0120/Chela/native/internal/storage"
)

func sessionFilename(id string) string { return fmt.Sprintf("%x.json", sha256.Sum256([]byte(id))) }

func readSession(path string) (ChatSession, error) {
	var session ChatSession
	data, err := os.ReadFile(path)
	if err != nil {
		return session, err
	}
	if err := json.Unmarshal(data, &session); err != nil {
		return session, err
	}
	if session.ID == "" || sessionFilename(session.ID) != filepath.Base(path) {
		return session, errors.New("聊天记录 ID 与文件不一致")
	}
	return session, nil
}

// ImportProfile only migrates history; it starts no workers, models, or timers.
func ImportProfile(profile string, store *storage.Store) error {
	c := &Chat{profile: profile, config: profile, store: store}
	_, err := c.database()
	return err
}

func (c *Chat) database() (*sql.DB, error) {
	db, err := c.store.DB()
	if err != nil {
		return nil, err
	}
	if c.imported {
		return db, nil
	}
	var count int
	if err := db.QueryRow("SELECT count(*) FROM import_receipts WHERE source='chat-json-v1'").Scan(&count); err != nil {
		return nil, err
	}
	if count > 0 {
		c.imported = true
		return db, nil
	}
	sessions, err := c.readImportSessions()
	if err != nil {
		return nil, err
	}
	assistant, err := c.store.Identity()
	if err != nil {
		return nil, err
	}
	data, err := json.Marshal(sessions)
	if err != nil {
		return nil, err
	}
	err = c.store.Update(context.Background(), func(tx *sql.Tx) error {
		if err := tx.QueryRow("SELECT count(*) FROM import_receipts WHERE source='chat-json-v1'").Scan(&count); err != nil {
			return err
		}
		if count > 0 {
			return nil
		}
		seen := map[string]bool{}
		for _, session := range sessions {
			if session.ID == "" || seen[session.ID] {
				return errors.New("聊天记录含空白或重复 ID，无法迁移")
			}
			seen[session.ID] = true
			if err := saveSession(tx, assistant, session); err != nil {
				return err
			}
			raw, err := json.Marshal(session)
			if err != nil {
				return err
			}
			if _, err := tx.Exec("INSERT INTO legacy_import_map VALUES('chat-json-v1',?,?,'session',?,?)", session.ID, storage.Hash(raw), session.ID, storage.Now()); err != nil {
				return err
			}
		}
		_, err := tx.Exec("INSERT INTO import_receipts VALUES('chat-json-v1',?,?,?)", storage.Hash(data), len(sessions), storage.Now())
		return err
	})
	if err != nil {
		return nil, err
	}
	c.imported = true
	return db, nil
}

func (c *Chat) readImportSessions() ([]ChatSession, error) {
	dir := filepath.Join(c.profile, "chat-sessions")
	entries, err := os.ReadDir(dir)
	if err == nil {
		rows := []ChatSession{}
		for _, entry := range entries {
			if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
				continue
			}
			session, err := readSession(filepath.Join(dir, entry.Name()))
			if err != nil {
				return nil, err
			}
			rows = append(rows, session)
		}
		return rows, nil
	}
	if !errors.Is(err, os.ErrNotExist) {
		return nil, err
	}
	data, err := os.ReadFile(filepath.Join(c.profile, "chat-sessions.json"))
	if errors.Is(err, os.ErrNotExist) {
		return c.legacySessions()
	}
	if err != nil {
		return nil, err
	}
	var rows []ChatSession
	if err := json.Unmarshal(data, &rows); err != nil {
		return nil, err
	}
	if rows == nil {
		return nil, errors.New("聊天记录格式异常，无法读取")
	}
	return rows, nil
}

const sessionSelect = `SELECT s.session_id,s.assistant_id,b.branch_id,s.revision,b.generation,s.title,s.pinned,s.archived_at IS NOT NULL,s.created_at,s.updated_at,COALESCE(p.workspace_path,''),s.group_name,s.model_id,s.effort FROM sessions s JOIN branches b ON b.branch_id=COALESCE(s.active_branch_id,s.session_id||'-main') LEFT JOIN projects p ON p.project_id=s.project_id WHERE s.deleted_at IS NULL AND s.kind='user'`

func scanSession(row interface{ Scan(...any) error }) (ChatSession, error) {
	var session ChatSession
	err := row.Scan(&session.ID, &session.AssistantID, &session.BranchID, &session.Revision, &session.Generation, &session.Title, &session.Pinned, &session.Archived, &session.CreatedAt, &session.UpdatedAt, &session.Project, &session.Group, &session.ModelID, &session.Effort)
	session.Messages = []ChatMessage{}
	return session, err
}

type queryer interface {
	Query(string, ...any) (*sql.Rows, error)
}

func sessionMessages(db queryer, session *ChatSession) error {
	rows, err := db.Query(`WITH RECURSIVE path AS (SELECT e.entry_id,e.parent_id FROM pi_entries e JOIN branches b ON e.session_id=b.session_id AND e.entry_id=b.active_leaf_id WHERE b.branch_id=? UNION ALL SELECT e.entry_id,e.parent_id FROM pi_entries e JOIN path p ON e.entry_id=p.parent_id WHERE e.session_id=?) SELECT m.content_json,COALESCE((SELECT state FROM run_inputs WHERE message_id=m.message_id AND mode='steer'),'') FROM messages m WHERE m.session_id=? AND m.erased_at IS NULL AND m.role IN ('user','assistant') AND ((m.branch_id=? AND m.entry_id IS NULL) OR m.entry_id IN (SELECT entry_id FROM path)) ORDER BY CASE WHEN m.run_id IS NULL THEN 0 WHEN m.entry_id IS NOT NULL THEN 1 ELSE 2 END,(SELECT entry_ordinal FROM pi_entries e WHERE e.session_id=m.session_id AND e.entry_id=m.entry_id),m.rowid`, session.BranchID, session.ID, session.ID, session.BranchID)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var raw, delivery string
		if err := rows.Scan(&raw, &delivery); err != nil {
			return err
		}
		var message ChatMessage
		if err := json.Unmarshal([]byte(raw), &message); err != nil {
			return err
		}
		message.Delivery = delivery
		session.Messages = append(session.Messages, message)
	}
	return rows.Err()
}

func (c *Chat) find(id string) (ChatSession, error) {
	db, err := c.database()
	if err != nil {
		return ChatSession{}, err
	}
	session, err := scanSession(db.QueryRow(sessionSelect+" AND s.session_id=?", id))
	if errors.Is(err, sql.ErrNoRows) {
		return session, errors.New("找不到这个对话")
	}
	if err != nil {
		return session, err
	}
	err = sessionMessages(db, &session)
	return session, err
}

func saveSession(tx *sql.Tx, assistant string, session ChatSession) error {
	branch := session.BranchID
	if branch == "" {
		branch = session.ID + "-main"
	}
	var projectID any
	if session.Project != "" {
		projectID = "project-" + storage.Hash([]byte(filepath.Clean(session.Project)))
		if _, err := tx.Exec("INSERT INTO projects(project_id,assistant_id,name,workspace_path) VALUES(?,?,?,?) ON CONFLICT(project_id) DO NOTHING", projectID, assistant, filepath.Base(session.Project), session.Project); err != nil {
			return err
		}
	}
	var archived any
	if session.Archived {
		archived = session.UpdatedAt
	}
	if _, err := tx.Exec(`INSERT INTO sessions(session_id,assistant_id,project_id,kind,title,created_at,updated_at,pinned,group_name,model_id,effort,archived_at) VALUES(?,?,?,'user',?,?,?,?,?,?,?,?) ON CONFLICT(session_id) DO UPDATE SET project_id=excluded.project_id,title=excluded.title,updated_at=excluded.updated_at,pinned=excluded.pinned,group_name=excluded.group_name,model_id=excluded.model_id,effort=excluded.effort,archived_at=excluded.archived_at,revision=sessions.revision+1`, session.ID, assistant, projectID, session.Title, session.CreatedAt, session.UpdatedAt, session.Pinned, session.Group, session.ModelID, session.Effort, archived); err != nil {
		return err
	}
	if _, err := tx.Exec("INSERT INTO branches(branch_id,session_id,created_at) VALUES(?,?,?) ON CONFLICT(branch_id) DO NOTHING", branch, session.ID, session.CreatedAt); err != nil {
		return err
	}
	for index, message := range session.Messages {
		if message.ID == "" {
			message.ID = fmt.Sprintf("%s-legacy-%d", session.ID, index)
		}
		data, err := json.Marshal(message)
		if err != nil {
			return err
		}
		if _, err := tx.Exec(`INSERT INTO messages(message_id,session_id,branch_id,role,content_json,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(message_id) DO NOTHING`, message.ID, session.ID, branch, message.Role, string(data), message.CreatedAt); err != nil {
			return err
		}
	}
	return nil
}

func (c *Chat) save(session ChatSession) error {
	if _, err := c.database(); err != nil {
		return err
	}
	assistant, err := c.store.Identity()
	if err != nil {
		return err
	}
	return c.store.Update(context.Background(), func(tx *sql.Tx) error {
		if err := saveSession(tx, assistant, session); err != nil {
			return err
		}
		_, err := storage.AppendEvent(tx, assistant, "session.changed", "session", session.ID, session.Revision+1, "session", session.ID, session.ID, map[string]string{"session_id": session.ID})
		return err
	})
}

func (c *Chat) load() ([]ChatSession, error) {
	db, err := c.database()
	if err != nil {
		return nil, err
	}
	rows, err := db.Query(sessionSelect + " ORDER BY s.updated_at DESC,s.session_id")
	if err != nil {
		return nil, err
	}
	sessions := []ChatSession{}
	for rows.Next() {
		session, err := scanSession(rows)
		if err != nil {
			rows.Close()
			return nil, err
		}
		sessions = append(sessions, session)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, err
	}
	for index := range sessions {
		if err := sessionMessages(db, &sessions[index]); err != nil {
			return nil, err
		}
	}
	return sessions, nil
}
