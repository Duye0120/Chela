# 01 — 项目总览

> 状态：`in-review`

## 1.1 项目是什么

Pi Desktop Agent 是一个本地运行的桌面端 AI Agent 工作台。

用最简单的话说：**一个能帮你干活的桌面助手**——它能读写文件、执行命令、上网查资料、记住你的偏好，而且你能看到它每一步在想什么、在做什么。

## 1.2 为什么做这个

OpenClaw 在 2026 年初爆火（60 天 247k GitHub stars），证明了个人 AI Agent 的巨大需求。但 OpenClaw 跑在消息平台（Telegram/WhatsApp）上，交互受限于纯文本聊天。

我们的切入角度：**桌面原生体验**。

| | OpenClaw | Pi Desktop Agent |
|---|---------|-----------------|
| 运行方式 | 消息平台里的 bot | 独立桌面应用 |
| 交互界面 | 纯文本聊天 | 完整 UI：推理可视化、终端、Diff |
| agent 过程 | 看不到中间步骤 | 每步 think → act → observe 可视化 |
| 工具执行 | 只看到最终结果 | 实时看到命令输出、文件变更 |
| 配置方式 | .md 文件（相同） | .md 文件 + 桌面 UI |

面试故事：*"OpenClaw 证明了 agent 的需求，但消息平台限制了交互深度。我认为桌面端可以提供更丰富的体验——可视化推理链、实时终端、文件管理——所以我做了 Pi Desktop Agent。"*

## 1.3 架构分层

```
┌──────────────────────────────────────────────────┐
│  Adapter 层（翻译官）                              │
│                                                   │
│  职责：把不同来源的消息翻译成 Agent 能理解的格式     │
│  v1：Electron UI                                  │
│  后续：Telegram Bot（预留接口）                     │
├──────────────────────────────────────────────────┤
│  Harness（执行约束层）                              │
│                                                   │
│  职责：run 状态机、权限门控、确认断点、事件回放      │
│  规则：模型只能提议下一步，不能直接落地副作用        │
├──────────────────────────────────────────────────┤
│  Agent Core（大脑）                                │
│                                                   │
│  职责：接收消息 → 思考 → 调用工具 → 继续思考 → 回复 │
│  引擎：pi-agent-core（ReAct Loop）                 │
│  能力：上下文管理、流式输出、BYOK 多 Provider       │
├──────────────────────────────────────────────────┤
│  工具层（手和脚）                                   │
│                                                   │
│  职责：Agent 的具体执行能力                         │
│  内置：file_read、file_write、shell_exec、          │
│        web_fetch、memory_search                    │
│  扩展：MCP Client（连接外部 MCP Server）            │
├──────────────────────────────────────────────────┤
│  记忆系统（记忆和人格）                              │
│                                                   │
│  职责：让 Agent 有身份、有记忆、认识你               │
│  T0 Soul 层：SOUL.md / USER.md / AGENTS.md        │
│  T1 长期记忆：MEMORY.md + 向量检索（RAG）           │
│  T2 会话记忆：当前对话 messages                     │
├──────────────────────────────────────────────────┤
│  前端体验（差异化核心）                              │
│                                                   │
│  职责：让用户"看到" Agent 在做什么                   │
│  推理可视化：think → act → observe 步骤面板          │
│  终端集成：shell 命令实时输出（xterm.js + ANSI）     │
│  文件 Diff：file_write 前后变更对比展示              │
└──────────────────────────────────────────────────┘
```

### Harness 约束

从这轮开始，本项目不是“模型直接控制工具”的自由 Agent，而是“模型运行在 Harness 里”的桌面 Agent。

Harness 是夹在 Adapter、Agent Core、Tool System 之间的执行约束层，负责：

- 把一次用户输入包装成一个可追踪的 `run`
- 控制 `run` 状态：`idle → running → awaiting_confirmation → executing_tool → completed / aborted / failed`
- 在 `tool_call` 真正落地前做 policy check、budget check、confirmation check
- 把 thinking、tool、result、final text 组织成可回放事件流

硬规则：

- LLM 只能提议下一步，不能直接产生副作用
- 所有副作用都必须经 Harness 批准，并绑定 `runId`
- 所有高风险动作都必须可中断、可确认、可恢复

### 为什么分层？

**关注点分离**——每一层只管自己的事：

