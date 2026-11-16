package chat

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/Duye0120/Chela/native/internal/companion"
	"github.com/Duye0120/Chela/native/internal/memory"
	"github.com/Duye0120/Chela/native/internal/storage"
	"github.com/Duye0120/Chela/native/internal/work"
)

type Run struct {
	ID          string          `json:"run_id"`
	AssistantID string          `json:"assistant_id"`
	SessionID   string          `json:"session_id"`
	BranchID    string          `json:"branch_id"`
	Origin      string          `json:"origin"`
	Lane        string          `json:"lane"`
	State       string          `json:"state"`
	Phase       string          `json:"phase"`
	Revision    int64           `json:"revision"`
	AttemptID   string          `json:"current_attempt_id,omitempty"`
	CreatedAt   string          `json:"created_at"`
	UpdatedAt   string          `json:"updated_at"`
	Reason      string          `json:"terminal_reason,omitempty"`
	Scope       json.RawMessage `json:"scope"`
	Budget      json.RawMessage `json:"budget"`
	MessageID   string          `json:"message_id"`
	Text        string          `json:"text,omitempty"`
	ModelID     string          `json:"model_id"`
	Effort      string          `json:"effort"`
	Workspace   string          `json:"workspace"`
	LeaseToken  int64           `json:"lease_token"`
	Generation  int64           `json:"branch_generation"`
	Operation   string          `json:"operation"`
}

type SubmitReceipt struct {
	MessageID string `json:"message_id"`
	RunID     string `json:"run_id"`
	State     string `json:"state"`
	Cursor    string `json:"event_cursor"`
}

const runSelect = `SELECT r.run_id,r.assistant_id,r.session_id,r.branch_id,r.origin,r.lane,r.state,r.phase,r.revision,COALESCE(r.current_attempt_id,''),r.created_at,r.updated_at,COALESCE(r.terminal_reason,''),r.scope_json,r.budget_json,i.message_id,m.content_json,p.model_id,p.effort,p.workspace_path,b.lease_token,b.generation,p.operation FROM runs r JOIN run_inputs i ON i.run_id=r.run_id AND i.mode='initial' JOIN messages m ON m.message_id=i.message_id JOIN run_parameters p ON p.run_id=r.run_id JOIN branches b ON b.branch_id=r.branch_id`

func scanRun(row interface{ Scan(...any) error }) (Run, error) {
	var run Run
	var scope, budget, message string
	err := row.Scan(&run.ID, &run.AssistantID, &run.SessionID, &run.BranchID, &run.Origin, &run.Lane, &run.State, &run.Phase, &run.Revision, &run.AttemptID, &run.CreatedAt, &run.UpdatedAt, &run.Reason, &scope, &budget, &run.MessageID, &message, &run.ModelID, &run.Effort, &run.Workspace, &run.LeaseToken, &run.Generation, &run.Operation)
	if err != nil {
		return run, err
	}
	run.Scope = json.RawMessage(scope)
	run.Budget = json.RawMessage(budget)
	var input ChatMessage
	if err := json.Unmarshal([]byte(message), &input); err != nil {
		return run, err
	}
	run.Text = input.Content
	return run, nil
}

func (c *Chat) Start() error {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.startLocked()
}

