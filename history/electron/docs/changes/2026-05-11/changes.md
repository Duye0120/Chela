# 2026-05-11 Changes

## Session Composer Option 1 UI
- 时间：2026-05-11 00:16:14 +0800
- 背景：老板发来 Option 1 / Option 2 附件输入区参考图，要求把 session 部分聊天输入区改成 Option 1 风格。
- 改动：
  - 将 composer 调整为 Option 1 布局：顶部横向 attachment/context chips，中间大输入区，底部控制条。
  - composer 附件从大卡片改为轻量 chip，保留图片预览、移除附件和 tooltip 能力。
  - Browser Context chip 对齐同一顶部 chip 行，保留预算提示、hover 摘要、单项移除和清空能力。
  - 输入区加高，placeholder 改为偏说明式的 instructions 文案，适配带附件/上下文的任务输入。
- 涉及文件：
  - `src/renderer/src/components/assistant-ui/thread.tsx`
  - `src/renderer/src/components/assistant-ui/attachment.tsx`
- 验证：
  - `pnpm exec tsc --noEmit --pretty false 2>&1 | grep -E 'assistant-ui/thread.tsx|assistant-ui/attachment.tsx|thread.tsx|attachment.tsx' || true` 无输出。
- 备注：未运行完整 build；本仓库规则要求如无必要不 build，当前为 targeted UI/typecheck 验证。

## Composer Empty Meta Row Collapse
- 时间：2026-05-11 12:32:25 +0800
- 背景：输入区没有附件、browser context 或备注类内容时，顶部 meta/chip 行仍保留空高度，视觉上出现多余空白。
- 改动：
  - 为 composer 顶部 meta 行增加显式可见性判断，仅在存在附件或 browser context 时渲染。
  - 附件 chip 与 browser context chip 分别按对应数据存在时挂载，空状态下输入框直接靠近 composer 顶部。
- 涉及文件：
  - `src/renderer/src/components/assistant-ui/thread.tsx`
  - `docs/changes/2026-05-11/changes.md`
- 结果：空备注/空附件状态不再保留顶部空白，已有附件和 context chip 展示路径保留。

## Browser Workspace Dynamic Max Width
- 时间：2026-05-11 12:38:40 +0800
- 背景：浏览器工作区打开后，右侧面板拖到固定上限后仍偏窄，较宽网页内容需要更大的显示范围。
- 改动：
  - 将右侧面板宽度上限从固定 920px 调整为按容器宽度动态计算。
  - 保留主聊天区最小 320px 可用宽度和面板间距，其余空间允许右侧 Browser Workspace 使用。
  - 将 920px 常量语义调整为无容器宽度时的兜底宽度。
- 涉及文件：
  - `src/renderer/src/lib/app-shell.ts`
  - `src/renderer/src/App.tsx`
  - `docs/changes/2026-05-11/changes.md`
- 结果：最大化窗口后，右侧浏览器面板可继续向左拖宽，适配更宽的页面预览。

## Right Panel Left Content Minimum Width
- 时间：2026-05-11 12:40:01 +0800
- 背景：右侧浏览器面板拖到最大时，左侧主聊天区保底 320px 偏窄，阅读和操作空间不足。
- 改动：
  - 将右侧面板动态宽度计算中的主聊天区最小保留宽度从 320px 调整为 600px。
- 涉及文件：
  - `src/renderer/src/lib/app-shell.ts`
  - `docs/changes/2026-05-11/changes.md`
- 结果：右侧面板仍可拉宽，同时左侧聊天区最大收缩到 600px。

## Shell Resize Handle And Sidebar Max Width
- 时间：2026-05-11 12:46:56 +0800
- 背景：左侧项目/聊天侧栏需要限制最大宽度到 350px，且左侧侧栏拖拽手柄与右侧面板拖拽手柄视觉和反馈不统一。
- 改动：
  - 新增左侧侧栏最大宽度常量 350px，并将侧栏 `ResizablePanel` 的 `maxSize` 改为像素上限。
  - 旧版像素宽度迁移时按 350px 夹紧，避免历史本地宽度恢复成过宽侧栏。
  - 左侧和右侧拖拽手柄共用 `chela-shell-resize-handle` 样式，统一命中宽度、细线和 hover/focus/active 反馈。
