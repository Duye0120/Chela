package chat

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"errors"
	"strconv"
	"strings"
	"time"

	"github.com/Duye0120/Chela/native/internal/companion"
	"github.com/Duye0120/Chela/native/internal/memory"
	"github.com/Duye0120/Chela/native/internal/storage"
	"github.com/Duye0120/Chela/native/internal/work"
)

func (c *Chat) Memories(session, query string) ([]memory.Item, error) {
	vector := c.queryVector(context.Background(), query)
	items := []memory.Item{}
	err := c.store.Update(context.Background(), func(tx *sql.Tx) error {
		assistant, scopes, err := memory.Scopes(tx, session)
		if err != nil {
			return err
		}
		items, err = memory.Retrieve(tx, assistant, scopes, query, true)
		if err == nil {
			items, err = memory.Fuse(tx, assistant, scopes, items, vector)
		}
		return err
	})
	return items, err
}

// SaveMemory is a user action; the correction itself is recorded as a new source.
func (c *Chat) SaveMemory(raw string) (memory.Item, error) {
	var p memory.Proposal
	var item memory.Item
	if json.Unmarshal([]byte(raw), &p) != nil {
		return item, errors.New("无效的记忆请求")
	}
	if p.MessageID == "" {
		p.MessageID = "memory-user-" + p.CommandID
	}
	err := c.store.Update(context.Background(), func(tx *sql.Tx) error {
		var branch string
		if err := tx.QueryRow("SELECT COALESCE(active_branch_id,session_id||'-main') FROM sessions WHERE session_id=? AND deleted_at IS NULL", p.SessionID).Scan(&branch); err != nil {
			return err
		}
		if len(p.MessageID) > 12 && p.MessageID[:12] == "memory-user-" {
			content, _ := json.Marshal(ChatMessage{ID: p.MessageID, Role: "user", Content: p.Content, CreatedAt: storage.Now()})
			if _, err := tx.Exec("INSERT INTO messages(message_id,session_id,branch_id,role,content_json,created_at) VALUES(?,?,?,'user',?,?) ON CONFLICT DO NOTHING", p.MessageID, p.SessionID, branch, string(content), storage.Now()); err != nil {
				return err
			}
		}
		var err error
		item, err = memory.Publish(tx, p, true)
		return err
	})
	return item, err
}

