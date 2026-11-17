# Diff Panel Slide-out Drawer 重构

**时间**: 2026-04-14

## 改了什么

将 Diff 面板从**静态 ResizablePanel 右侧栏**重构为**可切换的右侧滑出抽屉（Slide-out Drawer）**，默认隐藏，点击 Header Diff 按钮滑入，抽屉覆盖在聊天区上方，不影响聊天区宽度。

## 为什么改

原有的 Diff 面板作为静态右侧栏常驻时，占用约 20-28% 宽度，严重挤压聊天区。改为滑出抽屉后，聊天区始终保持全宽，Diff 面板需要时才出现，类似现代 IDE（Cursor/Alma）的体验。

## 改到哪些文件

### `src/renderer/src/components/assistant-ui/diff-panel.tsx`
- `DiffPanelProps` 新增 `open` 和 `onClose` 属性
- 三个返回路径（loading、non-git、正常）的根 `<aside>` 改为固定定位抽屉：
  - `fixed right-0 top-0 bottom-0 z-50 w-[28rem]`
  - 过渡动画：`transition-transform duration-300 ease-in-out`
  - 关闭：`translate-x-full`；打开：`translate-x-0`
- 新增 `DrawerHeader` 内部组件，包含关闭按钮（`XIcon`）
- 内部数据获取、文件列表、Diff 渲染逻辑完全保留

### `src/renderer/src/App.tsx`
- `threadPanels` useMemo 简化：移除 `ResizablePanelGroup` 条件分支，始终渲染全宽 thread 区域
- `DiffPanel` 从 ResizablePanel 内移出，作为 fixed overlay 渲染在 `</main>` 之前
- Header Diff 按钮添加红色角标（`gitBranchSummary?.hasChanges && !diffPanelOpen` 时显示）
- 移除以下不再需要的代码：
  - `diffPanelSize` state 及 localStorage 持久化
  - `clampDiffPanelSize`、`toPercentageSize` 工具函数
  - `handleDiffOnlyLayoutChanged` 回调
  - `normalizedDiffPanelSize` 变量
  - `DIFF_PANEL_SIZE_STORAGE_KEY` 等存储键常量
  - `DEFAULT_DIFF_PANEL_SIZE` / `MIN_DIFF_PANEL_SIZE` / `MAX_DIFF_PANEL_SIZE` 常量

## 行为保留

- `diffPanelOpen` 状态仍从 `ui-state.json` 读取/持久化
- `toggleDiffPanel` 函数和 Header 按钮逻辑不变
- Git diff 数据获取、刷新、自动刷新逻辑完全不变
