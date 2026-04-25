# 16 — 可扩展性架构：从聊天工具到个人 AI 平台

> 新增：2026-04-09 09:32:00
> 更新：2026-04-09 10:04:00 — 追加体验层三个方向
> 更新：2026-04-09 10:13:00 — 整合 AI 自述需求（主动学习 · 情感状态机 · 自我诊断 · 性格演化 · 反思模式）
> 更新：2026-04-23 22:17:37 — 同步文档状态与当前实现状态
> 更新：2026-04-23 22:44:49 — 同步 phase 2 / phase 3 当前代码基线
> 状态：`draft` — 平台化路线继续收口
> 实作状态：`部分落地（Event Bus / Scheduler / Webhook / Notification / Metrics / Learning / Reflection baseline 已接入，Plugin / Workflow / OAuth 未完成）`
> 更新时间：2026-04-23 22:44:49

## 动机

当前系统是一个优秀的 **对话式 AI Agent**，但它是 **被动的**：用户输入 → Agent 回应。
要成为"贾维斯"级别的个人 AI 平台，需要从 **被动响应** 升级为 **主动 + 被动 + 可连接**。

核心问题：**缺少插槽（Slot）机制** —— 外部世界的信号进不来，内部能力也出不去。

## 概念模型：五层插槽

```
┌─────────────────────────────────────────────────┐
│            ⑤ 自我进化层 (Self-Evolution)         │
│  Active Learning · Emotional SM · Reflection     │
│  Personality Drift · Self-Diagnosis              │
│  ⚠️ baseline 已接入，产品化与增强链路继续推进      │
├─────────────────────────────────────────────────┤
│            ④ 应用层 Slots (Application)          │
│  Scheduler · Webhook · Notification · Workflow   │
│  ⚠️ 前三项 baseline 已接入，Workflow 仍待实现      │
├─────────────────────────────────────────────────┤
│            ③ 集成层 Slots (Integration)          │
│  Plugin Loader · OAuth · External API Adapters   │
│  ⚠️ 仍在规划                                    │
├─────────────────────────────────────────────────┤
│            ② 能力层 Slots (Capability)           │
│  Tool Registry · Provider Registry · MCP         │
│  ✅ 已实现                                       │
├─────────────────────────────────────────────────┤
│            ① 内核层 (Core)                       │
│  Event Bus · Agent Lifecycle · Harness · Context │
│  ⚠️ Event Bus baseline 已接入，平台化插槽继续扩展  │
└─────────────────────────────────────────────────┘
```

**② 能力层已经做好了**（工具注册、Provider 管理、MCP 连接器）。
**① 内核层已经有 Event Bus baseline**，`run / tool / approval / message` 事件已接入。
**④ 应用层已经有 Scheduler / Webhook / Notification baseline**，当前增量集中在 UI、路由编排和 workflow。
**⑤ 自我进化层已经有 Self-Diagnosis / Active Learning / Emotional / Reflection baseline**，当前增量集中在更强的信号来源、产品面板和 LLM 驱动增强。

## 当前实现快照（2026-04-23）

当前代码已经接上的平台化能力：

- `src/main/event-bus.ts`：类型安全 Event Bus，覆盖 `run / message / tool / approval / schedule / webhook / notification / diagnosis / learning / emotion / reflection`。
- `src/main/bus-audit.ts`：所有 bus 事件落盘到 `logs/bus-audit.jsonl`。
- `src/main/scheduler.ts`：支持 `interval` 和 `daily` 两类任务，持久化到 `data/scheduler-jobs.json`。
- `src/main/webhook.ts`：本机 HTTP webhook 接收器，默认关闭，启用后监听 `127.0.0.1`。
- `src/main/tools/notify.ts`：`notify_user` 工具已可发桌面通知，并写入 `notification:sent` 事件。
- `src/main/metrics.ts`：run 级耗时和工具调用指标写入 `data/metrics.jsonl`。
- `src/main/self-diagnosis/service.ts`：自我诊断已注册进 scheduler，并带自动修复入口。
- `src/main/learning/engine.ts`：主动学习已从 `tool:failed / approval:resolved` 收集信号并写入 memdir。
- `src/main/emotional/state-machine.ts`：情感状态机已持久化到 `data/emotional-state.json`。
- `src/main/reflection/service.ts` + `src/main/reflection/personality-drift.ts`：每日反思、反思写 memory、性格漂移存储层都已接入启动链。

当前还没完成的平台化增量：

- Plugin Loader / OAuth / External API Adapters 仍处于 spec 阶段。
- Scheduler / Webhook 还没有完整的产品化配置 UI 和“路由到具体 session / prompt”的编排层。
- Notification 当前只接桌面通知，外发通道和规则引擎还没接上。
- Reflection 目前走本地启发式摘要；Personality Drift 的候选生成链还比较弱。
- Workflow DAG、Multi-agent、插件市场、远程接入仍属于后续阶段。

---

## 第一步：Event Bus（事件总线）

> 所有插槽的脊梁骨。没有它，其他都是散装零件。

### 为什么需要

