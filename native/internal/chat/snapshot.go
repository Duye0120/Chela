package chat

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"github.com/Duye0120/Chela/native/internal/storage"
	"strings"
)

func (c *Chat) Snapshot() (ChatSnapshot, error) {
	if err := c.Start(); err != nil {
		return ChatSnapshot{}, err
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	models, _, model, effort, catalogErr := c.catalog()
	assistant, err := c.store.Identity()
	if err != nil {
		return ChatSnapshot{}, err
	}
	result := ChatSnapshot{Sessions: []ChatSession{}, Runs: []Run{}, Approvals: []Approval{}, Models: models, Model: model, Effort: effort, AssistantID: assistant, RuntimeError: c.runtimeError}
	if catalogErr != nil {
		result.RuntimeError = catalogErr.Error()
	}
	db, err := c.store.DB()
	if err != nil {
		return result, err
	}
	tx, err := db.Begin()
	if err != nil {
		return result, err
	}
	defer tx.Rollback()
	rows, err := tx.Query(sessionSelect + " ORDER BY s.updated_at DESC,s.session_id")
	if err != nil {
		return result, err
	}
	for rows.Next() {
		session, err := scanSession(rows)
		if err != nil {
			rows.Close()
			return result, err
		}
		result.Sessions = append(result.Sessions, session)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return result, err
	}
	for i := range result.Sessions {
		if err := sessionMessages(tx, &result.Sessions[i]); err != nil {
			return result, err
		}
	}
	rows, err = tx.Query(runSelect + " WHERE r.origin!='consolidation' ORDER BY r.created_at DESC,r.rowid DESC LIMIT 200")
	if err != nil {
		return result, err
	}
	for rows.Next() {
		run, err := scanRun(rows)
		if err != nil {
			rows.Close()
			return result, err
		}
		result.Runs = append(result.Runs, run)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return result, err
	}
	result.Approvals, err = readApprovals(tx)
	if err != nil {
		return result, err
	}
	err = tx.QueryRow("SELECT cast(COALESCE(max(seq),0) AS TEXT) FROM domain_events").Scan(&result.Cursor)
	return result, err
}

type Observation struct {
	Events       []storage.Event              `json:"events"`
	Progress     map[string]map[string]string `json:"progress"`
	RuntimeError string                       `json:"runtimeError,omitempty"`
}

func (c *Chat) Observe(after string) (Observation, error) {
	events, err := c.Events(after)
	if err != nil {
		return Observation{}, err
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	result := Observation{Events: events, Progress: map[string]map[string]string{}, RuntimeError: c.runtimeError}
	for id, g := range c.sending {
		if g.lane == "background" {
			continue
		}
		result.Progress[id] = map[string]string{"run_id": g.runID, "text": g.text.String(), "thinking": g.thinking.String()}
	}
	return result, nil
}

func readApprovals(db interface {
	Query(string, ...any) (*sql.Rows, error)
}) ([]Approval, error) {
	rows, err := db.Query("SELECT a.approval_id,t.run_id,r.session_id,a.title,a.description,a.status,t.final_args_json,t.tool_id FROM approvals a JOIN tool_invocations t ON t.invocation_id=a.invocation_id JOIN runs r ON r.run_id=t.run_id WHERE a.status='pending' AND r.state='waiting_approval' ORDER BY a.created_at")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []Approval{}
	for rows.Next() {
		var a Approval
		var raw, name string
		if err := rows.Scan(&a.ID, &a.RunID, &a.SessionID, &a.Title, &a.Description, &a.Status, &raw, &name); err != nil {
			return nil, err
		}
		var args fileArgs
		if err := json.Unmarshal([]byte(raw), &args); err != nil {
			return nil, err
		}
		if args.Content != nil {
			a.Preview = *args.Content
		}
		if strings.HasPrefix(name, "mcp__") {
			var pretty bytes.Buffer
			_ = json.Indent(&pretty, []byte(raw), "", "  ")
			a.Preview = pretty.String()
		}
		result = append(result, a)
	}
	return result, rows.Err()
}
