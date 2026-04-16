# Diff Panel 分组提交计划

**时间**: 2026-04-16 18:36

## 改了什么

1. 给 worker 链路新增 `generateCommitPlan`，让工具模型按 `.agents/skills/commit` 规则生成多组提交计划。
2. 分组计划结果支持 `title / description / filePaths / reason`，主进程会校验文件覆盖率，并为缺失文件补本地兜底分组。
3. `diff-panel` 的底部提交区改成提交计划卡片，支持生成计划、清空计划、全部暂存、依次提交全部、逐组暂存、逐组提交。
4. 提交计划只分析当前勾选文件；未勾选时生成入口保持禁用。

## 为什么改

- 当前 diff-panel 只有“把所有选中文件揉成一个模糊提交”的体验，和 `/commit` 的分组提交流程割裂。
- 用户希望工具模型承担 commit-message / 杂活 / 记忆管理这类工作，生成逻辑需要真正遵循 commit skill。
- 分组计划卡片能把“选哪些文件、怎么拆提交、每组提交什么”直接暴露给用户，操作成本更低。

## 涉及文件

- `src/shared/contracts.ts`
- `src/shared/ipc.ts`
- `src/preload/index.ts`
- `src/main/ipc/worker.ts`
- `src/main/worker-service.ts`
- `src/renderer/src/components/assistant-ui/diff-panel.tsx`

## 结果

- 点击生成后，diff-panel 会基于当前勾选文件生成多组提交计划。
- 每组计划都能单独编辑标题和说明，并单独暂存或提交。
- 全量提交流程会按计划顺序串行执行。