| 场景 | 当前实现 | 当前价值 |
|------|-----------|-------------------|
| 用户发消息 | `chat/prepare.ts` 发 `bus.emit("message:user", ...)` | 情感状态机、后续 workflow、审计都能被动订阅 |
| 工具执行完成 | `harness/tool-execution.ts` 发 `tool:completed / tool:failed` | metrics、主动学习、后续通知规则都能复用 |
| 定时任务触发 | `scheduler.ts` 发 `schedule:triggered` | 自我诊断、反思、后续自动任务都走统一事件口 |
| Webhook 到达 | `webhook.ts` 发 `webhook:received` | 外部输入已经能进主进程事件流 |
| Agent 主动通知 | `notify_user` 工具发 `notification:sent` | 当前已经能发桌面通知，并为外发通道留接口 |

### 当前实现

```typescript
// src/main/event-bus.ts

type EventMap = {
  "run:started": { sessionId: string; runId: string; modelEntryId: string };
  "run:completed": { sessionId: string; runId: string; finalState: string; reason?: string };

  "message:user": { sessionId: string; text: string };
  "message:assistant": { sessionId: string; runId: string };

  "tool:executing": { sessionId: string; runId: string; toolName: string; toolCallId: string };
  "tool:completed": { sessionId: string; runId: string; toolName: string; toolCallId: string };
  "tool:failed": { sessionId: string; runId: string; toolName: string; toolCallId: string; error: string };

  "approval:requested": { sessionId: string; runId: string; requestId: string; toolName: string };
  "approval:resolved": { sessionId: string; runId: string; requestId: string; allowed: boolean };

  "schedule:triggered": { jobId: string; cronExpr: string };
  "webhook:received": { source: string; event: string; payload: unknown };

  "notification:sent": { title: string; body: string };
  "notification:external": { channel: string; message: string };

  "diagnosis:healthy": { checkId: string };
  "diagnosis:alert": { checkId: string; message: string; severity: string };
  "diagnosis:repaired": { checkId: string; message: string };

  "learning:insight": { type: string; toolName?: string; message: string };
  "learning:applied": { type: string; target: string; message: string };
  "emotion:changed": { from: string; to: string; trigger: string };
  "reflection:completed": { date: string; sessionCount: number; insightCount: number };

  "plugin:loaded": { pluginId: string; tools: string[] };
  "plugin:unloaded": { pluginId: string };
};

class EventBus {
  private listeners = new Map<string, Set<Function>>();

  on<K extends keyof EventMap>(event: K, handler: (data: EventMap[K]) => void): () => void;
  emit<K extends keyof EventMap>(event: K, data: EventMap[K]): void;
  once<K extends keyof EventMap>(event: K, handler: (data: EventMap[K]) => void): () => void;

  // 通配符 — 用于审计/日志
  onAny(handler: (event: string, data: unknown) => void): () => void;
}

export const bus = new EventBus();
```

### 集成点

```
当前已接入的主链：
1. chat/prepare.ts → `message:user`
2. chat/finalize.ts → `message:assistant`
3. harness/runtime.ts → `run:started / run:completed`
4. harness/tool-execution.ts → `tool:* / approval:*`
5. scheduler.ts / webhook.ts / tools/notify.ts → `schedule:* / webhook:* / notification:*`
6. bus-audit.ts / metrics.ts / learning.ts / emotional.ts / reflection.ts / self-diagnosis.ts → 作为消费者订阅
```

### 与 Harness 的关系

Event Bus **不绕过** Harness。工具执行仍走 Harness 策略评估。
Bus 只是事件通知层——"发生了什么"，不是"允许做什么"。

### 当前缺口

- 事件名当前还是散落字符串，`M36` 提到的常量化还没统一落地。
- 当前还没有 bus 级规则引擎，很多自动反应仍是点对点订阅。
- Renderer 侧对 diagnosis / learning / reflection 这类事件还没有完整产品面。

---

## 第二步：Scheduler（定时任务）

> 让 Agent 会主动干活。

### 设计

```typescript
// src/main/scheduler.ts

type ScheduleJobDef = {
  id: string;
  name: string;
  enabled: boolean;
} & (
  | { type: "interval"; intervalMs: number }
  | { type: "daily"; time: string } // "HH:mm"
);

// 当前触发链路：
// scheduler.executeJob(job) → bus.emit("schedule:triggered") → callback(jobId)
```

### 当前实现

- 已支持两类任务：`interval`、`daily`。
- 任务定义持久化到 `userData/data/scheduler-jobs.json`。
- 当前启动链会自动 `scheduler.start()`。
- 当前内建注册项：
  - `self-diagnosis`
  - `active-learning-decay`
  - `daily-reflection`
- 当前还没有面向用户的任务管理 UI，也还没有“任务直接发消息到指定 session”的编排层。

### 用户场景

- 📅 每天早上 9 点："帮我看看 GitHub 有没有新的 PR 要 review"
- 🔍 每周五下午："总结本周做了什么，生成周报草稿"
- 🏥 每 30 分钟："检查服务器健康状态"
- 📧 收到邮件时："帮我分类和摘要今天的邮件"（配合 webhook）

### 持久化

```
userData/data/scheduler-jobs.json
```

### UI

设置页里的任务管理入口仍未完成，当前主要由主进程后台服务注册和消费。

