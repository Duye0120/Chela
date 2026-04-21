# 2026-04-21 变更记录

## 收紧引导条与权限确认条位置

**时间**: 10:39

### 改了什么

1. 调整 [`src/renderer/src/components/assistant-ui/thread.tsx`](D:/a_github/first_pi_agent/src/renderer/src/components/assistant-ui/thread.tsx)，把待确认权限条和中断恢复条整体挪到 composer 上方。
2. 调整同文件里的 `RedirectDraftCard`，把原来的大块引导卡片收成更紧凑的单行条，继续保留右侧 `引导` 和关闭操作。
3. 调整 [`src/renderer/src/components/assistant-ui/approval-notice-bar.tsx`](D:/a_github/first_pi_agent/src/renderer/src/components/assistant-ui/approval-notice-bar.tsx)，把待确认权限条改成“左侧说明 + 右侧允许/拒绝”结构，并补上类型、标题、时间、模型等上下文。

### 为什么改

- 当前 `引导` 卡片高度偏大，视觉重心压到输入区，和聊天主链路抢注意力。
- 当前权限确认条掉在 composer 下方，只剩两个按钮，位置和信息都不够直接。
- 聊天区里同类动作条需要统一成同样的左右结构，用户扫一眼就能理解在处理什么。

### 涉及文件

- `src/renderer/src/components/assistant-ui/thread.tsx`
- `src/renderer/src/components/assistant-ui/approval-notice-bar.tsx`
- `docs/changes/2026-04-21/changes.md`

### 结果

- `引导` 现在是更紧的单行条，离输入区更近，视觉负担更轻。
- 权限确认条现在会出现在输入框上方，并且右侧固定放 `允许 / 拒绝`。
- 权限说明、时间和模型上下文会一起显示，确认动作更容易判断。

## 引导改成运行中回车挂起，点击后中断续发

**时间**: 10:45

### 改了什么

1. 调整 [`src/renderer/src/components/assistant-ui/thread.tsx`](D:/a_github/first_pi_agent/src/renderer/src/components/assistant-ui/thread.tsx)，运行中在输入框里输入内容后按 `Enter` 会直接把内容写入引导条，并清空输入框。
2. 同文件里移除运行中 composer 右侧的内联 `引导` 按钮，只保留引导条上的主动作。
3. 调整引导条点击行为，点击 `引导` 时先把这条消息写进引导草稿，再立刻停止当前 run。
4. 调整 [`src/main/chat/service.ts`](D:/a_github/first_pi_agent/src/main/chat/service.ts)，把挂起的引导消息统一放到当前 run 收尾后续发，覆盖完成、失败、取消三种结束路径。

### 为什么改

- 当前运行中按回车没有把输入内容转成引导消息，主路径缺了一半。
- 当前点击 `引导` 只是在本地挂一条草稿，当前 run 继续执行，所以看起来像“点了没用”。
- 引导消息的职责是抢占当前回复并进入下一轮上下文，链路需要把“挂起消息”和“停止当前 run”串成一件事。

### 涉及文件

- `src/renderer/src/components/assistant-ui/thread.tsx`
- `src/main/chat/service.ts`
- `docs/changes/2026-04-21/changes.md`

### 结果

- 运行中输入内容后按 `Enter`，会立刻出现引导条。
- 点击引导条上的 `引导`，当前回复会停止，这条消息会在下一轮开始前进入上下文。
- 当前 run 正常完成、失败或取消后，只要有挂起引导消息，都会自动续发。

## 中断审批恢复改成内部续跑

**时间**: 11:03

### 改了什么

1. 调整 [`src/renderer/src/components/assistant-ui/thread.tsx`](D:/a_github/first_pi_agent/src/renderer/src/components/assistant-ui/thread.tsx)，`恢复执行` 现在直接启动内部 run，不再把 recovery prompt 填进输入框，也不再发成一条用户消息。
2. 调整 [`src/renderer/src/components/AssistantThreadPanel.tsx`](D:/a_github/first_pi_agent/src/renderer/src/components/AssistantThreadPanel.tsx) 和新增 [`src/renderer/src/lib/interrupted-approval-run-config.ts`](D:/a_github/first_pi_agent/src/renderer/src/lib/interrupted-approval-run-config.ts)，把中断审批恢复 prompt 改成 runConfig 里的内部输入，并给这类消息保留可重试的内部配置。
3. 调整 [`src/main/chat/prepare.ts`](D:/a_github/first_pi_agent/src/main/chat/prepare.ts) 和 [`src/shared/contracts.ts`](D:/a_github/first_pi_agent/src/shared/contracts.ts)，新增发送 origin，恢复中断审批时跳过用户消息落库和 `message:user` 广播。
4. 调整 [`src/renderer/src/components/assistant-ui/approval-notice-bar.tsx`](D:/a_github/first_pi_agent/src/renderer/src/components/assistant-ui/approval-notice-bar.tsx) 与 [`AGENTS.md`](D:/a_github/first_pi_agent/AGENTS.md)，移除“填入输入框”入口，并把“内部恢复文案不对用户展示”写成长期约束。

