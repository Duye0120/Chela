package chat

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/Duye0120/Chela/native/internal/capabilities"
	"github.com/Duye0120/Chela/native/internal/storage"
)

func (c *Chat) capabilityRegistry() capabilities.Registry {
	return capabilities.Registry{Store: c.store, Profile: c.profile}
}
func (c *Chat) Capabilities() ([]capabilities.Manifest, error) { return c.capabilityRegistry().List() }
func (c *Chat) InstallCapability(raw string) (capabilities.Manifest, error) {
	var input struct{ Source, Project string }
	if json.Unmarshal([]byte(raw), &input) != nil || input.Source == "" {
		return capabilities.Manifest{}, errors.New("请提供扩展包目录")
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if len(c.sending) > 0 {
		return capabilities.Manifest{}, errors.New("请在当前运行结束后安装扩展")
	}
	return c.capabilityRegistry().Install(input.Source, input.Project)
}
func (c *Chat) ChangeCapability(id, action string) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if len(c.sending) > 0 {
		return errors.New("当前有运行中的会话，请结束后启停或重载扩展")
	}
	if err := c.capabilityRegistry().Change(id, action); err != nil {
		return err
	}
	for session, w := range c.pool {
		w.stop()
		<-w.done
		delete(c.pool, session)
	}
	return nil
}

func (c *Chat) freezeCapabilities(ctx context.Context, run Run) ([]capabilities.Manifest, error) {
	items := []capabilities.Manifest{}
	var err error
	if run.Lane != "background" {
		items, err = c.capabilityRegistry().Snapshot(run.Workspace)
		if err != nil {
			return nil, err
		}
	}
	raw, _ := json.Marshal(items)
	err = c.store.Update(ctx, func(tx *sql.Tx) error {
		if err := validateLease(tx, run); err != nil {
			return err
		}
		_, err := tx.Exec("INSERT INTO run_capabilities(attempt_id,manifest_json,manifest_hash) VALUES(?,?,?)", run.AttemptID, string(raw), storage.Hash(raw))
		if err != nil {
			return err
		}
		_, err = tx.Exec("UPDATE run_attempts SET config_fingerprint=? WHERE attempt_id=?", storage.Hash([]byte(run.ModelID+"\n"+run.Effort+"\n"+run.Workspace+"\n"+storage.Hash(raw))), run.AttemptID)
		return err
	})
	return items, err
}
func (c *Chat) extensionReport(ctx context.Context, run Run, raw json.RawMessage) (any, error) {
	var report struct {
		ID, Problem string
		Tools       json.RawMessage
	}
	if json.Unmarshal(raw, &report) != nil {
		return nil, errors.New("无效扩展报告")
	}
	err := c.store.Update(ctx, func(tx *sql.Tx) error {
		if err := validateLease(tx, run); err != nil {
			return err
		}
		var saved string
		if err := tx.QueryRow("SELECT manifest_json FROM run_capabilities WHERE attempt_id=?", run.AttemptID).Scan(&saved); err != nil {
			return err
		}
		if report.ID == "" {
			if !json.Valid(report.Tools) {
				return errors.New("无效工具清单")
			}
			_, err := tx.Exec("UPDATE run_capabilities SET tools_json=? WHERE attempt_id=?", string(report.Tools), run.AttemptID)
			return err
		}
		var items []capabilities.Manifest
		if err := json.Unmarshal([]byte(saved), &items); err != nil {
			return err
		}
		for _, m := range items {
			if m.ID == report.ID {
				health := "loaded"
				if report.Problem != "" {
					health = "failed"
				}
				_, err := tx.Exec("UPDATE capability_installations SET health=?,manifest_json=json_set(manifest_json,'$.problem',?) WHERE capability_id=? AND build_hash=?", health, report.Problem, m.ID, m.Hash)
				return err
			}
		}
		return errors.New("扩展不在本轮固定清单中")
	})
	return nil, err
}