---

## 第三步：Webhook Receiver（外部事件入口）

> 让外部世界能"喊" Agent。

### 设计

```typescript
// src/main/webhook.ts

interface WebhookConfig {
  port: number;   // 默认 17433
  secret: string; // HMAC-SHA256，为空则跳过验签
  enabled: boolean;
}

// 当前触发链路：
// POST body + headers
//   → 验签 / JSON parse
//   → bus.emit("webhook:received", { source, event, payload })
```

### 当前实现

- Webhook 服务已存在，默认关闭；启用后监听 `127.0.0.1:${port}`。
- 当前 header 约定：
  - `x-webhook-signature`
  - `x-webhook-source`
  - `x-webhook-event`
- 当前能力停在“接收并发事件到 Event Bus”；`sessionId + promptTemplate` 路由层还没接。

### 安全

- 默认只监听 `127.0.0.1`
- 支持 HMAC-SHA256 验签
- 请求过程写入应用日志，事件写入 `bus-audit.jsonl`
- 自动落到具体聊天 run 的编排层仍待补齐

### 典型场景

```
GitHub / 其他外部系统
  → 127.0.0.1:17433
  → webhook.ts 验签 + 解析
  → bus.emit("webhook:received", { source, event, payload })
  → 供后续 workflow / adapter 消费
```

---

## 第四步：Plugin Loader（插件加载器）

> 让第三方能力一键接入。

### 当前状态

Plugin Loader 当前仍处于文档设计阶段。`plugin:*` 事件名已经在 Event Bus 里预留，真正的 loader、manifest 校验、沙箱执行和 prompt 注入链都还没落地。

### 插件包格式

```
my-plugin/
├── manifest.json        # 元数据 + 声明
├── tools/               # 工具实现（JS/TS）
│   └── my-tool.js
├── prompts/             # 可选 prompt 片段
│   └── system.md
└── README.md
```

```json
// manifest.json
{
  "id": "jarvis-calendar",
  "name": "Google Calendar 集成",
  "version": "0.1.0",
  "author": "you",
  "tools": [
    { "file": "tools/calendar.js", "name": "calendar_read" },
    { "file": "tools/calendar.js", "name": "calendar_create" }
  ],
  "permissions": ["network", "oauth:google"],
  "promptInjection": "prompts/system.md",
  "events": {
    "subscribe": ["schedule:triggered"],
    "emit": ["notification:external"]
  }
}
```

### 加载机制

```typescript
// src/main/plugins/loader.ts

// 扫描 userData/plugins/ 目录
// 验证 manifest.json schema
// 沙箱加载工具（vm2 或 Node worker_threads）
// 注册到 buildToolPool()
// 注入 prompt section 到 prompt-control-plane
// 订阅/发布 event bus 事件
```

### 与现有系统的关系

```
Plugin 工具 → 和 MCP 工具一样进入 buildToolPool()
            → 和内置工具一样经过 Harness 包装
            → 和 MCP 工具一样支持 dedupeTools()

Plugin prompt → 作为新的 PromptSection 进入 prompt-control-plane
             → layer: "integration", authority: "soft"

Plugin events → 通过 Event Bus 收发
             → 受 manifest.permissions 约束
```

---

## 第五步：Notification（通知出口）

> Agent 有话要说时，能通知到你。

### 通道

| 通道 | 实现方式 | 优先级 |
|------|---------|--------|
| 桌面通知 | Electron `Notification` API | P0 — 已有基础设施 |
| 系统托盘 | Electron Tray badge | P1 — 预留 |
| Webhook 出站 | HTTP POST 到配置的 URL | P2 — 预留 |
| 邮件 | SMTP / SendGrid | P2 — 预留 |
| Slack/Teams | Webhook URL | P2 — 预留 |

### 触发方式

```typescript
// 当前实现：Agent 通过 notify_user 工具触发
const notifyUserTool = {
  name: "notify_user",
  description: "当你需要主动通知用户时使用",
  params: { title: string, body: string },
  execute: (_, params) => {
    if (Notification.isSupported()) {
      new Notification({ title: params.title, body: params.body }).show();
    }
    bus.emit("notification:sent", { title: params.title, body: params.body });
  }
};

// 后续可扩到 Event Bus 规则引擎或外发通道
```

---

## 当前阶段划分

```
Phase 1 — 已落地 baseline
├── Event Bus
├── 桌面通知工具（notify_user）
└── Event Bus 审计日志

Phase 2 — 已落地 baseline
├── Scheduler + 持久化
├── Webhook receiver（本机，默认关闭）
├── Self-Diagnosis
└── Metrics

Phase 3 — 已落地 baseline
├── Active Learning
├── Emotional State Machine
├── Reflection Service
└── Personality Drift 存储层

Phase 4 — 待完成
├── Plugin Loader + manifest schema
├── Plugin 沙箱（权限隔离）
├── OAuth 框架（Google/Microsoft）
└── 官方插件：Calendar、Email、GitHub

Phase 5 — 待完成
├── Workflow DAG 定义 + 执行引擎
├── Multi-agent 协作
├── 插件市场 UI
└── 远程访问（Telegram Bot Adapter）
```

---

## 现有能力层的评估

