# 修复 Diff Panel 工具模型静默失败

**时间**: 2026-04-16 09:55

## 改了什么

1. 调整 `diff-panel` 的生成按钮逻辑，让按钮可用条件和 `handleGenerateMessage` 的实际生成范围保持一致。
2. 为 commit message 生成补上面板内可见错误提示，worker / 模型层报错会直接显示给用户。
3. 在模型条目保存阶段拦截占位模型 ID `new-model-id`，避免把占位配置当成真实工具模型写入设置。

## 为什么改

- 当前 `diff-panel` 在未勾选文件时，handler 会按当前来源全部文件生成，但按钮却直接禁用，用户体感是“点击生成没有反应”。
- 工具模型或 provider 出错时，界面只写 `console.error`，用户看不到失败原因。
- 本机当前工具模型配置已经指向占位模型 ID，产品需要在保存入口提前拦住这类无效配置。

## 涉及文件

- `src/renderer/src/components/assistant-ui/diff-panel.tsx`
- `src/main/providers.ts`

## 结果

- `diff-panel` 未勾选文件时可直接按当前来源全部文件生成 commit message。
- 工具模型配置异常时，用户会在面板内直接看到错误信息。
- 后续新增自定义模型条目时，必须填写真实模型 ID 才能保存。