func (c *Chat) startLocked() error {
	if c.closed {
		return errors.New("Chela Agent 已关闭")
	}
	if c.started {
		return nil
	}
	if _, err := c.database(); err != nil {
		return err
	}
	if err := companion.ImportProfile(c.store, c.profile); err != nil {
		return err
	}
	err := c.store.Update(context.Background(), func(tx *sql.Tx) error {
		rows, err := tx.Query("SELECT run_id,assistant_id,session_id,revision FROM runs WHERE state IN ('starting','running','waiting_approval','waiting_input','cancelling')")
		if err != nil {
			return err
		}
		type interrupted struct {
			id, assistant, session string
			revision               int64
		}
		pending := []interrupted{}
		for rows.Next() {
			var r interrupted
			if err := rows.Scan(&r.id, &r.assistant, &r.session, &r.revision); err != nil {
				rows.Close()
				return err
			}
			pending = append(pending, r)
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return err
		}
		for _, r := range pending {
			if _, err := tx.Exec("UPDATE runs SET state='interrupted',phase='idle',revision=revision+1,updated_at=?,terminal_reason='应用重新启动，原执行已中断' WHERE run_id=?", storage.Now(), r.id); err != nil {
				return err
			}
			if _, err := storage.AppendEvent(tx, r.assistant, "run.interrupted", "run", r.id, r.revision+1, "session", r.session, r.id, map[string]string{"reason": "应用重新启动，原执行已中断"}); err != nil {
				return err
			}
		}
		if _, err := tx.Exec("UPDATE run_attempts SET state='interrupted',ended_at=? WHERE state IN ('starting','running')", storage.Now()); err != nil {
			return err
		}
		if _, err := tx.Exec("UPDATE run_inputs SET state='cancelled' WHERE state='queued' AND run_id IN (SELECT run_id FROM runs WHERE state='interrupted')"); err != nil {
			return err
		}
		if _, err := tx.Exec("UPDATE tool_invocations SET state='outcome_unknown' WHERE state='executing'"); err != nil {
			return err
		}
		if _, err := tx.Exec("UPDATE approvals SET status='invalidated',revision=revision+1 WHERE status='pending'"); err != nil {
			return err
		}
		if _, err := tx.Exec("UPDATE tool_invocations SET state='cancelled',ended_at=? WHERE state IN ('planned','awaiting_approval')", storage.Now()); err != nil {
			return err
		}
		if _, err := tx.Exec("UPDATE branches SET lease_run_id=NULL,lease_until=NULL,lease_token=lease_token+1 WHERE lease_run_id IS NOT NULL"); err != nil {
			return err
		}
		if _, err := tx.Exec("UPDATE consolidation_jobs SET state='cancelled',lease_owner=NULL,lease_until=NULL,fencing_token=fencing_token+1,last_error='应用重新启动',updated_at=? WHERE state='running' OR (state='queued' AND run_id IN (SELECT run_id FROM runs WHERE state='interrupted'))", storage.Now()); err != nil {
			return err
		}
		_, err = tx.Exec("UPDATE model_requests SET status='unknown',ended_at=? WHERE status='started'", storage.Now())
		return err
	})
	if err != nil {
		return err
	}
	c.started = true
	c.workers.Add(2)
	go c.schedule()
	go c.indexMemories()
	c.wakeRuns()
	return nil
}

func (c *Chat) wakeRuns() {
	select {
	case c.wake <- struct{}{}:
	default:
	}
}

// Submit commits user input before returning. Application lifetime owns execution.
func (c *Chat) Submit(id, text, modelID, effort, commandID string) (SubmitReceipt, error) {
	return c.submit(id, text, modelID, effort, commandID, "prompt", "", "")
}

func (c *Chat) Compact(id, commandID string) (SubmitReceipt, error) {
	return c.submit(id, "整理当前对话上下文", "", "off", commandID, "compact", "", "")
}

