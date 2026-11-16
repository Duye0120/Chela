package chat

import (
	"bytes"
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/Duye0120/Chela/native/internal/capabilities"
	"github.com/Duye0120/Chela/native/internal/storage"
)

type toolRequest struct {
	ID     string          `json:"tool_call_id"`
	Parent string          `json:"parent_tool_call_id"`
	Name   string          `json:"name"`
	Args   json.RawMessage `json:"arguments"`
}
type fileArgs struct {
	Path    string  `json:"path"`
	Content *string `json:"content,omitempty"`
}

func (c *Chat) executeTool(ctx context.Context, run Run, raw json.RawMessage) (any, error) {
	if run.Lane == "background" {
		return nil, errors.New("后台整理与关注判断不允许执行工具")
	}
	var request toolRequest
	if json.Unmarshal(raw, &request) != nil || request.ID == "" {
		return nil, errors.New("无效的工具请求")
	}
	if request.Parent != "" {
		if err := c.registerNestedTool(ctx, run, request); err != nil {
			return nil, err
		}
	}
	if strings.HasPrefix(request.Name, "mcp__") {
		return c.executeMCPTool(ctx, run, request)
	}
	if request.Name == "appraise_interaction" || request.Name == "attention_save" || request.Name == "memory_save" || request.Name == "memory_search" || request.Name == "planner_read" || request.Name == "planner_propose" || request.Name == "planner_commit" {
		return c.stateTool(ctx, run, request)
	}
	if request.Name != "read" && request.Name != "read_file" && request.Name != "write_file" {
		return nil, errors.New("工具未注册")
	}
	args, err := canonicalJSON(request.Args)
	if err != nil {
		return nil, err
	}
	var file fileArgs
	decoder := json.NewDecoder(bytes.NewReader(args))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&file); err != nil {
		return nil, err
	}
	rootPath := run.Workspace
	if request.Name == "read" {
		rootPath = ""
		db, err := c.store.DB()
		if err != nil {
			return nil, err
		}
		var raw string
		if err = db.QueryRow("SELECT manifest_json FROM run_capabilities WHERE attempt_id=?", run.AttemptID).Scan(&raw); err != nil {
			return nil, err
		}
		var installed []capabilities.Manifest
		if err = json.Unmarshal([]byte(raw), &installed); err != nil {
			return nil, err
		}
		for _, m := range installed {
			if len(m.Resources.Skills) == 0 {
				continue
			}
			rel, err := filepath.Rel(m.Root, file.Path)
			if err == nil && filepath.IsLocal(rel) {
				rootPath, file.Path = m.Root, rel
				break
			}
		}
		if rootPath == "" {
			return nil, errors.New("只能读取本轮已安装 skill 包内的文件")
		}
	}
	if file.Path == "" || filepath.IsAbs(file.Path) || !filepath.IsLocal(file.Path) || rootPath == "" {
		return nil, errors.New("工具仅能访问当前对话选择的项目目录")
	}
	if (request.Name == "write_file" && (file.Content == nil || len(*file.Content) > 1024*1024)) || (request.Name != "write_file" && file.Content != nil) {
		return nil, errors.New("文件工具参数不符合契约")
	}
	var invocation, prior, state string
	err = c.store.Update(ctx, func(tx *sql.Tx) error {
		if err := validateLease(tx, run); err != nil {
			return err
		}
		var name, hash string
		if err := tx.QueryRow("SELECT invocation_id,tool_id,final_args_hash,state,COALESCE(result_json,'') FROM tool_invocations WHERE attempt_id=? AND pi_tool_call_id=?", run.AttemptID, request.ID).Scan(&invocation, &name, &hash, &state, &prior); err != nil {
			return errors.New("工具调用尚未通过历史提交屏障")
		}
		if name != request.Name {
			return errors.New("工具名称与提交历史不一致")
		}
		if state != "planned" && hash != storage.Hash(args) {
			return errors.New("工具参数变化，旧回执或审批已失效")
		}
		if state == "succeeded" || state == "failed" || state == "denied" || state == "cancelled" {
			return nil
		}
		if state != "planned" {
			return errors.New("工具正在执行或结果未知，禁止重放")
		}
		if request.Name == "write_file" {
			var unknown int
			if err := tx.QueryRow("SELECT count(*) FROM tool_invocations WHERE run_id=(SELECT recovery_of_run_id FROM runs WHERE run_id=?) AND state='outcome_unknown' AND json_extract(final_args_json,'$.path')=?", run.ID, file.Path).Scan(&unknown); err != nil {
				return err
			}
			if unknown > 0 {
				return errors.New("原运行对此文件的写入结果未知，必须先核对文件，不能自动重放")
			}
			var oldResult string
			err := tx.QueryRow("SELECT result_json FROM tool_invocations WHERE run_id=(SELECT recovery_of_run_id FROM runs WHERE run_id=?) AND tool_id=? AND final_args_hash=? AND state='succeeded' AND result_json IS NOT NULL LIMIT 1", run.ID, request.Name, storage.Hash(args)).Scan(&oldResult)
			if err == nil {
				prior = oldResult
				_, err = tx.Exec("UPDATE tool_invocations SET state='succeeded',result_json=?,result_hash=?,ended_at=? WHERE invocation_id=?", prior, storage.Hash([]byte(prior)), storage.Now(), invocation)
				return err
			}
			if !errors.Is(err, sql.ErrNoRows) {
				return err
			}
		}
		var count int
		if err := tx.QueryRow("SELECT count(*) FROM tool_invocations WHERE run_id=?", run.ID).Scan(&count); err != nil {
			return err
		}
		if count > 64 {
			return errors.New("本轮工具调用超过 64 次")
		}
		_, err := tx.Exec("UPDATE tool_invocations SET final_args_json=?,final_args_hash=?,state='executing',started_at=? WHERE invocation_id=?", string(args), storage.Hash(args), storage.Now(), invocation)
		return err
	})
	if err != nil {
		return nil, err
	}
	if prior != "" {
		return json.RawMessage(prior), nil
	}
	var text string
	effectErr := func() error {
		root, err := os.OpenRoot(rootPath)
		if err != nil {
			return err
		}
		defer root.Close()
		if request.Name != "write_file" {
			f, err := root.Open(file.Path)
			if err != nil {
				return err
			}
			defer f.Close()
			data, err := io.ReadAll(io.LimitReader(f, 128*1024+1))
			if err != nil {
				return err
			}
			if len(data) > 128*1024 {
				data = data[:128*1024]
				text = string(data) + "\n[文件内容超过 128 KiB，已截断]"
			} else {
				text = string(data)
			}
			return ctx.Err()
		}
		before, err := fileFingerprint(root, file.Path)
		if err != nil {
			return err
		}
		if err := c.awaitFileApproval(ctx, run, invocation, file.Path, storage.Hash(args), before); err != nil {
			return err
		}
		c.fileMu.Lock()
		defer c.fileMu.Unlock()
		current, err := fileFingerprint(root, file.Path)
		if err != nil {
			return err
		}
		if before != current {
			return errors.New("文件在审批后发生变化，请重新发起写入")
		}
		if err := ctx.Err(); err != nil {
			return err
		}
		temp := filepath.Join(filepath.Dir(file.Path), ".chela-"+rand.Text()+".tmp")
		out, err := root.OpenFile(temp, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
		if err != nil {
			return err
		}
		defer root.Remove(temp)
		_, err = out.WriteString(*file.Content)
		if err == nil {
			err = out.Sync()
		}
		closeErr := out.Close()
		if err != nil {
			return err
		}
		if closeErr != nil {
			return closeErr
		}
		if err := ctx.Err(); err != nil {
			return err
		}
		if err := root.Rename(temp, file.Path); err != nil {
			return err
		}
		text = "已写入 " + file.Path
		return nil
	}()
	result := map[string]any{"content": []map[string]string{{"type": "text", "text": text}}, "details": map[string]string{"invocation_id": invocation}, "isError": false}
	outcome := "succeeded"
	if effectErr != nil {
		outcome = "failed"
		if ctx.Err() != nil {
			outcome = "cancelled"
		}
		result["content"] = []map[string]string{{"type": "text", "text": effectErr.Error()}}
		result["isError"] = true
	}
	payload, err := json.Marshal(result)
	if err != nil {
		return nil, err
	}
	err = c.store.Update(context.Background(), func(tx *sql.Tx) error {
		if _, err := tx.Exec("UPDATE tool_invocations SET state=?,result_json=?,result_hash=?,ended_at=? WHERE invocation_id=?", outcome, string(payload), storage.Hash(payload), storage.Now(), invocation); err != nil {
			return err
		}
		_, err := storage.AppendEvent(tx, run.AssistantID, "tool."+outcome, "tool_invocation", invocation, 1, "session", run.SessionID, run.ID, map[string]string{"invocation_id": invocation, "tool": request.Name, "state": outcome})
		return err
	})
	if err != nil {
		return nil, fmt.Errorf("TOOL_OUTCOME_UNKNOWN: 工具结果未提交，副作用需核对: %w", err)
	}
	return result, nil
}

