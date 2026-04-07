# Harness 架构基线

> 目的：后续实现先对齐架构，再写功能，避免 UI、Agent、工具、安全、持久化继续串层。

## 1. 北极星

这个项目不是“模型直接调工具”的自由 Agent，而是“模型运行在 Harness 里”的桌面 Agent。

硬规则：

- 模型只能提议下一步，不能直接产生副作用
- 一次用户发送 = 一个 `run`
- `run` 是执行一等公民，`session` 只是用户视角的会话容器
- 所有副作用都必须先经过 `policy -> allow / confirm / deny`
- 所有关键动作都必须带 `runId`
- 所有高风险动作都必须可暂停、可确认、可恢复、可审计

一句话概括：

`Renderer 负责显示，Agent 负责思考，Harness 负责准入和记账，Tools/MCP 负责执行能力，Store 负责落盘。`

## 2. 分层

### 2.1 Adapter / UI 层

职责：

- 接收用户输入
- 展示 Harness 事件流
- 发出确认结果
- 不做安全判断，不做副作用准入

当前代码：

- `src/renderer/**`
- `src/preload/index.ts`
- `src/main/adapter.ts`
- `src/shared/agent-events.ts`
- `src/shared/ipc.ts`

边界：

- Renderer 不能自己判断命令能不能跑
- Renderer 不能直接改 run 状态
- Renderer 只能消费结构化事件，不能依赖底层模型原始输出细节

### 2.2 Harness Runtime 层

职责：

- 创建 / 恢复 / 结束 `run`
- 维护状态机
- 接住所有 `tool_call proposal`
- 做 policy 判定
- 进入确认态、恢复执行、拒绝执行
- 记录审计事件
- 把执行结果重新喂回 Agent

这是整个项目的中轴，不是工具的附属逻辑。

当前相关代码是分散的：

- `src/main/index.ts`
- `src/main/agent.ts`
- `src/main/security.ts`
- `src/main/store.ts`

但后续新增实现应优先收口到：

```text
src/main/harness/
  runtime.ts
  policy.ts
  approvals.ts
  audit.ts
  types.ts
```

### 2.3 Agent Core 层

职责：

- 包装 `pi-agent-core`
- 拼装 system prompt
- 做上下文管理
- 订阅和转发流式事件

当前代码：

- `src/main/agent.ts`
- `src/main/adapter.ts`
- `src/main/chat-message-adapter.ts`
- `src/main/soul.ts`

边界：

- Agent Core 不直接决定副作用是否允许
- Agent Core 不直接写审计日志
- Agent Core 不直接做确认 UI

### 2.4 Capability Ports 层

职责：

- 暴露能力端口给 Harness
- 执行内置工具
- 接 MCP 工具

当前代码：

- `src/main/tools/**`
- `src/mcp/**`
- `src/tools/getTime.ts`

边界：

- 工具负责“怎么执行”
- Harness 负责“能不能执行”
- MCP 工具默认也算副作用入口，不能绕过 Harness

### 2.5 Data / Security 层

职责：

- session / settings / providers / credentials 持久化
- git / terminal / files 这类本地服务封装
- 文件、命令、网络基础规则
- audit log 落盘

当前代码：

- `src/main/store.ts`
- `src/main/settings.ts`
- `src/main/providers.ts`
- `src/main/git.ts`
- `src/main/terminal.ts`
- `src/main/files.ts`
- `src/main/security.ts`
- `src/shared/security.ts`

边界：

- Store 负责保存，不负责决定策略
- Security 负责规则和判定，不负责 UI 展示

## 3. 核心对象

后续设计和实现统一围绕这 5 个对象，不再混着写：

### 3.1 Session

用户看到的一条聊天线程。

它负责：

- 消息历史
- 附件
- 标题
- UI 侧可回放的步骤数据

它不负责：

- 当前副作用是否合法
- 当前确认是否待处理

### 3.2 Run

一次用户输入触发的一次执行封装。

最小语义：

```ts
type RunState =
  | "running"
  | "awaiting_confirmation"
  | "executing_tool"
  | "completed"
  | "aborted"
  | "failed";
```

Run 至少应带：

- `runId`
- `sessionId`
- `modelEntryId`
- `state`
- `currentStepId?`
- `pendingApproval?`
- `startedAt`
- `endedAt?`

原则：

- 一个 assistant 最终产物必须能追溯到一个 `run`
- 恢复确认时必须复用原 `runId`

