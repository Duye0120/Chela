# Chela Backend Runtime Framework Optimization Spec

时间：2026-05-08 12:50 +0800

## 1. 目的

这份 spec 不是为了“重构好看”，而是为了让 Chela 后台从一组散落的 Electron main services，演进成一个可治理的本地 Agent Runtime。

当前 Chela 已经有：

- run lifecycle / harness runtime
- event-bus
- TraceService / Trace Panel
- Readiness Trace Recorder
- Python readiness_report sidecar
- scheduler / webhook / metrics / self-diagnosis / learning 等后台服务

问题是：这些能力已经开始像一个 runtime，但启动、依赖、观测、路径注入、Python sidecar 生命周期还没有统一框架承载。

目标是把后台框架整理成：

```text
Electron main
  -> Runtime Service Registry
      -> core services
      -> observability services
      -> agent services
      -> integration services
      -> experimental services
  -> Observability Dispatcher
      -> trace / readiness / metrics / audit
  -> Analysis Sidecar Runner
      -> one-shot Python report now
      -> long-lived Python worker later
```

面试叙事对应一句话：

> Chela 不是把功能塞进 Electron main，而是把本地 Agent 运行时拆成可启动、可回滚、可观测、可评估的 runtime services。

---

## 2. 当前状态

### 2.1 `bootstrap/services.ts`

当前后台服务定义：

```ts
type BackgroundServiceDefinition = {
  name: string;
  start: () => void | Promise<void>;
  stop?: () => void;
};

const BACKGROUND_SERVICES: BackgroundServiceDefinition[] = [
  { name: "bus-audit", start: initBusAuditLog, stop: stopBusAuditLog },
  { name: "metrics", start: initMetrics, stop: stopMetrics },
  { name: "self-diagnosis", start: initSelfDiagnosis, stop: stopSelfDiagnosis },
  { name: "active-learning", start: initActiveLearning, stop: stopActiveLearning },
  ...
  { name: "trace-service", start: initTraceService, stop: stopTraceService },
  { name: "readiness-trace-recorder", start: initReadinessTraceRecorder, stop: stopReadinessTraceRecorder },
];
```

优点：

- 简单
- 已有启动失败 rollback
- stop 顺序反向执行

问题：

- 服务类型没有分组
- 依赖顺序靠数组位置隐式表达
- 服务是否 critical / optional 没有表达
- 服务是否启用没有统一开关
- 没有 service-level startup timing / health / failure reason
- `startedBackgroundServices.size === BACKGROUND_SERVICES.length` 在未来动态 enable/disable 时会变脆

### 2.2 Readiness Recorder

当前文件：

- `src/main/harness-readiness/trace-recorder.ts`
- `src/main/harness-readiness/service.ts`

当前行为：

- `trace-recorder.ts` 是 core，使用 `BusLike` 注入，方便测试
- `service.ts` 注入真实 `bus`
- 默认路径在 recorder core 内：`process.cwd()/artifacts/readiness/readiness-trace.jsonl`

优点：

- 不直接 import Electron
- 测试可以绕开 event-bus / Electron
- 已经能把 run/tool/policy/approval events 映射成 sanitized JSONL

问题：

- 产品态路径应该由 Electron service 层注入，而不是 core 用 `process.cwd()`
- recorder 写入失败目前只在 Promise 内部 pending，不会进入统一后台服务健康状态
- 多个 observability consumer 未来都 onAny，容易分散

### 2.3 Python Sidecar Runner

当前文件：

- `scripts/readiness/readiness_report.py`
- `scripts/readiness/run-readiness-report.ts`

当前行为：

- one-shot `spawn(python, args)`
- 参数数组，不 shell 拼接
- 环境白名单
- timeout
- stdout/stderr 分离

优点：

- 安全
- 可测试
- 适合离线 report

问题：

- 目前只是 script runner，还不是 Chela main 的通用 Analysis Sidecar Runner
- 如果未来 Python 做高频 memory maintenance / transcript analytics / repo intelligence，每次 spawn 会有额外开销
- 还没有统一 artifact path / report lifecycle / latest pointer

---

## 3. 目标架构

### 3.1 Runtime Service Registry

新增：

```text
src/main/runtime-services/
  types.ts
  registry.ts
  service-groups.ts
  lifecycle.ts
  health.ts
```

建议类型：

```ts
export type RuntimeServiceGroup =
  | "core"
  | "observability"
  | "agent"
  | "integration"
  | "experimental";

export type RuntimeServiceCriticality = "critical" | "optional";

export type RuntimeServiceDefinition = {
  name: string;
  group: RuntimeServiceGroup;
  criticality: RuntimeServiceCriticality;
  dependsOn?: string[];
  enabled?: () => boolean;
  start: () => void | Promise<void>;
  stop?: () => void | Promise<void>;
  health?: () => RuntimeServiceHealth | Promise<RuntimeServiceHealth>;
};

export type RuntimeServiceHealth = {
  status: "unknown" | "starting" | "healthy" | "degraded" | "failed" | "stopped";
  message?: string;
  updatedAt: number;
};
```

