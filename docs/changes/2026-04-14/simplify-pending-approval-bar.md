# 精简 PendingApprovalNoticeBar 审批 UI

**时间：** 2026-04-14 14:44

## 改了什么

将 `PendingApprovalNoticeBar` 从原来的详细卡片式布局精简为纯按钮条：

- 去掉所有描述性文字：Shell 标签、"正在等待你的确认"、审批标题+描述、"当前 run 已暂停"、"查看审批上下文"、metaItems
- 只保留"允许"和"拒绝"两个按钮，水平排列在一行
- 容器使用 `var(--color-control-bg)` 背景色，圆角改为 `rounded-[6px]`（之前是 `rounded-[10px]`）
- 去掉 shadow，按钮更轻量
- `InterruptedApprovalNoticeBar` 保持不变

## 为什么改

用户反馈审批条信息量过大，视觉太重。审批场景下用户只需要快速做"允许/拒绝"决定，不需要在审批条里重复展示已在工具进度中可见的上下文信息。

## 改到哪些文件

- `src/renderer/src/components/assistant-ui/approval-notice-bar.tsx`
  - 删除 `pendingApprovalKindLabels`、`PendingApprovalNotice` 类型的 `formatRunKind` 调用（不再需要）
  - 删除 `PendingApprovalNoticeBar` 中的卡片式布局（标签、描述、状态文字、ApprovalDetailCard）
  - 替换为紧凑的横向按钮条（`flex items-center gap-1`）
  - `InterruptedApprovalNoticeBar` 完全不动

## 诊断结果

`tsc --noEmit` 通过，零错误。