func (c *Chat) registerNestedTool(ctx context.Context, run Run, request toolRequest) error {
	if len(request.ID) > 250 || strings.Count(request.ID, ":") > 8 || !strings.HasPrefix(request.ID, request.Parent+":") {
		return errors.New("嵌套工具标识或深度无效")
	}
	args, err := canonicalJSON(request.Args)
	if err != nil {
		return err
	}
	return c.store.Update(ctx, func(tx *sql.Tx) error {
		if err := validateLease(tx, run); err != nil {
			return err
		}
		var parent string
		if err := tx.QueryRow("SELECT invocation_id FROM tool_invocations WHERE attempt_id=? AND pi_tool_call_id=? AND state='executing'", run.AttemptID, request.Parent).Scan(&parent); err != nil {
			return errors.New("嵌套调用缺少正在执行的父工具")
		}
		var count int
		if err := tx.QueryRow("SELECT count(*) FROM tool_invocations WHERE run_id=?", run.ID).Scan(&count); err != nil {
			return err
		}
		if count >= 64 {
			return errors.New("本轮工具调用超过 64 次")
		}
		_, err := tx.Exec(`INSERT INTO tool_invocations(invocation_id,run_id,attempt_id,parent_invocation_id,pi_tool_call_id,tool_id,tool_version,final_args_json,final_args_hash,resource_versions_json,effect_class,state,idempotency_key,created_at) VALUES(?,?,?,?,?,?,'1',?,?,'{}','external_write','planned',?,?) ON CONFLICT(attempt_id,pi_tool_call_id) DO NOTHING`, rand.Text(), run.ID, run.AttemptID, parent, request.ID, request.Name, string(args), storage.Hash(args), run.AttemptID+":"+request.ID, storage.Now())
		return err
	})
}