### 3.3 Step

Run 内的执行单元。

最少包含：

- `thinking`
- `tool_call`
- `tool_result`
- `final_text`

Step 是 UI 回放和排错的基础，不是临时变量。

### 3.4 Approval

需要用户确认的挂起点。

最小语义：

- 绑定 `runId`
- 绑定 `payloadHash`
- 绑定具体动作
- 可恢复
- 超时可自动拒绝

Approval 不是“这轮默认都允许”，而是“只允许这一次具体 payload”。

### 3.5 AuditEvent

安全和执行决策的结构化记录。

至少记录：

- `runId`
- `sessionId`
- `toolCallId?`
- `action`
- `decision`
- `reason`
- `timestamp`

## 4. 唯一正确的数据流

后面所有功能都尽量往这条链路上挂：

```text
用户输入
  -> Renderer 发起 chat.send
  -> Main 创建 run
  -> Harness 调 Agent Core
  -> Agent 产出 text / thinking / tool_call proposal
  -> Harness 规范化 proposal
  -> Policy 判断 allow / confirm / deny
  -> allow: 执行能力端口
  -> confirm: run 挂起，等待用户
  -> deny: 生成拒绝结果喂回 Agent
  -> 事件流推给 Renderer
  -> assistant 结束后统一持久化 session/run/audit
```

注意两个原则：

- `tool_call` 是 proposal，不是执行命令
- `message_end` 是用户可见文本收口点，不等于安全执行收口点

## 5. 状态机

统一按这个状态机思考，不要各模块私自发明状态：

```text
idle
  -> running
  -> awaiting_confirmation
       -> user_allow -> executing_tool -> running
       -> user_deny -> running 或 failed
  -> executing_tool -> running
  -> completed
  -> aborted
  -> failed
```

实现约束：

- `awaiting_confirmation` 必须可恢复，不能只活在内存里
- `executing_tool` 必须有明确的 `toolCallId`
- `completed / aborted / failed` 是终态

## 6. 目录归属约束

为了避免写偏，后续默认按下面落位：

### 6.1 还能继续长的目录

- `src/main/harness/`：新增 Harness 运行时
- `src/main/tools/`：内置工具实现
- `src/mcp/`：MCP 连接与适配
- `src/main/` 下的数据服务模块：`store/settings/providers/git/terminal/files`
- `src/renderer/`：只做 UI 和交互投影
- `src/shared/`：协议和共享类型

### 6.2 不要再继续长业务的遗留目录

- `src/agent/`
- `src/chatgpt/`
- `src/main.ts`

这三块现在属于旧入口 / 兼容入口，不是主产品链路。

## 7. 当前仓库映射

按现在代码看，可以先这样理解：

- `src/main/index.ts`
  应该只做应用装配、IPC 注册、模块编排
- `src/main/agent.ts`
  应该是 Agent Wrapper，不应继续吸收 policy / store / approval 逻辑
- `src/main/security.ts`
  现在只是规则助手，后面应被 Harness Policy 调用
- `src/main/tools/*.ts`
  现在是直接执行器，后面保持这个角色，不升级成策略中心
- `src/main/store.ts`
  现在只存 session / group / ui；后面要补 run / approval 恢复能力
- `src/renderer/**`
  现在已经比较像“事件投影层”，这个方向是对的

## 8. 当前缺口

和 Harness 基线相比，当前最缺的是这四块：

1. 独立的 Harness Runtime
2. 确认流与 `awaiting_confirmation` 持久化
3. `audit.log` 结构化审计
4. `transformContext + memory_search` 这一套真正的上下文治理

优先级明确一点：

- 第一优先级：`run / policy / confirm / audit`
- 第二优先级：`transformContext / memory`
- 第三优先级：体验增强

## 9. 后续编码铁律

以后写功能，先问这 6 个问题：

1. 这是 UI 显示，还是 Harness 状态？
2. 这是副作用执行，还是副作用准入？
3. 这个动作有没有 `runId`？
4. 这个动作需不需要 `allow / confirm / deny`？
5. 这个状态如果应用重启，能不能恢复？
6. 这个决策有没有地方审计？

只要有两个问题答不上来，就先别写实现。

## 10. 一句话版本

以后整个项目按这个顺序想：

`用户线程(session) -> 本次执行(run) -> 执行步骤(step) -> 准入决策(policy/approval) -> 能力执行(tool/mcp) -> 事件回放(renderer) -> 持久化(store/audit)`
