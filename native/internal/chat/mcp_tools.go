package chat

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/Duye0120/Chela/native/internal/storage"
)

func (c *Chat) executeMCPTool(ctx context.Context, run Run, request toolRequest) (any, error) {
	var tool MCPTool
	var revision int64
	var invocation, state, prior string
	err := c.store.Update(ctx, func(tx *sql.Tx) error {
		if err := validateLease(tx, run); err != nil {
			return err
		}
		var raw string
		if err := tx.QueryRow("SELECT definition_json,connection_revision FROM run_mcp_tools WHERE attempt_id=? AND tool_name=?", run.AttemptID, request.Name).Scan(&raw, &revision); err != nil {
			return errors.New("MCP 工具不在本轮固定清单中")
		}
		if err := json.Unmarshal([]byte(raw), &tool); err != nil {
			return err
		}
		if err := tx.QueryRow("SELECT invocation_id FROM tool_invocations WHERE attempt_id=? AND pi_tool_call_id=? AND tool_id=?", run.AttemptID, request.ID, request.Name).Scan(&invocation); err != nil {
			return errors.New("MCP 调用尚未提交历史")
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	p, cfg, current, err := c.mcpConnection(ctx, tool.Server)
	if err != nil {
		return nil, err
	}
	if current != revision {
		return nil, errors.New("MCP 配置已变化，本轮工具不能继续使用")
	}
	validationCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	validated, err := p.call(validationCtx, "validate", map[string]any{"name": tool.Name, "version": tool.Version, "arguments": request.Args})
	cancel()
	if err != nil {
		return nil, errors.New(redactMCPError(err.Error(), cfg))
	}
	args, err := canonicalJSON(validated)
	if err != nil {
		return nil, err
	}
	hash := storage.Hash(args)
	err = c.store.Update(ctx, func(tx *sql.Tx) error {
		if err := validateLease(tx, run); err != nil {
			return err
		}
		var oldHash string
		if err := tx.QueryRow("SELECT state,final_args_hash,COALESCE(result_json,'') FROM tool_invocations WHERE invocation_id=?", invocation).Scan(&state, &oldHash, &prior); err != nil {
			return err
		}
		if state != "planned" && oldHash != hash {
			return errors.New("MCP 最终参数变化，旧回执失效")
		}
		if prior != "" {
			return nil
		}
		if state != "planned" {
			return errors.New("MCP 正在执行或结果未知，禁止自动重放")
		}
		var unknown int
		if err := tx.QueryRow("SELECT count(*) FROM tool_invocations WHERE run_id=(SELECT recovery_of_run_id FROM runs WHERE run_id=?) AND tool_id=? AND state='outcome_unknown'", run.ID, request.Name).Scan(&unknown); err != nil {
			return err
		}
		if unknown > 0 {
			return errors.New("原运行的 MCP 结果未知，请先到原服务核对，不能自动重放")
		}
		var oldResult string
		err := tx.QueryRow("SELECT result_json FROM tool_invocations WHERE run_id=(SELECT recovery_of_run_id FROM runs WHERE run_id=?) AND tool_id=? AND tool_version=? AND final_args_hash=? AND state='succeeded' AND result_json IS NOT NULL LIMIT 1", run.ID, request.Name, tool.Version, hash).Scan(&oldResult)
		if err == nil {
			prior = oldResult
			_, err = tx.Exec("UPDATE tool_invocations SET state='succeeded',effect_class='external_write',tool_version=?,final_args_json=?,final_args_hash=?,result_json=?,result_hash=?,ended_at=? WHERE invocation_id=?", tool.Version, string(args), hash, prior, storage.Hash([]byte(prior)), storage.Now(), invocation)
			return err
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return err
		}
		var count int
		if err := tx.QueryRow("SELECT count(*) FROM tool_invocations WHERE run_id=?", run.ID).Scan(&count); err != nil {
			return err
		}
		if count > 64 {
			return errors.New("本轮工具超过 64 次")
		}
		_, err = tx.Exec("UPDATE tool_invocations SET final_args_json=?,final_args_hash=?,tool_version=?,effect_class='external_write',state='executing',started_at=? WHERE invocation_id=?", string(args), hash, tool.Version, storage.Now(), invocation)
		return err
	})
	if err != nil {
		return nil, err
	}
	if prior != "" {
		return json.RawMessage(prior), nil
	}
	var result json.RawMessage
	outcome := "succeeded"
	if !cfg.AutoApprove {
		versions, _ := json.Marshal(map[string]any{"connection": tool.Server, "revision": revision, "tool_version": tool.Version})
		if err = c.awaitToolApproval(ctx, run, invocation, hash, versions, "调用 "+tool.Name, "将向已配置的 MCP 服务发送以下参数；此服务有独立的文件、网络及外部系统权限。"); err != nil {
			outcome = "denied"
			result, _ = json.Marshal(map[string]any{"content": []map[string]string{{"type": "text", "text": err.Error()}}, "isError": true})
		}
	}
	if result == nil {
		err = c.store.Update(ctx, func(tx *sql.Tx) error {
			if err := validateLease(tx, run); err != nil {
				return err
			}
			var current int64
			var enabled bool
			if err := tx.QueryRow("SELECT revision,enabled FROM mcp_connections WHERE connection_id=?", tool.Server).Scan(&current, &enabled); err != nil {
				return err
			}
			if !enabled || current != revision {
				return errors.New("MCP 连接授权或版本已变化")
			}
			return nil
		})
		if err != nil {
			return nil, err
		}
		callCtx, cancel := context.WithTimeout(ctx, 60*time.Second)
		result, err = p.call(callCtx, "call", map[string]any{"name": tool.Name, "version": tool.Version, "arguments": json.RawMessage(args)})
		cancel()
		if err != nil {
			c.mcpHealth(tool.Server, "failed", redactMCPError(err.Error(), cfg))
			_ = c.store.Update(context.Background(), func(tx *sql.Tx) error {
				_, err := tx.Exec("UPDATE tool_invocations SET state='outcome_unknown',ended_at=? WHERE invocation_id=?", storage.Now(), invocation)
				return err
			})
			return nil, fmt.Errorf("TOOL_OUTCOME_UNKNOWN: MCP 未取得确定回执，请核对原服务: %s", redactMCPError(err.Error(), cfg))
		}
		var value struct {
			IsError bool `json:"isError"`
		}
		if json.Unmarshal(result, &value) != nil {
			return nil, errors.New("TOOL_OUTCOME_UNKNOWN: MCP 回执格式无效")
		}
		if value.IsError {
			outcome = "failed"
		}
	}
	err = c.store.Update(context.Background(), func(tx *sql.Tx) error {
		_, err := tx.Exec("UPDATE tool_invocations SET state=?,result_json=?,result_hash=?,ended_at=? WHERE invocation_id=?", outcome, string(result), storage.Hash(result), storage.Now(), invocation)
		return err
	})
	if err != nil {
		return nil, fmt.Errorf("TOOL_OUTCOME_UNKNOWN: MCP 回执未落库: %w", err)
	}
	return result, nil
}