### 为什么改

- 当前恢复执行复用了普通发消息链路，导致中断审批上下文被当成用户消息直接显示在聊天区。
- 当前这类消息失败后再点重试，会继续复用那段内部 prompt，用户还能再次看到内部字段。
- 中断审批恢复属于内部控制链路，产品界面只需要展示继续执行的结果，不需要展示 runtime 日志细节。

### 涉及文件

- `src/renderer/src/components/assistant-ui/thread.tsx`
- `src/renderer/src/components/AssistantThreadPanel.tsx`
- `src/renderer/src/components/assistant-ui/approval-notice-bar.tsx`
- `src/renderer/src/lib/interrupted-approval-run-config.ts`
- `src/main/chat/prepare.ts`
- `src/shared/contracts.ts`
- `AGENTS.md`
- `docs/changes/2026-04-21/changes.md`

### 结果

- 点击 `恢复执行` 会直接继续跑，不再生成一条带内部字段的用户消息。
- 这类内部恢复 run 失败后再点 `重新生成`，仍然会走内部 prompt，不会把 recovery 文案暴露到聊天区。
- 中断审批恢复入口现在只保留用户可理解的动作，不再给用户暴露原始恢复日志。

## 引导点击补齐等待当前 run 结束后的续发

**时间**: 11:37

### 改了什么

1. 调整 [`src/main/chat/service.ts`](D:/a_github/first_pi_agent/src/main/chat/service.ts)，`queueRedirectMessage()` 在命中“当前正在跑的 run”时，先等待这个 run 真正结束，再继续尝试派发挂起引导。
2. 调整 [`src/renderer/src/components/assistant-ui/thread.tsx`](D:/a_github/first_pi_agent/src/renderer/src/components/assistant-ui/thread.tsx)，点击 `引导` 时改成先发起挂起请求、立即停止当前 run、最后等待挂起链路完成。

### 为什么改

- 之前点击 `引导` 时，前端会先等挂起请求返回，再去停止当前 run；主进程这一步又会在发现 run 还活着时直接返回，所以链路停在“已取消 + 草稿保留”。
- 引导续发的正确顺序是：先把下一条内容挂起，再让当前 run 结束，最后由主进程补发这条挂起消息。

### 涉及文件

- `src/main/chat/service.ts`
- `src/renderer/src/components/assistant-ui/thread.tsx`
- `docs/changes/2026-04-21/changes.md`

### 结果

- 点击 `引导` 后，当前回复会先停下，然后挂起的引导消息会继续往下执行。
- 主进程和前端现在对“等待当前 run 结束后续发”用了同一条顺序，不会再卡在草稿条上。

## 引导与下一条消息切回正式队列实现

**时间**: 12:18

### 改了什么

1. 调整 [`src/shared/contracts.ts`](D:/a_github/first_pi_agent/src/shared/contracts.ts)、[`src/shared/ipc.ts`](D:/a_github/first_pi_agent/src/shared/ipc.ts)、[`src/preload/index.ts`](D:/a_github/first_pi_agent/src/preload/index.ts) 和 [`src/main/ipc/chat.ts`](D:/a_github/first_pi_agent/src/main/ipc/chat.ts)，把 `pendingRedirectDraft` 单草稿接口切回 `queuedMessages` 队列模型，并恢复 `enqueueQueuedMessage`、`triggerQueuedMessage`、`removeQueuedMessage` 三条正式 API。
2. 调整 [`src/main/session/meta.ts`](D:/a_github/first_pi_agent/src/main/session/meta.ts)、[`src/main/session/service.ts`](D:/a_github/first_pi_agent/src/main/session/service.ts) 和 [`src/main/session/facade.ts`](D:/a_github/first_pi_agent/src/main/session/facade.ts)，把会话持久化改成 FIFO 队列，并兼容把历史 `pendingRedirectDraft` 自动迁移成一条队列消息。
3. 调整 [`src/main/chat/service.ts`](D:/a_github/first_pi_agent/src/main/chat/service.ts)，把挂起续发改成单入口队列派发器，统一处理运行中排队、点击 `引导` 抢占、run 收尾后自动续发这三条路径。
4. 调整 [`src/renderer/src/components/AssistantThreadPanel.tsx`](D:/a_github/first_pi_agent/src/renderer/src/components/AssistantThreadPanel.tsx)、[`src/renderer/src/components/assistant-ui/thread.tsx`](D:/a_github/first_pi_agent/src/renderer/src/components/assistant-ui/thread.tsx) 和 [`AGENTS.md`](D:/a_github/first_pi_agent/AGENTS.md)，让输入框回车进入队尾、顶部横条展示队首和剩余数量、`引导` / 删除按钮接到正式队列接口，并把这条约束沉淀成长期规则。

