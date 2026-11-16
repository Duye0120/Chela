package chat

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"errors"
	"strings"

	"github.com/Duye0120/Chela/native/internal/storage"
)

func (c *Chat) Steer(runID, text, command string) (SubmitReceipt, error) {
	text = strings.TrimSpace(text)
	if text == "" || len(text) > 512*1024 || command == "" || len(command) > 200 {
		return SubmitReceipt{}, errors.New("补充内容或提交标识无效")
	}
	raw, _ := json.Marshal([]string{"steer", runID, text})
	hash := storage.Hash(raw)
	result := SubmitReceipt{RunID: runID, MessageID: rand.Text(), State: "queued"}
	err := c.store.Update(context.Background(), func(tx *sql.Tx) error {
		var oldHash, receipt string
		err := tx.QueryRow("SELECT payload_hash,result_json FROM command_receipts WHERE command_id=?", command).Scan(&oldHash, &receipt)
		if err == nil {
			if oldHash != hash {
				return errors.New("IDEMPOTENCY_CONFLICT: 提交标识已用于其他内容")
			}
			return json.Unmarshal([]byte(receipt), &result)
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return err
		}
		run, err := scanRun(tx.QueryRow(runSelect+" WHERE r.run_id=?", runID))
		if err != nil {
			return err
		}
		if run.Operation != "prompt" || (run.State != "running" && run.State != "waiting_approval") {
			return errors.New("当前运行已结束或尚未开始，请作为新消息发送")
		}
		if err := validateLease(tx, run); err != nil {
			return err
		}
		now := storage.Now()
		message, _ := json.Marshal(ChatMessage{ID: result.MessageID, Role: "user", Content: text, CreatedAt: now})
		if _, err := tx.Exec("INSERT INTO messages(message_id,session_id,branch_id,run_id,role,content_json,created_at) VALUES(?,?,?,?,'user',?,?)", result.MessageID, run.SessionID, run.BranchID, runID, string(message), now); err != nil {
			return err
		}
		if _, err := tx.Exec("INSERT INTO run_inputs(input_id,run_id,message_id,mode,state,created_at) VALUES(?,?,?,'steer','queued',?)", rand.Text(), runID, result.MessageID, now); err != nil {
			return err
		}
		result.Cursor, err = storage.AppendEvent(tx, run.AssistantID, "run.steer_queued", "run", runID, run.Revision, "session", run.SessionID, command, map[string]string{"message_id": result.MessageID})
		if err != nil {
			return err
		}
		receiptJSON, _ := json.Marshal(result)
		_, err = tx.Exec("INSERT INTO command_receipts VALUES(?,'user','Steer',?,?,?,?)", command, hash, string(receiptJSON), result.Cursor, now)
		return err
	})
	return result, err
}

func (c *Chat) pendingSteers(ctx context.Context, run Run) (any, error) {
	result := []ChatMessage{}
	err := c.store.Update(ctx, func(tx *sql.Tx) error {
		if err := validateLease(tx, run); err != nil {
			return err
		}
		rows, err := tx.Query("SELECT m.content_json FROM run_inputs i JOIN messages m ON m.message_id=i.message_id WHERE i.run_id=? AND i.mode='steer' AND i.state='queued' ORDER BY i.rowid", run.ID)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var raw string
			if err := rows.Scan(&raw); err != nil {
				return err
			}
			var message ChatMessage
			if err := json.Unmarshal([]byte(raw), &message); err != nil {
				return err
			}
			result = append(result, message)
		}
		return rows.Err()
	})
	return result, err
}
