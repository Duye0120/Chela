package chat

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"errors"
	"path/filepath"
	"time"

	"github.com/Duye0120/Chela/native/internal/companion"
	"github.com/Duye0120/Chela/native/internal/storage"
)

type bridgeContext struct {
	Assistant string `json:"assistant_id"`
	Session   string `json:"session_id"`
	Branch    string `json:"branch_id"`
	Run       string `json:"run_id"`
	Attempt   string `json:"attempt_id"`
}

type agentEvent struct {
	Protocol    int             `json:"protocol_version"`
	Kind        string          `json:"kind"`
	Method      string          `json:"method"`
	Worker      string          `json:"worker_id"`
	Epoch       int64           `json:"epoch"`
	Seq         int64           `json:"worker_seq"`
	RequestID   string          `json:"request_id,omitempty"`
	Correlation string          `json:"correlation_id,omitempty"`
	Context     bridgeContext   `json:"context"`
	Payload     json.RawMessage `json:"payload"`
	Error       string          `json:"error,omitempty"`
}

func runContext(run Run) bridgeContext {
	return bridgeContext{run.AssistantID, run.SessionID, run.BranchID, run.ID, run.AttemptID}
}

func (c *Chat) performRun(ctx context.Context, run Run) error {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Minute)
	defer cancel()
	_, configs, _, _, err := c.catalog()
	if err != nil {
		return err
	}
	cfg, ok := configs[run.ModelID]
	if !ok {
		return errors.New("运行使用的模型已不可用")
	}
	w, err := c.piWorker(run.SessionID)
	if err != nil {
		return err
	}
	defer func() { cancel(); w.pending.Wait() }()
	snapshot, err := c.openPi(run, w)
	if err != nil {
		return err
	}
	installed, err := c.freezeCapabilities(ctx, run)
	if err != nil {
		return err
	}
	for _, m := range installed {
		if len(m.Resources.Extensions) > 0 {
			defer w.stop()
			break
		}
	}
	p := &piRun{context: runContext(run), done: make(chan struct{})}
	p.onRequest = func(e agentEvent) (any, error) { return c.handlePiRequest(ctx, run, e) }
	p.onDelta = func(e agentEvent) {
		var delta struct{ Type, Delta string }
		if json.Unmarshal(e.Payload, &delta) != nil {
			return
		}
		c.mu.Lock()
		defer c.mu.Unlock()
		if g := c.sending[run.SessionID]; g != nil && g.runID == run.ID {
			if delta.Type == "text_delta" {
				g.text.WriteString(delta.Delta)
			} else if delta.Type == "thinking_delta" {
				g.thinking.WriteString(delta.Delta)
			}
		}
	}
	w.mu.Lock()
	w.run = p
	w.mu.Unlock()
	defer func() {
		w.mu.Lock()
		if w.run == p {
			w.run = nil
		}
		w.mu.Unlock()
	}()
	payload := map[string]any{"source": cfg.Source, "entry": cfg.Entry, "key": cfg.Key, "effort": run.Effort, "text": run.Text, "workspace": run.Workspace, "agent_dir": filepath.Join(c.profile, "worker"), "snapshot": snapshot, "lease_token": run.LeaseToken, "branch_generation": run.Generation, "operation": run.Operation}
	payload["capabilities"] = installed
	mcpTools, err := c.freezeMCP(ctx, run)
	if err != nil {
		return err
	}
	payload["mcp_tools"] = mcpTools
	if run.Origin == "consolidation" {
		payload["operation"] = "consolidate"
	}
	if run.Origin == "proactive" {
		payload["operation"] = "review"
	}
	roles, err := c.ModelRoles()
	if err != nil {
		return err
	}
	if ref := roles["compaction"]; ref != "" {
		compact, ok := configs[ref]
		if !ok {
			return errors.New("绑定的压缩模型已不可用")
		}
		payload["compaction_model"] = compact
	}
	if err := w.send(ctx, "request", "run.start", rand.Text(), p.context, payload, ""); err != nil {
		return err
	}
	select {
	case <-p.done:
	case <-w.done:
		return w.err
	case <-ctx.Done():
		aborted := make(chan struct{})
		go func() {
			_ = w.send(context.Background(), "cancel", "run.cancel", rand.Text(), p.context, nil, "")
			close(aborted)
		}()
		timer := time.NewTimer(2 * time.Second)
		defer timer.Stop()
		select {
		case <-p.done:
		case <-w.done:
		case <-timer.C:
			w.stop()
			<-w.done
		}
		<-aborted
		return ctx.Err()
	}
	if p.final.Error != "" {
		return errors.New(p.final.Error)
	}
	if p.final.Method != "run.settled" {
		return errors.New("Agent 未确认运行已收敛")
	}
	return nil
}

