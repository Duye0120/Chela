# Chela Runtime Diagnostics Surface Spec

时间：2026-05-09 11:35 +0800

## 1. 目的

底层 Python / Readiness / Analysis Sidecar 的 MVP 已经闭环：

- Readiness JSONL 有 recorder；
- Observability Dispatcher 已经把 readiness sink 收口；
- Analysis Sidecar Runner 已经从脚本能力升级成 backend 可复用 runner；
- Python 仍保持离线 report，不进入在线 run lifecycle。

下一步不应该继续往 Python 深处钻，也不应该马上做大 UI。最划算的一刀是把已经存在的 backend runtime 状态暴露成一个最小诊断面，让 Chela 从“后台有能力”变成“用户/面试官能看见后台运行时健康”。

一句话目标：

> Chela 可以在 System/Diagnostics 里看到 Runtime Service Registry、Readiness Recorder、Observability Dispatcher、Analysis Sidecar 的健康状态，而不是只能从日志里猜。

## 2. 当前状态

已有能力：

- `src/main/runtime-services/lifecycle.ts`
  - 已有 `getStatusReport()`。
  - 已能汇总 service status / group / criticality / totals / startDurationMs / errorMessage。
- `src/main/bootstrap/services.ts`
  - 内部已有 `backgroundServiceLifecycle`。
  - 启动后会把 status report 写日志。
- `src/main/harness-readiness/service.ts`
  - 已有 `getReadinessTraceRecorderHealth()`。
- `src/main/observability/dispatcher.ts`
  - dispatcher/sink 已有 health 概念。
- `src/main/analysis-sidecar/*`
  - 已有 runner/env/artifacts，但还没有可供 UI 查询的“能力状态”。

缺口：

1. `backgroundServiceLifecycle.getStatusReport()` 还没有安全的导出函数。
2. 没有 IPC channel 暴露 runtime diagnostics。
3. `DesktopApi` 没有 runtime diagnostics 入口。
4. Renderer 的系统设置页还看不到这些状态。
5. 变更记录还没有记录“runtime 诊断面”这一步。

## 3. 范围

### 本轮要做

- 新增/导出一个只读 runtime diagnostics API。
- 通过 IPC 暴露给 renderer。
- 在 preload 的 `desktopApi` 下新增 `runtime.getDiagnostics()`。
- 在 System 设置页加一个克制的 Runtime Diagnostics 区块：
  - 总状态：healthy / degraded / failed / stopped 等；
  - totals：healthy/degraded/failed/stopped/disabled；
  - service 列表：name、group、criticality、status、message/error 摘要、启动耗时；
  - 一个“刷新”按钮。
- 增加 targeted regression test，优先测 main/preload contract 或 pure helper，不做大 E2E。
- 更新 `docs/changes/2026-05-09/changes.md`。

### 本轮不做

- 不做新的 Python worker。
- 不把 Python 接进在线 run lifecycle。
- 不改 provider/model/keys 逻辑。
- 不改 Agent Harness Core。
- 不重写 TraceService UI。
- 不改 `package.json` / `pnpm-lock.yaml`。
- 不做全仓 build。
- 不做复杂图表；只做信息清晰的列表/卡片。

## 4. 设计

### 4.1 Shared contract

在 `src/shared/contracts.ts` 新增只读类型，建议贴近已有 runtime service report，但避免 renderer import main 类型：

```ts
export type RuntimeDiagnosticsServiceStatus = {
  name: string;
  group: "core" | "observability" | "agent" | "integration" | "experimental";
  criticality: "critical" | "optional";
  status: "unknown" | "starting" | "healthy" | "degraded" | "failed" | "stopped" | "disabled";
  startDurationMs?: number;
  message?: string;
  errorMessage?: string;
  updatedAt: number;
};

export type RuntimeDiagnosticsReport = {
  status: "unknown" | "healthy" | "degraded" | "failed" | "stopped";
  generatedAt: number;
  totals: {
    total: number;
    healthy: number;
    degraded: number;
    failed: number;
    stopped: number;
    disabled: number;
  };
  services: RuntimeDiagnosticsServiceStatus[];
};
```

如果 `RuntimeServiceStatusReport` 已经有非常接近的类型，可以复用字段形状，但 shared contract 必须位于 `src/shared`，不要让 renderer import `src/main`。

### 4.2 IPC

在 `src/shared/ipc.ts` 新增：

```ts
runtimeGetDiagnostics: "runtime:get-diagnostics"
```

新增文件建议：

```text
src/main/ipc/runtime.ts
```

职责：

- 注册 `IPC_CHANNELS.runtimeGetDiagnostics`。
- 调用 bootstrap 层导出的 `getRuntimeDiagnosticsReport()`。
- 只读，不触发 side effect。

### 4.3 Bootstrap service facade

在 `src/main/bootstrap/services.ts` 导出：

```ts
export async function getRuntimeDiagnosticsReport(): Promise<RuntimeDiagnosticsReport> {
  return backgroundServiceLifecycle.getStatusReport();
}
```

如果类型不完全一致，做显式 mapper；不要把 renderer contract 绑死到 lifecycle 内部类型。

### 4.4 Preload / DesktopApi

在 `src/shared/contracts.ts` 的 `DesktopApi` 类型里新增：

```ts
runtime: {
  getDiagnostics: () => Promise<RuntimeDiagnosticsReport>;
};
```

在 `src/preload/index.ts` 对应新增：

```ts
runtime: {
  getDiagnostics: () => invokeIpc(IPC_CHANNELS.runtimeGetDiagnostics),
},
```

### 4.5 Renderer UI

优先修改现有系统设置页：

```text
src/renderer/src/components/assistant-ui/settings/system-section.tsx
```

要求：

- 不新增顶级设置 route。
- 不发明大面积新视觉系统。
- 少 border，优先用已有 settings section/card 风格、背景层级和留白。
- 初次进入自动加载一次。
- “刷新”按钮只调用 `desktopApi.runtime.getDiagnostics()`。
- 错误态展示为产品级文案，不泄露内部 stack。
- service 列表默认按 group + name 稳定排序。
- `errorMessage` 最多显示一行或截断，避免系统页变成日志页。

## 5. 验收标准

1. `runtime:get-diagnostics` IPC 存在并注册。
2. `window.desktopApi.runtime.getDiagnostics()` 存在。
3. System 设置页能显示 runtime status/totals/service list。
4. 健康状态查询失败时 UI 不崩，显示可读错误。
5. 不修改 provider/model/keys/package lock。
6. 文档留痕完整。

## 6. 建议验证命令

按最小必要验证，避免习惯性 build：

```bash
pnpm exec tsx tests/runtime-services-regression.test.ts
pnpm exec tsx tests/runtime-diagnostics-ipc-regression.test.ts
```

如果没有合适的 Electron IPC 测试环境，可以新增 pure mapper test，例如：

```bash
pnpm exec tsx tests/runtime-diagnostics-regression.test.ts
```

再针对改动文件跑 TypeScript 层面的现有 targeted test；不要全仓 build，除非 Codex 判断本轮改了跨层类型且 targeted test 不足。

## 7. 面试讲法

这一步的价值不是“加了个设置页”，而是：

> 我把本地 Agent 的后台服务抽成 Runtime Service Registry 后，又补了 Runtime Diagnostics Surface。这样服务不是黑盒启动，scheduler、trace、readiness、sidecar 这些能力的健康状态可以被 UI 查询。Agent 产品出问题时，用户看到的是哪个 runtime capability degraded，而不是一句泛泛的 failed。
