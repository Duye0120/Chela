package chat

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/Duye0120/Chela/native/internal/storage"
)

type piEntry struct {
	ID        string  `json:"id"`
	Parent    *string `json:"parentId"`
	Type      string  `json:"type"`
	Timestamp string  `json:"timestamp"`
	Message   struct {
		Role       string          `json:"role"`
		InputID    string          `json:"chelaInputId"`
		Content    json.RawMessage `json:"content"`
		ToolCallID string          `json:"toolCallId"`
		StopReason string          `json:"stopReason"`
		Usage      struct {
			Total int `json:"totalTokens"`
		} `json:"usage"`
	} `json:"message"`
	FirstKept   string          `json:"firstKeptEntryId"`
	Summary     string          `json:"summary"`
	Target      string          `json:"targetId"`
	Replacement json.RawMessage `json:"replacement"`
}

type checkpoint struct {
	Batch      string            `json:"batch_id"`
	Base       int64             `json:"base_revision"`
	Generation int64             `json:"branch_generation"`
	Lease      int64             `json:"lease_token"`
	Header     json.RawMessage   `json:"header"`
	Entries    []json.RawMessage `json:"added_entries"`
	Leaf       *string           `json:"active_leaf_id"`
	Boundary   string            `json:"boundary"`
	SafeCut    string            `json:"safe_cut_token_id"`
}