- 涉及文件：
  - `src/renderer/src/App.tsx`
  - `src/renderer/src/lib/app-shell.ts`
  - `src/renderer/src/styles.css`
  - `docs/changes/2026-05-11/changes.md`
- 结果：左侧项目/聊天侧栏最大为 350px，左右分栏拖拽手柄呈现一致。

## Shell Resize Drag Correction
- 时间：2026-05-11 13:10:14 +0800
- 背景：左侧 sidebar 与主聊天之间出现多条竖线；右侧 Browser Workspace 拖拽释放后偶发残留拖拽态。前一轮只看了局部实现，缺少对左侧 tree/session、主聊天区域、右侧 diff/browser/trace 工作区和共享 resize wrapper 的完整核对。
- 改动：
  - 左侧 shell sidebar 保留 `react-resizable-panels` 的命中能力，改用 `chela-sidebar-resize-handle` 专用透明拉手，覆盖共享 handle 默认 1px 视觉宽度，移除三条线来源。
  - 右侧 workspace 拉宽逻辑从 mouse 事件升级为 pointer drag 链路，增加 pointer capture、全窗 pointerup/pointercancel、mouseup fallback、lostpointercapture、window blur、Escape 清理。
  - 右侧拖拽时加全局透明遮罩，覆盖 Browser `<webview>` 抢事件场景，释放后统一清掉 cursor、user-select 和拖拽状态。
  - 保留左侧 sidebar 最大 350px、右侧动态最大宽度、主聊天最小 600px。
  - 将 shell 分栏拖拽改动前的完整核对范围写入 `AGENTS.md`，后续同类修改先查实际拖拽来源。
- 涉及文件：
  - `AGENTS.md`
  - `src/renderer/src/App.tsx`
  - `src/renderer/src/lib/app-shell.ts`
  - `src/renderer/src/styles.css`
  - `docs/changes/2026-05-11/changes.md`
- 验证：
  - `App.tsx` targeted LSP diagnostics：0 errors。
  - `app-shell.ts` targeted LSP diagnostics：0 errors。
  - `rg` 确认已移除 `chela-shell-resize-handle` 和 `withHandle` 的 shell 调用残留。
- 备注：按仓库约束未运行完整 build。

## Shell Layout / Right Panel Drag Stabilization

- Expanded `docs/plans/2026-05-11-shell-layout-fixed-sidebar.md` to cover both the fixed A/sidebar direction and the B/C right panel drag issue.
- Updated `src/renderer/src/App.tsx` right panel resize behavior so Browser panel drag feedback applies directly to the right panel shell during pointer movement, then commits the final width once on release.
- Removed the fixed transparent drag overlay from the right panel resize path to avoid interfering with Browser/webview pointer release.
- Added `rightPanelShellRef` and drag `currentWidth` tracking so mouseup/blur fallback persists the final visible width instead of snapping back.
- Verified targeted shell files with:
  `pnpm exec tsc --noEmit --pretty false 2>&1 | grep -E 'App.tsx|app-shell.ts|BrowserPreviewPanel|trace-panel|diff-panel|resizable.tsx|sidebar.tsx' || true`
  Result: no output for the targeted files.

## Shell Layout Fixed Sidebar

- Removed the A/B sidebar resize handle from `src/renderer/src/App.tsx`; the left session/project list no longer exposes a draggable divider.
- Removed the now-unused `.chela-sidebar-resize-handle` CSS hot zone from `src/renderer/src/styles.css` so there is no hidden drag target between A and B.
- Kept the existing sidebar `ResizablePanel` imperative collapse/expand path for the title-bar toggle, but user dragging is no longer available.
- Added sidebar tooltips for truncated session titles and project names in `src/renderer/src/components/assistant-ui/sidebar.tsx`.
- Verified targeted shell files with:
  `pnpm exec tsc --noEmit --pretty false 2>&1 | grep -E 'App.tsx|app-shell.ts|BrowserPreviewPanel|trace-panel|diff-panel|resizable.tsx|sidebar.tsx|styles.css' || true`
  Result: no output for the targeted files.