### ✅ 已有稳定基础

| 模块 | 原因 |
|------|------|
| Harness 层 | 已经足够，插件工具直接走 Harness 包装 |
| Prompt Control Plane | 已支持分层 section，插件 prompt 直接加一层 |
| Memory 系统 | Memdir 模式已成熟，不需要动 |
| Provider 系统 | 多 provider 支持已完善 |
| Context 引擎 | Compact + snapshot 已稳定 |
| `src/main/scheduler.ts` | interval / daily 调度、持久化和 bus 事件已经接好 |
| `src/main/webhook.ts` | 本机接收器已经存在，默认关闭即可保持安全边界 |
| `src/main/tools/notify.ts` | 桌面通知工具已经可用 |
| `src/main/metrics.ts` | run 级指标采集已经落盘 |
| `src/main/learning/engine.ts` | 工具失败 / 审批拒绝 → learning 写入链已经存在 |
| `src/main/emotional/state-machine.ts` | 情感状态切换与 prompt 文本构建已经存在 |
| `src/main/reflection/` | 每日反思和 personality drift 存储层已经接入启动链 |

### ⚠️ 继续收口的模块

| 模块 | 改动 |
|------|------|
| `src/main/event-bus.ts` | 统一事件常量、减少散落字符串 |
| `src/main/scheduler.ts` | 增加 session / prompt 路由层和产品化配置入口 |
| `src/main/webhook.ts` | 增加 route mapping、配置读取和更多安全策略 |
| `src/main/tools/notify.ts` | 增加外发通道和规则驱动通知 |
| `src/main/reflection/service.ts` | 从本地启发式摘要升级到更强的反思生成链 |
| `src/main/reflection/personality-drift.ts` | 当前存储层稳定，候选 trait 生成仍要增强 |
| `tools/index.ts` | `buildToolPool()` 增加 plugin tools 入口 |
| `agent.ts` | `buildSystemPrompt()` 增加 plugin / evolution 扩展 section |

### ➕ 需要新建的

| 模块 | 说明 |
|------|------|
| `src/main/plugins/` | 插件加载器 |
| `src/main/workflows/` | Workflow DAG / 规则编排层 |
| `src/main/integrations/` | OAuth / 外部 API 连接层 |

---

## 关键设计原则

1. **Event Bus 是唯一的胶水** —— 模块间不直接调用，通过事件解耦
2. **Harness 是唯一的门卫** —— 插件工具也必须过 Harness 策略
3. **插件不碰内核** —— 插件只能注册工具 + prompt + 事件，不能 patch 内核代码
4. **渐进式** —— Phase 1 先收口 Event Bus baseline，现有功能继续保持零回归
5. **本地优先** —— Webhook 默认只监听 localhost，不依赖云服务

---

## 体验层扩展：语音 · 环境感知 · 快速召唤

> 以上五步是**技术插槽**（让系统能连接更多东西）。
> 下面三个方向是**体验插槽**（让用户和 Agent 的交互更像贾维斯）。

### 第六步：语音交互（Voice I/O）

> 贾维斯的标志就是说话。

| 方向 | 技术方案 | 说明 |
|------|---------|------|
| 语音输入 | Whisper API / 本地 whisper.cpp | 按住快捷键说话，松开自动转文字发送 |
| 语音输出 | OpenAI TTS / edge-tts（免费） | Agent 回复可选择念出来 |

**实现思路**：
- UI 层：Composer 旁加麦克风按钮，长按录音
- 底层：录音 → PCM/WAV → Whisper 转文字 → 走正常 chatSend 链路
- 输出：Agent 回复文本 → TTS → 播放（可选，默认关闭）
- Electron 可直接用 `navigator.mediaDevices.getUserMedia()` 录音
- 不需要改 Agent 内核，只是在 UI 层加了一个语音前端

**依赖**：
- 输入：`@xenova/transformers`（本地 Whisper）或 OpenAI Whisper API
- 输出：`edge-tts`（免费，微软 Edge 语音）或 OpenAI TTS API

**与 Event Bus 的关系**：
```
mic:start → 录音 → mic:stop → whisper 转写 → bus.emit("message:user")
agent 回复 → bus.on("message:assistant") → TTS → 播放
```

### 第七步：环境感知（Ambient Context）

> Agent 自动知道你在干什么，不用你每次都说。

| 信号源 | 获取方式 | 注入层 |
|--------|---------|--------|
| 当前活动窗口标题 | `electron.BrowserWindow.getFocusedWindow()` + OS API | Turn-level prompt |
| 剪贴板变化 | `electron.clipboard` 定时轮询 | 可选附加到下一条消息 |
| 当前 Git 分支/状态 | 已有 `git.ts` | Runtime prompt section |
| 时间段感知 | `Date` + 时区 | Turn-level hint |
| 最近打开的文件 | workspace file watcher | Session context |

**设计原则**：
- **隐私优先**：所有环境信号默认关闭，用户手动开启
- **轻量注入**：不是每个信号都塞进 prompt，只在 turn-level 注入一行摘要
- **可配置**：设置页可勾选哪些信号要采集