func (c *Chat) submit(id, text, modelID, effort, commandID, operation, recoveryOf, editOf string) (SubmitReceipt, error) {
	text = strings.TrimSpace(text)
	if text == "" || len(text) > 512*1024 {
		return SubmitReceipt{}, errors.New("消息不能为空，且应小于 512 KiB")
	}
	if commandID == "" || len(commandID) > 200 {
		return SubmitReceipt{}, errors.New("无效的提交标识")
	}
	switch effort {
	case "", "off", "minimal", "low", "medium", "high", "xhigh", "max":
	default:
		return SubmitReceipt{}, errors.New("不支持的推理强度")
	}
	request, _ := json.Marshal([]string{id, text, modelID, effort, operation, recoveryOf, editOf})
	hash := storage.Hash(request)
	c.mu.Lock()
	defer c.mu.Unlock()
	if err := c.startLocked(); err != nil {
		return SubmitReceipt{}, err
	}
	db, err := c.database()
	if err != nil {
		return SubmitReceipt{}, err
	}
	var oldHash, oldResult string
	err = db.QueryRow("SELECT payload_hash,result_json FROM command_receipts WHERE command_id=?", commandID).Scan(&oldHash, &oldResult)
	if err == nil {
		if oldHash != hash {
			return SubmitReceipt{}, errors.New("IDEMPOTENCY_CONFLICT: 提交标识已用于另一条消息")
		}
		var receipt SubmitReceipt
		err = json.Unmarshal([]byte(oldResult), &receipt)
		return receipt, err
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return SubmitReceipt{}, err
	}
	session, err := c.find(id)
	if err != nil {
		return SubmitReceipt{}, err
	}
	if session.Archived {
		return SubmitReceipt{}, errors.New("请先恢复已归档的对话")
	}
	_, configs, defaultID, _, err := c.catalog()
	if err != nil {
		return SubmitReceipt{}, err
	}
	if modelID == "" {
		modelID = session.ModelID
		if modelID == "" {
			modelID = defaultID
		}
		if operation == "compact" {
			roles, err := c.ModelRoles()
			if err != nil {
				return SubmitReceipt{}, err
			}
			if roles["compaction"] != "" {
				modelID = roles["compaction"]
			}
		}
	}
	if _, ok := configs[modelID]; !ok {
		return SubmitReceipt{}, errors.New("请先配置聊天模型")
	}
	now := storage.Now()
	receipt := SubmitReceipt{MessageID: rand.Text(), RunID: rand.Text(), State: "queued"}
	input := ChatMessage{ID: receipt.MessageID, Role: "user", Content: text, CreatedAt: now}
	message, _ := json.Marshal(input)
	budget, _ := json.Marshal(map[string]any{"max_input_tokens": 128000, "max_output_tokens": 8192, "max_model_requests": 32, "max_tool_calls": 64, "deadline_at": time.Now().UTC().Add(10 * time.Minute).Format("2006-01-02T15:04:05.000Z")})
	err = c.store.Update(context.Background(), func(tx *sql.Tx) error {
		var existingHash, existingResult string
		err := tx.QueryRow("SELECT payload_hash,result_json FROM command_receipts WHERE command_id=?", commandID).Scan(&existingHash, &existingResult)
		if err == nil {
			if existingHash != hash {
				return errors.New("IDEMPOTENCY_CONFLICT: 提交标识已用于另一条消息")
			}
			return json.Unmarshal([]byte(existingResult), &receipt)
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return err
		}
		origin, handoff := "user", ""
		scope, err := runScope(tx, id)
		if err != nil {
			return err
		}
		if editOf != "" {
			var editErr error
			session.BranchID, editErr = createEditBranch(tx, session, editOf)
			if editErr != nil {
				return editErr
			}
		}
		if recoveryOf != "" {
			var recoveryErr error
			session.BranchID, handoff, recoveryErr = createRecoveryBranch(tx, session, recoveryOf)
			if recoveryErr != nil {
				return recoveryErr
			}
			origin = "recovery"
		}
		if _, err := tx.Exec(`INSERT INTO runs(run_id,assistant_id,session_id,branch_id,origin,lane,state,phase,scope_json,budget_json,created_at,updated_at,recovery_of_run_id) VALUES(?,?,?,?,?,'foreground','queued','idle',?,?,?,?,NULLIF(?,''))`, receipt.RunID, session.AssistantID, id, session.BranchID, origin, string(scope), string(budget), now, now, recoveryOf); err != nil {
			return err
		}
		if _, err := tx.Exec(`INSERT INTO messages(message_id,session_id,branch_id,run_id,role,content_json,created_at) VALUES(?,?,?,?,'user',?,?)`, input.ID, id, session.BranchID, receipt.RunID, string(message), now); err != nil {
			return err
		}
		if _, err := tx.Exec("INSERT INTO run_inputs(input_id,run_id,message_id,mode,state,created_at) VALUES(?,?,?,'initial','queued',?)", rand.Text(), receipt.RunID, input.ID, now); err != nil {
			return err
		}
		if _, err := tx.Exec("INSERT INTO run_parameters(run_id,model_id,effort,workspace_path,operation,handoff) VALUES(?,?,?,?,?,?)", receipt.RunID, modelID, effort, session.Project, operation, handoff); err != nil {
			return err
		}
		if memory.Explicit(text) && operation == "prompt" {
			if err := memory.Enqueue(tx, id, input.ID); err != nil {
				return err
			}
		}
		if mode := map[string]string{"安静": "quiet", "安静一点": "quiet", "严肃一点": "focused", "恢复正常": "focused"}[strings.TrimRight(text, "。！!")]; operation == "prompt" && mode != "" {
			value, _ := json.Marshal(mode)
			if _, err = tx.Exec("INSERT INTO preferences(assistant_id,scope_type,scope_id,preference_key,revision,value_json,updated_at) VALUES(?,'session',?,'interaction_mode',1,?,?) ON CONFLICT DO UPDATE SET revision=revision+1,value_json=excluded.value_json,updated_at=excluded.updated_at", session.AssistantID, id, string(value), now); err != nil {
				return err
			}
		}
		title := session.Title
		if len(session.Messages) == 0 && title == newChatTitle {
			runes := []rune(strings.Join(strings.Fields(text), " "))
			if len(runes) > 32 {
				runes = runes[:32]
			}
			title = string(runes)
		}
		savedModel, savedEffort := modelID, effort
		if operation == "compact" {
			savedModel, savedEffort = session.ModelID, session.Effort
		}
		if _, err := tx.Exec("UPDATE sessions SET title=?,model_id=?,effort=?,updated_at=?,revision=revision+1 WHERE session_id=?", title, savedModel, savedEffort, now, id); err != nil {
			return err
		}
		receipt.Cursor, err = storage.AppendEvent(tx, session.AssistantID, "run.queued", "run", receipt.RunID, 1, "session", id, commandID, map[string]string{"run_id": receipt.RunID, "message_id": receipt.MessageID, "state": "queued"})
		if err != nil {
			return err
		}
		result, err := json.Marshal(receipt)
		if err != nil {
			return err
		}
		_, err = tx.Exec("INSERT INTO command_receipts VALUES(?,'user','SubmitMessage',?,?,?,?)", commandID, hash, string(result), receipt.Cursor, now)
		return err
	})
	if err == nil {
		for _, g := range c.sending {
			if g.lane == "background" {
				g.cancel()
			}
		}
		c.wakeRuns()
	}
	return receipt, err
}

