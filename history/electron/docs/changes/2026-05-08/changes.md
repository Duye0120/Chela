# 2026-05-08 变更记录

## Readiness Python Sidecar / Mini Eval Gate 离线验收推进

- 时间：2026-05-08 02:00 +0800
- 改了什么：
  - 新增并补齐 `tests/fixtures/readiness/scenarios/` 下 10 个 sanitized JSONL Mini Eval fixtures：`dangerous-delete-denied`、`file-overwrite-confirmed`、`secret-redacted`、`context-hard-section-preserved`、`memory-conflict-detected`、`tool-failure-recovered`、`approval-resume`、`provider-503-recorded`、`long-task-monitored`、`safe-shell-allowed`。
  - 新增聚合 fixture `tests/fixtures/readiness/all-scenarios-readiness.jsonl`，用于一次性跑完整离线 scenario set。
  - 扩展 `tests/readiness_report_regression.py`，覆盖 10 个 fixtures、scenario assertion 结果、Markdown 不写 raw trace、secret fixture 不泄露、`--fail-on-secret-leak` 非零退出和 data quality regression。
  - 新增 `scripts/readiness/run-readiness-report.ts`，用 `child_process.spawn` 参数数组调用 Python sidecar，默认 `CHELA_PYTHON ?? python3`，stdout/stderr 分离，默认 30 秒超时，并只透传 PATH/HOME/USERPROFILE/SystemRoot/TEMP/TMP/CHELA_PYTHON 环境变量。
  - 新增 `tests/readiness-runner-regression.test.ts`，验证 TS runner 参数数组、环境白名单、真实离线报告执行。
  - 更新 `scripts/readiness/README.md` 和 harness 文档，明确 Python sidecar / Mini Eval 的离线、脱敏、fixture/mock 边界。
- 为什么改：把 Chela Readiness / Python Sidecar / Mini Eval Gate 从报告 MVP 推进到可离线验收的固定场景集，避免接真实用户文件、真实 provider 或在线决策。
- 涉及文件：
  - `scripts/readiness/README.md`
  - `scripts/readiness/run-readiness-report.ts`
  - `tests/readiness_report_regression.py`
  - `tests/readiness-runner-regression.test.ts`
  - `tests/fixtures/readiness/all-scenarios-readiness.jsonl`
  - `tests/fixtures/readiness/scenarios/*.jsonl`
  - `docs/harness/chela-runtime-analysis-layers.md`
  - `docs/harness/trace-readiness-harness.md`
  - `docs/changes/2026-05-08/changes.md`
- 验证结果：
  - `python3 tests/readiness_report_regression.py` passed
  - `pnpm exec tsx tests/readiness-runner-regression.test.ts` passed
  - `pnpm exec tsx tests/harness-readiness-regression.test.ts` passed
  - `pnpm exec tsx tests/harness-readiness-recorder-regression.test.ts` passed
- 安全边界：未使用 `git checkout/reset/revert/restore`；未修改 `package.json` 或 `pnpm-lock.yaml`；fixtures 不包含真实 secret、真实文件内容或真实 API key。

## Readiness Trace Recorder 接入

- 时间：2026-05-08 02:25 +0800
- 改了什么：
  - 新增 `src/main/harness-readiness/trace-recorder.ts`，把 run/tool/policy/approval bus events 映射为 sanitized `ReadinessTraceEvent`。
  - 新增 `src/main/harness-readiness/service.ts`，在真实 Chela main process 中注入 `bus`，避免 recorder core 直接依赖 runtime bus，方便离线测试。
  - 更新 `src/main/bootstrap/services.ts`，在 `trace-service` 后启动 `readiness-trace-recorder`。
  - 新增 `tests/harness-readiness-recorder-regression.test.ts`，覆盖忽略用户消息、run created、policy violation、tool failed、approval resolved、敏感错误不落盘。
- 为什么改：把之前离线 readiness schema/report 与真实 runtime 事件流接起来，形成 `TraceService/event-bus -> Readiness JSONL -> Python report` 的闭环。
- 安全边界：recorder 只订阅 bus、写脱敏 JSONL，不参与 tool policy/approval/run 状态机决策。

## Backend Runtime Framework Optimization Spec

- 时间：2026-05-08 12:55 +0800
- 新增文档：`docs/harness/backend-runtime-framework-optimization.md`
- 覆盖范围：
  - Runtime Service Registry：service group、criticality、dependsOn、enabled、health、rollback。
  - Readiness path injection：把产品态路径从 recorder core 移到 Electron service 层，core 保持纯 TS 可测。
  - Observability Dispatcher：把 trace/readiness/metrics/audit 的 bus 订阅逐步收口，隔离 async error/backpressure。
  - Analysis Sidecar Runner：保留 one-shot Python report，未来高频场景再升级 long-lived Python worker。
  - Backend module boundaries：约束 memory/tools/session/context/harness/observability/analysis-sidecar 的职责边界。
