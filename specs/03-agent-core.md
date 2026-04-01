# 03 — Agent Core

> 状态：`in-review`
> 依赖：01-overview

## 3.1 职责

Agent Core 是整个系统的大脑。它负责：

1. **接收用户消息** — 从 Adapter 层拿到用户输入
2. **拼装上下文** — 把 Soul 文件 + 记忆 + 对话历史组合成 LLM 能理解的 context
3. **驱动 ReAct Loop** — 发给 LLM → 判断回复类型 → 执行工具或回复用户 → 循环
4. **管理上下文预算** — 对话太长时压缩，防止 token 溢出和幻觉
5. **透传流式事件** — 把 agent 执行过程的每一步事件发给前端展示

Agent Core 不关心消息从哪来（Electron 还是 Telegram），也不关心 UI 长什么样。它只管"想"和"做"。

## 3.2 技术选型：pi-agent-core

我们不自己实现 agent loop，而是使用已安装的 `@mariozechner/pi-agent-core`。

### 它帮我们做了什么

| 能力 | 说明 |
|------|------|
| ReAct Loop | 自动循环：LLM 回复 → 判断是工具调用还是最终回复 → 执行 → 继续 |
| 工具执行 | 自动解析 LLM 的 tool_call → 校验参数（TypeBox）→ 调用 execute → 结果喂回 |
| 流式输出 | 细粒度事件：thinking delta、text delta、tool 执行状态，实时推送 |
| 错误重试 | 工具参数校验失败自动让 LLM 重试，不需要我们处理 |
| 运行时配置 | 可以随时切换模型、工具列表、system prompt、thinking level |
| 中断控制 | 支持 AbortSignal，用户可以随时取消正在执行的 agent |

### 我们要做的

| 能力 | 说明 |
|------|------|
| System Prompt 拼装 | 从 Soul 文件 + 记忆检索结果动态构建 |
| transformContext 实现 | 上下文压缩策略（详见 3.5） |
| 事件桥接 | 把 agent 事件通过 IPC 转发给前端 |
| 工具注册 | 收集内置工具 + MCP 工具，注入 Agent |
| 生命周期管理 | Agent 实例的创建、销毁、会话切换 |

## 3.3 Agent 初始化流程

用户打开应用（或切换到一个会话）时：

```
1. 读取 workspace 的 Soul 文件
   ├─ SOUL.md  → agent 人格和行为边界
   ├─ USER.md  → 用户信息和偏好
   └─ AGENTS.md → 行为规则和 SOP

2. 拼装 system prompt
   systemPrompt = soul + user + agents + 工具使用指引

3. 加载工具
   ├─ 内置工具（file_read, file_write, shell_exec, web_fetch, memory_search）
   └─ MCP 工具（从 mcp.json 配置的 server 获取）

4. 解析 LLM 配置
   ├─ provider + model（用户在 UI 选择或配置文件指定）
   └─ API key（BYOK，从 credentials 读取）

5. 创建 Agent 实例
   new Agent({
     initialState: { systemPrompt, model, tools, messages, thinkingLevel },
     transformContext: 我们的上下文管理策略,
     getApiKey: 从配置读取,
   })

6. 订阅事件
   agent.subscribe(event => 通过 IPC 转发给前端)

7. 如果是已有会话 → 从 store 恢复 messages 历史
   如果是新会话 → messages 为空
```

## 3.4 ReAct Loop 详解

一次用户输入触发的完整循环：

```
用户输入: "帮我创建一个 hello.txt 文件，内容是 Hello World"
                            │
                            ▼
┌─ Turn 1 ─────────────────────────────────────────┐
│                                                   │
│  Agent → LLM:                                     │
│    system: [soul + user + agents + 记忆]           │
│    user: "帮我创建一个 hello.txt..."               │
│                                                   │
│  LLM 回复:                                        │
│    thinking: "用户要创建文件，我用 file_write"      │
│    tool_call: file_write({ path: "hello.txt",     │
│                            content: "Hello World", │
│                            mode: "overwrite" })    │
│                                                   │
│  Agent Core 判断: 这是工具调用 → 执行它             │
│  执行 file_write → 成功，返回 { size: 11 }        │
│                                                   │
│  事件流:                                           │
│    → turn_start                                   │
│    → message_start                                │
│    → thinking_delta("用户要创建文件...")            │
│    → tool_execution_start(file_write)             │
│    → tool_execution_end(success)                  │
│    → message_end                                  │
│    → turn_end                                     │
│                                                   │
└──────────────────────────────────────────────────┘
                            │
                            ▼ 工具结果喂回 LLM
┌─ Turn 2 ─────────────────────────────────────────┐
│                                                   │
│  Agent → LLM:                                     │
│    [...之前的消息]                                  │
│    tool_result: { file created, size: 11 bytes }  │
│                                                   │
│  LLM 回复:                                        │
│    text: "已创建 hello.txt，内容是 Hello World"    │
│                                                   │
│  Agent Core 判断: 这是最终回复 → 发给用户           │
│                                                   │
│  事件流:                                           │
│    → turn_start                                   │
│    → message_start                                │
│    → text_delta("已创建 hello.txt...")             │
│    → message_end                                  │
│    → turn_end                                     │
│    → agent_end                                    │
│                                                   │
└──────────────────────────────────────────────────┘
```

### 关键参数

| 参数 | 值 | 说明 |
|------|-----|------|
| 最大轮次 | 20 | 防止 agent 死循环，超过直接终止并告诉用户 |
| thinking level | 用户可选 | off / minimal / low / medium / high / xhigh |
| 并发工具调用 | 支持 | LLM 可以在一次回复中调用多个工具，Agent Core 并行执行 |

## 3.5 上下文管理（transformContext）

