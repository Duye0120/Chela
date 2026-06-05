# Chela Runtime / Analysis Plane

更新时间：2026-06-04 14:55:00 +0800

## 一句话结论

Chela 的在线安全边界和 readiness analysis 都留在 TS/Electron；AI 只做可审计建议。

语言边界跟随风险边界：越靠近用户文件、shell、审批、provider streaming 和 run 状态机，越需要确定性、低延迟、可控；report、eval、失败复盘和 repo intelligence 第一版统一走 TypeScript。

## 分层

- L0 Local OS / Workspace / Secrets Boundary
  - 文件系统、进程、shell、git workspace、API key、用户数据边界。
  - 最高风险，必须由 TS/Electron Main 通过确定性 policy 控制。

- L1 Desktop Shell / IPC / UI
  - Electron 窗口、React UI、preload API、IPC、审批弹窗、Trace Panel。
  - Readiness analysis 不驱动 UI 状态；TypeScript 产出的 JSON/Markdown 由 TS 展示。

- L2 Agent Runtime / Context / Policy
  - run 状态机、tool policy、approval、tool execution、provider streaming、实时 context assembly。
  - 这是 Chela 的在线控制面，由 TS/Electron Main 承载。

- L3 Evidence / Readiness / Trace Store
  - TraceService 输出、Readiness Trace、脱敏、JSONL/SQLite evidence。
  - TS 负责写入前脱敏、归一化、离线读取和报告生成。

- L4 Offline Intelligence / Analytics
  - readiness analytics、eval report、failure analysis、memory maintenance suggestions、repo intelligence。
  - 第一阶段统一走 TypeScript/Node；AI judge 作为显式开启的可审计解释层。

- L5 Research / Notebook / Experiment
  - notebook、实验、面试材料、benchmark 原型、架构研究。
  - 可使用独立研究工具处理导出的脱敏证据或用户明确授权数据。

## 必须留在 TS 的能力

- Electron UI / IPC / preload
- run state machine
- tool policy：allow / confirm / deny
- approval：暂停、恢复、审计
- tool execution loop
- real-time context assembly
- provider streaming
- readiness evidence sanitization before disk write

原因：这些能力处在在线主链路，失败会直接影响用户文件、命令执行、聊天流和安全边界。

## 当前 JS-only Readiness 能力

- readiness analytics：成功率、失败率、p95、policy violation、secret leakage、hard section preserved
- eval report：从 JSONL/fixtures 生成 pass/fail/warn
- failure analysis：provider 503、tool failure、approval 中断、context 预算不足等聚类
- Mini Eval Gate：scenario assertions、JSON report、Markdown report、exit code
- memory maintenance suggestions：后续 RAG/memory 阶段再显式设计
- repo intelligence：后续独立规划

Readiness analysis 的默认输入必须是 TS 写出的 sanitized JSONL/SQLite/transcript summary；默认输出是 JSON/Markdown。

新增约束（2026-06-04 14:55）：Mini Eval 的第一阶段固定走离线 fixture/mock 路线，`tests/fixtures/readiness/scenarios/` 至少覆盖危险删除拒绝、覆盖写入确认、secret 脱敏、context hard section 保留、memory conflict、tool failure recovery、approval resume、provider 503、long task monitor、safe shell allow。TypeScript report 只读取这些 sanitized JSONL，并输出聚合后的 `scenarioResults`，Markdown 只写摘要，不写 raw event data。runner 直接执行 TS 逻辑。

## AI Judge 边界

可以用 AI Judge 的地方：

- groundedness 解释
- 回答质量辅助评分
- 失败原因解释
- memory conflict 解释
- repo summary / interview narrative draft

绝对不能让 AI 直接决策的地方：

- shell/file/web 工具是否 allow/confirm/deny
- approval 是否通过
- run state 是否跳转
- context hard section 是否可裁剪
- secret 是否可读取或写入
- memory 是否直接写回

AI judge 的输出只能是建议或解释；安全事实来自 deterministic runtime 和 sanitized evidence。

## 近期路线

1. TS Readiness Evidence Layer
   - 已开始：`src/main/harness-readiness/types.ts`、`sanitize.ts`、`trace-store.ts`。
   - 目标：把运行过程写成不会泄露 prompt/code/fileContent/key/token 的 evidence。

2. TypeScript readiness report
   - 离线读取 sanitized JSONL。
   - 输出 JSON + Markdown report。
   - 第一版不联网、不用 AI、不依赖外部分析运行时。

3. Mini Eval Gate
   - 用 fixtures/mock scenarios 覆盖危险删除、覆盖审批、secret redaction、context hard section、memory conflict、tool failure recovery、provider 503、long task monitoring。
   - 第一版只做 deterministic gate，不碰真实危险命令和真实 provider。

## 面试讲法

Chela 把本地 Agent 拆成两条平面：在线 Runtime Plane 和离线 Analysis Plane。在线部分用 TypeScript/Electron 控制 run 生命周期、工具准入、审批和上下文，因为这些东西必须低延迟、可预测、能保护本地文件和凭据；离线部分同样用 TypeScript/Node 从脱敏 trace 里计算 readiness、失败率、p95、策略合规和 eval 结果。这样 Chela 具备审计、复盘、评分和防回归能力。
