# Diff Panel 接入工具模型优先的 Commit Skill 生成

**时间**: 2026-04-16 11:18

## 改了什么

1. 把 diff-panel 的提交信息生成功能从裸字符串补全改成结构化结果回填，直接返回 `title` 和 `description`。
2. 主进程生成链路改成读取 `.agents/skills/commit/SKILL.md`，按 commit skill 规则构造提示词。
3. 生成时优先使用工具模型；工具模型失败后自动回退聊天模型，继续完成提交信息生成。
4. diff-panel 增加本地可见的生成中提示和错误提示，避免点击后无感知。
5. 生成上下文补充了当前分支和最近一次提交标题，帮助结果更贴近仓库已有提交风格。

## 为什么改

- 用户要求这类“杂活”优先走工具模型，不再让生成按钮只走简单补全文本链路。
- 用户要求提交信息生成遵循 `.agents/skills/commit` 的规则，而不是随意总结 diff。
- 原来的交互只有控制台错误，没有明确 loading，用户无法判断是否真的发起了生成。

## 涉及文件

- `src/main/worker-service.ts`
- `src/main/ipc/worker.ts`
- `src/main/git.ts`
- `src/shared/contracts.ts`
- `src/renderer/src/components/assistant-ui/diff-panel.tsx`

## 结果

- 星按钮点击后会显示“正在按 commit skill 生成提交信息…”
- 正常情况下优先用工具模型生成 title 和 description
- 工具模型失败时自动回退聊天模型，仍优先保证结果可生成
- 成功后内容直接落到 diff-panel 的 title / description 输入框