func fileFingerprint(root *os.Root, path string) (string, error) {
	f, err := root.Open(path)
	if errors.Is(err, os.ErrNotExist) {
		return "absent", nil
	}
	if err != nil {
		return "", err
	}
	defer f.Close()
	data, err := io.ReadAll(io.LimitReader(f, 8*1024*1024+1))
	if err != nil {
		return "", err
	}
	if len(data) > 8*1024*1024 {
		return "", errors.New("文件超过 8 MiB，不能用此工具整体覆盖")
	}
	return storage.Hash(data), nil
}

type Approval struct {
	ID          string `json:"id"`
	RunID       string `json:"runId"`
	SessionID   string `json:"sessionId"`
	Title       string `json:"title"`
	Description string `json:"description"`
	Status      string `json:"status"`
	Preview     string `json:"preview"`
}

func (c *Chat) Approvals() ([]Approval, error) {
	db, err := c.store.DB()
	if err != nil {
		return nil, err
	}
	return readApprovals(db)
}

func (c *Chat) ResolveApproval(id string, approved bool) error {
	return c.store.Update(context.Background(), func(tx *sql.Tx) error {
		status := "denied"
		if approved {
			status = "approved"
		}
		result, err := tx.Exec("UPDATE approvals SET status=?,revision=revision+1,resolved_at=? WHERE approval_id=? AND status='pending' AND expires_at>? AND EXISTS(SELECT 1 FROM tool_invocations t JOIN runs r ON r.run_id=t.run_id WHERE t.invocation_id=approvals.invocation_id AND r.state='waiting_approval' AND t.final_args_hash=approvals.final_args_hash)", status, storage.Now(), id, storage.Now())
		if err != nil {
			return err
		}
		n, err := result.RowsAffected()
		if err != nil {
			return err
		}
		if n != 1 {
			return errors.New("审批已失效或运行已停止")
		}
		return nil
	})
}