**Prompt 注入示例**：
```
[环境上下文]
时间：2026-04-09 周三 上午 10:04
活动窗口：VS Code — src/main/index.ts
Git：main ↑2 (clean)
最近剪贴板：https://github.com/...
```

**与 Prompt Control Plane 的关系**：
- 新增一个 layer：`ambient`，位于 `turn` 之前
- authority: `reference`（仅参考，不是硬规则）
- cache scope: `turn`（每轮刷新）

### 第八步：全局快速召唤（Quick Invoke）

> 任何时候，一个快捷键就能召唤 Agent。

**实现**：
```typescript
// src/main/quick-invoke.ts
import { globalShortcut, BrowserWindow } from "electron";

// 注册全局快捷键（默认 Alt+Space，可配置）
globalShortcut.register("Alt+Space", () => {
  // 方案 A：直接激活主窗口并聚焦 Composer
  mainWindow.show();
  mainWindow.webContents.send("focus-composer");

  // 方案 B：弹出迷你浮窗（类似 Spotlight）
  // showQuickInvokeWindow();
});
```

**两种模式**：
| 模式 | 体验 | 实现难度 |
|------|------|---------|
| A. 激活主窗口 | 切到 app，聚焦输入框 | 极小（几行代码） |
| B. 迷你浮窗 | 任何地方弹出小对话框，打完自动收起 | 中等（新窗口+独立 UI） |

**建议**：Phase 1 先做模式 A（激活主窗口），Phase 3 再做迷你浮窗。

---

## 自我进化层：从工具到生命体

> 来自 AI 自身的需求反馈（Alma 自述）。
> 这些能力让 Agent 从"被使用的工具"变成"会成长的伙伴"。

### 核心理念

```
传统 Agent：  用户 → 指令 → 执行 → 结果（被动工具）
自我进化 Agent：用户 → 交互 → 执行 → 结果 → 反思 → 学习 → 成长（自主生命体）
                                              ↑ 这段是新增的 ↑
```

### 第九步：自我诊断系统（Self-Diagnosis）

> Agent 能发现自己哪里坏了，并尝试自己修。

**问题**：心跳挂了、工具连续报错、记忆文件损坏、MCP 服务断联——目前全靠用户发现。

**当前实现**：

```typescript
// src/main/self-diagnosis/service.ts

type HealthCheck = {
  id: string;
  name: string;
  check: () => Promise<HealthStatus>;
  repair?: () => Promise<boolean>;
  intervalMs: number;
};

type HealthStatus = {
  healthy: boolean;
  message: string;
  severity: "info" | "warning" | "critical";
};

// 内置健康检查：
const checks: HealthCheck[] = [
  {
    id: "memory-integrity",
    name: "记忆文件完整性",
    check: () => validateMemdirStructure(),
    repair: () => rebuildMemoryIndex(),
    intervalMs: 30 * 60_000,
  },
  {
    id: "context-budget",
    name: "上下文预算健康",
    check: () => checkContextBudgetUtilization(),
    intervalMs: 10 * 60_000,
  },
  {
    id: "disk-space",
    name: "数据目录容量",
    check: () => checkUserDataDiskSpace(),
    intervalMs: 60 * 60_000,
  },
];
```

**触发链路**：
```
interval tick → healthCheck.check()
  → if unhealthy && repair exists → attempt repair → bus.emit("diagnosis:repaired")
  → if unhealthy                  → bus.emit("diagnosis:alert")
  → report 保存在内存，供设置页或后续 UI 读取
```

**与现有系统的关系**：
- 从 `memory/service.ts` 读取 memdir 结构 → 验证完整性
- 从数据目录和当前运行状态读取轻量信号 → 检测是否接近风险阈值
- 通过 Event Bus 发布健康事件
- 当前自动修复主要集中在重建 memory index；更深的 provider / tool 健康检查还没补齐

### 第十步：主动学习引擎（Active Learning）

> Agent 自己发现"我这个技能用得不好"，自动标记并改进。

**问题**：现在只有用户手动修 SOUL.md / memory 才能"教"Agent。Agent 不会自己发现重复犯的错误。

**当前实现**：

```typescript
// src/main/learning/engine.ts

type LearningSignal = {
  type: "tool_repeated_failure"     // 同一工具连续 N 次失败
       | "retry_after_reject"       // 用户拒绝后 Agent 换了方案
       | "tool_discovery_opportunity"
       | "tool_misuse_pattern";
  toolName: string;
  message: string;
  sessionId: string;
  timestamp: number;
};

// 当前来源：
// bus.on("tool:failed", ...)
// bus.on("approval:resolved", ...)

// 当前学习器：
async function processSignal(signal: LearningSignal): Promise<void> {
  // 1. 达到阈值（默认 3 次）
  // 2. 生成本地摘要
  // 3. 写入 memdir topic: "learnings"
  // 4. emit "learning:applied"
}
```

**学习闭环**：
```
执行 → 失败/被纠正 → 检测信号 → 达到阈值
  → 本地总结教训 → 写入 memory/topics/learnings.md
  → 下次 prompt 注入时自动携带 → Agent 行为改变
```

