# 右侧工作区 Diff 宽度引用修复

**时间**: 2026-04-16 13:19

## 改了什么

1. 给 `DiffWorkbenchContent` 显式补上 `panelWidth` 入参。
2. 把树区宽度上限从遗留的闭包变量改成读取传入宽度。
3. 让抽屉模式和嵌入式右侧工作区都向 diff 内容传递当前面板宽度。

## 为什么改

- `DiffPanel` 拆成内容组件后，树区宽度逻辑还在读取旧抽屉里的 `panelWidth`，会在运行时触发 `ReferenceError`。
- 这类宽度约束属于内容层依赖，改成显式入参后更稳定，也更适合复用。

## 涉及文件

- `src/renderer/src/components/assistant-ui/diff-panel.tsx`
- `src/renderer/src/App.tsx`

## 结果

- 打开右侧工作区时不再因为 `panelWidth is not defined` 崩掉。