func (c *Chat) ForgetMemory(session, id, revision string) error {
	expected, err := strconv.ParseInt(revision, 10, 64)
	if err != nil {
		return errors.New("无效的记忆版本")
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	err = c.store.Update(context.Background(), func(tx *sql.Tx) error {
		_, scopes, err := memory.Scopes(tx, session)
		if err != nil {
			return err
		}
		item, err := memory.Get(tx, id)
		if err != nil {
			return err
		}
		allowed := false
		for _, scope := range scopes {
			if scope == item.Scope {
				allowed = true
			}
		}
		if !allowed {
			return errors.New("当前会话无权遗忘此记忆")
		}
		return memory.Forget(tx, id, expected)
	})
	if err != nil {
		return err
	}
	// Current workers may still hold a deleted evidence packet; rebuild on the next run.
	for _, g := range c.sending {
		g.cancel()
	}
	return nil
}

func (c *Chat) stateTool(ctx context.Context, run Run, request toolRequest) (any, error) {
	if request.Name == "memory_save" && run.Policy.Permission != "" && !run.Policy.MemoryEnabled {
		return nil, errors.New("用户已关闭自动提取偏好记忆")
	}
	var vector *memory.QueryVector
	if request.Name == "memory_search" {
		var q struct {
			Query string `json:"query"`
		}
		if json.Unmarshal(request.Args, &q) != nil {
			return nil, errors.New("无效的查询")
		}
		args, err := canonicalJSON(request.Args)
		if err != nil {
			return nil, err
		}
		var planned int
		err = c.store.Update(ctx, func(tx *sql.Tx) error {
			if err := validateLease(tx, run); err != nil {
				return err
			}
			return tx.QueryRow("SELECT count(*) FROM tool_invocations WHERE attempt_id=? AND pi_tool_call_id=? AND tool_id='memory_search' AND final_args_hash=? AND state='planned'", run.AttemptID, request.ID, storage.Hash(args)).Scan(&planned)
		})
		if err != nil {
			return nil, err
		}
		if planned == 1 {
			vector = c.queryVector(ctx, q.Query)
		}
	}
	if strings.HasPrefix(request.Name, "planner_") {
		if _, err := work.New(c.profile, c.store).Tasks(); err != nil {
			return nil, err
		}
	}
	var result json.RawMessage
	err := c.store.Update(ctx, func(tx *sql.Tx) error {
		if err := validateLease(tx, run); err != nil {
			return err
		}
		var invocation, name, hash, state, prior string
		if err := tx.QueryRow("SELECT invocation_id,tool_id,final_args_hash,state,COALESCE(result_json,'') FROM tool_invocations WHERE attempt_id=? AND pi_tool_call_id=?", run.AttemptID, request.ID).Scan(&invocation, &name, &hash, &state, &prior); err != nil {
			return errors.New("记忆工具尚未通过提交屏障")
		}
		args, err := canonicalJSON(request.Args)
		if err != nil {
			return err
		}
		if name != request.Name || hash != storage.Hash(args) {
			return errors.New("记忆工具参数与已提交记录不一致")
		}
		if state == "succeeded" {
			result = json.RawMessage(prior)
			return nil
		}
		if state != "planned" {
			return errors.New("记忆工具状态不允许重复执行")
		}
		var value any
		if name == "appraise_interaction" || name == "attention_save" {
			var source struct {
				MessageID string `json:"message_id"`
			}
			if err = json.Unmarshal(args, &source); err != nil {
				return err
			}
			var content string
			if err = tx.QueryRow("SELECT json_extract(m.content_json,'$.content') FROM messages m JOIN run_inputs i ON i.message_id=m.message_id WHERE i.run_id=? AND i.state='consumed' AND m.message_id=? AND m.erased_at IS NULL", run.ID, source.MessageID).Scan(&content); err != nil {
				return errors.New("只能使用本轮已消费的用户消息")
			}
			if name == "attention_save" {
				var a companion.Attention
				if err = json.Unmarshal(args, &a); err != nil {
					return err
				}
				value, err = companion.SaveAttention(tx, a, run.AssistantID, run.SessionID, source.MessageID, false)
			} else {
				var p companion.Appraisal
				if err = json.Unmarshal(args, &p); err != nil {
					return err
				}
				if !map[string]bool{"praise": true, "friendly_teasing": true, "correction": true}[p.Label] || p.Evidence == "" || len(p.Evidence) > 1000 || !strings.Contains(content, p.Evidence) {
					return errors.New("情绪提议缺少有效的原文证据")
				}
				if err = memory.Enqueue(tx, run.SessionID, source.MessageID); err != nil {
					return err
				}
				if err = tx.QueryRow("SELECT event_id FROM domain_events WHERE event_type='memory.source' AND aggregate_id=? AND redacted_at IS NULL", source.MessageID).Scan(&p.Cause); err != nil {
					return err
				}
				expression, e := companion.FreezeExpression(tx, run.ID, run.AssistantID, time.Now())
				if e != nil {
					return e
				}
				p.PersonaVersion = expression.PersonaVersion
				if p.Label == "correction" {
					p.Intensity = min(p.Intensity, .5)
				}
				_, err = companion.Apply(tx, run.AssistantID, p, "interaction:"+p.Label+":"+storage.Hash([]byte(strings.TrimSpace(content))), time.Now())
				value = map[string]bool{"accepted": err == nil}
			}
		} else if strings.HasPrefix(name, "planner_") {
			var frozen struct {
				Visible []memory.Scope `json:"visible_scopes"`
			}
			if err = json.Unmarshal(run.Scope, &frozen); err != nil {
				return err
			}
			project := ""
			for _, scope := range frozen.Visible {
				if scope.Type == "project" {
					project = scope.ID
				}
			}
			var current string
			if err = tx.QueryRow("SELECT COALESCE(project_id,'') FROM sessions WHERE session_id=? AND deleted_at IS NULL", run.SessionID).Scan(&current); err != nil {
				return err
			}
			if current != project {
				return errors.New("运行期间项目范围已变化，请重新发送")
			}
			switch name {
			case "planner_read":
				value, err = work.PlannerSnapshot(tx, project)
			case "planner_propose":
				var draft work.PlanDraft
				if err = json.Unmarshal(args, &draft); err != nil {
					return err
				}
				value, err = work.ProposePlan(tx, draft, run.SessionID, project, run.MessageID)
			case "planner_commit":
				if !map[string]bool{"按这个来": true, "确认计划": true, "采用这个计划": true, "就按这个计划": true}[strings.TrimRight(strings.TrimSpace(run.Text), "。！!")] {
					return errors.New("请先查看计划草案，再点击采用；也可以明确回复“按这个来”")
				}
				var p struct {
					ID       string `json:"id"`
					Revision int64  `json:"revision"`
				}
				if err = json.Unmarshal(args, &p); err != nil {
					return err
				}
				err = work.CommitPlan(tx, p.ID, p.Revision, run.SessionID)
				value = map[string]string{"state": "committed", "draft_id": p.ID}
			}
		} else if name == "memory_save" {
			var p memory.Proposal
			if json.Unmarshal(args, &p) != nil {
				return errors.New("无效的记忆提议")
			}
			var count int
			if err = tx.QueryRow("SELECT count(*) FROM run_inputs WHERE run_id=? AND message_id=? AND state='consumed'", run.ID, p.MessageID).Scan(&count); err != nil {
				return err
			}
			if count != 1 {
				return errors.New("只能使用本轮已消费的用户消息作为来源")
			}
			p.SessionID = run.SessionID
			p.CommandID = invocation
			_, currentScopes, scopeErr := memory.Scopes(tx, run.SessionID)
			if scopeErr != nil {
				return scopeErr
			}
			var frozen struct {
				Visible []memory.Scope `json:"visible_scopes"`
			}
			if err = json.Unmarshal(run.Scope, &frozen); err != nil {
				return err
			}
			allowed := false
			for _, current := range currentScopes {
				for _, s := range frozen.Visible {
					if s == current && s.Type == p.ScopeType {
						allowed = true
					}
				}
			}
			if !allowed {
				return errors.New("运行期间项目范围已变化，请重新发送")
			}
			value, err = memory.Publish(tx, p, false)
		} else {
			var q struct {
				Query string `json:"query"`
			}
			if json.Unmarshal(args, &q) != nil {
				return errors.New("无效的查询")
			}
			var scope struct {
				Visible []memory.Scope `json:"visible_scopes"`
			}
			if err = json.Unmarshal(run.Scope, &scope); err != nil {
				return err
			}
			var items []memory.Item
			items, err = memory.Retrieve(tx, run.AssistantID, scope.Visible, q.Query, false)
			if err == nil {
				value, err = memory.Fuse(tx, run.AssistantID, scope.Visible, items, vector)
			}
		}
		if err != nil {
			return err
		}
		body, err := json.Marshal(value)
		if err != nil {
			return err
		}
		result, err = json.Marshal(map[string]any{"content": []map[string]string{{"type": "text", "text": string(body)}}, "details": map[string]any{}})
		if err != nil {
			return err
		}
		_, err = tx.Exec("UPDATE tool_invocations SET state='succeeded',started_at=?,ended_at=?,result_json=?,result_hash=? WHERE invocation_id=?", storage.Now(), storage.Now(), string(result), storage.Hash(result), invocation)
		return err
	})
	return result, err
}

func memoryContext(tx *sql.Tx, run Run, query string, vector *memory.QueryVector) ([]memory.Item, []map[string]any, error) {
	if run.Origin == "proactive" {
		return nil, nil, nil
	}
	var scope struct {
		Visible []memory.Scope `json:"visible_scopes"`
	}
	if err := json.Unmarshal(run.Scope, &scope); err != nil {
		return nil, nil, err
	}
	items, err := memory.Retrieve(tx, run.AssistantID, scope.Visible, query, false)
	if err != nil {
		return nil, nil, err
	}
	items, err = memory.Fuse(tx, run.AssistantID, scope.Visible, items, vector)
	if err != nil {
		return nil, nil, err
	}
	prefs, err := memory.Retrieve(tx, run.AssistantID, scope.Visible, "", false)
	if err != nil {
		return nil, nil, err
	}
	seen := map[string]bool{}
	selected := []memory.Item{}
	size := 0
	for _, i := range append(prefs, items...) {
		if seen[i.ID] || (i.Kind != "preference" && !containsMemory(items, i.ID)) {
			continue
		}
		if len(selected) >= 12 || size+len(i.Content) > 12000 {
			continue
		}
		selected = append(selected, i)
		seen[i.ID] = true
		size += len(i.Content)
	}
	rows, err := tx.Query("SELECT m.message_id,json_extract(m.content_json,'$.content') FROM run_inputs i JOIN messages m ON m.message_id=i.message_id WHERE i.run_id=? AND i.state='consumed'", run.ID)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()
	sources := []map[string]any{}
	for rows.Next() {
		var id, text string
		if err = rows.Scan(&id, &text); err != nil {
			return nil, nil, err
		}
		sources = append(sources, map[string]any{"message_id": id, "explicit_memory_request": memory.Explicit(text)})
	}
	return selected, sources, rows.Err()
}
func containsMemory(items []memory.Item, id string) bool {
	for _, i := range items {
		if i.ID == id {
			return true
		}
	}
	return false
}

func runScope(tx *sql.Tx, session string) ([]byte, error) {
	assistant, scopes, err := memory.Scopes(tx, session)
	if err != nil {
		return nil, err
	}
	var epoch int64
	if err = tx.QueryRow("SELECT erase_epoch FROM assistants WHERE assistant_id=?", assistant).Scan(&epoch); err != nil {
		return nil, err
	}
	return json.Marshal(map[string]any{"scope_id": rand.Text(), "revision": 1, "visible_scopes": scopes, "allowed_source_ids": []string{}, "grants": []any{}, "output_targets": []string{"session:" + session}, "erase_epoch": epoch})
}
