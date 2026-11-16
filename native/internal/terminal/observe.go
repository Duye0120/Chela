package terminal

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/Duye0120/Chela/native/internal/storage"
)

type result struct {
	Ref     string `json:"ref"`
	Version int64  `json:"version"`
	Text    string `json:"text"`
	Seen    bool   `json:"seen"`
}
type wireEvent struct{ Session, Turn, Reply, Text, Kind string }
type observer struct {
	program, directory, prompt, external, expected, turn string
	sequence                                             int
	degraded                                             bool
}

func observedVersion(program, version string) bool {
	return program == "codex" && version == "codex-cli 0.168.0" || program == "opencode" && version == "1.19.5"
}
func rpc(id int, method string, params any) []byte {
	raw, _ := json.Marshal(map[string]any{"id": id, "method": method, "params": params})
	return append(raw, '\n')
}
func (o *observer) initial() string {
	if o.program == "opencode" {
		return o.prompt
	}
	return string(rpc(1, "initialize", map[string]any{"clientInfo": map[string]string{"name": "Chela", "version": "1.0"}}))
}
func (o *observer) args() []string {
	if o.program == "codex" {
		return []string{"app-server"}
	}
	args := []string{"run", "--format", "json"}
	if o.external != "" {
		args = append(args, "--session", o.external)
	}
	return args
}

func (o *observer) parse(raw []byte) (wireEvent, []byte, bool, error) {
	var e wireEvent
	if o.degraded {
		return e, nil, false, nil
	}
	if o.program == "opencode" {
		var v struct {
			Type, SessionID string
			Part            struct {
				ID, Type, SessionID, MessageID, Text string
				Time                                 struct{ End int64 }
			}
			Error json.RawMessage
		}
		if err := json.Unmarshal(raw, &v); err != nil {
			return e, nil, false, err
		}
		if v.Type == "error" {
			e.Kind = "failed"
			e.Text = "OpenCode 报告执行失败"
			return e, nil, false, nil
		}
		if v.SessionID == "" || !strings.HasPrefix(v.SessionID, "ses_") {
			return e, nil, false, errors.New("OpenCode 事件缺少会话 ID")
		}
		if o.external != "" && o.external != v.SessionID {
			return e, nil, false, errors.New("OpenCode 返回了不同会话")
		}
		o.external = v.SessionID
		e.Session = v.SessionID
		switch v.Type {
		case "text":
			if v.Part.Type != "text" || v.Part.ID == "" || v.Part.MessageID == "" || v.Part.SessionID != v.SessionID || v.Part.Time.End == 0 {
				return e, nil, false, errors.New("OpenCode 回复事件不完整")
			}
			e.Turn = v.Part.MessageID
			e.Reply = v.Part.ID
			e.Text = v.Part.Text
			e.Kind = "reply_available"
		case "step_start", "step_finish", "tool_use", "reasoning":
		default:
			return e, nil, false, errors.New("未知 OpenCode 事件格式")
		}
		return e, nil, false, nil
	}
	var v struct {
		ID     json.RawMessage
		Method string
		Result json.RawMessage
		Params json.RawMessage
		Error  json.RawMessage
	}
	if err := json.Unmarshal(raw, &v); err != nil {
		return e, nil, false, err
	}
	if len(v.Error) > 0 && string(v.Error) != "null" {
		e.Kind = "failed"
		e.Text = "Codex 协议请求失败"
		return e, nil, true, nil
	}
	if v.Method == "" {
		switch string(v.ID) {
		case "1":
			method := "thread/start"
			params := map[string]any{"cwd": o.directory, "approvalPolicy": "on-request", "sandbox": "workspace-write"}
			if o.external != "" {
				method = "thread/resume"
				params["threadId"] = o.external
			}
			return e, append([]byte("{\"method\":\"initialized\"}\n"), rpc(2, method, params)...), false, nil
		case "2":
			var r struct{ Thread struct{ ID string } }
			if err := json.Unmarshal(v.Result, &r); err != nil || r.Thread.ID == "" {
				return e, nil, false, errors.New("Codex 没有返回会话 ID")
			}
			if o.expected != "" && r.Thread.ID != o.expected {
				return e, nil, false, errors.New("Codex 恢复了不同会话")
			}
			o.external = r.Thread.ID
			e.Session = o.external
			return e, rpc(3, "turn/start", map[string]any{"threadId": o.external, "input": []any{map[string]any{"type": "text", "text": o.prompt}}}), false, nil
		case "3":
			var r struct{ Turn struct{ ID string } }
			if err := json.Unmarshal(v.Result, &r); err != nil || r.Turn.ID == "" {
				return e, nil, false, errors.New("Codex 没有返回轮次 ID")
			}
			o.turn = r.Turn.ID
		default:
			return e, nil, false, errors.New("未知 Codex 回执")
		}
		return e, nil, false, nil
	}
	var p struct {
		ThreadID, TurnID string
		Item             struct{ Type, ID, Text string }
		Turn             struct{ ID, Status string }
	}
	if err := json.Unmarshal(v.Params, &p); err != nil {
		return e, nil, false, err
	}
	if len(v.ID) > 0 {
		e.Kind = "input_required"
		e.Text = "CLI 请求交互授权，请在原 CLI 会话中处理。此次请求未获批准。"
		response := map[string]any{"id": v.ID, "error": map[string]any{"code": -32601, "message": "Chela result mode does not accept interactive requests"}}
		if v.Method == "item/commandExecution/requestApproval" || v.Method == "item/fileChange/requestApproval" {
			response = map[string]any{"id": v.ID, "result": map[string]string{"decision": "decline"}}
		}
		raw, _ := json.Marshal(response)
		return e, append(raw, '\n'), false, nil
	}
	switch v.Method {
	case "item/completed":
		if p.Item.Type != "agentMessage" {
			return e, nil, false, nil
		}
		if p.ThreadID != o.external || p.TurnID == "" || p.Item.ID == "" {
			return e, nil, false, errors.New("Codex 回复缺少关联 ID")
		}
		if o.turn != "" && o.turn != p.TurnID {
			return e, nil, false, errors.New("Codex 回复轮次不匹配")
		}
		e = wireEvent{Session: p.ThreadID, Turn: p.TurnID, Reply: p.Item.ID, Text: p.Item.Text, Kind: "reply_available"}
	case "turn/completed":
		if p.ThreadID != o.external || p.Turn.ID == "" {
			return e, nil, false, errors.New("Codex 结束事件不匹配")
		}
		if p.Turn.Status != "completed" {
			e.Kind = "failed"
			e.Text = "Codex 轮次未正常完成"
		}
		return e, nil, true, nil
	}
	return e, nil, false, nil
}