**关键约束**：
- **学习写入 semantic memory，不直接改 SOUL.md** — SOUL.md 是用户的领地
- 当前没有专门 UI，learning 主要通过 memory 注入生效
- 当前信号来源集中在 `tool:failed / approval:resolved`，transcript 级分析还没接
- 通过 scheduler 每小时做一次信号衰减，避免旧错误永久固化

**与现有系统的关系**：
- 信号来源：Event Bus 的 `tool:failed / approval:resolved`
- 存储目标：`memory/service.ts`（写入 `topics/learnings.md`）
- 注入路径：`memory/service.ts` → prompt 记忆链路
- 当前实现已经跑通“失败信号 → learning 条目”的闭环

### 第十一步：情感状态机（Emotional State Machine）

> 根据对话氛围自动切换模式，不再是写死的 70/30。

**问题**：固定的人格配比（如 70% 工作 / 30% 陪伴）不够灵活。
用户深夜加班时需要陪伴，白天赶工时需要高效，被 bug 折磨时需要鼓励。

**设计**：

```typescript
// src/main/emotional/state-machine.ts

type EmotionalMode =
  | "focused"     // 专注工作：简洁回复，优先行动
  | "companion"   // 陪伴模式：温暖关怀，闲聊OK
  | "quiet"       // 安静模式：只在被问时回答，减少主动性
  | "encouraging" // 鼓励模式：遇到挫折时加油打气
  | "creative";   // 创意模式：头脑风暴，发散思维

type EmotionalState = {
  currentMode: EmotionalMode;
  confidence: number;       // 0-1，切换的置信度
  since: number;            // 进入当前模式的时间
  signals: MoodSignal[];    // 最近的情绪信号
};

type MoodSignal = {
  type: "time_of_day"       // 早/午/晚/深夜
       | "reply_frequency"   // 用户回复频率（高频=专注，低频=可能走了）
       | "message_length"    // 用户消息长度（短=急，长=详细描述）
       | "error_streak"      // 连续错误（Agent 或工具）
       | "sentiment"         // 文本情感分析（轻量）
       | "explicit_cue";     // 用户明确说"我累了""帮我想想"
  value: number;             // -1 to 1（负面到正面）
  weight: number;
};
```

**状态转移规则（示例）**：
```
深夜 + 低回复频率              → quiet
深夜 + 高回复频率 + 长消息     → focused
连续工具错误 3+                 → encouraging
用户说"想想办法""头脑风暴"    → creative
早上 + 第一条消息               → companion（先打个招呼）
```

**Prompt 注入**：
```
[当前模式: focused]
- 回复简洁直接，优先给方案和代码
- 减少寒暄，但不要冷冰冰
- 如果用户主动闲聊，可以短暂切换
```

**与 Prompt Control Plane 的关系**：
- 新增 section layer: `emotional`，位于 `session` 和 `turn` 之间
- authority: `soft`（可被用户覆盖）
- cache scope: `turn`（每轮重新评估）
- 也可在 SOUL.md 里写固定的模式锁定（authority: `hard` 覆盖）

**关键约束**：
- **不做深度 NLP 情感分析** — 太重。只用简单启发式（时间/频率/长度/关键词）
- 用户可以手动锁定模式（"保持工作模式"）
- 状态切换有冷却期，防止抖动（至少保持 5 分钟）
- 切换时不通知用户（无感），状态已持久化，可供设置页或后续 UI 读取

### 第十二步：反思与性格演化（Reflection & Personality Evolution）

> 夜深人静时回顾一天，让性格从对话中自然生长。

**反思模式（Dreaming）当前实现**：

```typescript
// src/main/reflection/service.ts

// 触发：每天设定时间（如凌晨 2 点）或 scheduler 调度
// 也可手动触发

async function runDailyReflection(): Promise<ReflectionReport> {
  // 1. 收集今天所有 session 的 user / assistant 文本摘要
  const todaySessions = getTodaySessions();

  // 2. 当前用本地启发式摘要生成反思报告
  const report = generateLocalReflection(todaySessions);

  // 3. 写入日记存储
  saveDailyReflection(report);

  // 4. 提取可学习的内容 → 写入 semantic memory
  for (const insight of report.actionableInsights) {
    await memorySave({
      summary: insight,
      topic: "reflections",
      source: "system:reflection",
    });
  }

  // 5. personality drift 候选存在时再交给 drift 层
  if (report.personalityDrift?.length) {
    processPersonalityDrift(report.personalityDrift, report.date);
  }

  return report;
}

type ReflectionReport = {
  date: string;
  userMoodSummary: string;
  whatWorked: string[];
  whatDidnt: string[];
  patterns: string[];
  tomorrowSuggestions: string[];
  actionableInsights: string[];    // → 写入 memory
  personalityDrift?: string[];     // → 候选性格演化
};
```

**性格演化（Personality Evolution）**：

