# 09 — RAG 与 Embedding

> 状态：`in-review`
> 实作状态：`local RAG baseline 已落地，自动探测和管理 UI 待增强`
> 依赖：07-memory-architecture
> 更新时间：2026-04-27 13:50:06

## 9.1 职责

这个模块负责记忆系统的"读写引擎"：

- **写入**：把新记忆转成向量并存储
- **检索**：根据查询找到最相关的记忆
- **提取**：从对话中自动识别值得记住的信息

## 9.2 Embedding 模型选择

| 方案 | 模型 | 维度 | 优点 | 缺点 |
|------|------|------|------|------|
| 本地默认 | Xenova/bge-small-zh | 模型决定 | 随桌面应用本地运行、隐私、离线可用 | 首次加载需要下载/缓存模型 |
| 远程 provider | Provider 目录中的 embedding 模型 | provider 决定 | 可复用 OpenAI-compatible 配置 | 需要网络和 API Key |

**策略：**
```
读取 settings.memory.embeddingModelId
  ├─ Xenova/* → 使用 @xenova/transformers 本地 worker
  └─ 其他模型 ID → 使用 settings.memory.embeddingProviderId 对应 provider
      ├─ provider 可用 → 通过 OpenAI-compatible embeddings API 编码
      └─ provider 不可用 → memory search/add 返回错误，T0/T2 和 memdir 继续可用
```

**降级运行是什么意思？**

没有 embedding 能力时，agent 仍然能工作。T0（Soul 文件）正常加载，T2（会话记忆）正常运行，memdir 记忆正常读取；语义 T1 检索不可用或返回错误。后续 UI 需要明确提示用户重建 native 依赖、下载本地模型或配置远程 embedding provider。

这保证了应用的基本可用性。embedding provider 缺失或本地模型未就绪时，Agent 仍可使用 T0、T2 和 memdir。

## 9.3 向量存储

### 存储格式

语义记忆存在本地 SQLite（07 spec 已定义）：

```sql
CREATE TABLE memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content TEXT NOT NULL,
  embedding TEXT NOT NULL,
  metadata TEXT,
  match_count INTEGER NOT NULL DEFAULT 0,
  feedback_score INTEGER NOT NULL DEFAULT 0,
  last_matched_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 为什么用 SQLite + JSON embedding

```
我们的数据量：
  活跃使用 1 个月 → 大约 200-500 条记忆
  embedding 以 JSON 存储在 SQLite text 字段
  500 条 → MB 级别

检索性能：
  先按 created_at 取候选集（默认 500）
  worker 内解析向量并做余弦相似度排序

结论：SQLite 持久化 + worker 内计算足够支撑当前桌面单用户规模
```

引入 Chroma / Qdrant / Pinecone 的代价：
- 额外的安装步骤（桌面应用用户不想装数据库）
- 额外的进程管理
- 额外的学习成本

如果未来记忆量超过 10000 条，可以考虑引入 sqlite-vss / sqlite-vec 或分片索引。

### 原生依赖 ABI

`better-sqlite3` 是原生模块，必须和当前 Node ABI 匹配。项目默认 Node 版本固定为 `22.19.0`，切换 Node 版本后需要重新安装或重建原生依赖；否则 memory store 会在加载 `.node` 文件时报 `NODE_MODULE_VERSION` 不匹配。

### 查询向量缓存

当前实现缓存 query embedding，避免重复查询反复编码：

```typescript
class QueryVectorCache {
  get(query: string, modelId: string): number[] | null;
  set(query: string, modelId: string, vector: number[]): void;
  clear(): void;
}
```

## 9.4 检索流程

```
输入："帮我准备一下面试"
            │
            ▼
     Embedding 模型
   "帮我准备一下面试" → [0.34, -0.12, 0.67, ...]
            │
            ▼
    遍历所有存储的向量，计算余弦相似度
            │
            ▼
    排序，取 top-K（默认 5）
            │
    ┌───────┴────────────────────────┐
    │  结果：                         │
    │  1. (0.92) "用户计划 4/7 面试字节" │
    │  2. (0.85) "用户是全栈工程师"     │
    │  3. (0.78) "项目用 pi-agent-core" │
    │  4. (0.71) "偏好 pnpm + TS"      │
    │  5. (0.65) "用户之前用过 OpenClaw" │
    └────────────────────────────────┘
            │
            ▼
    从 SQLite row 直接返回完整记忆内容和 metadata
            │
            ▼
    格式化成 semantic memory section 或 memory_search tool result
