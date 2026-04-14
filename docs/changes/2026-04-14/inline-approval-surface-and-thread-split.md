# 线程内审批面板与 Thread 审批条拆分

> 更新时间：2026-04-14 14:03:09

## 这次做了什么

- 给 Harness 增加了当前待确认操作的 read model，renderer 现在可以按 session 拉取 live pending approval group。
- 把工具确认默认切到线程内处理，审批请求仍会发 `confirmation_request` 事件，系统弹窗退回成兜底后备。
- 在线程 composer 上方新增 live approval 条，支持直接 `允许 / 拒绝` 当前待确认操作。
- 保留原有 interrupted approval 恢复条，并把两类审批 UI 一起抽到独立组件文件。
- `AssistantThreadPanel` 新增局部 pending approval state 和刷新逻辑，避免继续把审批状态抬回 `App.tsx`。
- interrupted recovery 的新 run metadata 现在会额外带上原审批的 kind / requestId / payloadHash / title / reason / detail，recovery prompt 也同步补齐这些字段。
- 修了 thread 里 `Composer` 漏传 `pendingApprovalGroups / onResolvePendingApproval` 导致的 renderer crash。

## 为什么要改

- 当前确认链后端已经完整，产品面还停在系统弹窗，线程内体验是不完整的。
- live approval 和 interrupted approval 分成两套零散实现，会继续把 thread 文件撑大。
- 线程内确认是后续继续补真实恢复链的基础，先把审批 read model 和 UI 统一起来更稳。

## 改到哪些文件

- `src/shared/contracts.ts`
- `src/shared/ipc.ts`
- `src/preload/index.ts`
- `src/main/ipc/harness.ts`
- `src/main/harness/runtime.ts`
- `src/main/harness/approvals.ts`
- `src/main/adapter.ts`
- `src/main/harness/tool-execution.ts`
- `src/renderer/src/components/AssistantThreadPanel.tsx`
- `src/renderer/src/components/assistant-ui/thread.tsx`
- `src/renderer/src/components/assistant-ui/approval-notice-bar.tsx`
- `docs/changes/2026-04-14/inline-approval-surface-and-thread-split.md`

## 验证

- 2026-04-14 14:03:09
  用局部 TypeScript 诊断确认以下文件无错误：
- `src/renderer/src/components/assistant-ui/thread.tsx`
- `src/renderer/src/components/AssistantThreadPanel.tsx`
- `src/renderer/src/components/assistant-ui/approval-notice-bar.tsx`
- `src/main/harness/approvals.ts`
- `src/main/adapter.ts`
- `src/main/harness/tool-execution.ts`
- `src/preload/index.ts`
- `src/shared/contracts.ts`
- `src/main/ipc/harness.ts`
- `src/main/harness/runtime.ts`
- `src/shared/ipc.ts`

## 说明

- 这轮把 live approval 从系统弹窗主路径切到了线程内。
- interrupted approval 的恢复语义仍然是“新建 run + recovery prompt 重新进入 Harness 链”，原暂停点原地续跑属于后续阶段；这轮先把恢复所需审批上下文补全。
