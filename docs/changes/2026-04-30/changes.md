## 调整工具调用过程聚合展示

时间：2026-04-30 09:24:55 +08:00

改了什么：
- 调整 `process_group` 渲染：运行中直接展示 thinking 与 command 过程条目，完成后再显示“已处理 · N 个命令”的聚合入口。
- 调整 command 过程条目：执行中的 command 组默认展开，便于看到当前正在运行的命令列表。

为什么改：
- 用户希望中间 command 全部完成前保留过程可见性，全部完成后再把过程收缩成已处理聚合，并把最终回复正文放在聚合之后展示。

涉及文件：
- `src/renderer/src/components/ui/tool-fallback.tsx`
- `docs/changes/2026-04-30/changes.md`

结果：
- 运行中界面先展示实际工具调用过程。
- 完成后界面显示折叠后的“已处理”聚合。

## 调整过程条目顺序展开与自动收起

时间：2026-04-30 09:32:12 +08:00

改了什么：
- 调整 thinking 过程条目：执行中自动展开，执行状态结束后自动收起。
- 调整 command 过程条目：执行中自动展开，执行状态结束后自动收起。

为什么改：
- 用户希望过程展示按时间线推进：当前过程展开，结束后收起，再展开下一个 thinking 或 command，所有过程结束后再显示最终“已处理”聚合。

涉及文件：
- `src/renderer/src/components/ui/tool-fallback.tsx`
- `docs/changes/2026-04-30/changes.md`

结果：
- 运行中的过程条目只保持当前项展开。
- 完成态继续显示最终“已处理”聚合入口。

## 增加引导对话 UI 标识

时间：2026-04-30 09:43:30 +08:00

改了什么：
- 为排队消息增加 `source` 来源字段，区分普通排队和引导触发。
- 引导触发的消息发送时写入 `sendOrigin: guided`，用户消息和对应 assistant 消息都会保留这个来源。
- 用户消息气泡上方增加“已引导对话”轻量标识。
- guided run 的工具过程区增加“已引导对话”提示。

为什么改：
- 用户希望参考截图里的引导状态反馈，让被引导的对话在 command 过程区和消息气泡上都有明确但克制的状态提示。

涉及文件：
- `src/shared/contracts.ts`
- `src/main/session/meta.ts`
- `src/main/session/service.ts`
- `src/main/session/facade.ts`
- `src/main/session/transcript-writer.ts`
- `src/main/chat/service.ts`
- `src/main/chat/prepare.ts`
- `src/main/chat/finalize.ts`
- `src/renderer/src/components/AssistantThreadPanel.tsx`
- `src/renderer/src/components/assistant-ui/thread.tsx`
- `src/renderer/src/components/ui/tool-fallback.tsx`
- `docs/changes/2026-04-30/changes.md`

结果：
- 引导消息进入正式队列和正式消息链路。
- UI 能在消息气泡和过程区展示引导来源。

## 限制连续工具调用死循环

时间：2026-04-30 23:16:00 +08:00

改了什么：
- 新增 agent 工具循环守卫，统计最新用户消息之后连续出现的 assistant tool call 轮次。
- 在 agent 的 `transformContext` 链路前置守卫，达到 12 轮后停止本轮执行并返回产品级错误。
- 调整 `memory_save` 保存语义为 `saved / duplicate / merged / conflict` 四态。
- 新增 memory 模糊去重纯模块，先覆盖精确重复、包含式补充、数字/时间冲突。
- 新增 memory 工具返回文案，明确输出状态、结果和下一步，告诉 Agent 本次 `memory_save` 已闭环。
- 新增回归测试覆盖连续 memory 工具调用计数、四态判断和四态返回文案，并接入 `test:regression`。

为什么改：
- memory 处理时部分模型会反复执行“思考 -> memory_save 工具调用 -> 回到模型”链路，底层 ReAct 循环需要项目侧上限兜底。
- 记忆内容存在模糊边界，存储层需要区分重复、补充升级和事实冲突，工具返回也需要给 Agent 明确的成功 / 跳过 / 合并 / 冲突信号。

涉及文件：
- `src/main/agent-loop-guard.ts`
- `src/main/agent.ts`
- `src/main/memory/dedupe.ts`
- `src/main/memory/service.ts`
- `src/main/tools/memory.ts`
- `src/main/tools/memory-result.ts`
- `tests/agent-loop-guard-regression.test.ts`
- `tests/memory-dedupe-regression.test.ts`
- `tests/memory-tool-regression.test.ts`
- `package.json`
- `docs/changes/2026-04-30/changes.md`

结果：
- 单轮聊天最多执行 12 轮连续工具调用。
- 超过上限时 Chela 主动终止本轮，避免 memory_save 等工具形成无限循环。
- `memory_save` 对精确重复返回 `duplicate` 并跳过写入。
- 新记忆比旧记忆更具体时返回 `merged` 并用新摘要替换索引。
- 相近记忆存在数字/时间冲突时返回 `conflict`，保留新条目并标记可能冲突。
