---
name: chela-chat-surface
description: Use when changing Chela chat UI, composer, context controls, thinking display, message send flow, attachments, multimodal input, branch switching, model selection, queueing, retries, or user-visible runtime copy.
---

# Chela Chat Surface

## 能力优先

- 不要为了去掉视觉瑕疵而隐藏已有控件；先保住能力，再修样式。
- 改聊天区时，把 `context` 入口、hover 摘要、click 展开、消息发送、思考展示一起回归。
- 交付前至少手动确认：纯文本聊天能发、`思考` 还能显示、`context` 圆环与 hover/展开都在、`0%` 灰环正常、分支切换器选中态和缓存正常。

## Context 入口

- `context` 必须是用户可控能力，不准只做自动黑盒压缩。
- 手动 `compact` 属于 context 管理链路；UI 负责触发，真正压缩发生在 Agent Core / context 层。
- 底部 `context` 入口固定为圆形进度环；无 usage 时也显示为 `0%` 灰色空环。
- hover 时圆环本体仍然可见；hover 只展示紧凑摘要，click 仍能展开更大的详情卡片。
- 浅色模式下 `context` 浮层不要使用发黑、发重的阴影；深色模式才允许更重一点。

## 消息链路

- 聊天链路改动后，要确认 assistant 的最终 `text` 和最终 `thinking` 都能在 `message_end` 兜底恢复，不能只依赖流式 delta。
- OpenAI-compatible / DashScope 兼容层改动后，至少验证一次真实聊天发送，避免 `400` 或“发了没反应”。
- 图片附件必须真实进入 agent 的多模态消息，不能只停留在 UI 占位。
- 模型明确不支持视觉时，要在发送前拦截并提示。

## 文案和队列

- 中断审批恢复、内部续写提示、runtime 诊断文案只走内部链路。
- 用户可见聊天消息、重试动作、恢复动作统一展示产品级文案，不暴露 `sessionId`、`runId`、`payloadHash` 等内部字段。
- 引导消息和“下一条继续说”统一走正式队列模型。
- 主进程负责 FIFO、抢占置顶、run 结束后续发；`pendingRedirectDraft` 这类单条临时草稿语义只保留迁移兼容职责。

## 分支和选择态

- 分支切换器默认走缓存，不要每次点击都重新查询。
- 切换或创建分支成功后再刷新缓存和 git snapshot。
- 聊天区新增选择态默认对齐模型选择器已有选中底色，不额外发明新的选中色。