func (c *Chat) handlePiRequest(ctx context.Context, run Run, e agentEvent) (any, error) {
	if e.Context != runContext(run) {
		return nil, errors.New("运行身份不匹配")
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	switch e.Method {
	case "session.checkpoint", "session.compaction_commit":
		return c.checkpoint(ctx, run, e.Payload, e.Method == "session.compaction_commit")
	case "context.safe_cut":
		return c.prepareSafeCut(ctx, run, e.Payload)
	case "model.request.prepare":
		return c.prepareModel(ctx, run, e.Payload)
	case "model.request.finish":
		return c.finishModel(ctx, run, e.Payload)
	case "tool.request":
		return c.executeTool(ctx, run, e.Payload)
	case "input.pending":
		return c.pendingSteers(ctx, run)
	case "extension.report":
		return c.extensionReport(ctx, run, e.Payload)
	case "extension.ui":
		return c.requestExtensionUI(ctx, run, e.Payload)
	case "extension.ui.cancel":
		return nil, c.cancelExtensionUI(ctx, run, e.Payload)
	case "extension.tool.start", "extension.tool.finish":
		return c.nativeToolReceipt(ctx, run, e.Payload, e.Method == "extension.tool.finish")
	default:
		return nil, errors.New("不支持的 worker 请求")
	}
}

func (c *Chat) checkpoint(ctx context.Context, run Run, raw json.RawMessage, compaction bool) (json.RawMessage, error) {
	var p checkpoint
	if err := json.Unmarshal(raw, &p); err != nil {
		return nil, err
	}
	if p.Batch == "" || len(p.Batch) > 200 || p.Generation != run.Generation || p.Lease != run.LeaseToken {
		return nil, errors.New("无效的 checkpoint 身份")
	}
	hash := storage.Hash(raw)
	var ack json.RawMessage
	err := c.store.Update(ctx, func(tx *sql.Tx) error {
		var oldHash, oldAck string
		err := tx.QueryRow("SELECT request_hash,ack_json FROM checkpoint_receipts WHERE attempt_id=? AND batch_id=?", run.AttemptID, p.Batch).Scan(&oldHash, &oldAck)
		if err == nil {
			if oldHash != hash {
				return errors.New("IDEMPOTENCY_CONFLICT: checkpoint 内容改变")
			}
			ack = json.RawMessage(oldAck)
			return nil
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return err
		}
		if err := validateLease(tx, run); err != nil {
			return err
		}
		var revision, ordinal int64
		var leaf sql.NullString
		if err := tx.QueryRow("SELECT canonical_revision,active_leaf_id FROM branches WHERE branch_id=?", run.BranchID).Scan(&revision, &leaf); err != nil {
			return err
		}
		if revision != p.Base {
			return errors.New("REVISION_CONFLICT: 历史版本已改变")
		}
		var header struct {
			Type, ID string
			Version  int
		}
		if json.Unmarshal(p.Header, &header) != nil || header.Type != "session" || header.ID == "" || header.Version != 3 {
			return errors.New("不支持的 Pi 历史格式")
		}
		var existing string
		err = tx.QueryRow("SELECT header_json FROM pi_sessions WHERE session_id=?", run.SessionID).Scan(&existing)
		if errors.Is(err, sql.ErrNoRows) {
			if _, err := tx.Exec("INSERT INTO pi_sessions VALUES(?,'1.5.2','1.5.2','3',?,?)", run.SessionID, string(p.Header), storage.Hash([]byte(run.ModelID))); err != nil {
				return err
			}
		} else if err != nil {
			return err
		} else if storage.Hash([]byte(existing)) != storage.Hash(p.Header) {
			return errors.New("Pi session header 不能覆盖")
		}
		if err := tx.QueryRow("SELECT COALESCE(max(entry_ordinal),0) FROM pi_entries WHERE session_id=?", run.SessionID).Scan(&ordinal); err != nil {
			return err
		}
		revision++
		cursor, err := storage.AppendEvent(tx, run.AssistantID, "session.checkpoint", "branch", run.BranchID, revision, "session", run.SessionID, run.ID, map[string]any{"run_id": run.ID, "boundary": p.Boundary, "entry_count": len(p.Entries)})
		if err != nil {
			return err
		}
		compacted := false
		for _, payload := range p.Entries {
			var entry piEntry
			if json.Unmarshal(payload, &entry) != nil || entry.ID == "" || len(entry.ID) > 200 || entry.Type == "" {
				return errors.New("无效的 Pi entry")
			}
			parent := ""
			if entry.Parent != nil {
				parent = *entry.Parent
			}
			if parent != leaf.String {
				return errors.New("Pi entry 不在当前分支叶子之后")
			}
			if entry.Type == "context_edit" {
				if err := validateRecoveryOmission(tx, run, entry); err != nil {
					return err
				}
			}
			if entry.Type == "compaction" {
				if !compaction || compacted {
					return errors.New("压缩必须单独提交")
				}
				if err := validateCompaction(tx, run, entry, revision, p.SafeCut); err != nil {
					return err
				}
				compacted = true
			}
			ordinal++
			if _, err := tx.Exec("INSERT INTO pi_entries(session_id,entry_id,parent_id,entry_type,payload_json,payload_hash,committed_seq,entry_ordinal) VALUES(?,?,?,?,?,?,?,?)", run.SessionID, entry.ID, entry.Parent, entry.Type, string(payload), storage.Hash(payload), cursor, ordinal); err != nil {
				return err
			}
			if entry.Type == "message" {
				if err := projectMessage(tx, run, entry); err != nil {
					return err
				}
			}
			leaf = sql.NullString{String: entry.ID, Valid: true}
		}
		requestedLeaf := ""
		if p.Leaf != nil {
			requestedLeaf = *p.Leaf
		}
		if requestedLeaf != leaf.String || compaction != compacted {
			return errors.New("checkpoint 叶子或压缩声明不一致")
		}
		if _, err := tx.Exec("UPDATE branches SET canonical_revision=?,active_leaf_id=? WHERE branch_id=?", revision, p.Leaf, run.BranchID); err != nil {
			return err
		}
		if _, err := tx.Exec("UPDATE sessions SET updated_at=?,revision=revision+1 WHERE session_id=?", storage.Now(), run.SessionID); err != nil {
			return err
		}
		ack, err = json.Marshal(map[string]any{"revision": revision, "event_cursor": cursor, "batch_id": p.Batch})
		if err != nil {
			return err
		}
		_, err = tx.Exec("INSERT INTO checkpoint_receipts VALUES(?,?,?,?,?,?)", run.AttemptID, p.Batch, hash, string(ack), cursor, storage.Now())
		return err
	})
	return ack, err
}

func validateRecoveryOmission(tx *sql.Tx, run Run, entry piEntry) error {
	if entry.Target == "" || string(entry.Replacement) != "null" {
		return errors.New("只允许 Pi 隐去失败的重试消息")
	}
	var raw string
	err := tx.QueryRow(`WITH RECURSIVE path AS (SELECT e.* FROM pi_entries e JOIN branches b ON e.session_id=b.session_id AND e.entry_id=b.active_leaf_id WHERE b.branch_id=? UNION ALL SELECT e.* FROM pi_entries e JOIN path p ON e.session_id=p.session_id AND e.entry_id=p.parent_id) SELECT payload_json FROM path WHERE entry_id=?`, run.BranchID, entry.Target).Scan(&raw)
	if err != nil {
		return err
	}
	var target piEntry
	if json.Unmarshal([]byte(raw), &target) != nil || target.Message.Role != "assistant" || (target.Message.StopReason != "error" && target.Message.StopReason != "aborted") {
		return errors.New("重试不能改写已成功消息或其他分支")
	}
	_, err = tx.Exec(`UPDATE context_snapshots SET status='invalidated' WHERE branch_id=? AND status='valid' AND EXISTS (SELECT 1 FROM json_each(source_entries_json) WHERE json_extract(value,'$.entry_id')=?)`, run.BranchID, entry.Target)
	return err
}

type contentBlock struct {
	Type      string          `json:"type"`
	Text      string          `json:"text"`
	Thinking  string          `json:"thinking"`
	ID        string          `json:"id"`
	Name      string          `json:"name"`
	Arguments json.RawMessage `json:"arguments"`
}

func projectMessage(tx *sql.Tx, run Run, entry piEntry) error {
	message := ChatMessage{ID: "pi-" + run.SessionID + "-" + entry.ID, Role: entry.Message.Role, CreatedAt: entry.Timestamp, Tokens: entry.Message.Usage.Total}
	if message.Role == "assistant" {
		if err := tx.QueryRow("SELECT COALESCE(json_extract(manifest_json,'$.budget.window'),json_extract(manifest_json,'$.context_window'),0) FROM context_manifests WHERE attempt_id=? ORDER BY rowid DESC LIMIT 1", run.AttemptID).Scan(&message.Limit); err != nil && !errors.Is(err, sql.ErrNoRows) {
			return err
		}
	}
	var blocks []contentBlock
	if err := json.Unmarshal(entry.Message.Content, &blocks); err != nil {
		if err := json.Unmarshal(entry.Message.Content, &message.Content); err != nil {
			return errors.New("无效的 Pi message 内容")
		}
	}
	for _, block := range blocks {
		if block.Type == "text" {
			message.Content += block.Text
		}
		if block.Type == "thinking" {
			message.Thinking += block.Thinking
		}
		if block.Type == "toolCall" {
			if block.ID == "" || block.Name == "" || !json.Valid(block.Arguments) {
				return errors.New("无效的工具调用")
			}
			effect := "read"
			if strings.HasPrefix(block.Name, "mcp__") {
				effect = "external_write"
			}
			if block.Name == "write_file" || block.Name == "memory_save" || block.Name == "planner_propose" || block.Name == "planner_commit" || block.Name == "attention_save" || block.Name == "appraise_interaction" {
				effect = "local_write"
			}
			args, err := canonicalJSON(block.Arguments)
			if err != nil {
				return err
			}
			invocation := rand.Text()
			if _, err := tx.Exec(`INSERT INTO tool_invocations(invocation_id,run_id,attempt_id,pi_tool_call_id,tool_id,tool_version,final_args_json,final_args_hash,resource_versions_json,effect_class,state,idempotency_key,created_at) VALUES(?,?,?,?,?,'1',?,?,'{}',?,'planned',?,?)`, invocation, run.ID, run.AttemptID, block.ID, block.Name, string(args), storage.Hash(args), effect, run.AttemptID+":"+block.ID, storage.Now()); err != nil {
				return err
			}
			message.Tools = append(message.Tools, ToolActivity{ID: invocation, Name: block.Name, Arguments: string(args), State: "planned"})
		}
	}
	if message.Role == "toolResult" {
		message.Role = "tool"
	}
	if message.Role != "user" && message.Role != "assistant" && message.Role != "tool" && message.Role != "system" {
		return fmt.Errorf("不支持的消息 role: %s", message.Role)
	}
	if message.CreatedAt == "" {
		message.CreatedAt = storage.Now()
	}
	data, err := json.Marshal(message)
	if err != nil {
		return err
	}
	if message.Role == "user" {
		inputID := run.MessageID
		if entry.Message.InputID != "" {
			inputID = entry.Message.InputID
		}
		result, err := tx.Exec("UPDATE messages SET entry_id=? WHERE message_id=? AND run_id=? AND entry_id IS NULL", entry.ID, inputID, run.ID)
		if err != nil {
			return err
		}
		count, err := result.RowsAffected()
		if err != nil {
			return err
		}
		if count == 1 {
			_, err = tx.Exec("UPDATE run_inputs SET state='consumed',consumed_at=? WHERE run_id=? AND message_id=?", storage.Now(), run.ID, inputID)
			return err
		}
		if entry.Message.InputID != "" {
			return errors.New("补充输入不属于当前运行或已经消费")
		}
	}
	_, err = tx.Exec("INSERT INTO messages(message_id,session_id,branch_id,run_id,entry_id,role,content_json,created_at) VALUES(?,?,?,?,?,?,?,?)", message.ID, run.SessionID, run.BranchID, run.ID, entry.ID, message.Role, string(data), message.CreatedAt)
	return err
}

func canonicalJSON(raw json.RawMessage) ([]byte, error) {
	var value any
	decoder := json.NewDecoder(strings.NewReader(string(raw)))
	decoder.UseNumber()
	if err := decoder.Decode(&value); err != nil {
		return nil, err
	}
	return json.Marshal(value)
}
