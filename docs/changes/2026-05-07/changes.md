## Trace Readiness Harness Spec

时间：2026-05-07 22:31:21 +0800

改了什么：
- 新增 `docs/harness/trace-readiness-harness.md`，作为 Chela 现有 trace 升级到 Readiness Harness 的方案文档。
- 文档明确 Chela 已有 `TraceService`、Trace Panel、shared trace types；后续不是从 0 新建 trace，而是补齐离线可评测、可 gate 的 Readiness Trace。
- 规划了三阶段路线：Readiness Trace 持久化、Readiness Report、Mini Eval Scenarios + Gate。

为什么改：
- 老板指出 Chela 已经有 trace，需要先做 plan/spec 看后续方向。
- AHE / LLM Readiness Harness 的落点应该复用现有 trace 底座，避免重复造轮子。

涉及文件：
- `docs/harness/trace-readiness-harness.md`
- `docs/changes/2026-05-07/changes.md`

结果：
- 只新增文档，没有改运行时代码。
- 没有执行 build/check。

## Trace Readiness Harness Phase 1 最小安全子集

时间：2026-05-07 22:37:09 +0800

改了什么：
- 新增 Readiness Trace 类型定义，固定 `schemaVersion: 1`，覆盖 run/session/scenario、组件、状态、模型、工具策略、token/cost/latency、context/memory/retrieval 和脱敏后的 `data`。
- 新增 Readiness 数据脱敏与事件归一化入口，递归替换 `apiKey`、`key`、`token`、`password`、`secret`、`authorization`、`cookie`、`content`、`prompt`、`fileContent` 等敏感字段为 `[REDACTED]`，保留 `toolName`、`decision`、`riskLevel`、`durationMs`、`status` 等非敏感 metadata。
- 新增 JSONL trace store，支持 `appendEvent`、`readRecentEvents(limit)`、`readAllEvents()`；不存在文件/空文件返回 `[]`，非法 JSON 行跳过不中断，写入时自动创建父目录。
- 新增 targeted regression test，覆盖脱敏、schemaVersion、append/read、不存在文件、非法 JSON 行跳过。

为什么改：
- 按 `docs/harness/trace-readiness-harness.md` 先落 Phase 1 最小安全子集，为后续 report/eval gate 提供离线、可测试、不会落完整 prompt/代码/文件内容的 readiness evidence 层。
- 本轮不接实时 `TraceService`，不改运行链路，不改 UI，避免碰现有脏改和运行时风险。

涉及文件：
- `src/main/harness-readiness/types.ts`
- `src/main/harness-readiness/sanitize.ts`
- `src/main/harness-readiness/trace-store.ts`
- `tests/harness-readiness-regression.test.ts`
- `docs/changes/2026-05-07/changes.md`

验证结果：
- 首次执行 `pnpm exec tsx tests/harness-readiness-regression.test.ts` 失败，原因是当前 `node_modules` 是 Windows 平台 esbuild，WSL 需要 `@esbuild/linux-x64`。
- 执行 `CI=true pnpm install --frozen-lockfile` 仅重建 WSL 侧依赖环境，未修改 `package.json`。
- 再次执行 `pnpm exec tsx tests/harness-readiness-regression.test.ts` 通过，输出：`harness readiness regression tests passed`。
- 未执行 `pnpm build`，未执行 `pnpm check`。

## Runtime / Analysis Plane 架构定界

时间：2026-05-07 23:56:00 +0800

改了什么：
- 新增 `docs/harness/chela-runtime-analysis-layers.md`，固化 Chela 的 TS / Python / AI 分层边界。
- 明确 TS 负责在线安全和 runtime，Python 负责离线 analysis，AI judge 只做可选解释。

为什么改：
- 避免后续把 Python 误接入主聊天、tool policy、approval 或 run 状态机。
- 为 Readiness Report、Mini Eval Gate 和后续面试叙事提供稳定架构边界。

涉及文件：
- `docs/harness/chela-runtime-analysis-layers.md`
- `docs/changes/2026-05-07/changes.md`

验证结果：
- 文档变更，无需 build/check。

## Python Readiness Report MVP

时间：2026-05-07 23:56:00 +0800

改了什么：
- 新增 `scripts/readiness/readiness_report.py`，标准库实现离线 readiness JSONL 分析。
- 新增 `scripts/readiness/README.md`，说明 Python sidecar 的边界和使用方式。
- 新增 `tests/fixtures/readiness/sample-readiness.jsonl`，作为 report MVP 的 sanitized fixture。
- 新增 `tests/readiness_report_regression.py`，覆盖非法 JSON、非法 schema、secret marker 检测、`--fail-on-secret-leak` 和不泄露原始 secret 输出。

为什么改：
- 把 Readiness Phase 1 的 TS evidence 层接到 Python Analysis Plane，先实现不联网、不用 AI、不依赖第三方包的确定性 report。
- 证明 Chela 后续可以用离线 report/eval gate 做可验证 runtime 边界，而不是只靠人工看 trace。

涉及文件：
- `scripts/readiness/readiness_report.py`
- `scripts/readiness/README.md`
- `tests/fixtures/readiness/sample-readiness.jsonl`
- `tests/readiness_report_regression.py`
- `docs/changes/2026-05-07/changes.md`

验证结果：
- 待执行 targeted verification。
