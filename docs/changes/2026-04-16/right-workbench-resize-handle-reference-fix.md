# 右侧工作区抽屉拖拽引用修复

**时间**: 2026-04-16 13:39

## 改了什么

1. 把 `DiffPanel` 抽屉拖拽条上的 `onMouseDown` 回调从失效的 `handleMouseDown` 改成实际解构出来的 `handlePanelResize`。

## 为什么改

- `DiffPanel` 外壳重构后，抽屉模式的拖拽条还在引用旧变量名，会在运行时触发 `ReferenceError`。

## 涉及文件

- `src/renderer/src/components/assistant-ui/diff-panel.tsx`

## 结果

- 窄屏抽屉模式下打开 Diff 时，不再因为拖拽回调名错误崩掉。