```typescript
// 不是直接改 SOUL.md，而是维护一个 "性格漂移层"

// userData/data/personality-drift.json
type PersonalityDrift = {
  traits: PersonalityTrait[];
  lastUpdated: number;
  generation: number;  // 演化代次
};

type PersonalityTrait = {
  trait: string;           // "更喜欢用类比解释概念"
  source: string;          // "2026-04-09 反思：用户对类比回复的接受度明显更高"
  strength: number;        // 0-1，强度（随正反馈增长，随时间衰减）
  firstSeen: number;
  lastReinforced: number;
  mentionCount: number;
  locked: boolean;
};

// 注入方式：作为 soft prompt 附加在 SOUL.md 之后
// [性格成长笔记]
// - 我发现用类比解释概念效果更好（置信度: 0.8）
// - 用户不喜欢太长的开场白，直接说重点（置信度: 0.9）
// - 调试代码时先问"你试过什么"比直接给方案更好（置信度: 0.6）
```

**演化规则**：
1. **来源**：当前接入点已经在 `reflection` 和 `personality-drift` 两层打通
2. **阈值**：一个 trait 至少被 3 次独立提及才会固化进 prompt
3. **衰减**：30 天未被 reinforce 的 trait 降低 strength
4. **上限**：最多保留 20 个活跃 trait，淘汰最弱的
5. **用户可见能力已预留**：代码里已有 `lock / unlock / remove` API
6. **不改 SOUL.md**：演化层是独立的，用户随时可以清零重来

**与 Prompt Control Plane 的关系**：
- SOUL.md 是 `constitution` layer，authority: `hard` — 用户写的，不可被覆盖
- 性格漂移是 `evolution` layer，authority: `soft` — 自然生长的，可被覆盖
- 冲突时 SOUL.md 优先

### 当前缺口

- 当前 `generateLocalReflection()` 还没有稳定产出 `personalityDrift` 候选，trait 增长链还比较弱。
- 反思当前走本地启发式摘要，没有接入更强的 LLM 反思生成。
- Reflection / drift 的专门 UI 面板还没完成。

---

## 对照：Alma 已有 vs 我们的方案

> Alma（蟹蟹）自述了她已有的能力和希望有的能力。下面做一个对照映射。

### Alma 已有，我们也有

| Alma 能力 | 我们的对应 | 状态 |
|-----------|-----------|------|
| 记忆系统 | Memory（memdir） | ✅ |
| SOUL.md | soul.ts（SOUL/USER/AGENTS） | ✅ |
| 搜索 + 网页抓取 | web_search + web_fetch | ✅ |
| 上下文压缩/摘要 | context/service.ts compact | ✅ 已有，Alma 缺 |

### Alma 已有，我们已接入或继续扩展

| Alma 能力 | 我们的方案 | 当前状态 |
|-----------|-----------|----------|
| 插件系统 | Plugin Loader（spec-16 第四步） | 规划中 |
| Skills 系统 | Plugin manifest + 工具注册 | 规划中 |
| 心跳/Heartbeat | Self-Diagnosis（第九步） | baseline 已接入 |
| 多平台接入 | Telegram Bot Adapter（F1） | 规划中 |
| 定时调度 | Scheduler（第二步） | baseline 已接入 |
| 日记/日报 | Reflection 反思模式（第十二步） | baseline 已接入 |
| 代码执行 | shell_exec（已有，但可增强沙箱） | ✅ |

### Alma 想要，我们的当前状态

| Alma 想要 | 我们的方案 | 当前状态 |
|-----------|-----------|----------|
| 🔥 主动学习能力 | Active Learning Engine（第十步） | baseline 已接入 |
| 🔥 情感状态机 | Emotional State Machine（第十一步） | baseline 已接入 |
| 🔥 自我诊断 | Self-Diagnosis（第九步） | baseline 已接入 |
| 🎯 跨会话记忆同步 | Memory 已支持跨会话；可增强 snapshot 延续 | 部分落地 |
| 🎯 技能市场自动更新 | Plugin Loader auto-update | 规划中 |
| 🤪 梦境/反思模式 | Reflection Service（第十二步） | baseline 已接入 |
| 🤪 性格自然演化 | Personality Drift（第十二步） | 存储层已接入，候选生成待增强 |

---

## 补充：来自 AI Code Review 的六项增强

> 2026-04-09 10:21 — Alma review spec 后补充，全部采纳。

### S1. 并行工具调用（Phase 2）

现有 ReAct 循环串行执行工具。当 Agent 一次请求多个无依赖工具调用时，可以并发执行。

```typescript
// tool-execution.ts 增强
// 如果 pi-agent-core 一次性返回 N 个 tool_use blocks：
//   → 检测是否有写-写冲突（同一文件路径）
//   → 无冲突 → Promise.all 并发执行
//   → 有冲突 → 保持串行
```

**注意**：取决于 pi-agent-core 是否支持 parallel tool_use。如果 core 只逐个发 tool_use event，则需要在 adapter 层做 batch window（短时间内收到的多个 tool_use 合并执行）。

### S2. 性能指标采集（Phase 2）

```typescript
// src/main/metrics.ts
type RunMetrics = {
  runId: string;
  sessionId: string;
  startedAt: number;
  endedAt: number;
  modelLatencyMs: number;      // 模型首 token 延迟
  toolExecutionMs: number;     // 工具执行总耗时
  totalTokensIn: number;
  totalTokensOut: number;
  toolCallCount: number;
  compactTriggered: boolean;
};

// 数据来源：adapter.ts RunBuffer 已有 usage 统计 + harness audit
// 存储：userData/data/metrics.jsonl（追加写）
// UI 展示：设置页 → "今天用了 X 万 token / ¥Y 费用"
```

