# Chela UI Consistency Governance

## Goal

把 Chela UI 一致性从提示约束推进到工程约束：token、圆角、surface、selection、border 和 preview 容器都通过共享 primitive 与审计脚本持续收敛。

## Baseline

- 时间：2026-05-14 13:25 +0800
- 入口：`pnpm audit:ui`
- 覆盖范围：`src/renderer/src`、`tailwind.config.ts`
- 当前治理样板：
  - `src/renderer/src/components/assistant-ui/surface.tsx`
  - `src/renderer/src/components/browser-preview/BrowserPreviewPanel.tsx`
  - `src/renderer/src/components/ui/button.tsx`
  - `src/renderer/src/components/ui/badge.tsx`

## Contract

- 预览区域统一使用 `PreviewSurface`。
- 面板、浮层、控制面统一使用 `Surface`。
- 基础控件统一承载圆角、focus、hover 和选择态。
- 业务组件使用 semantic token，避免新增裸色、任意圆角和厚边框。
- `rounded-full` 保留给头像、状态点、进度环这类天然圆形元素。

## Migration Order

1. 基础 primitives：`Button`、`Badge`、`Select`、`Switch`、`TooltipIconButton`。
2. 高频 shell：`App.tsx`、`sidebar.tsx`、`BrowserPreviewPanel.tsx`、`diff-panel.tsx`、`trace-panel.tsx`。
3. 高频聊天：`thread.tsx`、`context-summary-trigger.tsx`、`attachment.tsx`、`agent-activity-bar.tsx`。
4. 设置页：`settings/shared.tsx` 先升级，随后按 section 分批替换局部样式。
5. Diff 与代码视图：保留必要分隔线，减少厚边框和任意小圆角。

## Verification

- 每轮 UI 迁移运行 `pnpm audit:ui`。
- 记录本轮处理的 drift 类别和剩余规模。
- 完成全局收敛后启用 `pnpm exec tsx scripts/audit-ui-consistency.ts --strict` 作为阻断式检查。

## Current Result

- 已建立审计脚本和 npm 入口。
- 已建立 `Surface` / `PreviewSurface`。
- 已完成 Browser preview 主容器与批注浮层样板迁移。
- 已把一致性契约沉淀到 `docs/design-system-baseline.md` 与 `chela-ui-guidelines` skill。
- 2026-05-14 14:22 +0800：`pnpm audit:ui` 已归零，产品 UI 漂移从 212 个收敛到 0 个。
- 合法例外已写进审计脚本：theme token 源、Tailwind token 映射、webview inspector 注入样式、头像圆形、markdown 内容分隔、diff 分栏线。
