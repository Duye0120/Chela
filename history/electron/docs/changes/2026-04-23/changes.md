# 2026-04-23 变更记录

## 契约收紧与设置入口防脏值

**时间**: 22:03:02

**改了什么**：

- 收紧 [`src/shared/contracts.ts`](D:/a_github/first_pi_agent/src/shared/contracts.ts) 里的共享类型：
  - `customTheme` 改成受限 token 集合；
  - `terminal.shell` 补上明确语义类型；
  - `MemoryMetadata` 从 `unknown` 收成 `string / number / boolean / null / string[]`。
- 在 [`src/main/settings.ts`](D:/a_github/first_pi_agent/src/main/settings.ts) 增加 runtime 归一化：
  - `customTheme` 只接受白名单 token；
  - `terminal.shell` 只接受内置 preset、存在的绝对路径，或 PATH 上可解析的可执行名；
  - 非法值统一回退默认配置。
- 新增 [`src/main/memory/metadata.ts`](D:/a_github/first_pi_agent/src/main/memory/metadata.ts)，把 memory metadata 的 key / value / tags / 条目数做集中清洗，并接入 [`src/main/memory/rag-service.ts`](D:/a_github/first_pi_agent/src/main/memory/rag-service.ts) 与 [`src/main/memory/store.ts`](D:/a_github/first_pi_agent/src/main/memory/store.ts)。
- 顺手收一个低风险渲染优化：
  - [`src/renderer/src/components/assistant-ui/model-selector.tsx`](D:/a_github/first_pi_agent/src/renderer/src/components/assistant-ui/model-selector.tsx) 给选中项和分组结果补 `useMemo`；
  - [`src/renderer/src/components/assistant-ui/settings-view.tsx`](D:/a_github/first_pi_agent/src/renderer/src/components/assistant-ui/settings-view.tsx) 用 `ref` 收住 provider 目录已加载标记，减少无意义回调重建。

**为什么改**：

1. 审计清单里的 `M22 / M23 / M24` 都属于“入口太宽”，继续往后做大调整前先把设置和记忆的脏值入口收紧更稳。
2. `customTheme` 和 `terminal.shell` 都是持久化设置，历史脏值或手改 settings 文件会直接影响运行时行为，主进程归一化更合适。
3. `MemoryMetadata` 如果继续允许任意对象结构，后续 worker、SQLite 和 prompt 注入链路都会被迫吃宽类型，越晚收越麻烦。

**涉及文件**：

- `src/shared/contracts.ts`
- `src/main/settings.ts`
- `src/main/memory/metadata.ts`
- `src/main/memory/rag-service.ts`
- `src/main/memory/store.ts`
- `src/renderer/src/App.tsx`
- `src/renderer/src/components/assistant-ui/model-selector.tsx`
- `src/renderer/src/components/assistant-ui/settings-view.tsx`

**结果**：

- `M22 / M23 / M24` 已落地。
- 当前工作区继续保持无 TypeScript 诊断错误。
- 这轮没有触发 `pnpm build` / `pnpm check`。

## spec 状态线与当前实现同步

**时间**: 22:17:37

**改了什么**：

- 更新 [`specs/README.md`](D:/a_github/first_pi_agent/specs/README.md)，把 spec 索引拆成两条状态线：
  - `文档状态` 继续表达讨论与确认进度；
  - `实作状态` 单独表达当前代码落地程度；
  - `01-16` 和后续规划索引表都补上 `实作状态` 列。
- 给关键 spec 头部补齐当前实现口径：
  - [`specs/01-overview.md`](D:/a_github/first_pi_agent/specs/01-overview.md)
  - [`specs/03-agent-core.md`](D:/a_github/first_pi_agent/specs/03-agent-core.md)
  - [`specs/07-memory-architecture.md`](D:/a_github/first_pi_agent/specs/07-memory-architecture.md)
  - [`specs/09-rag-and-embedding.md`](D:/a_github/first_pi_agent/specs/09-rag-and-embedding.md)
  - [`specs/14-data-storage.md`](D:/a_github/first_pi_agent/specs/14-data-storage.md)
  - [`specs/15-security.md`](D:/a_github/first_pi_agent/specs/15-security.md)
  - [`specs/16-extensibility-architecture.md`](D:/a_github/first_pi_agent/specs/16-extensibility-architecture.md)
