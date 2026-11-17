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

type Branch struct {
	ID        string `json:"id"`
	Parent    string `json:"parent"`
	CreatedAt string `json:"createdAt"`
	Current   bool   `json:"current"`
}

func (c *Chat) Branches(id string) ([]Branch, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	session, err := c.find(id)
	if err != nil {
		return nil, err
	}
	db, err := c.store.DB()
	if err != nil {
		return nil, err
	}
	rows, err := db.Query("SELECT branch_id,COALESCE(parent_branch_id,''),created_at FROM branches WHERE session_id=? ORDER BY created_at,rowid", id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []Branch{}
	for rows.Next() {
		var b Branch
		if err := rows.Scan(&b.ID, &b.Parent, &b.CreatedAt); err != nil {
			return nil, err
		}
		b.Current = b.ID == session.BranchID
		result = append(result, b)
	}
	return result, rows.Err()
}

func (c *Chat) SwitchBranch(id, branch string) (ChatSession, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	session, err := c.find(id)
	if err != nil {
		return session, err
	}
	err = c.store.Update(context.Background(), func(tx *sql.Tx) error {
		var count int
		if err := tx.QueryRow("SELECT count(*) FROM runs WHERE session_id=? AND state NOT IN ('succeeded','failed','cancelled','interrupted')", id).Scan(&count); err != nil {
			return err
		}
		if count > 0 {
			return errors.New("请先结束或取消当前对话的运行与队列")
		}
		result, err := tx.Exec("UPDATE sessions SET active_branch_id=?,revision=revision+1 WHERE session_id=? AND EXISTS(SELECT 1 FROM branches WHERE branch_id=? AND session_id=?)", branch, id, branch, id)
		if err != nil {
			return err
		}
		n, err := result.RowsAffected()
		if err != nil {
			return err
		}
		if n != 1 {
			return errors.New("找不到这个分支")
		}
		_, err = storage.AppendEvent(tx, session.AssistantID, "session.branch_selected", "session", id, session.Revision+1, "session", id, id, map[string]string{"branch_id": branch})
		return err
	})
	if err != nil {
		return session, err
	}
	return c.find(id)
}

func (c *Chat) Recover(runID, command string) (SubmitReceipt, error) {
	run, err := c.GetRun(runID)
	if err != nil {
		return SubmitReceipt{}, err
	}
	return c.submit(run.SessionID, "从中断处继续", run.ModelID, run.Effort, command, "prompt", runID, "", run.Attachments...)
}

func (c *Chat) EditMessage(sessionID, messageID, text, model, effort, command string) (SubmitReceipt, error) {
	return c.submit(sessionID, text, model, effort, command, "prompt", "", messageID)
}

func createEditBranch(tx *sql.Tx, session ChatSession, messageID string) (string, error) {
	var count int
	if err := tx.QueryRow("SELECT count(*) FROM runs WHERE session_id=? AND state NOT IN ('succeeded','failed','cancelled','interrupted')", session.ID).Scan(&count); err != nil {
		return "", err
	}
	if count > 0 {
		return "", errors.New("请先停止当前运行并清空队列，再编辑历史消息")
	}
	var parent sql.NullString
	err := tx.QueryRow(`WITH RECURSIVE path AS (SELECT e.* FROM pi_entries e JOIN branches b ON e.session_id=b.session_id AND e.entry_id=b.active_leaf_id WHERE b.branch_id=? UNION ALL SELECT e.* FROM pi_entries e JOIN path p ON e.session_id=p.session_id AND e.entry_id=p.parent_id) SELECT p.parent_id FROM path p JOIN messages m ON m.session_id=p.session_id AND m.entry_id=p.entry_id WHERE m.message_id=? AND m.role='user' AND m.erased_at IS NULL`, session.BranchID, messageID).Scan(&parent)
	if err != nil {
		return "", errors.New("这条消息尚无可编辑的原始历史，或不在当前分支")
	}
	id := rand.Text()
	if _, err := tx.Exec("INSERT INTO branches(branch_id,session_id,parent_branch_id,active_leaf_id,created_at) VALUES(?,?,?,?,?)", id, session.ID, session.BranchID, parent, storage.Now()); err != nil {
		return "", err
	}
	_, err = tx.Exec("UPDATE sessions SET active_branch_id=? WHERE session_id=?", id, session.ID)
	return id, err
}

func createRecoveryBranch(tx *sql.Tx, session ChatSession, runID string) (string, string, error) {
	var state, branch, text string
	if err := tx.QueryRow("SELECT r.state,r.branch_id,m.content_json FROM runs r JOIN run_inputs i ON i.run_id=r.run_id AND i.mode='initial' JOIN messages m ON m.message_id=i.message_id WHERE r.run_id=? AND r.session_id=?", runID, session.ID).Scan(&state, &branch, &text); err != nil {
		return "", "", err
	}
	if state != "interrupted" && state != "failed" && state != "cancelled" {
		return "", "", errors.New("只能恢复已中断、失败或停止的运行")
	}
	var count int
	if err := tx.QueryRow("SELECT count(*) FROM runs WHERE session_id=? AND state NOT IN ('succeeded','failed','cancelled','interrupted')", session.ID).Scan(&count); err != nil {
		return "", "", err
	}
	if count > 0 {
		return "", "", errors.New("请先取消此对话中尚未完成的运行")
	}
	rows, err := tx.Query(`WITH RECURSIVE path AS (SELECT e.* FROM pi_entries e JOIN branches b ON e.session_id=b.session_id AND e.entry_id=b.active_leaf_id WHERE b.branch_id=? UNION ALL SELECT e.* FROM pi_entries e JOIN path p ON e.session_id=p.session_id AND e.entry_id=p.parent_id) SELECT payload_json FROM path ORDER BY entry_ordinal`, branch)
	if err != nil {
		return "", "", err
	}
	var safe *string
	pending := map[string]bool{}
	for rows.Next() {
		var raw string
		if err := rows.Scan(&raw); err != nil {
			rows.Close()
			return "", "", err
		}
		var entry piEntry
		if err := json.Unmarshal([]byte(raw), &entry); err != nil {
			rows.Close()
			return "", "", err
		}
		if entry.Type == "message" {
			if entry.Message.Role == "assistant" {
				if entry.Message.StopReason == "error" || entry.Message.StopReason == "aborted" {
					break
				}
				var blocks []contentBlock
				if err := json.Unmarshal(entry.Message.Content, &blocks); err != nil {
					rows.Close()
					return "", "", err
				}
				for _, block := range blocks {
					if block.Type == "toolCall" {
						pending[block.ID] = true
					}
				}
			} else if entry.Message.Role == "toolResult" {
				delete(pending, entry.Message.ToolCallID)
			}
		}
		if len(pending) == 0 {
			id := entry.ID
			safe = &id
		}
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return "", "", err
	}
	var input ChatMessage
	if err := json.Unmarshal([]byte(text), &input); err != nil {
		return "", "", err
	}
	handoff := strings.Builder{}
	fmt.Fprintf(&handoff, "恢复说明：先前运行已结束，本次是新的恢复运行。原目标：%s\n原始记录保留在原分支。以下为 Go 保存的工具事实；已成功动作不要重复，未知副作用必须先核对，不能假装完成。\n", input.Content)
	rows, err = tx.Query("SELECT tool_id,state,final_args_json,COALESCE(result_json,'null') FROM tool_invocations WHERE run_id=? ORDER BY rowid", runID)
	if err != nil {
		return "", "", err
	}
	for rows.Next() {
		var tool, state, args, result string
		if err := rows.Scan(&tool, &state, &args, &result); err != nil {
			rows.Close()
			return "", "", err
		}
		fmt.Fprintf(&handoff, "工具 %s，状态 %s，参数 %s，回执 %s\n", tool, state, args, result)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return "", "", err
	}
	id := rand.Text()
	if _, err := tx.Exec("INSERT INTO branches(branch_id,session_id,parent_branch_id,active_leaf_id,created_at) VALUES(?,?,?,?,?)", id, session.ID, branch, safe, storage.Now()); err != nil {
		return "", "", err
	}
	if _, err := tx.Exec("UPDATE sessions SET active_branch_id=? WHERE session_id=?", id, session.ID); err != nil {
		return "", "", err
	}
	return id, handoff.String(), nil
}
