---
name: chela-shell-panels
description: Use when changing Chela shell sidebar, right workspace panels, Browser/Diff/Trace panel layout, resizable widths, drag handles, or webview-adjacent resizing behavior.
---

# Chela Shell Panels

## 先核对这些文件

改左侧 sidebar、右侧 diff/browser/trace 工作区、聊天主区域宽度和拖拽前，先同时查看：

- `src/renderer/src/App.tsx`
- `src/renderer/src/components/assistant-ui/sidebar.tsx`
- `src/renderer/src/components/assistant-ui/diff-panel.tsx`
- `src/renderer/src/components/browser-preview/BrowserPreviewPanel.tsx`
- `src/renderer/src/components/assistant-ui/trace-panel.tsx`
- `src/renderer/src/components/ui/resizable.tsx`

## 拖拽来源

- 左侧 shell sidebar 由 `react-resizable-panels` 的 `ResizableHandle` 承载。
- 右侧 workspace 由 `App.tsx` 的 panel state 和 pointer drag 承载。
- 旧 `diff-panel.tsx` 内部 `useResizable` 要按调用点确认，不要假设它仍是实际生效路径。

## 交互细节

- 左侧 sidebar 拉手默认视觉透明，只保留命中区域，避免出现多条硬竖线。
- 右侧含 Browser `<webview>` 的拖拽必须有 pointer capture。
- 同时提供全窗 `pointerup` / `pointercancel`、`lostpointercapture` / `blur` 兜底。
- 拖拽期间要用透明遮罩覆盖 `webview`，避免释放后残留拖拽态。