func (c *Chat) openPi(run Run, w *piWorker) (map[string]any, error) {
	snapshot := map[string]any{"entries": []json.RawMessage{}, "active_leaf_id": nil}
	err := c.store.Update(context.Background(), func(tx *sql.Tx) error {
		if err := validateLease(tx, run); err != nil {
			return err
		}
		var revision int64
		var leaf sql.NullString
		if err := tx.QueryRow("SELECT canonical_revision,active_leaf_id FROM branches WHERE branch_id=?", run.BranchID).Scan(&revision, &leaf); err != nil {
			return err
		}
		snapshot["revision"] = revision
		if leaf.Valid {
			snapshot["active_leaf_id"] = leaf.String
		}
		var header string
		err := tx.QueryRow("SELECT header_json FROM pi_sessions WHERE session_id=?", run.SessionID).Scan(&header)
		if err == nil {
			snapshot["header"] = json.RawMessage(header)
		} else if !errors.Is(err, sql.ErrNoRows) {
			return err
		}
		rows, err := tx.Query("SELECT payload_json FROM pi_entries WHERE session_id=? AND erased_at IS NULL ORDER BY entry_ordinal", run.SessionID)
		if err != nil {
			return err
		}
		entries := []json.RawMessage{}
		for rows.Next() {
			var raw string
			if err := rows.Scan(&raw); err != nil {
				rows.Close()
				return err
			}
			entries = append(entries, json.RawMessage(raw))
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return err
		}
		snapshot["entries"] = entries
		var erasedSummary string
		err = tx.QueryRow(`WITH RECURSIVE path AS (SELECT e.* FROM pi_entries e JOIN branches b ON e.session_id=b.session_id AND e.entry_id=b.active_leaf_id WHERE b.branch_id=? UNION ALL SELECT e.* FROM pi_entries e JOIN path p ON e.session_id=p.session_id AND e.entry_id=p.parent_id) SELECT COALESCE((SELECT status FROM context_snapshots WHERE compaction_entry_id=path.entry_id AND branch_id IN (SELECT branch_id FROM branches WHERE session_id=?)),'') FROM path WHERE entry_type='compaction' ORDER BY entry_ordinal DESC LIMIT 1`, run.BranchID, run.SessionID).Scan(&erasedSummary)
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			return err
		}
		snapshot["rebuild_context"] = erasedSummary == "erased"
		if header == "" {
			rows, err := tx.Query("SELECT content_json FROM messages WHERE session_id=? AND run_id IS NULL AND erased_at IS NULL ORDER BY created_at,rowid", run.SessionID)
			if err != nil {
				return err
			}
			legacy := []json.RawMessage{}
			for rows.Next() {
				var raw string
				if err := rows.Scan(&raw); err != nil {
					rows.Close()
					return err
				}
				legacy = append(legacy, json.RawMessage(raw))
			}
			err = rows.Err()
			rows.Close()
			if err != nil {
				return err
			}
			snapshot["legacy_messages"] = legacy
		}
		var persona string
		expression, err := companion.FreezeExpression(tx, run.ID, run.AssistantID, time.Now())
		if err != nil {
			return err
		}
		if err := tx.QueryRow("SELECT profile_json FROM persona_versions WHERE assistant_id=? AND revision=?", run.AssistantID, expression.PersonaVersion).Scan(&persona); err != nil {
			return err
		}
		snapshot["persona"] = json.RawMessage(persona)
		var handoff string
		if err := tx.QueryRow("SELECT handoff FROM run_parameters WHERE run_id=?", run.ID).Scan(&handoff); err != nil {
			return err
		}
		snapshot["handoff"] = handoff
		now := storage.Now()
		fingerprint := storage.Hash([]byte(run.ModelID + "\n" + run.Effort + "\n" + run.Workspace))
		if _, err := tx.Exec(`INSERT INTO run_attempts(attempt_id,run_id,attempt_no,worker_id,worker_epoch,lease_token,start_revision,state,config_fingerprint,started_at) VALUES(?,?,1,?,?,?,?,'running',?,?)`, run.AttemptID, run.ID, w.id, w.epoch, run.LeaseToken, revision, fingerprint, now); err != nil {
			return err
		}
		if _, err := tx.Exec("UPDATE runs SET state='running',phase='thinking',revision=revision+1,updated_at=? WHERE run_id=?", now, run.ID); err != nil {
			return err
		}
		if _, err := tx.Exec("UPDATE run_inputs SET state='consumed',consumed_at=? WHERE run_id=? AND mode='initial'", now, run.ID); err != nil {
			return err
		}
		_, err = storage.AppendEvent(tx, run.AssistantID, "run.running", "run", run.ID, run.Revision+1, "session", run.SessionID, run.ID, map[string]string{"state": "running"})
		return err
	})
	return snapshot, err
}

func validateLease(tx *sql.Tx, run Run) error {
	var state, attempt, lease string
	var token, generation int64
	if err := tx.QueryRow(`SELECT r.state,COALESCE(r.current_attempt_id,''),COALESCE(b.lease_run_id,''),b.lease_token,b.generation FROM runs r JOIN branches b ON b.branch_id=r.branch_id WHERE r.run_id=?`, run.ID).Scan(&state, &attempt, &lease, &token, &generation); err != nil {
		return err
	}
	if (state != "starting" && state != "running" && state != "waiting_approval") || attempt != run.AttemptID || lease != run.ID || token != run.LeaseToken || generation != run.Generation {
		return errors.New("STALE_RUN: 执行租约已失效")
	}
	var scope struct {
		Epoch int64 `json:"erase_epoch"`
	}
	if err := json.Unmarshal(run.Scope, &scope); err != nil {
		return err
	}
	var epoch int64
	if err := tx.QueryRow("SELECT erase_epoch FROM assistants WHERE assistant_id=?", run.AssistantID).Scan(&epoch); err != nil {
		return err
	}
	if scope.Epoch != epoch {
		return errors.New("STALE_CONTEXT: 记忆已被遗忘，请重新提交以重建上下文")
	}
	return nil
}