### 为什么改

- 单条 `pendingRedirectDraft` 语义把“排队下一条消息”和“引导当前轮”压进同一个临时状态，当前 run 停止、续发、重试三条链路容易互相打架。
- 正式队列模型把排队、置顶、删除和自动续发拆成稳定职责，主进程可以用一条派发器统一收口，行为更可预测。

### 涉及文件

- `src/shared/contracts.ts`
- `src/shared/ipc.ts`
- `src/preload/index.ts`
- `src/main/ipc/chat.ts`
- `src/main/session/meta.ts`
- `src/main/session/service.ts`
- `src/main/session/facade.ts`
- `src/main/chat/service.ts`
- `src/renderer/src/components/AssistantThreadPanel.tsx`
- `src/renderer/src/components/assistant-ui/thread.tsx`
- `AGENTS.md`
- `docs/changes/2026-04-21/changes.md`

### 结果

- 运行中按 `Enter` 会把输入内容排到队尾，当前 run 结束后按 FIFO 自动继续。
- 点击 `引导` 会把目标消息提到队首，并在当前 run 结束后优先续发。
- 历史会话里的单条草稿会自动迁移进队列，聊天区展示和主进程派发现在共用同一套正式语义。

## 修复重新生成按钮触发的渲染死循环

**时间**: 13:43

### 改了什么

1. 调整 [`src/renderer/src/components/assistant-ui/thread.tsx`](D:/a_github/first_pi_agent/src/renderer/src/components/assistant-ui/thread.tsx)，把 `AssistantReloadButton` 里 `useAuiState` 的 selector 从返回 `internalRun` 对象改成只返回稳定的 `prompt` 字符串。

### 为什么改

- `readInterruptedApprovalInternalRun()` 每次调用都会新建对象，直接把这个对象交给 `useAuiState` 会让 assistant-ui 的外部状态订阅持续判定“值已变化”，最终打出 `Maximum update depth exceeded`。

### 涉及文件

- `src/renderer/src/components/assistant-ui/thread.tsx`
- `docs/changes/2026-04-21/changes.md`

### 结果

- `重新生成` 按钮继续保留内部恢复 prompt 的能力。
- renderer 不会再因为 selector 返回新对象而进入无限更新。

## 引导续发改回 renderer 接棒发送

**时间**: 13:52

### 改了什么

1. 调整 [`src/main/chat/service.ts`](D:/a_github/first_pi_agent/src/main/chat/service.ts)，把队列相关 API 收敛回“只负责入队、置顶、删除”，停止在主进程里后台直接 `sendChatMessage()`。
2. 调整 [`src/renderer/src/components/assistant-ui/thread.tsx`](D:/a_github/first_pi_agent/src/renderer/src/components/assistant-ui/thread.tsx)，新增空闲态自动续发逻辑：当前 run 结束后，只要队首还有排队消息，就由 renderer 通过现有 composer/runtime 正常发出下一条消息。
3. 同文件补上自动续发锁，防止删除队首并 reload session 后，下一条消息在上一条真正起跑前被提前抢发。

### 为什么改

- assistant-ui 当前聊天界面依赖 renderer 里的 `useLocalRuntime` 消费 run 事件；主进程后台直接发送队列消息时，UI 接不到新一轮 run，所以用户看到的效果就是“已停止，但引导没继续”。
- 队列持久化放在主进程，真正发消息放回 renderer，才能复用现有聊天流、思考展示和消息落区。

### 涉及文件

- `src/main/chat/service.ts`
- `src/renderer/src/components/assistant-ui/thread.tsx`
- `docs/changes/2026-04-21/changes.md`

### 结果

- 点击 `引导` 后，当前 run 停止，队首消息会由聊天 UI 自己继续发出。
- 运行中按 `Enter` 排队的消息，也会在上一条结束后自动接棒。
- 多条排队消息会按现有 runtime 一条条继续，用户能看到真实的续发过程。

## 取消 run 后不再落空白 assistant 卡片

**时间**: 14:03

### 改了什么

1. 调整 [`src/renderer/src/components/AssistantThreadPanel.tsx`](D:/a_github/first_pi_agent/src/renderer/src/components/AssistantThreadPanel.tsx)，运行中只有在 assistant 已经产生可见内容时才推送 runtime 更新。
2. 同文件里把 `createRunQueue().finish()` 改成支持无 payload 收尾；当一轮 run 被取消且整轮没有任何可见内容时，直接结束，不再补一条空 assistant 消息。

