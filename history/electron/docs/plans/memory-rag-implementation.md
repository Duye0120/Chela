# Chela Memory 系统实施计划 (Local-First RAG)

> **状态**: 待执行  
> **目标**: 在 Chela (Electron + TS) 中实现一套开箱即用、无外部依赖的本地记忆系统，支持语义检索与上下文增强。

## 1. 核心目标
- 实现本地文本向量化存储与语义检索（RAG 基础链路）
- 纯 TypeScript / Electron 技术栈，不依赖外部 Python 环境或重型数据库
- 保证 UI 主线程流畅，模型推理与检索操作必须在 Worker 线程或异步隔离环境中运行
- 支持开箱即用（安装包内自带轻量模型），并预留 Ollama 等外部协议扩展位

## 2. 技术选型 (决策点)
| 模块 | 选型 | 理由 |
|:---|:---|:---|
| **向量化引擎** | `@xenova/transformers` + `Xenova/bge-small-zh` | 纯 JS 推理，自动下载缓存，中文效果好，包体小 (~50MB) |
| **持久化存储** | `better-sqlite3` | 同步高性能，Electron 兼容性好，生态成熟 |
| **向量检索** | 内存级余弦相似度 (纯 TS 计算) | 避免 `sqlite-vec` 等 C 扩展的跨平台编译地狱，万级数据量毫秒级响应 |
| **并发隔离** | `worker_threads` | 防止模型加载和推理阻塞 Electron 主进程 Event Loop |

## 3. 实施步骤 (Task Breakdown)

### Phase 1: 基础设施搭建
- [ ] 安装依赖：`@xenova/transformers`, `better-sqlite3`, `@types/better-sqlite3`
- [ ] 在 `src/main/memory/` 下建立模块目录
- [ ] 配置 `electron-builder` 或 `vite` 插件，确保 SQLite 原生模块能正确编译/打包（注意 `better-sqlite3` 的 `electron-rebuild` 或 `prebuild-install` 配置）

### Phase 2: Embedding 服务 (大脑)
- **文件**: `src/main/memory/embedding.ts`
- [ ] 封装 `EmbeddingService` 单例类
- [ ] 实现懒加载：首次调用时初始化 `pipeline('feature-extraction', 'Xenova/bge-small-zh')`
- [ ] 实现 `encode(text: string): Promise<number[]>`，返回 L2 归一化向量
- [ ] **关键**: 使用 `worker_threads` 包装推理逻辑，主进程通过 `postMessage` 通信

### Phase 3: 存储层 (海马体)
- **文件**: `src/main/memory/store.ts`
- [ ] 初始化 SQLite 数据库路径：`app.getPath('userData')/chela-memory.db`
- [ ] 创建表结构：
  ```sql
  CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      embedding TEXT NOT NULL,        -- JSON 字符串
      metadata TEXT,                  -- JSON 对象 (timestamp, type, source等)
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  ```
- [ ] 实现 `add(content: string, metadata?: Record<string, any>): Promise<void>`
- [ ] 实现批量写入优化（事务包装）

### Phase 4: 检索层 (回忆)
- **文件**: `src/main/memory/retrieval.ts`
- [ ] 实现 `search(query: string, limit: number = 5): Promise<Memory[]>`
  1. 调用 EmbeddingService 将 query 转为向量
  2. 从 DB 拉取候选记录（建议按时间过滤或限制总数，避免全表加载）
  3. 在内存中计算余弦相似度：`(A·B) / (||A|| * ||B||)`
  4. 排序并返回 Top-K
- [ ] **优化**: 增加 Query 向量缓存，避免重复计算相同问题

### Phase 5: 集成与 IPC
- [ ] 在 `src/main/index.ts` (或对应入口) 注册 IPC 通道: `memory:add`, `memory:search`
- [ ] 使用 `ipcMain.handle` 处理异步请求，做好 try/catch 错误边界
- [ ] 暴露类型安全的 Preload API 给 Renderer 进程

## 4. 给 Codex 的执行 Prompt
*(直接复制以下区块丢给 Codex)*

```markdown
# Task: Implement Local-First RAG Memory System for Chela

**Role:** Expert Electron & AI Systems Architect
**Tech Stack:** TypeScript, Electron, `better-sqlite3`, `@xenova/transformers`

## Requirements
1. **Embedding**: Use `@xenova/transformers` with `Xenova/bge-small-zh`. Run inference inside `worker_threads` to keep UI responsive.
2. **Storage**: Use `better-sqlite3` in `src/main/memory/`. Store embeddings as JSON text. Path: `app.getPath('userData')/chela-memory.db`.
3. **Retrieval**: Implement pure TS Cosine Similarity search. Target performance: <50ms for <5000 records.
4. **Structure**: Modularize under `src/main/memory/` (`embedding.ts`, `store.ts`, `retrieval.ts`).
5. **Integration**: Register `ipcMain.handle('memory:add')` and `ipcMain.handle('memory:search')`. Add proper error handling.

## Execution Order
1. Add dependencies & verify native module build config (`better-sqlite3` needs `electron-builder` native deps handling).
2. Create DB schema & CRUD in `store.ts`.
3. Implement `embedding.ts` with worker thread isolation.
4. Implement `retrieval.ts` with similarity math & caching.
5. Wire up IPC in main process entry file.
6. Add a test script or console log flow to verify end-to-end.

**Constraints:**
- Strict TypeScript types. No `any`.
- Never block the main thread. Use async/await properly.
- Handle worker initialization errors gracefully (fallback to mock or retry).
- Do not modify unrelated UI or routing code.
```

## 5. 验收与避坑指南 (Owner 必看)
- 🚨 **打包坑**: `better-sqlite3` 是原生模块，必须配置 `electron-builder` 的 `extraResources` 或使用 `@electron/rebuild`，否则打包后运行会报 `Module not found`。
- 🚨 **模型缓存**: `@xenova/transformers` 默认缓存路径可能在 `~/.cache` 或 `C:\Users\...\AppData\Local\...`，需确保 Electron 有权限读写，或配置 `env.cacheDir` 指向 `app.getPath('userData')`。
- ✅ **性能验证**: 首次启动加载模型需 2~5 秒，后续查询应 <100ms。若主线程卡顿，检查 Worker 通信是否同步阻塞。
- ✅ **数据安全**: 向量文件包含在 `userData` 中，卸载软件时会一并清理，符合隐私预期。

---
*创建于: 2026-04-21 | 状态: 待 Codex 执行*