func (c *Chat) awaitFileApproval(ctx context.Context, run Run, invocation, path, hash, version string) error {
	versions, _ := json.Marshal(map[string]string{path: version})
	return c.awaitToolApproval(ctx, run, invocation, hash, versions, "写入文件 "+path, "将修改当前项目内的文件；批准仅用于此次调用。")
}
func (c *Chat) awaitToolApproval(ctx context.Context, run Run, invocation, hash string, versions json.RawMessage, title, description string) error {
	id := rand.Text()
	err := c.store.Update(ctx, func(tx *sql.Tx) error {
		if err := validateLease(tx, run); err != nil {
			return err
		}
		if _, err := tx.Exec("UPDATE tool_invocations SET state='awaiting_approval',resource_versions_json=? WHERE invocation_id=?", string(versions), invocation); err != nil {
			return err
		}
		if _, err := tx.Exec("INSERT INTO approvals(approval_id,invocation_id,status,final_args_hash,policy_revision,resource_versions_json,title,description,created_at,expires_at) VALUES(?,?,'pending',?,1,?,?,?,?,?)", id, invocation, hash, string(versions), title, description, storage.Now(), time.Now().UTC().Add(5*time.Minute).Format("2006-01-02T15:04:05.000Z")); err != nil {
			return err
		}
		if _, err := tx.Exec("UPDATE runs SET state='waiting_approval',phase='tool',revision=revision+1 WHERE run_id=?", run.ID); err != nil {
			return err
		}
		_, err := storage.AppendEvent(tx, run.AssistantID, "approval.requested", "approval", id, 1, "session", run.SessionID, run.ID, map[string]string{"approval_id": id, "run_id": run.ID})
		return err
	})
	if err != nil {
		return err
	}
	defer c.store.Update(context.Background(), func(tx *sql.Tx) error {
		if _, err := tx.Exec("UPDATE approvals SET status='expired',revision=revision+1 WHERE approval_id=? AND status='pending'", id); err != nil {
			return err
		}
		_, err := tx.Exec("UPDATE runs SET state='running',phase='tool',revision=revision+1 WHERE run_id=? AND state='waiting_approval'", run.ID)
		return err
	})
	ticker := time.NewTicker(150 * time.Millisecond)
	defer ticker.Stop()
	timeout := time.NewTimer(5 * time.Minute)
	defer timeout.Stop()
	for {
		db, err := c.store.DB()
		if err != nil {
			return err
		}
		var status string
		if err := db.QueryRow("SELECT status FROM approvals WHERE approval_id=?", id).Scan(&status); err != nil {
			return err
		}
		if status == "approved" {
			return c.store.Update(ctx, func(tx *sql.Tx) error {
				if _, err := tx.Exec("UPDATE runs SET state='running' WHERE run_id=? AND state='waiting_approval'", run.ID); err != nil {
					return err
				}
				if err := validateLease(tx, run); err != nil {
					return err
				}
				_, err := tx.Exec("UPDATE tool_invocations SET state='executing' WHERE invocation_id=?", invocation)
				return err
			})
		}
		if status != "pending" {
			return errors.New("用户未批准此次操作")
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-timeout.C:
			return errors.New("工具审批超时")
		case <-ticker.C:
		}
	}
}
