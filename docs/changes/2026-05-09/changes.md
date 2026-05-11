# 2026-05-09 变更记录

## Runtime Diagnostics Surface Spec

- 时间：2026-05-09 13:24 +0800
- 改了什么：
  - 新增 `docs/harness/runtime-diagnostics-surface.md`，明确 Runtime Diagnostics Surface 的下一步切片。
  - 结论：底层 Python / Readiness / Analysis Sidecar MVP 已经闭环，下一刀不继续加深 Python，而是把 Runtime Service Registry、Readiness Recorder、Observability Dispatcher、Analysis Sidecar 的健康状态暴露到 System/Diagnostics。
  - 约束：只做只读 diagnostics IPC + preload + System 设置页最小展示，不改 provider/model/keys，不改 Agent Harness Core，不改 `package.json` / `pnpm-lock.yaml`，不做全仓 build。
- 为什么改：Chela 后台已经从散落 service 进化成 runtime framework，但目前主要只能从日志看状态；诊断面能把“可启动、可观测、可降级”的能力变成用户和面试官可见的产品能力。
- 涉及文件：
  - `docs/harness/runtime-diagnostics-surface.md`
  - `docs/changes/2026-05-09/changes.md`
- 验证结果：文档/spec 已落盘；尚未进入代码实现。
- 安全边界：未改源码、未改 UI、未改 provider/model/keys、未执行删除/revert/checkout/reset。

## Runtime Diagnostics Surface MVP

- Shared contract: added `RuntimeDiagnosticsReport` / service status DTOs and `runtime:get-diagnostics` IPC channel.
- Main/preload: exposed a read-only runtime diagnostics API backed by `backgroundServiceLifecycle.getStatusReport()`.
- Renderer: added a System settings Runtime Diagnostics panel with refresh, loading/error/empty states, summary counters, and per-service rows.
- Tests: added `tests/runtime-diagnostics-regression.test.ts` for the JSON-safe report mapping.