type ExtensionUIRequest struct {
	ID      string          `json:"id"`
	Session string          `json:"session"`
	Run     string          `json:"run"`
	Kind    string          `json:"kind"`
	Payload json.RawMessage `json:"payload"`
	State   string          `json:"state"`
}

func (c *Chat) ExtensionUI(session string) ([]ExtensionUIRequest, error) {
	db, err := c.store.DB()
	if err != nil {
		return nil, err
	}
	rows, err := db.Query(`SELECT u.request_id,u.session_id,u.run_id,u.kind,u.payload_json,u.state FROM extension_ui_requests u JOIN runs r ON r.run_id=u.run_id WHERE u.session_id=? AND u.expires_at>? AND (u.state='notified' OR (u.state='pending' AND r.state IN ('running','waiting_approval'))) ORDER BY u.created_at LIMIT 30`, session, storage.Now())
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []ExtensionUIRequest{}
	for rows.Next() {
		var item ExtensionUIRequest
		var raw string
		if err = rows.Scan(&item.ID, &item.Session, &item.Run, &item.Kind, &raw, &item.State); err != nil {
			return nil, err
		}
		item.Payload = json.RawMessage(raw)
		items = append(items, item)
	}
	return items, rows.Err()
}
func (c *Chat) ResolveExtensionUI(raw string) error {
	var input struct {
		ID, Session, Run string
		Answer           json.RawMessage
		Cancelled        bool
	}
	if json.Unmarshal([]byte(raw), &input) != nil || input.ID == "" || input.Session == "" || input.Run == "" {
		return errors.New("扩展交互身份不完整")
	}
	return c.store.Update(context.Background(), func(tx *sql.Tx) error {
		var kind, payload, state, runState, expires string
		if err := tx.QueryRow(`SELECT u.kind,u.payload_json,u.state,r.state,u.expires_at FROM extension_ui_requests u JOIN runs r ON r.run_id=u.run_id WHERE u.request_id=? AND u.session_id=? AND u.run_id=?`, input.ID, input.Session, input.Run).Scan(&kind, &payload, &state, &runState, &expires); err != nil {
			return err
		}
		if state == "notified" {
			_, err := tx.Exec("UPDATE extension_ui_requests SET state='answered',answer_json='null' WHERE request_id=?", input.ID)
			return err
		}
		if state != "pending" || expires <= storage.Now() || (runState != "running" && runState != "waiting_approval") {
			return errors.New("该扩展请求已经结束或过期")
		}
		answer := input.Answer
		next := "answered"
		if input.Cancelled {
			next = "cancelled"
			answer = json.RawMessage("null")
		} else {
			if !json.Valid(answer) || len(answer) > 65536 {
				return errors.New("无效的扩展回答")
			}
			var options struct{ Options []string }
			_ = json.Unmarshal([]byte(payload), &options)
			if kind == "confirm" {
				var value bool
				if json.Unmarshal(answer, &value) != nil || string(answer) == "null" {
					return errors.New("需要确认或取消")
				}
			} else {
				var value string
				if json.Unmarshal(answer, &value) != nil || string(answer) == "null" {
					return errors.New("需要文本回答")
				}
				if kind == "select" {
					found := false
					for _, v := range options.Options {
						if v == value {
							found = true
						}
					}
					if !found {
						return errors.New("请选择有效选项")
					}
				}
			}
		}
		_, err := tx.Exec("UPDATE extension_ui_requests SET state=?,answer_json=? WHERE request_id=?", next, string(answer), input.ID)
		return err
	})
}
func (c *Chat) requestExtensionUI(ctx context.Context, run Run, raw json.RawMessage) (any, error) {
	var input struct {
		Kind    string
		Key     string
		Title   string
		Message string
		Options []string
		Timeout int
	}
	if json.Unmarshal(raw, &input) != nil || len(raw) > 65536 {
		return nil, errors.New("扩展交互请求无效")
	}
	switch input.Kind {
	case "select", "confirm", "input", "editor", "notify", "status":
	default:
		return nil, errors.New("不支持的 WebView 交互类型")
	}
	if len(input.Options) > 100 || len(input.Title) > 2000 {
		return nil, errors.New("扩展交互内容过长")
	}
	if run.Lane == "background" {
		return nil, errors.New("后台运行不能弹出扩展交互")
	}
	timeout := 5 * time.Minute
	if input.Timeout > 0 && time.Duration(input.Timeout)*time.Millisecond < timeout {
		timeout = time.Duration(input.Timeout) * time.Millisecond
	}
	id := input.Key
	if id == "" {
		id = rand.Text()
	}
	if len(id) > 100 {
		return nil, errors.New("扩展请求标识过长")
	}
	state := "pending"
	if input.Kind == "notify" || input.Kind == "status" {
		state = "notified"
	}
	err := c.store.Update(ctx, func(tx *sql.Tx) error {
		if err := validateLease(tx, run); err != nil {
			return err
		}
		var n int
		if err := tx.QueryRow("SELECT count(*) FROM extension_ui_requests WHERE run_id=?", run.ID).Scan(&n); err != nil {
			return err
		}
		if n >= 100 {
			return errors.New("本轮扩展交互已超过 100 次")
		}
		_, err := tx.Exec("INSERT INTO extension_ui_requests VALUES(?,?,?,?,?,?,?,NULL,?,?) ON CONFLICT(request_id) DO NOTHING", id, run.AttemptID, run.SessionID, run.ID, input.Kind, string(raw), state, time.Now().UTC().Add(timeout).Format("2006-01-02T15:04:05.000Z"), storage.Now())
		if err != nil {
			return err
		}
		var owner string
		if err = tx.QueryRow("SELECT attempt_id FROM extension_ui_requests WHERE request_id=?", id).Scan(&owner); err != nil {
			return err
		}
		if owner != run.AttemptID {
			return errors.New("扩展请求标识已属于其他运行")
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	if state == "notified" {
		return nil, nil
	}
	defer func() {
		_ = c.store.Update(context.Background(), func(tx *sql.Tx) error {
			_, err := tx.Exec("UPDATE extension_ui_requests SET state='expired' WHERE request_id=? AND state='pending'", id)
			return err
		})
	}()
	timer := time.NewTimer(timeout)
	defer timer.Stop()
	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-timer.C:
			return nil, nil
		case <-ticker.C:
			db, err := c.store.DB()
			if err != nil {
				return nil, err
			}
			var answer sql.NullString
			var state string
			if err = db.QueryRow("SELECT state,answer_json FROM extension_ui_requests WHERE request_id=?", id).Scan(&state, &answer); err != nil {
				return nil, err
			}
			if state != "pending" {
				if answer.Valid {
					return json.RawMessage(answer.String), nil
				}
				return nil, nil
			}
		}
	}
}

func (c *Chat) cancelExtensionUI(ctx context.Context, run Run, raw json.RawMessage) error {
	var input struct{ Key string }
	if json.Unmarshal(raw, &input) != nil || input.Key == "" || len(input.Key) > 100 {
		return errors.New("无效扩展请求标识")
	}
	return c.store.Update(ctx, func(tx *sql.Tx) error {
		if err := validateLease(tx, run); err != nil {
			return err
		}
		_, err := tx.Exec(`INSERT INTO extension_ui_requests VALUES(?,?,?,?,'cancel','{}','cancelled','null',?,?) ON CONFLICT(request_id) DO UPDATE SET state='cancelled',answer_json='null' WHERE extension_ui_requests.attempt_id=excluded.attempt_id AND extension_ui_requests.state='pending'`, input.Key, run.AttemptID, run.SessionID, run.ID, storage.Now(), storage.Now())
		return err
	})
}

// These receipts describe observed native extension calls; they do not sandbox JavaScript I/O.
func (c *Chat) nativeToolReceipt(ctx context.Context, run Run, raw json.RawMessage, finished bool) (any, error) {
	var input struct {
		ID     string          `json:"tool_call_id"`
		Parent string          `json:"parent_tool_call_id"`
		Name   string          `json:"name"`
		Args   json.RawMessage `json:"arguments"`
		Result json.RawMessage `json:"result"`
	}
	if json.Unmarshal(raw, &input) != nil || input.ID == "" || run.Lane == "background" {
		return nil, errors.New("无效的扩展工具调用")
	}
	if !finished && input.Parent != "" {
		if err := c.registerNestedTool(ctx, run, toolRequest{ID: input.ID, Parent: input.Parent, Name: input.Name, Args: input.Args}); err != nil {
			return nil, err
		}
	}
	var prior json.RawMessage
	err := c.store.Update(ctx, func(tx *sql.Tx) error {
		if err := validateLease(tx, run); err != nil {
			return err
		}
		var manifests string
		if err := tx.QueryRow("SELECT manifest_json FROM run_capabilities WHERE attempt_id=?", run.AttemptID).Scan(&manifests); err != nil {
			return err
		}
		var installed []capabilities.Manifest
		if err := json.Unmarshal([]byte(manifests), &installed); err != nil {
			return err
		}
		allowed := input.Name == "tool_search"
		effect := "read"
		for _, m := range installed {
			if m.Trust == "trusted-native" && strings.HasPrefix(input.Name, m.Namespace+"__") {
				allowed = true
				effect = "external_write"
			}
		}
		if !allowed {
			return errors.New("工具不在本轮扩展命名空间中")
		}
		var invocation, state string
		if err := tx.QueryRow("SELECT invocation_id,state FROM tool_invocations WHERE attempt_id=? AND pi_tool_call_id=? AND tool_id=?", run.AttemptID, input.ID, input.Name).Scan(&invocation, &state); err != nil {
			return errors.New("扩展调用尚未通过提交屏障；嵌套调用需单独适配")
		}
		if finished {
			if !json.Valid(input.Result) || state != "executing" {
				return errors.New("无效扩展回执")
			}
			var result struct {
				IsError bool `json:"isError"`
			}
			if err := json.Unmarshal(input.Result, &result); err != nil {
				return err
			}
			outcome := "succeeded"
			if result.IsError {
				outcome = "failed"
			}
			_, err := tx.Exec("UPDATE tool_invocations SET state=?,result_json=?,result_hash=?,ended_at=? WHERE invocation_id=?", outcome, string(input.Result), storage.Hash(input.Result), storage.Now(), invocation)
			return err
		}
		args, err := canonicalJSON(input.Args)
		if err != nil {
			return err
		}
		if state != "planned" {
			return errors.New("扩展调用不能自动重放")
		}
		var unknown int
		if err = tx.QueryRow("SELECT count(*) FROM tool_invocations WHERE run_id=(SELECT recovery_of_run_id FROM runs WHERE run_id=?) AND tool_id=? AND state='outcome_unknown'", run.ID, input.Name).Scan(&unknown); err != nil {
			return err
		}
		if unknown > 0 {
			return errors.New("原扩展调用结果未知，先核对副作用")
		}
		var saved string
		err = tx.QueryRow("SELECT result_json FROM tool_invocations WHERE run_id=(SELECT recovery_of_run_id FROM runs WHERE run_id=?) AND tool_id=? AND final_args_hash=? AND state='succeeded' AND result_json IS NOT NULL LIMIT 1", run.ID, input.Name, storage.Hash(args)).Scan(&saved)
		if err == nil {
			prior = json.RawMessage(saved)
			_, err = tx.Exec("UPDATE tool_invocations SET state='succeeded',result_json=?,result_hash=?,final_args_json=?,final_args_hash=?,ended_at=? WHERE invocation_id=?", saved, storage.Hash(prior), string(args), storage.Hash(args), storage.Now(), invocation)
			return err
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return err
		}
		_, err = tx.Exec("UPDATE tool_invocations SET state='executing',effect_class=?,final_args_json=?,final_args_hash=?,started_at=? WHERE invocation_id=?", effect, string(args), storage.Hash(args), storage.Now(), invocation)
		return err
	})
	if prior != nil {
		return map[string]any{"result": prior}, err
	}
	return nil, err
}
