# 右侧工作区按窗口右扩展开启

**时间**: 2026-04-16 13:34

## 改了什么

1. 新增窗口 bounds IPC，renderer 可以读取和设置主窗口位置与尺寸。
2. 打开 Diff 时，主窗口会以当前宽度为基准向右扩展 `rightPanel.width`，保持左上角坐标不变。
3. 关闭 Diff 时，主窗口会恢复到打开前记录的原始 bounds。
4. 右侧工作区宽度拖拽结束后，会把窗口总宽同步调整到 `原始宽度 + 右侧区宽度`。

## 为什么改

- 用户要的是“右侧增加一块工作区”，不是在现有窗口里压缩左侧聊天区。
- 保持左上角固定、只向右扩展后，交互感受更接近 IDE 里拉出侧边工作区。

## 涉及文件

- `src/shared/contracts.ts`
- `src/shared/ipc.ts`
- `src/preload/index.ts`
- `src/main/window.ts`
- `src/main/ipc/window.ts`
- `src/renderer/src/App.tsx`

## 结果

- 打开 Diff 时，窗口会向右变宽。
- 左上角位置保持不动。
- 关闭 Diff 时，窗口恢复原宽度。
