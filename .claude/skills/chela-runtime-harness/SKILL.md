---
name: chela-runtime-harness
description: Use when discussing or changing Chela harness runtime, context engine, memory system, transcript persistence, readiness, observability, backend runtime phases, or runtime architecture documents.
---

# Chela Runtime Harness

## 默认分层

- 讨论 harness 架构时，强制区分 `run memory`、`session memory`、`semantic memory`。
- 不要把活动 run 持久化误写成完整记忆系统。
- 默认按 `Harness Runtime / Context Engine / Memory System / Transcript Persistence` 拆层。
- 先收边界，再加高级能力。

## Session 接续

- 新开 session 想接上上次任务，默认依赖 `session transcript + session memory snapshot + T0/T1`。
- 不要写成只靠 `harness-runs.json` 就能完整接续。

## Readiness / Observability

- 修改 readiness/observability 时，优先复用现有 readiness trace recorder 和映射，不新增平行 schema 或 JSONL 路径。
- 生产链路保持 `event-bus -> ObservabilityDispatcher -> ReadinessObservabilitySink -> ReadinessTraceRecorder` 这一类集中分发思路。
- sink 的同步/异步失败要隔离为 degraded health，不让观测链路反向打断主流程。
- 用户明确限定 phase 时，只做该 phase 的最小闭环，不主动扩展到后续 phase 或 TraceService UI 链路。
