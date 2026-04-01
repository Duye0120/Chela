# 02 — Adapter 层

> 状态：`in-review`
> 依赖：01-overview, 03-agent-core

## 2.1 职责

Adapter 层是 Agent Core 和外部世界之间的翻译官：

- **接收** — 把外部输入（UI 点击、Telegram 消息）翻译成 Agent 能理解的统一格式
- **输出** — 把 Agent 的事件（思考中、工具执行、回复）翻译成外部能展示的格式
- **交互** — 处理需要用户参与的操作（确认弹窗、文件选择等）

## 2.2 为什么需要这一层

如果没有 Adapter 层，Agent Core 里会写满这种代码：

```typescript
// ❌ 不好：Agent Core 直接依赖 Electron
if (isElectron) {
  mainWindow.webContents.send('agent:event', event);
} else if (isTelegram) {
  bot.sendMessage(chatId, formatEvent(event));
}
```

每加一个平台就要改 Agent Core。这违反了"关注点分离"——Agent 的职责是思考和调用工具，不应该关心消息怎么送达。

有了 Adapter 层：

```typescript
// ✓ 好：Agent Core 只跟接口对话
adapter.sendAgentEvent(event);  // 不管是 Electron 还是 Telegram，同一行代码
```

## 2.3 接口定义

```typescript
interface AgentAdapter {
  /**
   * 监听用户输入
   * 当用户发送消息时触发回调
   */
  onUserMessage(handler: (input: UserInput) => void): void;

  /**
   * 发送 agent 事件给用户
   * 包括：思考过程、工具调用状态、最终回复等
   */
  sendAgentEvent(event: AgentEvent): void;

  /**
   * 请求用户确认
   * 用于高风险操作（如 shell 命令执行、文件覆盖）
   * 返回 true = 用户同意，false = 用户拒绝
   */
  requestConfirmation(request: ConfirmationRequest): Promise<boolean>;

  /**
   * 发送系统通知
   * 非对话内容：错误提示、配置变更提醒等
   */
  sendNotification(notification: Notification): void;
}
```

### 数据类型

```typescript
// 用户输入
interface UserInput {
  text: string;                    // 消息文本
  attachments?: Attachment[];      // 附件（文件、图片等）
  sessionId: string;               // 会话 ID
}

// Agent 事件（直接透传 pi-agent-core 的事件 + 包装）
type AgentEvent =
  | { type: 'agent_start' }
  | { type: 'agent_end' }
  | { type: 'turn_start' }
  | { type: 'turn_end' }
  | { type: 'thinking_delta'; content: string }
  | { type: 'text_delta'; content: string }
  | { type: 'text_done'; content: string; usage: Usage }
  | { type: 'tool_start'; name: string; params: any }
  | { type: 'tool_update'; name: string; data: any }
  | { type: 'tool_end'; name: string; result: any; error?: string }
  | { type: 'error'; message: string }

// 确认请求
interface ConfirmationRequest {
  title: string;                   // "执行 Shell 命令"
  description: string;             // "即将执行: git push origin main"
  riskLevel: 'low' | 'medium' | 'high';
}

// 系统通知
interface Notification {
  level: 'info' | 'warning' | 'error';
  message: string;
}
```

## 2.4 Electron Adapter（v1 实现）

这是我们 v1 唯一实现的 Adapter，通过 Electron IPC 连接 React 前端和 Agent Core。

```
React 前端                  Preload                   Main Process
(Renderer)                  (Bridge)                  (Agent Core)
    │                          │                          │
    │─ desktopApi.chat.send() ─→│─ ipcRenderer.invoke ──→│
    │                          │       'chat:send'        │
    │                          │                          │─→ Agent Core
    │                          │                          │   处理消息
    │                          │                          │
    │←─ onEvent callback ──────│←─ ipcRenderer.on ───────│
    │                          │     'agent:event'        │←─ agent.subscribe()
    │  更新 UI                  │                          │
```

### 实现要点

**接收用户消息：**
```typescript
// Main Process
ipcMain.handle('chat:send', async (_, input: UserInput) => {
  // 透传给 Agent Core
  await agentCore.handleUserInput(input);
});
```

**发送 Agent 事件：**
```typescript
// Main Process
agent.subscribe(event => {
  // 把 pi-agent-core 事件转换成我们的 AgentEvent 格式
  const agentEvent = mapToAgentEvent(event);
  mainWindow.webContents.send('agent:event', agentEvent);
});
```

**用户确认：**
```typescript
// Main Process
async requestConfirmation(request: ConfirmationRequest): Promise<boolean> {
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    title: request.title,
    message: request.description,
    buttons: ['执行', '取消'],
    defaultId: 1,        // 默认选中"取消"，安全第一
    cancelId: 1,
  });
  return response === 0;  // 0 = "执行"
}
```

### IPC Channel 注册

需要在 `src/shared/ipc.ts` 中新增的 channel：

```typescript
// 现有（保留）
'chat:send'           // 发送消息（改造：接入真实 Agent）
'sessions:*'          // 会话管理（保留原逻辑）
'files:*'             // 文件操作（保留原逻辑）

// 新增
'agent:event'         // Agent → 前端的事件流
'agent:cancel'        // 前端 → Agent 取消执行
'agent:confirm'       // 确认弹窗的响应
'config:get'          // 获取配置（API Keys、模型选择等）
'config:set'          // 更新配置
```

### 与现有代码的集成

当前 `src/main/index.ts` 的 `chat:send` handler 调用 `buildMockAssistantReply()`。我们的改造就是把这一行替换成真实的 Agent 调用：

```typescript
// 现在
ipcMain.handle(IpcChannels.CHAT_SEND, async (_, msg) => {
  return buildMockAssistantReply(msg);  // ← 删掉这行
});

// 改成
ipcMain.handle(IpcChannels.CHAT_SEND, async (_, input) => {
  await electronAdapter.handleUserMessage(input);  // ← 换成 Adapter
});
```

这是整个项目最关键的一行代码替换——从 mock 到 real agent。

## 2.5 Telegram Adapter（后期，仅定义接口）

v1 不实现，但架构上预留。后期的实现大概长这样：

```typescript
class TelegramAdapter implements AgentAdapter {
  private bot: TelegramBot;

  onUserMessage(handler) {
    this.bot.on('message', msg => {
      handler({
        text: msg.text,
        sessionId: String(msg.chat.id),  // Telegram chat ID 作为 session
      });
    });
  }

  sendAgentEvent(event) {
    if (event.type === 'text_done') {
      this.bot.sendMessage(this.chatId, event.content);
    }
    // tool 状态可以用 Telegram 的 "typing..." 指示器
  }

  async requestConfirmation(request) {
    // 发送带按钮的消息，等待用户点击
    await this.bot.sendMessage(this.chatId, request.description, {
      reply_markup: { inline_keyboard: [[
        { text: '✅ 执行', callback_data: 'confirm' },
        { text: '❌ 取消', callback_data: 'cancel' },
      ]]}
    });
    return await this.waitForCallback();
  }
}
```

**注意看**——同一个 AgentAdapter 接口，Electron 用 IPC + dialog，Telegram 用 Bot API + inline keyboard。Agent Core 完全不知道区别。这就是接口抽象的威力。

## 2.6 文件结构

```
src/
  adapter/
    types.ts              # AgentAdapter 接口 + 数据类型定义
    electron-adapter.ts   # Electron IPC 实现
    event-mapper.ts       # pi-agent-core 事件 → AgentEvent 转换
```
