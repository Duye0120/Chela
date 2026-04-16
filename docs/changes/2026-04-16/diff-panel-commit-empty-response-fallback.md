# Diff Panel 提交生成空响应兜底

**时间**: 2026-04-16 12:42

## 改了什么

1. 在 `src/main/worker-service.ts` 里为 commit 生成增加了响应日志。
2. 当工具模型没有返回可解析的文本或标题时，主进程会自动切换到本地启发式 commit 兜底。
3. 兜底结果会结合选中文件路径推断主题、scope 和描述，继续回填 diff-panel 的 title / description。

## 为什么改

- 当前工具模型 `MiniMax-M2.5` 通过 DashScope OpenAI-compatible 通道生成提交信息时，实际存在空文本响应场景。
- 原链路把这类场景直接暴露成 IPC 错误，用户点击星按钮后只能看到失败提示。
- 先保证“点了就有结果”，同时把原始响应形态写进 `app.log`，后续继续收敛模型兼容问题。

## 涉及文件

- `src/main/worker-service.ts`

## 结果

- 提交信息生成在空响应场景下继续可用。
- `C:\Users\Administrator\AppData\Roaming\Chela\logs\app.log` 会记录 commit 生成空文本和本地兜底事件。
