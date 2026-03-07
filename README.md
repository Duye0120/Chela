# Minimal pi-agent TypeScript Demo

这是一个从零开始的最小可运行 demo，用 `@mariozechner/pi-ai` 和 `@mariozechner/pi-agent-core` 跑通最基本的 agent 闭环：

`user message -> model -> tool call -> execute tool -> tool result -> model final answer`

这个项目故意保持简单：

- 只有命令行运行
- 只有一个工具 `get_time`
- 没有记忆系统
- 没有 UI
- 没有多代理

现在它额外支持了一个很适合学习的能力：`BYOK (Bring Your Own Key)`。

也就是说，你不需要再改源码里的 `provider` 和 `api key`，而是可以在运行时通过环境变量切换：

- 不同 provider
- 不同 model
- 不同 API key
- 不同 OpenAI-compatible base URL

## 目录结构

```text
first_pi_agent/
├─ package.json
├─ tsconfig.json
├─ README.md
└─ src/
   ├─ main.ts
   ├─ config.ts
   ├─ agent/
   │  └─ createAgent.ts
   └─ tools/
      └─ getTime.ts
```

## 环境要求

- Node.js 20+
- npm

## 安装

```bash
npm install
```

## 运行时配置

### 1. 最小默认模式

如果你什么都不配，demo 默认使用：

- provider: `google`
- model: `gemini-2.5-flash-lite-preview-06-17`
- credential: `GEMINI_API_KEY`

PowerShell:

```powershell
$env:GEMINI_API_KEY="your_api_key_here"
npm run dev
```

### 2. 标准 BYOK 模式

你可以通过统一入口切换 provider / model：

- `PI_PROVIDER`: 模型提供商，例如 `google`、`openai`、`openrouter`
- `PI_MODEL`: 模型 ID
- `PI_API_KEY`: 可选的统一 key；如果不传，会回退到 provider 自己的默认环境变量

例如切到 OpenAI：

```powershell
$env:PI_PROVIDER="openai"
$env:PI_MODEL="gpt-4.1-mini"
$env:PI_API_KEY="your_openai_key"
npm run dev
```

例如切到 OpenRouter：

```powershell
$env:PI_PROVIDER="openrouter"
$env:PI_MODEL="openai/gpt-4.1-mini"
$env:OPENROUTER_API_KEY="your_openrouter_key"
npm run dev
```

说明：

- 如果设置了 `PI_API_KEY`，它优先级最高
- 如果没设置 `PI_API_KEY`，代码会自动尝试 provider 对应的默认环境变量
- 当前 demo 只会自动给 `google` 填默认模型；其他 provider 建议显式设置 `PI_MODEL`

### 3. 自定义 OpenAI-compatible Endpoint

如果你以后要接 LiteLLM、One API、OpenRouter 代理、自建网关，这一层就很有用。

可用环境变量：

- `PI_PROVIDER`: 只是一个标识名，例如 `litellm`
- `PI_MODEL`: 模型 ID
- `PI_BASE_URL`: OpenAI-compatible base URL
- `PI_API_KEY`: 该 endpoint 对应的 key

示例：

```powershell
$env:PI_PROVIDER="litellm"
$env:PI_MODEL="gpt-4o-mini"
$env:PI_BASE_URL="http://localhost:4000/v1"
$env:PI_API_KEY="dummy-or-real-key"
npm run dev
```

注意：当前实现把 `PI_BASE_URL` 视为 OpenAI-compatible 接口，并使用 `openai-completions` 协议。

## 运行

```bash
npm run dev
```

运行后会自动发送固定 prompt：

```text
现在几点了？
```

终端会打印：

- 用户消息
- assistant 的工具调用
- tool 执行结果
- 最终 assistant 回复
- 当前运行时使用的 provider / model / auth source

## 预期输出示例

```text
[config]
provider: openai
model: gpt-4.1-mini
auth: PI_API_KEY
customModel: false

[user message]
现在几点了？

[assistant tool call]
name: get_time
arguments: {}

[tool result]
name: get_time
isError: false
content: 当前本地时间是 2026/3/6 16:30:12，时区是 Asia/Shanghai。
details: {
  "isoTime": "2026-03-06T08:30:12.000Z",
  "localTime": "2026/3/6 16:30:12",
  "timeZone": "Asia/Shanghai"
}

[assistant final answer]
现在是 2026/3/6 16:30:12（Asia/Shanghai）。
```

## 每个文件的作用

### `src/config.ts`

负责运行时配置解析，是这次 BYOK 改造的核心：

- 读取 `PI_PROVIDER`、`PI_MODEL`、`PI_API_KEY`、`PI_BASE_URL`
- 兼容 provider 默认环境变量，例如 `GEMINI_API_KEY`、`OPENAI_API_KEY`
- 在“内置 provider”与“自定义 OpenAI-compatible endpoint”之间做分流
- 最终产出统一的 `runtimeConfig`

### `src/agent/createAgent.ts`

创建 `Agent` 实例，挂载系统提示词、模型和工具。现在它不再直接依赖固定 provider，而是接收 `runtimeConfig`。

### `src/main.ts`

程序入口。负责：

- 调用 `resolveRuntimeConfig()`
- 用运行时配置创建 agent
- 打印 agent 执行事件
- 发送固定用户消息

### `src/tools/getTime.ts`

定义唯一的工具 `get_time`。它返回当前时间，并把结果同时提供给模型和终端日志。

## 这个 demo 对应的 agent 核心闭环

1. `main.ts` 解析运行时配置
2. `createAgent.ts` 根据配置创建 agent
3. `main.ts` 发送用户消息：`现在几点了？`
4. `Agent` 调用模型
5. 模型根据系统提示决定调用 `get_time`
6. `pi-agent-core` 执行工具
7. 工具结果作为 `toolResult` 消息回填给模型
8. 模型基于工具结果生成最终回复
9. `main.ts` 把整个过程打印出来

## 为什么这个版本更适合学习 BYOK

因为它把“agent 能力”和“模型接入”拆开了：

- `tool` 仍然是 tool
- `agent loop` 仍然是 agent loop
- 变化的只是“本次运行到底接哪个模型、用哪个 key”

这其实就是 BYOK 的核心思想：

- agent 框架尽量稳定
- 模型接入做成运行时配置
- 用户自己提供 key，而不是把 key 写死在代码里

## 一句话理解这次改造

以前是：

- 代码里写死 `google + GEMINI_API_KEY`

现在是：

- 代码只负责“解析配置并创建 agent”
- provider / model / key 在运行时决定

如果你下一步想继续学习，我很建议你继续做这两个方向：

1. 把固定 prompt 改成命令行输入，做成真正可交互的 agent
2. 在 `src/config.ts` 里再加一层 provider 白名单和 model 校验，理解“配置层”和“agent 层”的边界