启动顺序不再靠数组位置，而是：

1. 过滤 disabled services
2. 校验 `dependsOn` 是否存在
3. 拓扑排序
4. 逐个启动
5. 记录 startup duration / status
6. critical service 失败：rollback 并 throw
7. optional service 失败：记录 degraded，继续启动

### 3.2 服务分组建议

```ts
core:
  - scheduler
  - webhook? （如果作为 integration，也可以移出去）

observability:
  - bus-audit
  - metrics
  - trace-service
  - readiness-trace-recorder
  - self-diagnosis

agent:
  - active-learning
  - reflection-service
  - personality-drift
  - emotional-state-machine

integration:
  - webhook

experimental:
  - 后续 research / lab service
```

推荐第一版 criticality：

```text
critical:
  - trace-service?         # 如果 Trace Panel 是核心产品能力，可以 critical
  - scheduler?             # 如果 cron/job 是核心能力，可以 critical

optional:
  - bus-audit
  - metrics
  - readiness-trace-recorder
  - self-diagnosis
  - active-learning
  - reflection-service
  - personality-drift
  - emotional-state-machine
  - webhook
```

注意：readiness 现在应该是 optional。它不能因为写 JSONL 失败导致整个 app 启动失败。

### 3.3 Runtime paths 注入

新增：

```text
src/main/runtime-paths.ts
```

职责：集中生成 Electron 产品态路径，但不污染 core modules。

建议 API：

```ts
export type RuntimePaths = {
  userDataDir: string;
  logsDir: string;
  artifactsDir: string;
  readinessDir: string;
  readinessTracePath: string;
  readinessLatestJsonPath: string;
  readinessLatestMarkdownPath: string;
};

export function resolveRuntimePaths(userDataDir: string): RuntimePaths;
```

Electron 相关的 `app.getPath("userData")` 放在 service/bootstrap 层：

```ts
const paths = resolveRuntimePaths(app.getPath("userData"));
new ReadinessTraceRecorder({ bus, filePath: paths.readinessTracePath });
```

这样：

- core 仍然可测试
- 产品数据不会写到 `process.cwd()`
- report output 有统一位置

### 3.4 Observability Dispatcher

当前状态：TraceService、Readiness Recorder、Metrics、Audit 都可能直接订阅 bus。

短期可接受，但后续建议引入：

```text
src/main/observability/
  dispatcher.ts
  event-mapper.ts
  sinks/
    trace-sink.ts
    readiness-sink.ts
    metrics-sink.ts
    audit-sink.ts
```

目标：

```text
event-bus.onAny
  -> ObservabilityDispatcher
      -> sync/async isolation
      -> sink timeout/error handling
      -> optional sampling
      -> sink health state
      -> TraceSink
      -> ReadinessSink
      -> MetricsSink
      -> AuditSink
```

第一版不要急着改 TraceService。先做到：

- 给 readiness recorder 抽出 sink-like 接口
- dispatcher 可以只覆盖 readiness + metrics 的新路径
- TraceService 保持现状，避免动 UI 相关链路

### 3.5 Analysis Sidecar Runner

保留当前 one-shot runner，但把概念从 `scripts/readiness/run-readiness-report.ts` 提升为主进程可复用能力。

新增建议：

```text
src/main/analysis-sidecar/
  runner.ts
  env.ts
  artifacts.ts
```

第一版仍然 one-shot：

```ts
runAnalysisSidecar({
  command: python,
  args,
  timeoutMs,
  envAllowlist,
  cwd,
  stdoutLimitBytes,
  stderrLimitBytes,
});
```

必须保留：

- `spawn(file, args)`，不用 shell
- env allowlist
- timeout
- stdout/stderr 分离
- output size limit
- non-zero exit 保留 stderr 摘要

未来再升级 long-lived Python worker：

```text
Node -> Python worker over stdio JSON-RPC
```

升级条件：

- sidecar 调用频率高
- report 之外还做 memory maintenance / transcript analytics
- spawn overhead 明显影响体验

现在不要直接上 long-lived worker，复杂度不值得。

---

## 4. 分阶段实施计划

### Phase 1：Service Registry 最小可用

目标：替换 `bootstrap/services.ts` 里的裸数组，但不改变服务实际启动行为。

新增文件：

```text
src/main/runtime-services/types.ts
src/main/runtime-services/lifecycle.ts
src/main/runtime-services/service-groups.ts
```

修改：

```text
src/main/bootstrap/services.ts
```

验收：

- 所有现有 service name 保持一致
- 启动顺序与当前数组一致，除非明确 dependsOn
- stop 仍然反向
- optional/critical 行为有 regression test

测试：

```bash
pnpm exec tsx tests/runtime-services-regression.test.ts
```

建议测试覆盖：

- enabled=false 不启动
- dependsOn 拓扑排序
- missing dependency 报错
- critical start failure 触发 rollback + throw
- optional start failure 不 throw，状态 degraded
- stop 只停 started services，顺序反向

