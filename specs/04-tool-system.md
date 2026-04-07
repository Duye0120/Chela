# 04 — 工具系统

> 状态：`in-review`
> 依赖：03-agent-core

## 4.1 职责

工具系统负责：

1. **定义工具接口** — 每个工具长什么样、怎么注册
2. **工具发现与注册** — 启动时收集所有可用工具（内置 + MCP），打包给 Agent
3. **安全沙箱** — 在工具执行前拦截危险操作
4. **执行与反馈** — 运行工具、返回结果、处理错误
5. **提供 Harness 能力端口** — 让模型请求能力，而不是直接拥有能力

## 4.2 工具接口

所有工具统一实现 pi-agent-core 的 `AgentTool` 接口：

```typescript
interface AgentTool<TParameters extends TSchema, TDetails = any> {
  name: string;           // 工具唯一标识，LLM 用这个名字调用
  label: string;          // 前端展示用的人类可读名称
  description: string;    // 告诉 LLM 这个工具能干什么（很重要，写得好 LLM 才会正确使用）
  parameters: TParameters; // 参数 schema（TypeBox 格式），LLM 按这个格式传参
  execute: (
    toolCallId: string,    // 本次调用的唯一 ID
    params: Static<TParameters>,  // 校验后的参数
    signal?: AbortSignal,         // 用户取消时中断执行
    onUpdate?: (update: any) => void  // 流式中间输出（如 shell 的 stdout）
  ) => Promise<AgentToolResult>;
}
```

### 为什么用 TypeBox 定义参数？

LLM 调用工具时传的参数是 JSON。但 LLM 可能传错——比如类型不对、漏了必填字段。TypeBox 是一个 JSON Schema 库，pi-agent-core 会自动用它校验参数：

```typescript
// 定义参数 schema
const parameters = Type.Object({
  path: Type.String({ description: "文件路径" }),
  encoding: Type.Optional(Type.String({ default: "utf-8" })),
});

// LLM 传了 { path: 123 } → 校验失败（path 应该是 string）
// → pi-agent-core 自动把错误信息返回给 LLM，让它修正
// → LLM 重试 { path: "./package.json" } → 校验通过 → 执行
```

这个自动校验 + 重试完全由 pi-agent-core 处理，我们不需要在工具内部做参数检查。

### 工具返回值

```typescript
interface AgentToolResult {
  content: ToolContent[];   // 返回给 LLM 的内容（文本/图片）
  details?: TDetails;       // 返回给前端的结构化数据（不发给 LLM，用于 UI 展示）
}

// content 示例
{ content: [{ type: "text", text: "文件内容：..." }] }

// details 示例（前端用来展示 diff、终端输出等）
{ details: { exitCode: 0, stdout: "...", stderr: "" } }
```

**content vs details 的区别很重要：**
- `content` → 喂给 LLM 的，影响 agent 的下一步决策，要控制大小
- `details` → 给前端展示用的，可以包含完整数据（比如终端完整输出），不占 LLM context

## 4.3 工具注册流程

Agent 启动时：

```
1. 收集内置工具
   ├─ file_read
   ├─ file_write
   ├─ shell_exec
   ├─ web_fetch
   └─ memory_search

2. 连接 MCP Server，收集 MCP 工具
   ├─ 读取 workspace/mcp.json
   ├─ 启动配置的 MCP Server 进程
   ├─ 获取每个 Server 的工具列表
   └─ 包装成 AgentTool 格式（MCP 工具 → AgentTool 适配器）

3. 合并工具列表
   allTools = [...builtinTools, ...mcpTools]

4. 注入 Agent
   new Agent({ initialState: { tools: allTools, ... } })
```

### MCP 工具适配器

MCP 工具和 AgentTool 接口不完全一样，需要一个适配器：

```
MCP Server 声明的工具:
  { name: "query-docs", inputSchema: { type: "object", ... } }

适配成 AgentTool:
  {
    name: "mcp_context7_query-docs",      // 加前缀避免命名冲突
    label: "Context7: Query Docs",
    description: "...",
    parameters: 从 JSON Schema 转换成 TypeBox,
    execute: (id, params) => 调用 MCP Server 的 call_tool
  }
```

## 4.4 Harness 执行管线与安全沙箱

### 为什么需要

LLM 不是 100% 可靠的。它可能：
- 误解用户意图，执行了不该执行的操作
- 遭遇 prompt injection（用户输入中嵌入恶意指令）
- 单纯"抽风"，生成不合理的工具调用

我们的 agent 能读写文件、执行 shell 命令——如果不加防护，后果可能很严重。

更关键的是：**安全不是工具自己的补丁，而是 Harness 的默认执行管线。**

### Harness 执行管线

在 Harness 模式下，所有工具调用都经过同一条管线：

