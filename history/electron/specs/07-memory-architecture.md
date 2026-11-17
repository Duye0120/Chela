# 07 — 记忆系统架构

> 状态：`in-review`
> 实作状态：`T0 / T1 / T2 baseline 已落地`
> 依赖：03-agent-core, 05-builtin-tools
> 更新时间：2026-04-27 13:48:12

## 7.1 设计理念

记忆系统让 agent 从"每次都失忆的聊天机器人"变成"越用越懂你的助手"。

核心原则：
- **透明可控** — 人类可读记忆存储在用户可见的 `.md` 文件里，语义检索索引存储在本地 SQLite
- **分层管理** — 不同类型的记忆有不同的生命周期和访问方式
- **按需加载** — 不把所有记忆塞进 context，只检索相关的

## 7.2 三层架构

```
┌─ T0: Soul 层 ──────────────────────────────────┐
│                                                 │
│  内容：SOUL.md + USER.md + AGENTS.md            │
│  生命周期：永久（用户手动维护）                    │
│  加载方式：每次会话启动时全量读取，拼入 system prompt│
│  大小：通常 1000-3000 tokens                     │
│                                                 │
│  类比：一个人的性格和对朋友的基本了解              │
│  你不需要每次见朋友都重新认识他，                  │
│  这些信息始终在你脑子里。                         │
├─────────────────────────────────────────────────┤
│  T1: 长期记忆                                    │
│                                                 │
│  内容：从历次对话中提取的关键信息                  │
│  生命周期：持久（自动写入，可手动删除）             │
│  加载方式：按需检索（向量相似度），每轮 top-5 注入  │
│  大小：单条 100-500 tokens，库可以无限增长         │
│                                                 │
│  类比：日记本                                    │
│  你不会每天翻完整本日记，但当有人提到某件事，       │
│  你能快速翻到相关的那几页。                       │
├─────────────────────────────────────────────────┤
│  T2: 会话记忆                                    │
│                                                 │
│  内容：当前对话 messages + session continuity 快照 │
│  生命周期：会话期间持续更新，必要时为续会话保留摘要  │
│  加载方式：活跃会话可全量，重开时先注入快照再补历史 │
│  大小：messages 动态增长，快照保持紧凑               │
│                                                 │
│  类比：当前对话的短期记忆                         │
│  你正在和朋友聊天，聊的内容你当然全记得。          │
└─────────────────────────────────────────────────┘
```

补一条边界：

- `T2` 不只是“当前 messages 列表”，还包括“为同一任务后续 session 续接准备的 session memory snapshot”
- `T2` 仍然是 session 级短中期记忆，不等于 `T1` 长期记忆
- `T2` 也不等于 Harness 的活动 `run snapshot`；后者负责执行现场，不负责语义续接

### 当前实现收口

截至 2026-04-27，当前实现已经落到三层 baseline：

- `T0` 继续来自 `SOUL / USER / AGENTS`
- `T2` 已固定成 `recent transcript tail + session memory snapshot`
- `T1` 已有两条链路：
  - `memdir`：`memory_save` / `memory_list` 写入人类可读 topic 文件，适合规则、偏好、经验教训。
  - `SQLite + embedding worker`：`memory.add/search/list/stats/rebuild` IPC 和 `memory_search` 语义检索，适合长期语义检索。
- `compact` 已改成 Main 侧 context 能力，不在 Renderer 本地做压缩
- session todos 已进入 context summary 和 prompt，作为多步任务的工作记忆入口

## 7.3 数据流全景

一次完整的记忆生命周期：

```
═══ 会话开始 ═══

1. 加载 T0（Soul 层）
   读取 SOUL.md + USER.md + AGENTS.md → 拼入 system prompt

2. 如果是重开已有任务
   先加载 transcript + session memory snapshot
   让模型先知道“上次做到哪、还有什么没做”

3. 用户发送第一条消息："帮我看看上次那个项目的进度"

4. Context Engine 触发语义记忆检索
   "上次那个项目" → embedding → 向量检索 T1
   → 找到记忆："用户在做一个 Electron agent 项目，使用 pi-agent-core"
   → 注入到 context 中

5. Agent 带着完整上下文开始工作
   system prompt（T0）+ 检索到的记忆（T1）+ 用户消息（T2）

═══ 会话进行中 ═══

6. 多轮对话，T2 持续增长
   用户消息、agent 回复、工具调用结果不断追加

7. Context Engine 持续管理
   如果 T2 太大 → 压缩早期对话为摘要

8. Agent 可以主动调用 memory_search / memory_save 工具
   "让我查一下用户之前的偏好..." → 检索 T1

═══ 会话结束 ═══

9. 记忆提取（T2 → T1）
   用 LLM 分析本次对话 → 提取关键信息 → 写入 T1 长期记忆

   对话内容："用户说下周二要面试字节，岗位是全栈工程师"
   提取记忆：{
     content: "用户计划于 2026-04-07 面试字节跳动，岗位：全栈工程师",
     tags: ["career", "interview"]
   }

9. 更新 USER.md（可选）
   如果提取到的信息是关于用户本身的重大更新
   → 建议更新 USER.md（通过前端提示用户确认）
```