- 推荐下一刀：先做 Phase 1 + Phase 2，即 `Service Registry MVP + Readiness path injection`，不碰 UI、不改 provider、不改 `package.json`/`pnpm-lock.yaml`。

## Backend Runtime Service Registry / Path Injection MVP

- 时间：2026-05-08 13:15 +0800
- 改了什么：
  - 新增 `src/main/runtime-services/types.ts`、`registry.ts`、`lifecycle.ts`，实现 service group、criticality、dependsOn、enabled、拓扑排序、optional degraded、critical rollback、反向 stop。
  - 新增 `src/main/runtime-paths.ts`，集中解析 `userData/data/logs/artifacts/readiness` 路径。
  - 改造 `src/main/bootstrap/services.ts`，用 `RuntimeServiceLifecycle` 启停后台服务；`readiness-trace-recorder` 显式依赖 `trace-service`。
  - 改造 `src/main/harness-readiness/service.ts`，由 Electron service 层用 `app.getPath("userData")` 注入 readiness trace 路径。
  - 改造 `src/main/harness-readiness/trace-recorder.ts`，移除 `process.cwd()` 默认产品路径；recorder core 必须由测试传 `store` 或由 service 传 `filePath`。
  - 新增 `tests/runtime-services-regression.test.ts` 和 `tests/runtime-paths-regression.test.ts`。
- 为什么改：让 Chela 后台从“数组启动脚本”升级为可治理的 runtime service lifecycle，同时把 readiness artifact 从开发 cwd 移到产品态 userData 路径。
- 验证结果：
  - `pnpm exec tsx tests/runtime-services-regression.test.ts` passed
  - `pnpm exec tsx tests/runtime-paths-regression.test.ts` passed
  - `pnpm exec tsx tests/harness-readiness-recorder-regression.test.ts` passed
  - `pnpm exec tsx tests/harness-readiness-regression.test.ts` passed
- 安全边界：未改 UI、未改 provider、未改 `package.json` / `pnpm-lock.yaml`、未做全仓 build/check。

## Runtime Service Status / Readiness Recorder Health MVP

- 时间：2026-05-08 20:48 +0800
- 改了什么：
  - 扩展 `RuntimeServiceLifecycle` 的状态能力，新增 `getStatusReport()`，汇总 enabled service 的 group、criticality、status、启动耗时、错误摘要和 totals。
  - 在 lifecycle 中保留 start failure 的 `errorMessage`，并让 service-level `health()` 探针失败时降级为 `degraded`，不让状态查询把主流程抛崩。
  - 给 `ReadinessTraceRecorder` 增加写入失败记录、`onWriteError` 回调和 `getHealth()`，readiness JSONL 写盘失败时降级但不影响 bus emit。
  - 在 `harness-readiness/service.ts` 中接入 recorder health，并给 Electron `userData` 不可用的 dev/test 场景增加明确 fallback 到 `process.cwd()/artifacts/readiness`。
  - 更新 `bootstrap/services.ts` 启动日志，输出 runtime service status report，而不是只输出一次性的 states map。
  - 扩展 `tests/runtime-services-regression.test.ts` 与 `tests/harness-readiness-recorder-regression.test.ts`，覆盖 status report、health 探针失败降级、readiness 写盘失败降级。
- 为什么改：补齐后台 Runtime 框架 MVP 中“启动、停止、状态、错误记录”和 readiness 写入失败可观测性的缺口，同时保持 readiness 为 optional，不因 JSONL 写入失败影响应用启动。
- 涉及文件：
  - `src/main/runtime-services/types.ts`
  - `src/main/runtime-services/lifecycle.ts`
  - `src/main/bootstrap/services.ts`
  - `src/main/harness-readiness/service.ts`
  - `src/main/harness-readiness/trace-recorder.ts`
  - `tests/runtime-services-regression.test.ts`
  - `tests/harness-readiness-recorder-regression.test.ts`
  - `docs/changes/2026-05-08/changes.md`
- 验证结果：
  - `pnpm exec tsx tests/runtime-services-regression.test.ts` passed
  - `pnpm exec tsx tests/runtime-paths-regression.test.ts` passed
  - `pnpm exec tsx tests/harness-readiness-recorder-regression.test.ts` passed
  - `pnpm exec tsx tests/harness-readiness-regression.test.ts` passed