### 为什么需要

LLM 有 context window 限制（比如 Claude 200K、GPT-4o 128K）。但即使模型支持很长的 context，**塞太多信息反而会降低回复质量**——模型的注意力会分散，容易忽略关键信息或产生幻觉。

所以我们需要在每轮 LLM 调用前，主动管理 context 的内容和大小。

### 策略

```
transformContext(messages, signal) → 精简后的 messages
```

执行时机：每轮 LLM 调用前（pi-agent-core 自动调用）。

**Step 1: 计算 token 预算**
```
总预算 = 模型 context window × 0.7（留 30% 给回复）
已用 = system prompt tokens + 工具定义 tokens
可用 = 总预算 - 已用
```

**Step 2: 检索长期记忆**
```
取最近一条用户消息 → embedding → 向量检索 → top-5 条记忆
将记忆作为 system context 注入（占用约 500-1000 tokens）
```

**Step 3: 如果消息历史超出可用预算**
```
保护区：最近 6 轮对话（3 轮 user + 3 轮 assistant）→ 不动
压缩区：更早的对话 → 用 LLM 压缩成一段摘要
         "之前的对话摘要：用户是全栈工程师，正在搭建一个 Electron agent 项目，
          已经讨论了架构设计，确认使用 pi-agent-core 作为引擎..."
丢弃区：如果压缩后还是超 → 从最早的开始丢弃
```

**Step 4: 返回精简后的 messages**
```
[记忆注入消息, 压缩摘要消息, ...最近 6 轮原文]
```

### 为什么是 70%？

留 30% 给模型输出。如果 context 塞到 95%，模型还没说几句就到上限了，回复会被截断。70% 是业界常用的经验值。

### 为什么保留最近 6 轮？

最近的对话是当前任务的直接上下文，压缩会丢失细节。6 轮（3 来 3 回）通常足够覆盖当前正在进行的操作。如果一个工具调用链很长（比如 10 步），这个数字可以动态调整。

## 3.6 BYOK 多 Provider

通过 pi-ai 的统一 API 支持多个 LLM provider：

```
用户配置 (credentials):
  {
    "openai": { "apiKey": "sk-..." },
    "anthropic": { "apiKey": "sk-ant-..." },
    "google": { "apiKey": "AIza..." },
    "ollama": { "baseUrl": "http://localhost:11434" }
  }

模型选择 (UI 或配置文件):
  provider: "anthropic"
  model: "claude-sonnet-4-20250514"

Agent 初始化时:
  const model = getModel("anthropic", "claude-sonnet-4-20250514")
  getApiKey: (provider) => credentials[provider].apiKey
```

pi-ai 支持的 provider 包括：OpenAI、Anthropic、Google、DeepSeek、Mistral、xAI、Groq、Ollama（本地）等。用户只需要配置自己有的 API Key。

## 3.7 流式事件与前端桥接

pi-agent-core 的 Agent 通过 `subscribe` 发出事件，我们需要通过 Electron IPC 转发给前端。

### 事件类型

```
agent_start          → 一次完整执行开始
  turn_start         → 单轮 LLM 调用开始
    message_start    → 消息开始（含 role 信息）
    message_update   → 流式内容：text_delta / thinking_delta / toolcall_delta
    message_end      → 消息完成（含 usage 和 cost）
    tool_execution_start   → 工具开始执行（工具名、参数）
    tool_execution_update  → 工具中间输出（如 shell 的 stdout 流）
    tool_execution_end     → 工具执行完成（结果或错误）
  turn_end           → 单轮结束
agent_end            → 整次执行结束
```

### IPC 桥接方式

```
Main Process:
  agent.subscribe(event => {
    mainWindow.webContents.send('agent:event', event)
  })

Preload:
  contextBridge.exposeInMainWorld('desktopApi', {
    agent: {
      onEvent: (callback) => ipcRenderer.on('agent:event', (_, event) => callback(event))
    }
  })

Renderer:
  window.desktopApi.agent.onEvent(event => {
    // 更新 Steps 面板、消息列表等
  })
```

这样前端拿到的就是结构化的事件流，可以精确地知道 agent 在每一刻在干什么——正在思考、正在调 tool、tool 返回了什么、最终回复了什么。

## 3.8 Agent 生命周期

```
应用启动
  └→ 加载上次的会话 → 创建 Agent 实例（恢复 messages）

用户切换会话
  └→ 销毁当前 Agent → 保存当前会话 messages → 创建新 Agent（加载目标会话 messages）

用户新建会话
  └→ 创建新 Agent（空 messages）

用户发送消息
  └→ agent.prompt(message)（触发 ReAct Loop）

用户取消执行
  └→ AbortSignal 中断当前 loop

用户关闭应用
  └→ 保存当前会话 messages → 销毁 Agent

会话结束（用户主动 or 超过 N 分钟无交互）
  └→ 触发记忆提取：从对话中提取关键信息 → 存入 T1 长期记忆
```

## 3.9 错误处理

| 错误场景 | 处理方式 |
|---------|---------|
| LLM API 调用失败（网络/限流） | pi-agent-core 内置重试机制（指数退避） |
| LLM 返回格式异常 | pi-agent-core 自动重试一次 |
| 工具参数校验失败 | 错误信息喂回 LLM，让它修正参数重试 |
| 工具执行失败 | 错误信息喂回 LLM，让它决定重试还是换方案 |
| Token 超限 | transformContext 自动压缩，压缩失败则告知用户"对话太长，建议新建会话" |
| 超过最大轮次（20） | 终止 loop，告知用户"任务过于复杂，已执行 20 步仍未完成" |
| API Key 无效/过期 | 前端弹出配置页面，引导用户更新 Key |