- 要加 Telegram？→ 只写一个新 Adapter，其他层不动
- 要换 LLM provider？→ 只改 Agent Core 配置，工具和 UI 不动
- 要加新工具？→ 只在工具层注册，Agent Core 自动发现
- 要改 UI？→ 只动前端，后端逻辑不动

这意味着任何一层的变更不会引发连锁反应，也意味着我们开发时可以一层一层搭，搭好一层测一层。

## 1.4 技术栈

| 层 | 技术 | 状态 |
|----|------|------|
| Agent 引擎 | pi-agent-core + pi-ai (v0.56.2) | 已安装 |
| 桌面框架 | Electron 41 | 已有 |
| 前端 | React 19 + TypeScript | 已有 |
| UI 组件 | HeroUI + Headless UI + Heroicons | 已有 |
| 样式 | Tailwind CSS 4 | 已有 |
| 动画 | Framer Motion | 已有 |
| 终端渲染 | xterm.js | 新增 |
| Diff 渲染 | 待选型（见 12-file-diff-display） | 新增 |
| 向量计算 | Ollama embedding + 余弦相似度 | 新增 |
| MCP | @modelcontextprotocol/sdk | 已安装 |
| Schema 校验 | TypeBox（pi-ai 内置） | 已有 |

## 1.5 上下文管理策略（三板斧）

Agent 面临的核心工程挑战：LLM 的 context window 有限，塞太多信息会导致注意力分散和幻觉。

我们用三个机制控制上下文质量：

**第一板斧：transformContext 钩子**
pi-agent-core 提供的钩子，每轮 LLM 调用前自动执行。当 token 超预算时，把早期对话压缩成摘要，保留最近 N 轮原文，注入检索到的长期记忆。

**第二板斧：工具结果裁剪**
工具返回时就控制数据量。比如 file_read 读了一个 5000 行文件，不全塞进 context，而是截断+提示"文件共 5000 行，已截断"。

**第三板斧：记忆检索而非全量注入**
不把所有记忆塞进 context，只通过向量检索取 top-K 条相关记忆注入。

v2 规划中有更高级的方案（sub-agent 上下文蒸馏），但 v1 这三板斧已经足够。

## 1.6 数据流：一次完整的交互

```
1. 你在输入框打字："帮我看看 package.json 里有哪些依赖"
2. Electron Adapter 把消息通过 IPC 发给 Main Process
3. Agent Core 收到消息：
   a. 读取 SOUL.md + USER.md + AGENTS.md → 拼成 system prompt
   b. 检索长期记忆 → 找到相关条目注入 context
   c. 把消息 + context 发给 LLM
4. LLM 返回：tool_call proposal("file_read", { path: "./package.json" })
5. Harness 检查权限和策略 → 允许后执行工具 → 读到文件内容
6. 前端实时展示：Step 1 - Thinking... → Step 2 - file_read [running...]
7. 工具结果喂回 LLM → LLM 生成最终回复
8. 前端展示回复 + Step 2 变成 [done ✓]
9. 会话消息和 run 轨迹存入 store
```

## 1.7 Scope 边界

### v1 做的

- Harness 驱动的 Agent Core（pi-agent-core 集成 + 状态机 + 上下文管理）
- 5 个内置工具（file_read、file_write、shell_exec、web_fetch、memory_search）
- MCP Client（配置文件驱动，能连能用）
- 三层记忆系统（Soul 文件 + 长期 RAG + 会话记忆）
- 前端可视化（推理步骤 + 终端 + Diff）
- BYOK 多 Provider
- 安全机制（白名单 + 拦截 + 确认）

### v1 不做（后续规划，已预留接口）

| 编号 | 功能 | 预留方式 |
|------|------|---------|
| F1 | Telegram Bot Adapter | Adapter 接口统一，加新实现即可 |
| F2 | Sub-agent / Multi-agent | Agent Core 独立，可在上层编排多个实例 |
| F3 | Plan mode（先规划再执行） | Agent 的 tool 列表可以动态扩展 |
| F4 | MCP Server 管理 UI | MCP Client 已有，UI 是前端工作 |
| F5 | Cron / 定时任务 | Electron main process 可以跑 scheduler |
| F6 | 心跳 / 后台常驻 | Electron 本身就是长运行进程 |
| F7 | Workspace 文件浏览器 | file_read 工具已有，UI 是前端工作 |
