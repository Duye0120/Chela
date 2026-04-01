# 05 — 内置工具

> 状态：`in-review`
> 依赖：04-tool-system

## 5.1 工具一览

| 工具 | 能力 | 风险等级 | 流式输出 |
|------|------|---------|---------|
| file_read | 读取本地文件内容 | guarded | 否 |
| file_write | 写入/创建本地文件 | guarded | 否 |
| shell_exec | 执行 shell 命令 | guarded | 是（stdout 实时推送） |
| web_fetch | 获取网页内容 | safe | 否 |
| memory_search | 检索长期记忆 | safe | 否 |

## 5.2 file_read

**用途：** 读取本地文件内容，让 agent 能"看到"文件。

**参数：**
```typescript
{
  path: string;              // 文件路径（相对于 workspace 或绝对路径）
  offset?: number;           // 从第几行开始读（默认 1）
  limit?: number;            // 读多少行（默认 200）
  encoding?: string;         // 编码（默认 "utf-8"）
}
```

**返回（给 LLM 的 content）：**
```
文件: ./src/main/index.ts（第 1-200 行，共 450 行）

1  import { app, BrowserWindow } from 'electron'
2  import { registerIpcHandlers } from './ipc'
...
200  }

[文件共 450 行，当前显示第 1-200 行。如需查看更多，请指定 offset 和 limit]
```

**返回（给前端的 details）：**
```typescript
{
  path: string;
  totalLines: number;
  readRange: { from: number; to: number };
  truncated: boolean;
}
```

**为什么限制 200 行？**

200 行约 4000-6000 token，是一个在"信息量足够"和"不撑爆 context"之间的平衡点。如果 LLM 需要看更多内容，它可以再次调用 file_read 并指定 offset。这样 LLM 自己控制要看多少，而不是我们替它决定。

**特殊情况：**
- 二进制文件 → 返回 "这是一个二进制文件（类型：image/png，大小：45KB），无法以文本形式读取"
- 文件不存在 → 返回错误 "文件不存在: ./xxx"
- 路径超出白名单 → 被安全沙箱拦截（不会到达 execute）

## 5.3 file_write

**用途：** 创建或写入文件，让 agent 能"动手"修改项目。

**参数：**
```typescript
{
  path: string;              // 文件路径
  content: string;           // 要写入的内容
  mode?: "overwrite" | "append";  // 覆盖还是追加（默认 overwrite）
}
```

**返回（给 LLM 的 content）：**
```
文件已写入: ./hello.txt（11 字节）
```

或者覆盖时：
```
文件已更新: ./src/config.ts（从 2340 字节 → 2580 字节）
```

**返回（给前端的 details）：**
```typescript
{
  path: string;
  size: number;
  isNew: boolean;            // 是否新创建的文件
  previousContent?: string;  // 如果是覆盖，保存旧内容用于 diff 展示
  newContent: string;
}
```

**前端利用 details 展示 diff：**
- 新文件 → 直接展示内容预览
- 覆盖 → 展示 before/after diff（previousContent vs newContent）

**安全机制：**
- 路径白名单检查（安全沙箱）
- 覆盖已有文件时 → 通过 Adapter 请求用户确认
- 新建文件 → 直接执行，不需确认

## 5.4 shell_exec

**用途：** 执行 shell 命令，让 agent 能真正"做事"——安装依赖、跑测试、查进程等。

这是能力最强但也最危险的工具。

**参数：**
```typescript
{
  command: string;           // 要执行的命令
  cwd?: string;              // 工作目录（默认 workspace 根目录）
  timeout?: number;          // 超时秒数（默认 30，上限 300）
}
```

**返回（给 LLM 的 content）：**
```
命令: git status
退出码: 0
stdout:
  On branch main
  Your branch is up to date with 'origin/main'.
  nothing to commit, working tree clean
```

如果 stdout 太长（超过 200 行）：
```
命令: npm install
退出码: 0
stdout（最后 50 行，共 320 行）:
  added 150 packages in 12s
  ...

[输出共 320 行，已截断。完整输出可在终端面板查看]
```

**返回（给前端的 details）：**
```typescript
{
  command: string;
  cwd: string;
  exitCode: number;
  stdout: string;            // 完整输出（不截断，前端终端展示用）
  stderr: string;
  durationMs: number;
}
```

**流式输出：**

shell_exec 是唯一使用 `onUpdate` 的内置工具：

```typescript
async execute(toolCallId, params, signal, onUpdate) {
  const process = spawn(params.command, { ... });

  process.stdout.on('data', (chunk) => {
    // 实时推送给前端，用户在终端面板看到实时输出
    onUpdate?.({ type: 'stdout', data: chunk.toString() });
  });

  process.stderr.on('data', (chunk) => {
    onUpdate?.({ type: 'stderr', data: chunk.toString() });
  });

  // 等待进程结束，返回最终结果
  const result = await waitForProcess(process, signal, params.timeout);
  return { content: [...], details: { ... } };
}
```

前端收到 `tool_execution_update` 事件后，把数据喂给 xterm.js 渲染。

