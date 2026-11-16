package work

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/Duye0120/Chela/native/internal/storage"
)

func (w *Work) importElectron() error {
	db, err := w.store.DB()
	if err != nil {
		return err
	}
	var imported int
	if err = db.QueryRow("SELECT count(*) FROM import_receipts WHERE source='electron-planner-v1'").Scan(&imported); err != nil || imported > 0 {
		return err
	}
	data, err := os.ReadFile(filepath.Join(filepath.Dir(w.file), "planner.json"))
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	var old struct {
		Version int
		Items   []json.RawMessage
	}
	if json.Unmarshal(data, &old) != nil || old.Version != 1 || old.Items == nil {
		return errors.New("旧 Planner 格式无效，已保留原文件")
	}
	return w.store.Update(context.Background(), func(tx *sql.Tx) error {
		if err = tx.QueryRow("SELECT count(*) FROM import_receipts WHERE source='electron-planner-v1'").Scan(&imported); err != nil || imported > 0 {
			return err
		}
		var assistant string
		if err = tx.QueryRow("SELECT assistant_id FROM assistants").Scan(&assistant); err != nil {
			return err
		}
		for _, raw := range old.Items {
			var item struct {
				ID, Title, Content, Kind, Status, ProjectDirectory, Date, RemindAt, RemindedAt, CreatedAt, UpdatedAt string
				Completed                                                                                            bool
				Executions                                                                                           []struct{ TerminalID, Directory, Executor, StartedAt, EndedAt, State, Source, Result string }
			}
			if err = json.Unmarshal(raw, &item); err != nil {
				return err
			}
			if item.ID == "" || (item.Kind != "todo" && item.Kind != "note") {
				return errors.New("旧 Planner 含无效事项")
			}
			var exists int
			if err = tx.QueryRow("SELECT count(*) FROM planner_items WHERE item_id=?", item.ID).Scan(&exists); err != nil {
				return err
			}
			if exists > 0 {
				return fmt.Errorf("旧事项 ID 与当前资料重复: %s；已停止覆盖", item.ID)
			}
			for _, value := range []string{item.CreatedAt, item.UpdatedAt} {
				if _, err = time.Parse(time.RFC3339Nano, value); err != nil {
					return errors.New("旧 Planner 时间字段无效")
				}
			}
			if item.Kind == "note" {
				if err = saveNote(tx, WorkNote{ID: item.ID, Title: item.Title, Content: item.Content, UpdatedAt: item.UpdatedAt}); err != nil {
					return err
				}
			} else {
				status, ok := map[string]string{"todo": "待办", "doing": "进行中", "review": "待查看", "done": "已完成"}[item.Status]
				if !ok {
					return errors.New("旧任务状态无效")
				}
				if item.Completed {
					status = "已完成"
				}
				task := WorkTask{ID: item.ID, Title: item.Title, Description: item.Content, Status: status, Project: item.ProjectDirectory, Date: item.Date, Kind: "task", Revision: 1, Timezone: "UTC"}
				if err = saveTask(tx, &task, true); err != nil {
					return err
				}
				if task.ProjectID != "" {
					if _, err = tx.Exec("UPDATE projects SET workspace_path=? WHERE project_id=? AND workspace_path IS NULL", item.ProjectDirectory, task.ProjectID); err != nil {
						return err
					}
				}
			}
			if _, err = tx.Exec("UPDATE planner_items SET metadata_json=json_set(metadata_json,'$.legacy',json(?)),created_at=?,updated_at=? WHERE item_id=?", string(raw), item.CreatedAt, item.UpdatedAt, item.ID); err != nil {
				return err
			}
			if item.RemindAt != "" {
				at, e := time.Parse(time.RFC3339Nano, item.RemindAt)
				if e != nil {
					return e
				}
				rule, _ := json.Marshal(map[string]any{"kind": "once", "local": at.UTC().Format("2006-01-02T15:04"), "legacy_instant": item.RemindAt})
				enabled := !item.Completed && item.Status != "done" && item.RemindedAt == ""
				if _, err = tx.Exec(`INSERT INTO reminder_rules(rule_id,assistant_id,item_id,rule_json,timezone,time_binding,enabled,next_fire_at,catch_up,grace_seconds) VALUES(?,?,?,?,'UTC','absolute_instant',?,?,'within_grace',900)`, "legacy-reminder-"+item.ID, assistant, item.ID, string(rule), enabled, utc(at)); err != nil {
					return err
				}
			}
			for _, ex := range item.Executions {
				if ex.TerminalID == "" {
					return errors.New("旧执行缺少终端 ID")
				}
				kind := ex.Executor
				if kind != "codex" && kind != "opencode" {
					kind = "terminal"
				}
				if _, err = tx.Exec(`INSERT INTO terminal_sessions(terminal_session_id,assistant_id,executor_kind,adapter_version,cwd,process_ownership,process_state,capabilities_json,created_at,ended_at) VALUES(?,?,?,'legacy-electron',?,'external','interrupted','{"terminal":false,"observable":false,"resumable":false,"controllable":false}',?,NULLIF(?,''))`, ex.TerminalID, assistant, kind, ex.Directory, ex.StartedAt, ex.EndedAt); err != nil {
					return err
				}
				output := []byte("旧现场已归档，原进程不可恢复。以下为旧记录保存的结果文本：\r\n" + ex.Result)
				if _, err = tx.Exec("INSERT INTO terminal_output VALUES(?,?,?,?)", ex.TerminalID, len(output), output, storage.Now()); err != nil {
					return err
				}
				if _, err = tx.Exec("INSERT INTO execution_links(link_id,item_id,terminal_session_id,created_at) VALUES(?,?,?,?)", "legacy-"+ex.TerminalID, item.ID, ex.TerminalID, storage.Now()); err != nil {
					return err
				}
				if _, err = tx.Exec("INSERT INTO legacy_import_map VALUES('electron-terminal-v1',?,?,'terminal',?,?)", ex.TerminalID, storage.Hash(raw), ex.TerminalID, storage.Now()); err != nil {
					return err
				}
			}
			if _, err = tx.Exec("INSERT INTO legacy_import_map VALUES('electron-planner-v1',?,?,'planner',?,?)", item.ID, storage.Hash(raw), item.ID, storage.Now()); err != nil {
				return err
			}
		}
		_, err = tx.Exec("INSERT INTO import_receipts VALUES('electron-planner-v1',?,?,?)", storage.Hash(data), len(old.Items), storage.Now())
		return err
	})
}