func (c *Chat) Runs() ([]Run, error) {
	if err := c.Start(); err != nil {
		return nil, err
	}
	db, err := c.store.DB()
	if err != nil {
		return nil, err
	}
	rows, err := db.Query(runSelect + " WHERE r.origin!='consolidation' ORDER BY r.created_at,r.rowid")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	runs := []Run{}
	for rows.Next() {
		run, err := scanRun(rows)
		if err != nil {
			return nil, err
		}
		runs = append(runs, run)
	}
	return runs, rows.Err()
}

func (c *Chat) GetRun(id string) (Run, error) {
	db, err := c.store.DB()
	if err != nil {
		return Run{}, err
	}
	return scanRun(db.QueryRow(runSelect+" WHERE r.run_id=?", id))
}

func (c *Chat) Events(after string) ([]storage.Event, error) { return c.store.Events(after) }

func (c *Chat) Cancel(runID string) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	run, err := c.GetRun(runID)
	if err != nil {
		return err
	}
	if terminalRun(run.State) {
		return nil
	}
	state := "cancelling"
	if run.State == "queued" {
		state = "cancelled"
	}
	err = c.store.Update(context.Background(), func(tx *sql.Tx) error {
		if _, err := tx.Exec("UPDATE runs SET state=?,revision=revision+1,updated_at=?,terminal_reason='用户停止' WHERE run_id=?", state, storage.Now(), runID); err != nil {
			return err
		}
		if state == "cancelled" {
			if _, err := tx.Exec("UPDATE run_inputs SET state='cancelled' WHERE run_id=? AND state='queued'", runID); err != nil {
				return err
			}
		}
		_, err := storage.AppendEvent(tx, run.AssistantID, "run."+state, "run", run.ID, run.Revision+1, "session", run.SessionID, run.ID, map[string]string{"state": state})
		return err
	})
	if err == nil {
		if current := c.sending[run.SessionID]; current != nil && current.runID == runID {
			current.cancel()
		}
		c.wakeRuns()
	}
	return err
}

