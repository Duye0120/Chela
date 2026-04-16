# 右侧工作区替换 Diff 抽屉

**时间**: 2026-04-16 13:12

## 改了什么

1. 把线程页的 Diff 抽屉改成宽屏双栏布局，聊天区和右侧工作区进入同一个壳层容器。
2. 右侧工作区状态升级为正式 `rightPanel` 结构，持久化 `open / activeView / width`，并兼容旧的 `diffPanelOpen` 读取。
3. Diff 组件拆成可嵌入的 `DiffWorkbenchContent` 和窄屏回退用的抽屉包装。
4. 宽屏时终端改为挂在右侧工作区底部；窄屏时继续走原来的主区底部抽屉。
5. 右侧工作区支持拖拽改宽，宽度会写回 UI state 持久化。

## 为什么改

- 当前 Diff 抽屉是覆盖层，主聊天区感知不到右侧内容，后续很难在同一区域扩展浏览器或其他工作内容。
- 用户希望右侧内容像工作区一样把主内容拉宽，而不是悬浮抽屉盖住页面。
- 这块区域后续会承载更多内容，先把壳层状态和布局方式搭成通用结构更稳。

## 涉及文件

- `src/renderer/src/App.tsx`
- `src/renderer/src/components/assistant-ui/diff-panel.tsx`
- `src/shared/contracts.ts`
- `src/shared/ipc.ts`
- `src/preload/index.ts`
- `src/main/ui-state.ts`
- `src/main/ipc/workbench.ts`

## 结果

- 宽屏线程页点击 Diff 后，右侧出现嵌入式工作区，左侧聊天区同步收缩。
- 窄屏时自动退回覆盖式抽屉。
- 右侧宽度支持拖拽并记忆。
- 终端在双栏模式下默认进入右侧工作区底部。