- 顺手把 [`specs/01-overview.md`](D:/a_github/first_pi_agent/specs/01-overview.md) 里的产品名口径统一为 `Chela`，并把 [`specs/16-extensibility-architecture.md`](D:/a_github/first_pi_agent/specs/16-extensibility-architecture.md) 里已经落后于代码现状的 `Event Bus` / 路线图 / 模块评估描述同步到当前实现。

**为什么改**：

1. 当前 specs 里的 `approved`、`in-review` 只适合表达文档评审进度，继续拿它代替代码进度会误导后续调整顺序。
2. `spec-16` 已经出现“文档说缺失、代码其实已有 baseline”的错位，继续保留会让后续架构讨论反复对齐现状。
3. 这轮要开始做全项目调整，先把“哪些已经有 baseline、哪些还是部分落地”写清楚，后面排优先级才稳。

**涉及文件**：

- `specs/README.md`
- `specs/01-overview.md`
- `specs/03-agent-core.md`
- `specs/07-memory-architecture.md`
- `specs/09-rag-and-embedding.md`
- `specs/14-data-storage.md`
- `specs/15-security.md`
- `specs/16-extensibility-architecture.md`

**结果**：

- spec 索引现在能同时表达“文档确认进度”和“真实代码落地程度”。
- `spec-16` 的 `Event Bus` 相关表述已经和当前代码现状对齐。
- 这轮只改文档，没有触发 `pnpm build` / `pnpm check`。

## spec-16 phase 2 / phase 3 基线回写

**时间**: 22:44:49

**改了什么**：

- 继续更新 [`specs/16-extensibility-architecture.md`](D:/a_github/first_pi_agent/specs/16-extensibility-architecture.md)，新增“当前实现快照”，把这些已经接到主进程启动链的能力写回正文：
  - `Event Bus`
  - `bus-audit`
  - `scheduler`
  - `webhook`
  - `notify_user`
  - `metrics`
  - `self-diagnosis`
  - `active-learning`
  - `emotional state machine`
  - `reflection + personality drift`
- 重写 `Event Bus / Scheduler / Webhook / Notification` 四个章节的“当前实现”口径，正文直接对齐真实文件和事件名：
  - `message:user / message:assistant`
  - `notification:sent / notification:external`
  - `schedule:triggered`
  - `webhook:received`
- 更新 `spec-16` 的阶段划分、模块评估、Alma 对照表和完整路线图：
  - 已落地 baseline 和待完成增量拆开表达；
  - `Plugin / Workflow / OAuth` 继续留在后续阶段；
  - `Reflection / Personality Drift` 明确成“基础链已接入，候选生成仍弱”。
- 同步 [`specs/README.md`](D:/a_github/first_pi_agent/specs/README.md) 里的 `16 / F5 / F6` 实作状态：
  - `16` 改成 `Event Bus / Scheduler / Webhook / Notification / Metrics / Learning / Reflection baseline 已接入`
  - `F5` 改成 `scheduler baseline`
  - `F6` 改成 `Event Bus + background services baseline`

**为什么改**：

1. 仅把 `spec-16` 顶部状态改掉还不够，正文里原本很多 phase 文案还会把已落地能力说成“未开始”。
2. 这一轮要为全项目调整准备基线，平台编排层是最容易误判优先级的区域，必须先把“已经有的骨架”和“真正剩下的增量”拆清楚。
3. `Scheduler / Webhook / Learning / Reflection` 这几块已经进入启动链和持久化链，继续写成纯规划会直接误导后续排期。

**涉及文件**：

- `specs/16-extensibility-architecture.md`
- `specs/README.md`

**结果**：

- `spec-16` 现在可以直接作为“当前平台化基线 + 剩余增量”的参考文档使用。
- 当前未完成项已经集中收敛到 `Plugin / Workflow / OAuth / 产品化 UI / 更强的 reflection & drift 生成链`。
- 这轮继续只改文档，没有触发 `pnpm build` / `pnpm check`。