func terminalRun(state string) bool {
	return state == "succeeded" || state == "failed" || state == "cancelled" || state == "interrupted"
}

func (c *Chat) schedule() {
	defer c.workers.Done()
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-c.lifetime.Done():
			return
		case <-c.wake:
		case <-ticker.C:
		}
		if err := work.Tick(c.store, time.Now()); err != nil {
			c.mu.Lock()
			c.runtimeError = err.Error()
			c.mu.Unlock()
		}
		if err := companion.Tick(c.store, time.Now()); err != nil {
			c.mu.Lock()
			c.runtimeError = err.Error()
			c.mu.Unlock()
		}
		for {
			c.mu.Lock()
			if c.closed || len(c.sending) >= 3 {
				c.mu.Unlock()
				break
			}
			if err := c.queueAttention(); err != nil {
				c.runtimeError = err.Error()
			}
			if err := c.queueConsolidation(); err != nil {
				c.runtimeError = err.Error()
			}
			run, err := c.claimRun()
			if errors.Is(err, sql.ErrNoRows) {
				c.mu.Unlock()
				break
			}
			if err != nil {
				c.runtimeError = err.Error()
				c.mu.Unlock()
				break
			}
			ctx, cancel := context.WithCancel(c.lifetime)
			c.sending[run.SessionID] = &generation{cancel: cancel, runID: run.ID, lane: run.Lane}
			c.workers.Add(1)
			c.mu.Unlock()
			go c.executeRun(ctx, run)
		}
	}
}

func (c *Chat) claimRun() (Run, error) {
	var run Run
	err := c.store.Update(c.lifetime, func(tx *sql.Tx) error {
		var err error
		run, err = scanRun(tx.QueryRow(runSelect + ` WHERE r.state='queued' AND NOT EXISTS (SELECT 1 FROM runs active WHERE active.session_id=r.session_id AND active.state IN ('starting','running','waiting_approval','waiting_input','cancelling')) AND ((r.lane='foreground' AND (SELECT count(*) FROM runs x WHERE x.lane='foreground' AND x.state IN ('starting','running','waiting_approval','waiting_input','cancelling'))<2) OR (r.lane='background' AND NOT EXISTS(SELECT 1 FROM runs x WHERE x.run_id<>r.run_id AND ((x.lane='foreground' AND x.state NOT IN ('succeeded','failed','cancelled','interrupted')) OR (x.lane='background' AND x.state IN ('starting','running','waiting_approval','waiting_input','cancelling')))))) ORDER BY CASE r.lane WHEN 'foreground' THEN 0 ELSE 1 END,r.created_at,r.rowid LIMIT 1`))
		if err != nil {
			return err
		}
		run.AttemptID = rand.Text()
		run.LeaseToken++
		run.State = "starting"
		run.Revision++
		run.UpdatedAt = storage.Now()
		if run.Origin == "consolidation" {
			var job string
			if err := tx.QueryRow("SELECT consolidation_job_id FROM run_parameters WHERE run_id=?", run.ID).Scan(&job); err != nil {
				return err
			}
			fence, err := memory.LeaseJob(tx, job, run.ID)
			if err != nil {
				return err
			}
			if _, err = tx.Exec("UPDATE run_parameters SET consolidation_fence=? WHERE run_id=?", fence, run.ID); err != nil {
				return err
			}
		}
		if _, err := tx.Exec("UPDATE branches SET lease_run_id=?,lease_token=?,lease_until=? WHERE branch_id=?", run.ID, run.LeaseToken, time.Now().UTC().Add(10*time.Minute).Format("2006-01-02T15:04:05.000Z"), run.BranchID); err != nil {
			return err
		}
		if _, err := tx.Exec("UPDATE runs SET state='starting',revision=revision+1,current_attempt_id=?,updated_at=? WHERE run_id=?", run.AttemptID, run.UpdatedAt, run.ID); err != nil {
			return err
		}
		_, err = storage.AppendEvent(tx, run.AssistantID, "run.starting", "run", run.ID, run.Revision, "session", run.SessionID, run.ID, map[string]string{"state": "starting"})
		return err
	})
	return run, err
}