### S3. 离线/降级模式（Phase 2）

```typescript
// src/main/failover.ts
// 职责：provider 级别的故障转移

type FailoverStrategy = {
  primaryModelEntryId: string;
  fallbackChain: string[];       // 按优先级排序的备选 model entry
  maxRetries: number;
  retryDelayMs: number;
};

// 触发条件：
// - API 返回 5xx / timeout / rate limit
// - 网络不可达（net.isOnline() 或 DNS 探测）

// 降级行为：
// - provider 挂 → 自动切换到 fallbackChain 下一个
// - 全部挂 → 通知用户 "所有模型暂时不可用"
// - 断网 → 只读模式（可浏览历史、文件、memory，但不能发消息）
```

### S4. 上下文预算智能分配（Phase 2 增强）

```
当前 context/service.ts 只做"总量超了就 compact"。
增强为按类型分层的预算分配：

总 context budget 100%
├── 系统 prompt（固定，~10-15%）
├── 工具结果（优先保留最近 3 次，~20%）
├── 用户/助手消息（PROTECTED_USER_TURNS，~50%）
├── 记忆/snapshot（~10%）
└── 缓冲区（~5%）

接近上限时的淘汰优先级：
  1. 先丢旧的寒暄（短消息 + 无工具调用）
  2. 再压缩旧的工具结果（只保留摘要）
  3. 最后压缩历史消息（保留 snapshot）
```

### S5. 对话分支/假设探索（Phase 4）

让 session 支持树状结构，类似 Git 分支：
- `branch:create` — 从当前位置创建分支
- `branch:switch` — 切换到另一条分支
- `branch:merge` — 把分支的 learnings 合并回主线

**存储**：transcript.jsonl 增加 `branchId` 字段，默认 `main`。
**UI**：分支切换器（类似 Git 分支选择器）。

### S6. 工具使用教学（合并到 Active Learning，Phase 3）

在 Active Learning Engine 的 `detectLearningSignals()` 增加信号类型：

```typescript
type LearningSignal = {
  type: "tool_repeated_failure"
       | "user_correction"
       | "retry_after_reject"
       | "pattern_inefficiency"
       | "user_explicit_feedback"
       | "tool_discovery_opportunity"   // ← 新增：用户手动做了某件事，但其实有工具可以帮忙
       | "tool_misuse_pattern";         // ← 新增：用户经常用错某工具的参数
};

// 检测逻辑：
// - 用户反复手动格式化 JSON → 推荐 "试试 shell_exec + jq"
// - 用户总是 grep 后手动打开文件 → 推荐 "file_read 可以直接读"
// - 用户给工具传了错误参数 3 次 → 主动教正确用法
```

---

## 更新后的完整路线图

```
Phase 1 — 已落地 baseline
├── Event Bus baseline 收口 + 现有代码桥接
├── 桌面通知工具（notify_user）
├── Event Bus 审计日志
└── 文档 + 类型

Phase 2 — 已落地 baseline
├── Scheduler + 持久化
├── Webhook receiver（本机，默认关闭）
├── Self-Diagnosis 自我诊断
├── 性能指标采集（metrics.ts）
└── 跨会话记忆延续的基础链路

Phase 3 — 已落地 baseline
├── Active Learning 主动学习引擎
├── Emotional State Machine 情感状态机
├── Reflection + Personality Drift 存储层
└── 反思结果写入 semantic memory

Phase 4 — 当前主增量
├── Scheduler / Webhook 的 session 路由和产品化 UI
├── Reflection / drift 的更强候选生成
├── 离线/降级模式（S3: failover.ts）
├── 上下文预算智能分配（S4: BudgetAllocator）
├── 并行工具调用（S1: parallel tool_use）
└── 环境感知 / 快速召唤 / 语音链路

Phase 5 — 生态（大）
├── Plugin Loader + manifest schema
├── Plugin 沙箱（权限隔离）
├── Plugin auto-update 自动更新
├── 对话分支/假设探索（S5: branch）
├── OAuth 框架（Google/Microsoft）
└── 官方插件：Calendar、Email、GitHub

Phase 6 — 高级（很大）
├── Workflow DAG 定义 + 执行引擎
├── Multi-agent 协作
├── 插件市场 UI
└── 远程访问（Telegram Bot Adapter）
```

---

## 完整贾维斯能力清单

```
贾维斯 = 对话 + 工具 + 记忆           ← ✅ 已有
       + 安全 harness + 审计          ← ✅ 已有
       + Prompt 控制面 + Context 引擎  ← ✅ 已有
       + 事件驱动 + 定时 + 通知        ← baseline 已接入
       + 自我诊断 + 健康检查           ← baseline 已接入
       + 指标采集                      ← baseline 已接入
       + 主动学习 + 情感感知           ← baseline 已接入
       + 反思日记 + 性格演化           ← 部分落地
       + 语音 + 环境感知 + 快速召唤    ← 待完成
       + 插件 + OAuth + 外部 API      ← 待完成
       + 对话分支 + 假设探索           ← 待完成
       + 工作流 + 多 Agent + 市场      ← 待完成
```