### Phase 2：Readiness path injection

目标：把 Readiness JSONL 默认路径从 recorder core 移到 Electron service 层。

新增：

```text
src/main/runtime-paths.ts
```

修改：

```text
src/main/harness-readiness/service.ts
src/main/harness-readiness/trace-recorder.ts
```

规则：

- `trace-recorder.ts` 不再直接决定产品态路径
- tests 可继续传 temp filePath
- service 层用 `app.getPath("userData")` + `resolveRuntimePaths`
- 若 Electron app 不可用，允许 fallback 到 `process.cwd()/artifacts`，但必须明确只用于 dev/test

测试：

```bash
pnpm exec tsx tests/runtime-paths-regression.test.ts
pnpm exec tsx tests/harness-readiness-recorder-regression.test.ts
```

### Phase 3：Observability Dispatcher MVP

目标：不要让所有观测模块都散落 `bus.onAny`。

新增：

```text
src/main/observability/dispatcher.ts
src/main/observability/sinks/readiness-sink.ts
```

第一版只接 readiness，不碰 TraceService UI 链路。

验收：

- dispatcher handler 错误不影响 bus emit
- async sink 失败记录 degraded，不 throw 到 bus
- readiness sink 仍然输出相同 JSONL

测试：

```bash
pnpm exec tsx tests/observability-dispatcher-regression.test.ts
```

### Phase 4：Analysis Sidecar Runner 收口

目标：把 Python sidecar runner 从 scripts 概念收口为 backend framework 能力。

新增：

```text
src/main/analysis-sidecar/runner.ts
src/main/analysis-sidecar/env.ts
src/main/analysis-sidecar/artifacts.ts
```

迁移：

- `scripts/readiness/run-readiness-report.ts` 可继续保留 CLI 包装
- 核心 spawn 逻辑迁到 `src/main/analysis-sidecar/runner.ts`

验收：

- 参数数组
- env whitelist
- timeout
- stdout/stderr size limit
- non-zero exit 可诊断
- 不改 `package.json`

测试：

```bash
pnpm exec tsx tests/analysis-sidecar-runner-regression.test.ts
pnpm exec tsx tests/readiness-runner-regression.test.ts
```

### Phase 5：Backend module boundary review

目标：防止 `memory/tools/session/context` 继续膨胀成无边界中枢。

新增文档：

```text
docs/harness/backend-module-boundaries.md
```

内容：

- `memory` 只负责记忆存储/检索/维护，不直接知道 UI
- `tools` 只负责 tool implementation，不承担 run lifecycle
- `session` 只负责 transcript/session persistence，不判断 agent policy
- `context` 只负责 context assembly，不直接执行 side effect
- `harness` 负责 run lifecycle / policy / approval / tool execution
- `observability` 负责看见发生了什么，不参与决策
- `analysis-sidecar` 负责离线分析，不参与在线安全

---

## 5. 不做什么

第一轮不要做：

- 不改 UI
- 不改 `package.json` / `pnpm-lock.yaml`
- 不改 provider/model 逻辑
- 不重写 TraceService
- 不把 Python 接进在线 run lifecycle
- 不做 long-lived Python worker
- 不做全仓格式化
- 不修无关 TS check 历史错误

---

## 6. 推荐下一刀

最推荐先做 Phase 1 + Phase 2：

```text
Service Registry MVP + Readiness path injection
```

原因：

- 风险低
- 不碰 UI
- 不碰 provider
- 能让当前 Readiness Recorder 更像产品态能力
- 对后续 Observability Dispatcher / Sidecar Runner 都是地基

预期改动范围：

```text
src/main/runtime-services/*
src/main/runtime-paths.ts
src/main/bootstrap/services.ts
src/main/harness-readiness/service.ts
src/main/harness-readiness/trace-recorder.ts
tests/runtime-services-regression.test.ts
tests/runtime-paths-regression.test.ts
tests/harness-readiness-recorder-regression.test.ts
docs/changes/2026-05-08/changes.md
```

验收命令：

```bash
pnpm exec tsx tests/runtime-services-regression.test.ts
pnpm exec tsx tests/runtime-paths-regression.test.ts
pnpm exec tsx tests/harness-readiness-recorder-regression.test.ts
pnpm exec tsx tests/harness-readiness-regression.test.ts
```

---

## 7. 面试讲法

如果这套做完，可以这样讲：

> Chela 的后台不是普通 Electron main 里堆几个 service。我把它抽成 Runtime Service Registry：每个后台能力都有 group、criticality、dependencies、health 和 rollback。在线安全链路由 TS runtime 控制，离线分析由 Python sidecar 做，observability 通过 dispatcher 统一隔离。这样 Agent 出错时，不只是最终答案失败，而是能看到哪个 runtime service、哪个 tool policy、哪个 approval 或哪个 readiness scenario 退化。

这句话比“我做了一个 AI 助手”强很多。