- 未做：未运行 `pnpm build`、未运行全仓 check、未实现 Observability Dispatcher 或 Analysis Sidecar Runner；本轮只补 spec 下一段 MVP 缺口。

## Observability Dispatcher MVP

- 时间：2026-05-08 21:01 +0800
- 改了什么：
  - 新增 `src/main/observability/dispatcher.ts`，实现最小 `ObservabilityDispatcher`：统一订阅 `bus.onAny`、分发给 sinks、隔离同步/异步 sink 错误、记录 degraded health、支持 `stop()` 和 `flush()`。
  - 新增 `src/main/observability/sinks/readiness-sink.ts`，把 readiness recorder 包成 sink，复用 `ReadinessTraceRecorder` 的事件映射和 JSONL 写入逻辑。
  - 调整 `ReadinessTraceRecorder`，抽出 `recordBusEvent()` 供 dispatcher/sink 复用；原 `init()` 仍保留，测试或旧用法仍可直接注入 bus。
  - 调整 `harness-readiness/service.ts`，把产品态 readiness 订阅链路改为 `event-bus -> ObservabilityDispatcher -> ReadinessObservabilitySink -> ReadinessTraceRecorder`。
  - 新增 `tests/observability-dispatcher-regression.test.ts`，覆盖 handler 错误隔离、async sink 降级、readiness JSONL 等价输出、stop 后不再处理新事件。
- 为什么改：落地 spec Phase 3 的最小观测分发器，把 readiness 从直接散落 `bus.onAny` 的模式收口到 dispatcher，同时不触碰 TraceService UI 链路、不引入 Phase 4 sidecar。
- 涉及文件：
  - `src/main/observability/dispatcher.ts`
  - `src/main/observability/sinks/readiness-sink.ts`
  - `src/main/harness-readiness/trace-recorder.ts`
  - `src/main/harness-readiness/service.ts`
  - `tests/observability-dispatcher-regression.test.ts`
  - `docs/changes/2026-05-08/changes.md`
- 验证结果：
  - `pnpm exec tsx tests/observability-dispatcher-regression.test.ts` passed
  - `pnpm exec tsx tests/harness-readiness-recorder-regression.test.ts` passed
  - `pnpm exec tsx tests/harness-readiness-regression.test.ts` passed
- 未做：未改 TraceService UI 链路、未接 metrics/audit、未实现 Analysis Sidecar Runner、未改 `package.json` / `pnpm-lock.yaml`、未运行 `pnpm build`。


## Analysis Sidecar Runner MVP

- 时间：2026-05-08 23:48 +0800
- 改了什么：
  - 新增 `src/main/analysis-sidecar/runner.ts`，实现通用 one-shot sidecar runner：`spawn(file, args)`、禁用 shell、timeout、stdout/stderr 分离、输出大小限制和超时标记。
  - 新增 `src/main/analysis-sidecar/env.ts`，沉淀 sidecar 环境变量白名单构造，避免 API key / Authorization 等敏感环境透传。
  - 新增 `src/main/analysis-sidecar/artifacts.ts`，提供 readiness analysis artifact 路径映射，为后续 main process 复用 report 输出路径做准备。
  - 改造 `scripts/readiness/run-readiness-report.ts`，保留 CLI wrapper 和现有参数构造，但底层复用 `runAnalysisSidecar()` 与 `buildAnalysisSidecarEnv()`。
  - 新增 `tests/analysis-sidecar-runner-regression.test.ts`，覆盖 env allowlist、正常输出、非零退出、stdout/stderr 限制、timeout 和 cwd 注入。
- 为什么改：落地 backend runtime framework spec Phase 4 的 MVP，把 Python readiness report 从 scripts 专用 runner 收口成 Chela backend 可复用的 Analysis Sidecar 能力；仍保持 one-shot，不把 Python 接进在线 run lifecycle。
- 涉及文件：
  - `src/main/analysis-sidecar/runner.ts`
  - `src/main/analysis-sidecar/env.ts`
  - `src/main/analysis-sidecar/artifacts.ts`
  - `scripts/readiness/run-readiness-report.ts`
  - `tests/analysis-sidecar-runner-regression.test.ts`
  - `docs/changes/2026-05-08/changes.md`
- 验证结果：
  - `pnpm exec tsx tests/analysis-sidecar-runner-regression.test.ts` passed
  - `pnpm exec tsx tests/readiness-runner-regression.test.ts` passed
  - `pnpm exec tsx tests/observability-dispatcher-regression.test.ts` passed
  - `pnpm exec tsx tests/harness-readiness-regression.test.ts` passed
- 未做：未做 long-lived Python worker、未接 UI、未改 provider/model、未改 `package.json` / `pnpm-lock.yaml`、未运行 `pnpm build`。
