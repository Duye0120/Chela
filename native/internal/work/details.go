package work

import (
	"database/sql"
	"errors"
)

type TaskDetails struct {
	Workspace  string `json:"workspace"`
	UpdatedAt  string `json:"updatedAt"`
	Executor   string `json:"executor"`
	State      string `json:"state"`
	SessionID  string `json:"sessionId"`
	TerminalID string `json:"terminalId"`
}

func (w *Work) Details(id string) (TaskDetails, error) {
	var result TaskDetails
	if id == "" || len(id) > 200 {
		return result, errors.New("任务标识无效")
	}
	db, err := w.store.DB()
	if err != nil {
		return result, err
	}
	assistant, err := w.store.Identity()
	if err != nil {
		return result, err
	}
	err = db.QueryRow(`SELECT COALESCE(p.workspace_path,''),i.updated_at FROM planner_items i LEFT JOIN projects p ON p.project_id=i.project_id WHERE i.item_id=? AND i.assistant_id=? AND i.deleted_at IS NULL`, id, assistant).Scan(&result.Workspace, &result.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return result, errors.New("任务已不存在")
	}
	if err != nil {
		return result, err
	}
	err = db.QueryRow(`SELECT COALESCE(t.executor_kind,'Chela'),COALESCE(t.process_state,r.state,''),COALESCE(r.session_id,''),COALESCE(t.terminal_session_id,'') FROM execution_links l LEFT JOIN terminal_sessions t ON t.terminal_session_id=l.terminal_session_id LEFT JOIN runs r ON r.run_id=l.run_id WHERE l.item_id=? ORDER BY l.created_at DESC LIMIT 1`, id).Scan(&result.Executor, &result.State, &result.SessionID, &result.TerminalID)
	if errors.Is(err, sql.ErrNoRows) {
		return result, nil
	}
	return result, err
}