var startObservedProcess = func(string, string, []string, string, func([]byte) ([]byte, bool, error), io.Writer) (terminalProcess, error) {
	return nil, errors.New("当前平台没有结构化 CLI 适配器")
}

func (t *Terminal) observe(s *terminalSession, prompt string) (terminalProcess, error) {
	info := s.info
	o := &observer{program: info.Program, directory: info.Directory, prompt: prompt, external: info.ExternalSessionID, expected: info.ExternalSessionID}
	return startObservedProcess(info.Program, info.Directory, o.args(), o.initial(), func(raw []byte) ([]byte, bool, error) {
		o.sequence++
		e, response, done, parseErr := o.parse(raw)
		if parseErr != nil {
			o.degraded = true
			fmt.Fprintf(s, "\r\n事件格式未核验，已停止生成结果提醒：%s\r\n", parseErr)
		}
		err := t.recordObservation(s, o, e, raw)
		if err != nil {
			return nil, true, err
		}
		if e.Text != "" {
			fmt.Fprintf(s, "\r\n%s\r\n", e.Text)
		} else if o.degraded {
			fmt.Fprintf(s, "%s\r\n", raw)
		}
		if parseErr != nil && info.Program == "codex" {
			return nil, true, parseErr
		}
		return response, done, nil
	}, s)
}