func (c *Chat) executeRun(ctx context.Context, run Run) {
	defer c.workers.Done()
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	if run.Origin == "consolidation" {
		go c.renewConsolidation(ctx, run, cancel)
	}
	err := c.performRun(ctx, run)
	state, reason := "succeeded", ""
	if err != nil {
		state, reason = "failed", err.Error()
		if errors.Is(err, errWorkerExited) {
			state = "interrupted"
		}
	}
	if ctx.Err() != nil {
		state, reason = "cancelled", "用户停止"
		if c.lifetime.Err() != nil {
			state, reason = "interrupted", "应用退出，执行已停止"
		}
	}
	commitErr := c.settleRun(run, state, reason)
	c.mu.Lock()
	if commitErr != nil {
		c.runtimeError = fmt.Sprintf("保存运行状态失败: %v", commitErr)
	}
	if current := c.sending[run.SessionID]; current != nil && current.runID == run.ID {
		current.cancel()
		delete(c.sending, run.SessionID)
	}
	c.mu.Unlock()
	c.wakeRuns()
}

func (c *Chat) settleRun(run Run, state, reason string) error {
	return c.store.Update(context.Background(), func(tx *sql.Tx) error {
		var current string
		var revision int64
		if err := tx.QueryRow("SELECT state,revision FROM runs WHERE run_id=?", run.ID).Scan(&current, &revision); err != nil {
			return err
		}
		if terminalRun(current) {
			return nil
		}
		if current == "cancelling" {
			state = "cancelled"
			reason = "用户停止"
		}
		if run.Origin == "consolidation" {
			var err error
			state, reason, err = settleConsolidation(tx, run, state, reason)
			if err != nil {
				return err
			}
		} else if run.Origin == "proactive" {
			var err error
			state, reason, err = settleAttention(tx, run, state, reason)
			if err != nil {
				return err
			}
		} else if run.Operation == "prompt" {
			if err := memory.EnqueueRun(tx, run.ID); err != nil {
				return err
			}
		}
		now := storage.Now()
		if _, err := tx.Exec("UPDATE run_inputs SET state='cancelled' WHERE run_id=? AND state='queued'", run.ID); err != nil {
			return err
		}
		if _, err := tx.Exec("UPDATE runs SET state=?,phase='idle',revision=revision+1,updated_at=?,terminal_reason=? WHERE run_id=?", state, now, reason, run.ID); err != nil {
			return err
		}
		if _, err := tx.Exec("UPDATE branches SET lease_run_id=NULL,lease_until=NULL WHERE branch_id=? AND lease_run_id=?", run.BranchID, run.ID); err != nil {
			return err
		}
		attemptState := "settled"
		if state == "failed" {
			attemptState = "failed"
		}
		if state == "interrupted" {
			attemptState = "interrupted"
		}
		if _, err := tx.Exec("UPDATE run_attempts SET state=?,ended_at=?,end_revision=(SELECT canonical_revision FROM branches WHERE branch_id=?) WHERE attempt_id=?", attemptState, now, run.BranchID, run.AttemptID); err != nil {
			return err
		}
		if _, err := tx.Exec("UPDATE model_requests SET status='unknown',ended_at=? WHERE attempt_id=? AND status='started'", now, run.AttemptID); err != nil {
			return err
		}
		if _, err := tx.Exec("UPDATE tool_invocations SET state='outcome_unknown',ended_at=? WHERE attempt_id=? AND state='executing'", now, run.AttemptID); err != nil {
			return err
		}
		if _, err := tx.Exec("UPDATE tool_invocations SET state='cancelled',ended_at=? WHERE attempt_id=? AND state IN ('planned','awaiting_approval')", now, run.AttemptID); err != nil {
			return err
		}
		if _, err := tx.Exec("UPDATE approvals SET status='invalidated',revision=revision+1 WHERE status='pending' AND invocation_id IN (SELECT invocation_id FROM tool_invocations WHERE run_id=?)", run.ID); err != nil {
			return err
		}
		_, err := storage.AppendEvent(tx, run.AssistantID, "run."+state, "run", run.ID, revision+1, "session", run.SessionID, run.ID, map[string]string{"state": state, "reason": reason})
		return err
	})
}