## 7.4 存储结构

```
workspace/
  SOUL.md                    # T0: agent 人格
  USER.md                    # T0: 用户信息
  AGENTS.md                  # T0: 行为规则
  memory/
    MEMORY.md                # T1: memdir 人类可读索引
    topics/                  # T1: topic markdown 文件
      preferences.md
      architecture.md
  userData/
    data/
      memory.sqlite          # T1: 语义记忆、embedding、统计元数据
```

### MEMORY.md / topics 的作用

MEMORY.md 是长期记忆的 **人类可读索引**。topic 文件保存可追溯的事实、偏好、经验教训。用户打开就能看到 agent 记住了什么：

```markdown
# 长期记忆

## 用户相关
- [2026-03-28] 用户是全栈工程师，主要方向 AI/Agent，正在准备求职
- [2026-03-31] 用户计划 4 月 7 日面试字节跳动

## 项目相关
- [2026-03-29] 项目使用 pi-agent-core 作为 agent 引擎
- [2026-03-31] 已完成 spec 讨论，确认 5 个内置工具和三层记忆架构

## 偏好
- [2026-03-28] 偏好 pnpm + TypeScript，代码风格偏简洁
```

这些文件同时被 agent 读取，作为 T1 的高层摘要进入 semantic memory section。详细语义检索走 SQLite embedding 记录。

### SQLite 语义记忆记录

```typescript
type MemoryRecord = {
  id: number;
  content: string;
  metadata: MemoryMetadata | null;
  createdAt: string;
  matchCount: number;
  feedbackScore: number;
  lastMatchedAt: string | null;
};
```

SQLite 存储在 Electron `userData/data/memory.sqlite`，包含：

- `memories`：content、embedding JSON、metadata、match_count、feedback_score、last_matched_at、created_at。
- `memory_meta`：indexed_model_id、last_indexed_at、last_rebuilt_at。

当前没有引入外部向量数据库。SQLite 负责持久化，检索时取候选集后在 Node worker 内做余弦相似度排序。

## 7.5 记忆提取策略

会话结束时，从对话中自动提取关键信息：

**触发时机：**
- 用户关闭会话
- 用户切换到另一个会话
- 超过 30 分钟无交互

**提取流程：**
```
1. 把本次对话的全部 messages 发给 LLM（用当前模型，不额外花钱起子模型）
2. Prompt:
   "分析以下对话，提取值得长期记住的关键信息。
    只提取以下类型：
    - 用户的个人信息、偏好、习惯
    - 重要的事实、决策、结论
    - 项目进度、里程碑
    不要提取：
    - 临时的调试过程
    - 一般性的技术问答（可以再次搜索到的）
    - 对话中的寒暄
    返回 JSON 数组，每条包含 content 和 tags。"
3. 解析 LLM 返回的结构化数据
4. 对每条语义记忆计算 embedding → 写入 SQLite
5. 对人类可读记忆更新 MEMORY.md / topic 文件
```

**去重：**
新记忆写入前，先检索 T1 看有没有语义相近的已有记忆（相似度 > 0.9）。如果有，更新已有记忆而不是新建。防止"用户是全栈工程师"被重复记录 10 次。

## 7.6 记忆与 Context Engine 的协作

每轮 LLM 调用前，Context Engine 做的事：

```
async function buildContext(messages) {
  // 1. 从最近的用户消息提取检索 query
  const lastUserMsg = messages.findLast(m => m.role === 'user');

  // 2. 检索 T1 长期记忆
  const memories = await memorySearch(lastUserMsg.content, limit=5);

  // 3. 构建注入消息
  const memoryContext = formatMemories(memories);

  // 4. 如果消息历史太长，压缩早期对话
  const compressed = await compactIfNeeded(messages);

  // 5. 返回最终的 messages
  return [
    { role: "system", content: memoryContext },  // 检索到的记忆
    ...compressed,                                // 压缩/裁剪后的历史
  ];
}
```

注意：T0（Soul 文件）不在语义检索里处理，它是在 Agent 初始化时就写入 systemPrompt 的，始终存在。

## 7.7 用户控制

记忆系统对用户完全透明：

| 操作 | 方式 |
|------|------|
| 查看 memdir 记忆 | 打开 workspace/memory/MEMORY.md 和 topics/*.md |
| 查看语义记忆 | 设置页 Memory 区或 memory:list IPC |
| 删除/降权语义记忆 | 后续 UI 入口，当前优先保留 store API 扩展位 |
| 修改 agent 人格 | 编辑 SOUL.md |
| 更新个人信息 | 编辑 USER.md |
| 修改行为规则 | 编辑 AGENTS.md |
| 清空所有记忆 | 删除 memory/ 目录 |

memdir 记忆继续保持文件可控。语义记忆由 SQLite 管理，后续记忆管理页面应优先提供查看、删除、降权和重建索引入口。