**安全机制：**
1. 危险命令黑名单 → 直接拒绝
2. auto-approve 白名单 → 直接执行
3. 其他命令 → 用户确认

## 5.5 web_fetch

**用途：** 获取网页内容，让 agent 能查资料、读文档。

**参数：**
```typescript
{
  url: string;               // 网页 URL（必须是 http/https）
  prompt?: string;           // 可选：让 LLM 从网页中提取特定信息
  maxLength?: number;        // 返回内容最大字符数（默认 10000）
}
```

**执行流程：**
```
1. fetch(url) → 获取 HTML
2. HTML → Markdown 转换（去掉 script/style/nav 等噪音）
3. 如果有 prompt → 用一次轻量 LLM 调用提取关键信息
   如果没有 prompt → 直接截断到 maxLength 返回
```

**返回（给 LLM 的 content）：**
```
网页: https://docs.example.com/getting-started
标题: Getting Started Guide

# Getting Started
To install the package, run:
  npm install example-lib
...

[内容已截断至 10000 字符]
```

**返回（给前端的 details）：**
```typescript
{
  url: string;
  title: string;
  contentLength: number;
  truncated: boolean;
}
```

**为什么要做 HTML → Markdown 转换？**

原始 HTML 充满了标签、样式、脚本，大量是噪音。转成 Markdown 后，同样的信息量 token 数可能只有 1/5。省 token = 省钱 + 留更多空间给有用信息。

**为什么有 prompt 参数？**

有时用户说"帮我查一下 React 19 的新特性"，agent 用 web_fetch 拉了一个页面回来，但页面很长，大部分内容不相关。prompt 参数让工具内部先做一次提取，只返回相关部分。这是工具级的上下文控制——在信息进入 agent context 之前就过滤掉噪音。

## 5.6 memory_search

**用途：** 检索长期记忆，让 agent 能"回忆"之前的对话和用户偏好。

这个工具是记忆系统（07-09 spec）的前端接口。

**参数：**
```typescript
{
  query: string;             // 检索关键词或自然语言查询
  limit?: number;            // 返回条数（默认 5，上限 20）
}
```

**执行流程：**
```
1. query → embedding 模型 → 向量
2. 向量 → 在本地向量索引中检索
3. 返回 top-K 条最相关的记忆
```

**返回（给 LLM 的 content）：**
```
检索到 3 条相关记忆：

[1] (相关度: 0.92, 2026-03-30)
用户偏好使用 pnpm 作为包管理器，项目结构是 Electron + React

[2] (相关度: 0.85, 2026-03-29)
用户是全栈工程师，主要方向是 AI/Agent，正在准备求职

[3] (相关度: 0.78, 2026-03-28)
项目使用 pi-agent-core 作为 agent 引擎，已确认不自己实现 agent loop
```

**返回（给前端的 details）：**
```typescript
{
  query: string;
  results: Array<{
    id: string;
    content: string;
    score: number;
    createdAt: string;
    tags: string[];
  }>;
}
```

**什么时候 agent 会调用这个工具？**

两种场景：
1. **主动检索** — agent 在 system prompt 里被告知"如果需要回忆之前的信息，使用 memory_search 工具"，当它觉得需要时会自己调用
2. **自动注入** — 在 transformContext 里我们也会做一次自动检索（见 03-agent-core 3.5），但那是基于最新用户消息的隐式检索。memory_search 工具让 agent 能主动用不同的 query 检索，更灵活

## 5.7 工具之间的协作模式

LLM 可以在一次回复中调用多个工具（并行），也可以跨多轮串联调用。常见的协作模式：

**模式 1：读取 → 修改**
```
用户: "帮我把 config.ts 里的端口从 3000 改成 8080"

Turn 1: LLM → file_read({ path: "config.ts" })
Turn 2: LLM 看到文件内容 → file_write({ path: "config.ts", content: 修改后的内容 })
Turn 3: LLM → "已经把端口从 3000 改成了 8080"
```

**模式 2：命令 → 分析**
```
用户: "项目能跑起来吗"

Turn 1: LLM → shell_exec({ command: "pnpm dev" })
Turn 2: LLM 看到输出有报错 → file_read({ path: 报错指向的文件 })
Turn 3: LLM 分析问题 → "项目启动失败，因为 xxx 文件里有语法错误，在第 42 行..."
```

**模式 3：查资料 → 应用**
```
用户: "帮我加一个 debounce 函数"

Turn 1: LLM → web_fetch({ url: "lodash debounce 文档" })
Turn 2: LLM 看到文档 → file_write({ path: "src/utils/debounce.ts", content: 实现代码 })
Turn 3: LLM → "已创建 debounce 工具函数"
```

**模式 4：记忆 → 个性化**
```
用户: "帮我初始化一个新项目"

Turn 1: LLM → memory_search({ query: "用户偏好 项目配置" })
Turn 2: LLM 看到记忆"用户偏好 pnpm + TypeScript" → shell_exec({ command: "pnpm init" })
Turn 3: LLM → file_write 创建 tsconfig.json（按用户偏好配置）
Turn 4: LLM → "已用 pnpm + TypeScript 初始化项目（按你之前的偏好配置的）"
```