func (t *Terminal) recordObservation(s *terminalSession, o *observer, e wireEvent, raw []byte) error {
	s.mu.Lock()
	info := s.info
	s.mu.Unlock()
	format := info.Program + "-" + info.Version + "-v1"
	ref := ""
	if e.Kind == "reply_available" {
		ref = e.Session + "/" + e.Turn + "/" + e.Reply
	}
	key := fmt.Sprintf("%d:%d", info.Generation, o.sequence)
	err := t.store.Update(context.Background(), func(tx *sql.Tx) error {
		if _, err := tx.Exec("INSERT INTO executor_events VALUES(?,?,?,?,?,?)", info.ID, info.Generation, o.sequence, format, string(raw), storage.Now()); err != nil {
			return err
		}
		caps, _ := json.Marshal(map[string]bool{"terminal": true, "observable": o.external != "" && !o.degraded, "resumable": o.external != "" && !o.degraded, "controllable": false})
		if _, err := tx.Exec("UPDATE terminal_sessions SET external_session_id=NULLIF(?,''),adapter_version=?,capabilities_json=? WHERE terminal_session_id=? AND generation=?", o.external, format, string(caps), info.ID, info.Generation); err != nil {
			return err
		}
		if e.Kind == "" {
			return nil
		}
		payload, _ := json.Marshal(map[string]string{"text": e.Text, "external_session_id": e.Session, "turn_id": e.Turn, "reply_id": e.Reply})
		if ref != "" {
			key = "reply:" + ref
		}
		result, err := tx.Exec(`INSERT INTO execution_observations(observation_id,terminal_session_id,source_event_key,evidence_format,kind,result_ref,result_version,payload_json,observed_at) VALUES(?,?,?,?,?,NULLIF(?,''),1,?,?) ON CONFLICT(terminal_session_id,source_event_key) DO NOTHING`, info.ID+":"+key, info.ID, key, format, e.Kind, ref, string(payload), storage.Now())
		if err != nil {
			return err
		}
		n, _ := result.RowsAffected()
		if n == 0 {
			var prior string
			if err = tx.QueryRow("SELECT payload_json FROM execution_observations WHERE terminal_session_id=? AND source_event_key=?", info.ID, key).Scan(&prior); err != nil {
				return err
			}
			if prior != string(payload) {
				return errors.New("同一 CLI 结果 ID 返回了不同内容，已停止接收")
			}
			return nil
		}
		if ref == "" {
			return nil
		}
		if _, err = tx.Exec("UPDATE terminal_sessions SET last_result_ref=? WHERE terminal_session_id=?", ref, info.ID); err != nil {
			return err
		}
		var assistant string
		if err = tx.QueryRow("SELECT assistant_id FROM terminal_sessions WHERE terminal_session_id=?", info.ID).Scan(&assistant); err != nil {
			return err
		}
		if _, err = storage.AppendEvent(tx, assistant, "execution.reply_available", "planner_item", info.TaskID, int64(info.Generation), "assistant", assistant, info.ID, map[string]any{"terminal_session_id": info.ID, "result_ref": ref, "result_version": 1, "item_id": info.TaskID}); err != nil {
			return err
		}
		dedupe := "executor:" + info.ID + ":" + ref
		actions, _ := json.Marshal([]any{map[string]any{"action_id": "open", "label": "查看原现场", "route": map[string]any{"type": "terminal", "terminal_session_id": info.ID, "result_ref": ref, "result_version": 1}}})
		refs, _ := json.Marshal([]any{map[string]any{"source_type": "execution_observation", "source_id": info.ID + ":" + key, "source_revision": 1}})
		expires := time.Now().UTC().Add(24 * time.Hour).Format("2006-01-02T15:04:05.000Z")
		if _, err = tx.Exec(`INSERT INTO intentions(intention_id,assistant_id,kind,state,reason,evidence_refs_json,proposal_json,expires_at,dedupe_key,created_at) VALUES(?,?,'notify','eligible','CLI 新回复',?,'{}',?,?,?)`, dedupe, assistant, string(refs), expires, dedupe, storage.Now()); err != nil {
			return err
		}
		_, err = tx.Exec(`INSERT INTO deliveries(delivery_id,intention_id,assistant_id,fact_key,fact_version,purpose,dedupe_key,status,surface,text,actions_json,source_refs_json,not_before,expires_at) VALUES(?,?,?,?,'1','execution_result',?,'pending','pet',?,?,?,?,?)`, dedupe, dedupe, assistant, ref, dedupe, info.Program+" 有新回复", string(actions), string(refs), storage.Now(), expires)
		return err
	})
	if err == nil {
		s.mu.Lock()
		s.info.ExternalSessionID = o.external
		s.info.Observable = o.external != "" && !o.degraded
		s.info.Resumable = s.info.Observable
		s.mu.Unlock()
	}
	return err
}

func (t *Terminal) Results(id string) ([]result, error) {
	db, err := t.store.DB()
	if err != nil {
		return nil, err
	}
	rows, err := db.Query(`SELECT o.result_ref,o.result_version,json_extract(o.payload_json,'$.text'),EXISTS(SELECT 1 FROM execution_observations x WHERE x.terminal_session_id=o.terminal_session_id AND x.result_ref=o.result_ref AND x.result_version=o.result_version AND x.kind='reply_seen') FROM execution_observations o WHERE o.terminal_session_id=? AND o.kind='reply_available' ORDER BY o.observed_at DESC LIMIT 50`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	results := []result{}
	for rows.Next() {
		var r result
		if err = rows.Scan(&r.Ref, &r.Version, &r.Text, &r.Seen); err != nil {
			return nil, err
		}
		results = append(results, r)
	}
	return results, rows.Err()
}
func (t *Terminal) SeenResult(id, ref string, version int64) error {
	return t.store.Update(context.Background(), func(tx *sql.Tx) error {
		var format string
		if err := tx.QueryRow("SELECT evidence_format FROM execution_observations WHERE terminal_session_id=? AND result_ref=? AND result_version=? AND kind='reply_available'", id, ref, version).Scan(&format); err != nil {
			return errors.New("结果记录不存在")
		}
		key := fmt.Sprintf("seen:%s:%d", ref, version)
		if _, err := tx.Exec(`INSERT INTO execution_observations(observation_id,terminal_session_id,source_event_key,evidence_format,kind,result_ref,result_version,payload_json,observed_at) VALUES(?,?,?,?,'reply_seen',?,?,'{}',?) ON CONFLICT(terminal_session_id,source_event_key) DO NOTHING`, id+":"+key, id, key, format, ref, version, storage.Now()); err != nil {
			return err
		}
		_, err := tx.Exec("UPDATE deliveries SET status='seen',seen_at=?,revision=revision+1 WHERE delivery_id=? AND status IN ('pending','deferred','presented')", storage.Now(), "executor:"+id+":"+ref)
		return err
	})
}
