# 聊天区思考流程重做

> 时间：2026-04-09 11:05:46
> 目的：把聊天区里被改偏的“思考 / 工具过程”恢复成更清晰、可展开、带流式感的步骤流。

## 本次改了什么

- 新做了 `agent-activity-bar`，把 assistant 的 `reasoning` 和 `tool-call` 过程整理成单独的步骤流容器。
- 步骤流现在默认展示总览头和时间线，每一步都有状态、耗时、摘要，支持单步展开和收起。
- 思考步骤会展示流式文本，工具步骤会展示参数、输出、错误信息，运行中会保留流式感。
- `AssistantThreadPanel` 现在会把 step 的 `status / startedAt / endedAt` 映射进 message parts，前端能拿到真实步骤状态和耗时。
- 聊天正文区把默认的 `Reasoning` / `ToolFallback` 过程渲染关掉，避免同一条消息里出现两套过程 UI。

## 为什么这样改

- 之前的新 UI 把过程压得太扁，步骤边界不清，缺少“现在做到哪一步了”的可控感。
- 这次目标不是只还原旧卡片，而是把过程区做成更像流程面板的结构，让思考和编辑都能被顺着看。
- 把步骤时间和状态接进来后，后续继续 polish 视觉时不用再回头补数据链路。

## 涉及文件

- `D:\a_github\first_pi_agent\src\renderer\src\components\AssistantThreadPanel.tsx`
- `D:\a_github\first_pi_agent\src\renderer\src\components\assistant-ui\thread.tsx`
- `D:\a_github\first_pi_agent\src\renderer\src\components\assistant-ui\agent-activity-bar.tsx`
