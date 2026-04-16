# Diff Panel 提交标题自动换行

**时间**: 2026-04-16 13:13

## 改了什么

1. 给 diff-panel 的提交标题输入框增加了 `ref` 和内容变化后的自动高度重算。
2. 模型生成或程序性回填 commit 标题时，也会按实际内容高度展开。
3. 标题输入框补了 `break-words`，避免长标题继续横向顶出。

## 为什么改

- 标题区域已经是 `textarea`，手动输入时可以增高。
- 模型回填 commit 标题属于程序性赋值，旧逻辑只在 `onInput` 时测量高度，导致超长标题仍然显示成单行截断。
- 用户在 diff-panel 里需要直接看到完整标题，不能靠猜测或手动点进去确认。

## 涉及文件

- `src/renderer/src/components/assistant-ui/diff-panel.tsx`

## 结果

- diff-panel 里的 commit title 超长时会自动换行展示。
- 工具模型回填标题和手动编辑标题两种路径现在行为一致。