### 为什么改

- 当前点击 `引导` 或停止时，如果这轮 assistant 还没来得及产出正文、思考或工具内容，renderer 仍然会创建一条内容为空的 assistant 消息，聊天区就会出现中间那块空白卡片。

### 涉及文件

- `src/renderer/src/components/AssistantThreadPanel.tsx`
- `docs/changes/2026-04-21/changes.md`

### 结果

- 被取消且没有产出内容的 run 不会再在聊天区留下空白壳子。
- 真正有内容的 assistant 回复仍然会按原样展示。

## 过滤 usage-only 空消息并等待主进程确认结束后再续发

**时间**: 14:26

### 改了什么

1. 调整 [`src/main/adapter.ts`](D:/a_github/first_pi_agent/src/main/adapter.ts)，`buildAssistantMessage()` 现在只有在 assistant 真的产出可见正文、思考或工具步骤时才会落库；只有 usage、没有可见内容的消息直接丢弃。
2. 调整 [`src/renderer/src/components/AssistantThreadPanel.tsx`](D:/a_github/first_pi_agent/src/renderer/src/components/AssistantThreadPanel.tsx)，把历史消息映射改成过滤空 assistant 消息，并新增 `runCompletionSerial`，只在真正收到 `agent_end / agent_error` 后推进一轮完成序号。
3. 调整 [`src/renderer/src/components/assistant-ui/thread.tsx`](D:/a_github/first_pi_agent/src/renderer/src/components/assistant-ui/thread.tsx)，点击 `引导` 且当前 run 仍在执行时，自动续发会等待这轮主进程确认结束后再发下一条，避免抢在 agent abort 收尾前复用同一个 handle。

### 为什么改

- 当前空白块有两层来源：一层是 usage-only assistant 消息被持久化后重新渲染；另一层是 renderer 在本地先标记 cancelled 后，过早自动续发，导致主进程抛出 `Agent is already processing a prompt`。

### 涉及文件

- `src/main/adapter.ts`
- `src/renderer/src/components/AssistantThreadPanel.tsx`
- `src/renderer/src/components/assistant-ui/thread.tsx`
- `docs/changes/2026-04-21/changes.md`

### 结果

- 空 assistant 消息不会再写进 transcript，刷新后历史空白块也会被过滤掉。
- 点击 `引导` 后，下一条消息会等主进程确认上一轮真的收尾完成，再继续发送。
- `Agent is already processing a prompt` 这类抢跑报错会消失。


## 修复助手错误信息覆盖正文导致的重复展示

**时间**: 07:55

### 改了什么

1. 在 [src/renderer/src/components/AssistantThreadPanel.tsx](D:/a_github/first_pi_agent/src/renderer/src/components/AssistantThreadPanel.tsx) 的 `RuntimeResponse` 上新增独立的 `errorMessage` 字段，`createResponse` 默认置空。
2. `agent_error` 事件不再把 `**错误：** ...` 拼回 `response.finalText`，改为只写入 `response.errorMessage`，避免污染助手正文。
3. `chat.send` 失败的 catch 分支同样改写 `errorMessage` 而不是覆盖 `finalText`，防止用户已经看到的助手回复被错误信息整段替换。
4. `buildRuntimeStatus` 在 `status === "error"` 分支改用 `response.errorMessage` 作为 `MessageStatus.error`，回退文案保持 `Agent 执行失败`。

### 为什么改

- 用户反馈聊天里的"引导"（打断/插入排队消息那条）出问题：点击后助手区会把同一段文本既以正文形式渲染、又以红底 `MessageError` 重复展示一次，看起来像是"消息消失/列表被复制"。
- 根因是 `agent_error` 把错误说明追加进 `finalText`，而 `buildRuntimeStatus` 又把整段 `finalText` 当作 error 字段塞进消息状态，导致正文 + 错误浮层显示同样的内容。
- `chat.send` 失败时直接覆盖 `finalText` 也会让已经流式出来的助手正文被完整丢弃，体验和"消息消失"高度吻合。

### 涉及文件

- `src/renderer/src/components/AssistantThreadPanel.tsx`

### 结果

- 助手正文 (`finalText`) 与错误提示彻底解耦：正文不再被错误信息追加污染，红底 `MessageError` 只展示真实错误描述。
- 走 `引导` 路径打断当前 run 时，原助手回复保持完整，新排队消息按既有自动派发逻辑发送，不再出现"两边消息列表一样"的重复展示。
- 未跑 build / type-check（按 AGENTS.md 规则，未明确要求时不主动 build）。