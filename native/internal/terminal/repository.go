package terminal

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/Duye0120/Chela/native/internal/storage"
)

func (t *Terminal) initialize() error {
	if t.initialized {
		return nil
	}
	err := t.store.Update(context.Background(), func(tx *sql.Tx) error {
		_, err := tx.Exec("UPDATE terminal_sessions SET process_state='interrupted',ended_at=? WHERE process_state IN ('starting','running')", storage.Now())
		return err
	})
	if err != nil {
		return err
	}
	db, err := t.store.DB()
	if err != nil {
		return err
	}
	rows, err := db.Query(`SELECT s.terminal_session_id,s.executor_kind,s.cwd,COALESCE(l.item_id,''),s.process_state,COALESCE(s.executor_version,''),s.exit_code,COALESCE(o.next_offset,0),s.mode,s.generation,COALESCE(s.external_session_id,''),COALESCE(json_extract(s.capabilities_json,'$.observable'),0),COALESCE(json_extract(s.capabilities_json,'$.resumable'),0) FROM terminal_sessions s LEFT JOIN execution_links l ON l.terminal_session_id=s.terminal_session_id LEFT JOIN terminal_output o ON o.terminal_session_id=s.terminal_session_id ORDER BY s.created_at`)
	if err != nil {
		return err
	}
	defer rows.Close()
	var sessions []*terminalSession
	for rows.Next() {
		s := &terminalSession{done: make(chan struct{})}
		var code sql.NullInt64
		if err = rows.Scan(&s.info.ID, &s.info.Program, &s.info.Directory, &s.info.TaskID, &s.info.State, &s.info.Version, &code, &s.next, &s.info.Mode, &s.info.Generation, &s.info.ExternalSessionID, &s.info.Observable, &s.info.Resumable); err != nil {
			return err
		}
		if s.info.Program == "terminal" {
			s.info.Program = "pwsh"
		}
		if code.Valid {
			value := uint32(code.Int64)
			s.info.ExitCode = &value
		}
		s.info.Ended = true
		s.savedNext = s.next
		s.savedState = s.info.State
		s.archivedOutput = s.next > 0
		close(s.done)
		sessions = append(sessions, s)
	}
	if err = rows.Err(); err != nil {
		return err
	}
	t.sessions = sessions
	t.initialized = true
	return nil
}

func (t *Terminal) recordStart(info terminalInfo) error {
	return t.store.Update(context.Background(), func(tx *sql.Tx) error {
		var assistant string
		if err := tx.QueryRow("SELECT assistant_id FROM assistants").Scan(&assistant); err != nil {
			return err
		}
		if info.TaskID != "" {
			var kind string
			if err := tx.QueryRow("SELECT kind FROM planner_items WHERE item_id=? AND deleted_at IS NULL", info.TaskID).Scan(&kind); err != nil {
				return errors.New("关联任务已不存在")
			}
			if kind != "task" {
				return errors.New("只能关联任务")
			}
		}
		kind := info.Program
		if kind == "pwsh" {
			kind = "terminal"
		}
		_, err := tx.Exec(`INSERT INTO terminal_sessions(terminal_session_id,assistant_id,executor_kind,adapter_version,executor_version,cwd,process_ownership,process_state,capabilities_json,created_at,mode,generation) VALUES(?,?,?,'conpty-1',?,?,'chela','starting','{"terminal":true,"observable":false,"resumable":false,"controllable":false}',?,?,?)`, info.ID, assistant, kind, info.Version, info.Directory, storage.Now(), info.Mode, info.Generation)
		if err != nil {
			return err
		}
		if info.TaskID != "" {
			_, err = tx.Exec("INSERT INTO execution_links(link_id,item_id,terminal_session_id,created_at) VALUES(?,?,?,?)", "terminal-"+info.ID, info.TaskID, info.ID, storage.Now())
		}
		return err
	})
}

func (t *Terminal) checkpoint(s *terminalSession, final bool) error {
	s.persistMu.Lock()
	defer s.persistMu.Unlock()
	s.mu.Lock()
	info, next := s.info, s.next
	if !final && next == s.savedNext && info.State == s.savedState {
		s.mu.Unlock()
		return nil
	}
	data := append([]byte{}, s.output...)
	s.mu.Unlock()
	err := t.store.Update(context.Background(), func(tx *sql.Tx) error {
		_, err := tx.Exec(`INSERT INTO terminal_output VALUES(?,?,?,?) ON CONFLICT(terminal_session_id) DO UPDATE SET next_offset=excluded.next_offset,output=excluded.output,updated_at=excluded.updated_at`, info.ID, next, data, storage.Now())
		if err != nil {
			return err
		}
		if final {
			_, err = tx.Exec("UPDATE terminal_sessions SET process_state=?,ended_at=?,exit_code=? WHERE terminal_session_id=?", info.State, storage.Now(), info.ExitCode, info.ID)
			if err != nil {
				return err
			}
			payload, _ := json.Marshal(map[string]any{"process_state": info.State, "exit_code": info.ExitCode})
			_, err = tx.Exec(`INSERT INTO execution_observations(observation_id,terminal_session_id,source_event_key,evidence_format,kind,payload_json,observed_at) VALUES(?,?,?,'conpty-1','process_exit',?,?) ON CONFLICT(terminal_session_id,source_event_key) DO NOTHING`, fmt.Sprintf("exit-%s-%d", info.ID, info.Generation), info.ID, fmt.Sprintf("exit:%d", info.Generation), string(payload), storage.Now())
			return err
		}
		_, err = tx.Exec("UPDATE terminal_sessions SET process_state=? WHERE terminal_session_id=? AND process_state='starting'", info.State, info.ID)
		return err
	})
	s.mu.Lock()
	defer s.mu.Unlock()
	if err != nil {
		s.persistErr = "终端输出保存失败：" + err.Error()
	} else {
		s.savedNext = next
		s.savedState = info.State
		s.persistErr = ""
	}
	return err
}
