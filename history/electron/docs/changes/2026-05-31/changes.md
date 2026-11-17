## 修复 agent 错误空白完成态

- 时间：2026-05-31 13:28 +0800
- 改了什么：
  - 在 adapter 增加 pending terminal error 的只读访问器。
  - 在聊天执行完成后检查 pi-core 事件流里的 terminal error，触发失败 finalize。
  - 增加 `chat-runtime-error-regression`，并纳入 `test:regression`。
- 为什么改：provider 调用失败时，pi-core 会通过 `agent_end` 事件携带错误并让 `prompt()` 正常返回；原流程把这类失败写成 `run_finished completed`，导致 UI 没有 assistant 消息、思考和工具过程。
- 涉及文件：
  - `src/main/adapter.ts`
  - `src/main/chat/execute.ts`
  - `src/main/chat/terminal-error.ts`
  - `tests/chat-runtime-error-regression.test.ts`
  - `package.json`
- 验证结果：
  - `pnpm exec tsc --noEmit -p tsconfig.json`
  - `pnpm exec tsx tests/chat-runtime-error-regression.test.ts`
  - `pnpm exec tsx tests/package-scripts-regression.test.ts`
- 未做：
  - 未运行 `pnpm build` / `pnpm check`，原因是本次改动集中在主进程发送链路，已使用主进程 typecheck 和定向回归覆盖。

## 让运行错误直接返回给用户

- 时间：2026-05-31 13:38 +0800
- 改了什么：
  - 增加共享的聊天运行错误格式化函数，把认证失败、模型不存在、模型源禁用整理成用户可见文案。
  - failed finalize 持久化用户可见错误消息，同时保留原始错误 reason 供诊断使用。
  - renderer 收到 `agent_error` 时把错误文案写入当前响应文本，当前聊天无需等 reload 才看到原因。
- 为什么改：provider/token/model 这类失败需要直接告诉用户可操作原因，避免 UI 只显示空响应。
- 涉及文件：
  - `src/shared/chat-runtime-errors.ts`
  - `src/main/chat/finalize.ts`
  - `src/renderer/src/components/AssistantThreadPanel.tsx`
  - `tests/provider-regression.test.ts`
  - `tests/model-routing-regression.test.ts`
- 验证结果：
  - `pnpm exec tsx tests/provider-regression.test.ts`
  - `pnpm exec tsx tests/model-routing-regression.test.ts`
  - `pnpm exec tsx tests/chat-runtime-error-regression.test.ts`
  - `pnpm exec tsc --noEmit -p tsconfig.json`
  - `pnpm exec tsc --noEmit -p src/renderer/tsconfig.json`
- 未做：
  - 未运行 `pnpm build` / `pnpm check`，原因是本次改动已由定向回归、主进程 typecheck 和 renderer typecheck 覆盖。
