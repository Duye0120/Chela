# 2026-04-08 16:40 App Logging Baseline

> 更新时间：2026-04-08 16:40:47

## 本次做了什么

- 新增 `src/main/logger.ts`，落了最小可用 `app.log` 日志链
- `app.log` 默认写到 `${appData}/logs/app.log`
- 接入了主进程 `uncaughtException / unhandledRejection`
- 给 `ipcMain.handle` 加了统一报错包装，失败时会记 channel 和参数摘要
- 给 `chat:send` 补了开始 / 完成 / 取消 / 失败日志
- 给 renderer 生命周期补了日志：`render-process-gone / did-fail-load / unresponsive`
- 给 tool error 补了结构化日志
- 更新 `docs/backend-architecture-blueprint.md`，把 `app.log` 纳入后端分层

## 为什么改

- 之前只有 `audit.log + transcript.jsonl`，更偏审计和回放
- 真出错时，缺少一条专门记录“哪里炸了”的运行时日志
- 这会让排障非常痛苦：用户看不到、开发也不好追

## 现在的日志分工

- `app.log`：运行时异常、IPC 报错、renderer 生命周期故障、agent/tool 失败
- `audit.log`：run / policy / approval 这类 Harness 审计事件
- `transcript.jsonl`：会话事件流和聊天回放

## 涉及文件

- `src/main/logger.ts`
- `src/main/index.ts`
- `src/main/adapter.ts`
- `docs/backend-architecture-blueprint.md`
- `docs/changes/2026-04-08/app-logging-baseline.md`

## 验证

- `2026-04-08 16:43:00` 运行 `pnpm exec tsc --noEmit -p tsconfig.json`

## 说明

- 这轮先做 main 侧最小闭环，还没做日志 viewer
- 也还没做日志轮转、筛选和 renderer 主动上报接口
- 先把“出错能定位”这件事站住
