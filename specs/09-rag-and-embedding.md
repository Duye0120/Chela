# 09 — RAG 与 Embedding

> 状态：`in-review`
> 实作状态：`部分落地（local RAG baseline，升级版未完成）`
> 依赖：07-memory-architecture
> 更新时间：2026-04-23 22:17:37

## 9.1 职责

这个模块负责记忆系统的"读写引擎"：

- **写入**：把新记忆转成向量并存储
- **检索**：根据查询找到最相关的记忆
- **提取**：从对话中自动识别值得记住的信息

## 9.2 Embedding 模型选择

| 方案 | 模型 | 维度 | 优点 | 缺点 |
|------|------|------|------|------|
| 本地优先 | Ollama nomic-embed-text | 768 | 免费、隐私、离线可用 | 需要用户安装 Ollama |
| 远程 fallback | OpenAI text-embedding-3-small | 1536 | 不需要本地环境 | 花钱、需要网络 |

**策略：**
```
启动时检测 Ollama 是否可用
  ├─ 可用 → 使用 nomic-embed-text（本地、免费）
  └─ 不可用 → 检查是否配置了 OpenAI API Key
      ├─ 有 → 使用 text-embedding-3-small（远程）
      └─ 没有 → 记忆系统降级运行（只有 T0 和 T2，没有 T1 向量检索）
```

**降级运行是什么意思？**

没有 embedding 能力时，agent 仍然能工作——只是没有长期记忆检索。T0（Soul 文件）正常加载，T2（会话记忆）正常运行，只是 T1 的向量检索不可用。memory_search 工具会返回"记忆检索功能未启用，请安装 Ollama 或配置 OpenAI API Key"。

这保证了应用的基本可用性——不会因为没装 Ollama 就完全不能用。

## 9.3 向量存储

### 存储格式

所有向量存在一个 JSON 文件中（07 spec 已定义）：

```json
// memory/vectors/index.json
{
  "model": "nomic-embed-text",
  "dimension": 768,
  "entries": [
    { "id": "2026-03-31-001", "vector": [0.012, -0.034, ...] },
    { "id": "2026-03-31-002", "vector": [0.078, -0.012, ...] }
  ]
}
```

### 为什么不用向量数据库

```
我们的数据量：
  活跃使用 1 个月 → 大约 200-500 条记忆
  每条 768 维 float → 约 3KB
  500 条 → 约 1.5MB

检索性能：
  500 条暴力遍历（余弦相似度）→ < 5ms
  即使 5000 条 → < 50ms

结论：JSON 文件 + 内存计算完全够用
```

引入 Chroma / Qdrant / Pinecone 的代价：
- 额外的安装步骤（桌面应用用户不想装数据库）
- 额外的进程管理
- 额外的学习成本

如果未来记忆量超过 10000 条，可以考虑换成 SQLite + sqlite-vss 扩展（单文件，无额外进程）。

### 内存缓存

应用启动时把 index.json 加载到内存：

```typescript
class VectorStore {
  private entries: Map<string, Float32Array>;  // id → vector

  async load() {
    const data = JSON.parse(await readFile('memory/vectors/index.json'));
    for (const entry of data.entries) {
      this.entries.set(entry.id, new Float32Array(entry.vector));
    }
  }

  // 检索时直接在内存中计算，不读磁盘
  search(queryVector: Float32Array, limit: number): SearchResult[] { ... }

  // 新增记忆时同时更新内存和文件
  async add(id: string, vector: Float32Array) { ... }
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
    根据 id 从 entries/ 读取完整记忆内容
            │
            ▼
    格式化成文本，注入 agent context
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

不是检索到的都返回。设一个最低相似度阈值 **0.6**：

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

  4. 写入 entries/
     创建 memory/entries/{id}.json

  5. 写入 vectors/
     追加到 memory/vectors/index.json
     同时更新内存缓存

  6. 更新 MEMORY.md 索引
     追加一行人类可读的摘要
```

### Embedding 的批处理

如果一次提取出 5 条记忆，不要一条一条调 embedding API——批量发送：

```
本地 Ollama：5 条并发请求（本地不限速）
远程 OpenAI：一次 batch 请求（省 API 调用次数）
```

## 9.6 模型切换处理

如果用户从 Ollama 切换到 OpenAI（或反过来），embedding 维度不同，旧的向量就废了。

**处理策略：**

```
启动时检查 index.json 的 model 字段
  ├─ 和当前 embedding 模型一致 → 正常使用
  └─ 不一致 → 需要重建索引
     → 前端提示："embedding 模型已变更，需要重建记忆索引。
        这会重新计算所有记忆的向量，大约需要 X 秒。"
     → 用户确认 → 遍历所有 entries/ → 重新计算 embedding → 写入新 index.json
```

记忆内容（entries/）不受影响，只是向量需要重算。

## 9.7 性能预估

| 操作 | 数据量 | 耗时（本地 Ollama） | 耗时（远程 OpenAI） |
|------|--------|-------------------|-------------------|
| 单条 embedding | 1 条 | ~50ms | ~200ms |
| 检索 | 500 条 | < 5ms | < 5ms（内存计算） |
| 批量写入 | 5 条 | ~250ms | ~400ms |
| 索引重建 | 500 条 | ~25s | ~30s |

对于桌面应用来说，这些延迟用户几乎无感（检索在 transformContext 里异步执行，不阻塞 UI）。

## 9.8 文件结构

```
src/
  memory/
    index.ts            # 记忆系统对外接口
    vector-store.ts     # 向量存储：加载、检索、添加、删除
    embedding.ts        # Embedding 封装：Ollama / OpenAI，自动选择
    extractor.ts        # 记忆提取：对话 → LLM 分析 → 结构化记忆
    memory-file.ts      # MEMORY.md 索引读写
```