```

### 余弦相似度

```typescript
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
```

就这几行。向量检索在数据量小的时候没什么魔法，就是暴力算距离。

### 相似度阈值

不是检索到的都返回。阈值来自 `settings.memory.similarityThreshold`：

```
top-5 结果：
  1. (0.92) ✓ 返回
  2. (0.85) ✓ 返回
  3. (0.78) ✓ 返回
  4. (0.55) ✗ 低于 0.6，丢弃
  5. (0.42) ✗ 低于 0.6，丢弃
```

宁可少返回也不要返回不相关的记忆——不相关的记忆注入 context 只会干扰 LLM。

## 9.5 记忆写入流程

### 从记忆提取到写入

07 spec 定义了提取时机和策略，这里补充写入的具体步骤：

```
提取结果（来自 LLM）：
  [
    { content: "用户计划 4/7 面试字节，岗位全栈", tags: ["career"] },
    { content: "用户确认使用三层记忆架构", tags: ["project"] }
  ]

对每条记忆：
  1. 去重检查
     content → embedding → 检索已有记忆
     如果最高相似度 > 0.9 → 更新已有记忆的时间戳，跳过新建
     如果最高相似度 ≤ 0.9 → 继续新建

  2. 生成 ID
     格式：YYYY-MM-DD-NNN（当天第几条）

  3. 计算 embedding
     content → embedding 模型 → 向量

  4. 写入 SQLite memories
     content、embedding JSON、metadata

  5. 更新 memory_meta
     indexed_model_id、last_indexed_at

  6. memdir 链路另行更新 MEMORY.md / topics
```

### Embedding 的批处理

如果一次提取出 5 条记忆，不要一条一条调 embedding API——批量发送：

```
本地 transformers：worker 内串行/批量优化空间保留
远程 provider：当前按 OpenAI-compatible embeddings API 调用，后续可做 batch
```

## 9.6 模型切换处理

如果用户从一个 embedding 模型切换到另一个模型，embedding 维度或向量空间可能不同，旧的向量就废了。

**处理策略：**

```
启动时检查 memory_meta.indexed_model_id
  ├─ 和当前 embedding 模型一致 → 正常使用
  └─ 不一致 → 需要重建索引
     → 前端提示："embedding 模型已变更，需要重建记忆索引。
        这会重新计算所有记忆的向量，大约需要 X 秒。"
     → 用户确认 → 遍历 SQLite memories → 重新计算 embedding → 更新 embedding 字段
```

记忆内容不受影响，只是向量需要重算。

## 9.7 性能预估

| 操作 | 数据量 | 耗时（本地 transformers） | 耗时（远程 provider） |
|------|--------|-------------------|-------------------|
| 单条 embedding | 1 条 | ~50ms | ~200ms |
| 检索 | 500 条 | < 5ms | < 5ms（内存计算） |
| 批量写入 | 5 条 | ~250ms | ~400ms |
| 索引重建 | 500 条 | ~25s | ~30s |

对于桌面应用来说，检索在 Context Engine / worker 链路异步执行，不阻塞主要 UI。

## 9.8 文件结构

```
src/main/memory/
  rag-service.ts        # Main 侧 memory IPC 服务入口
  embedding.ts          # worker client
  embedding-worker.ts   # worker runtime，隔离 transformers / better-sqlite3
  embedding-types.ts    # worker 协议
  store.ts              # SQLite schema、写入、列表、统计、重建
  retrieval.ts          # 余弦相似度、排序、query cache
  metadata.ts           # metadata 入口收窄
  service.ts            # memdir、memory_search、auto summarize
```
