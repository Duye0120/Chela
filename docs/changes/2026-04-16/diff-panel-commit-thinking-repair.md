# Diff Panel 提交生成接入 Thinking 收束

**时间**: 2026-04-16 13:03

## 改了什么

1. 在 `src/main/worker-service.ts` 里新增 `thinking` 内容提取。
2. 当工具模型首轮只返回 `thinking`、没有 `text` 时，主进程会继续用同一个模型做二次收束。
3. 二次收束只保留“最终 commit 标题和描述”这个窄输出，减少思考模型在长 diff 场景下返回空文本的概率。

## 为什么改

- 用户要求工具模型本身要被适配好，不能把“思考模型返回空文本”变成用户侧的使用门槛。
- `pi-ai` 的 OpenAI-compatible 适配层会把部分供应商的 `reasoning_content / reasoning / reasoning_text` 解析成 `thinking` block。
- 聊天链路能消费 `thinking`，commit 生成链路原来只看 `text`，这会放大“聊天能用、工具生成失败”的体感落差。

## 涉及文件

- `src/main/worker-service.ts`

## 结果

- 工具模型在 `thinking-only` 响应场景下，commit 生成继续沿用工具模型做结果整理。
- 本地启发式 commit 兜底仍然保留，作为最后一层保护。