```
tool_call proposal
  → 规范化请求（runId / toolCallId / args）
  → 风险分级
  → policy evaluate（allow / confirm / deny）
  → confirm 时挂起 run
  → allow 后执行工具
  → 记录结构化结果与事件
  → 返回给 LLM
```

可以抽象成：

```typescript
interface ToolExecutionRequest {
  runId: string;
  toolCallId: string;
  toolName: string;
  args: unknown;
  riskLevel: "safe" | "guarded" | "dangerous";
}

type ToolPolicyDecision =
  | { type: "allow" }
  | { type: "confirm"; reason: string }
  | { type: "deny"; reason: string };
```

注意：MCP 工具也不例外。凡是副作用能力，一律先过 Harness。

### 三层防护

```
LLM 发出 tool_call proposal
        │
        ▼
┌─ 第一层：工具级权限 ─────────────────────┐
│                                          │
│  每个工具有一个风险等级：                   │
│  - safe：直接执行（如 web_fetch、memory）  │
│  - guarded：需要安全检查（如 file、shell） │
│                                          │
│  safe 工具 → 仍然经过 Harness 记账后执行   │
│  guarded 工具 → 进入第二层                │
└──────────────────────────────────────────┘
        │
        ▼
┌─ 第二层：规则拦截 ───────────────────────┐
│                                          │
│  对 guarded 工具的参数进行规则检查：        │
│                                          │
│  shell_exec:                             │
│  - 危险命令黑名单（正则匹配）              │
│    rm -rf /、format、mkfs、dd、           │
│    > /dev/sda、chmod 777 /               │
│  - 匹配到 → 直接拒绝，不问用户            │
│                                          │
│  file_read / file_write:                 │
│  - 路径必须在工作目录白名单内              │
│  - 访问白名单外路径 → 直接拒绝             │
│                                          │
│  通过规则检查 → 进入第三层                 │
└──────────────────────────────────────────┘
        │
        ▼
┌─ 第三层：用户确认 ───────────────────────┐
│                                          │
│  通过 Adapter 层弹出确认：                 │
│  - Electron → dialog 弹窗                │
│  - Telegram → 发确认消息等用户回复         │
│                                          │
│  需要确认的操作：                          │
│  - shell_exec：所有命令（除非用户配置了    │
│    auto-approve 白名单）                  │
│  - file_write：覆盖已有文件时             │
│                                          │
│  用户确认 → 恢复 run 并执行               │
│  用户拒绝 → 返回"用户拒绝执行"给 LLM      │
└──────────────────────────────────────────┘
```

### 工作目录白名单

用户在 workspace 配置中指定 agent 可以操作的目录：

```json
// workspace 配置
{
  "sandbox": {
    "allowedPaths": [
      "/Users/me/projects/my-app",
      "/tmp/agent-workspace"
    ]
  }
}
```

file_read/file_write 的路径会被 resolve 成绝对路径后，检查是否在白名单内。路径穿越（如 `../../etc/passwd`）会被拒绝。

### Auto-approve 白名单

每次 shell 命令都弹确认很烦。用户可以配置安全命令白名单：

```json
{
  "sandbox": {
    "autoApproveCommands": [
      "ls", "cat", "head", "tail", "pwd", "echo",
      "git status", "git log", "git diff",
      "node --version", "pnpm --version"
    ]
  }
}
```

白名单内的命令直接执行，不弹确认。白名单外的命令走第三层用户确认。

### 拒绝后的处理

当操作被拒绝（规则拦截或用户拒绝）时，不是直接报错，而是把拒绝原因作为 Harness 结果返回给 LLM：

```
tool_result: "操作被拒绝：shell 命令 'rm -rf /' 被安全策略拦截。请使用更安全的方式完成任务。"
```

LLM 看到这个结果后会自己调整策略——比如改用更安全的命令，或者告诉用户它无法执行这个操作。

## 4.5 工具执行超时

所有工具都有超时控制：

| 工具 | 默认超时 | 说明 |
|------|---------|------|
| file_read | 5s | 文件太大或路径不存在时快速失败 |
| file_write | 5s | 磁盘满或权限不足时快速失败 |
| shell_exec | 30s | 用户可在参数中自定义，上限 300s |
| web_fetch | 15s | 网络超时 |
| memory_search | 5s | 向量检索 |

超时后返回错误信息给 LLM，由 LLM 决定是否重试。

## 4.6 工具目录结构

```
src/
  tools/
    index.ts              # 导出所有内置工具
    types.ts              # 工具相关的共享类型
    sandbox.ts            # 安全沙箱：权限检查、规则拦截、用户确认
    file-read.ts          # file_read 工具实现
    file-write.ts         # file_write 工具实现
    shell-exec.ts         # shell_exec 工具实现
    web-fetch.ts          # web_fetch 工具实现
    memory-search.ts      # memory_search 工具实现
  mcp/
    client.ts             # MCP Client：连接 Server、获取工具、调用工具
    adapter.ts            # MCP 工具 → AgentTool 适配器
```
