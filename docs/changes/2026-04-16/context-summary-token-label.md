# 上下文摘要单位改为 token

**时间**: 2026-04-16 14:08

## 改了什么

1. 把上下文摘要里 `本轮约用` / `窗口上限` 这组文案的单位从 `词元` 改成 `token`。

## 为什么改

- 用户希望上下文摘要这处直接显示 `token`，不使用 `词元`。

## 涉及文件

- `src/renderer/src/components/assistant-ui/context-summary-trigger.tsx`

## 结果

- hover 和展开态里的这组用量摘要现在统一显示 `token`。
