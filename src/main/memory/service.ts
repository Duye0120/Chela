import { app } from "electron";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { appLogger } from "../logger.js";

// ---------------------------------------------------------------------------
// Hard limits — aligned with Claude Code memdir philosophy
// ---------------------------------------------------------------------------

/** MEMORY.md 索引入口最大行数 */
const MAX_INDEX_LINES = 200;
/** MEMORY.md 索引入口最大字节 */
const MAX_INDEX_BYTES = 25_000;
/** 单个 topic 文件最大字节 */
const MAX_TOPIC_FILE_BYTES = 50_000;
/** prompt 注入时总字符数上限（约 3K tokens） */
const MAX_PROMPT_SECTION_CHARS = 6_000;
/** 搜索最大返回条目数 */
const MAX_SEARCH_RESULTS = 8;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MemdirEntry = {
  /** 一行摘要 */
  summary: string;
  /** 所属 topic（文件名，不含 .md） */
  topic: string;
  /** 来源：agent / user / system */
  source: string;
};

export type MemdirSaveInput = {
  /** 一句话摘要，要清晰、具体、可独立理解 */
  summary: string;
  /** topic 分类（如 preferences / architecture / conventions） */
  topic: string;
  /** 详细内容（可选，不填则只在索引中记一行） */
  detail?: string;
  /** 来源 */
  source?: string;
};

export type MemdirSearchResult = {
  summary: string;
  topic: string;
  score: number;
  detail?: string;
};

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

function getMemoryDir(): string {
  return join(app.getPath("userData"), "data", "memory");
}

function getIndexPath(): string {
  return join(getMemoryDir(), "MEMORY.md");
}

function getTopicsDir(): string {
  return join(getMemoryDir(), "topics");
}

function getTopicFilePath(topic: string): string {
  const safeName = topic.replace(/[^a-zA-Z0-9_\-\u4e00-\u9fff]/g, "_");
  return join(getTopicsDir(), `${safeName}.md`);
}

// ---------------------------------------------------------------------------
// File I/O helpers
// ---------------------------------------------------------------------------

function ensureDir(dirPath: string): void {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

function atomicWrite(filePath: string, data: string): void {
  ensureDir(dirname(filePath));
  const tempPath = filePath + ".tmp";
  writeFileSync(tempPath, data, "utf-8");
  renameSync(tempPath, filePath);
}

function safeReadFile(filePath: string): string {
  if (!existsSync(filePath)) return "";
  try {
    return readFileSync(filePath, "utf-8");
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// MEMORY.md index parser / writer
// ---------------------------------------------------------------------------

type IndexEntry = {
  summary: string;
  topic: string;
};

function parseIndex(content: string): IndexEntry[] {
  const entries: IndexEntry[] = [];
  for (const line of content.split("\n")) {
    // 格式：- <summary> [→ topics/<topic>.md]
    const match = line.match(
      /^-\s+(.+?)\s+\[→\s*topics\/([^\]]+?)\.md\]\s*$/,
    );
    if (match) {
      entries.push({ summary: match[1].trim(), topic: match[2].trim() });
    }
  }
  return entries;
}

function renderIndex(entries: IndexEntry[]): string {
  const lines = ["# Long-term Memory Index", ""];

  // 按 topic 分组
  const grouped = new Map<string, string[]>();
  for (const entry of entries) {
    const list = grouped.get(entry.topic) ?? [];
    list.push(entry.summary);
    grouped.set(entry.topic, list);
  }

  for (const [topic, summaries] of grouped) {
    lines.push(`## ${topic}`);
    for (const summary of summaries) {
      lines.push(`- ${summary} [→ topics/${topic}.md]`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Topic file helpers
// ---------------------------------------------------------------------------

function readTopicFile(topic: string): string {
  return safeReadFile(getTopicFilePath(topic));
}

function appendToTopicFile(
  topic: string,
  summary: string,
  detail: string | undefined,
  source: string,
): void {
  const filePath = getTopicFilePath(topic);
  const existing = safeReadFile(filePath);

  const timestamp = new Date().toISOString().replace("T", " ").slice(0, 19);
  const block = [
    `### ${summary}`,
    `_source: ${source} | saved: ${timestamp}_`,
    "",
    detail ? detail : "_（无详细正文）_",
    "",
  ].join("\n");

  let newContent: string;
  if (!existing.trim()) {
    // 新文件
    newContent = `# ${topic}\n\n${block}`;
  } else {
    newContent = existing.trimEnd() + "\n\n" + block;
  }

  // 硬限制
  const bytes = Buffer.byteLength(newContent, "utf-8");
  if (bytes > MAX_TOPIC_FILE_BYTES) {
    appLogger.info({
      scope: "memdir",
      message: `Topic file '${topic}' exceeds ${MAX_TOPIC_FILE_BYTES} bytes, truncating oldest entries`,
    });
    // 截断策略：保留后半部分（较新的记忆）
    const lines = newContent.split("\n");
    const halfStart = Math.floor(lines.length / 2);
    newContent = `# ${topic}\n\n_（早期记忆已被截断）_\n\n` + lines.slice(halfStart).join("\n");
  }

  atomicWrite(filePath, newContent);
}

// ---------------------------------------------------------------------------
// Keyword search scoring
// ---------------------------------------------------------------------------

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((tok) => tok.length > 1);
}

function computeScore(text: string, queryTokens: string[]): number {
  if (queryTokens.length === 0) return 0;
  const haystack = text.toLowerCase();
  let matched = 0;
  for (const token of queryTokens) {
    if (haystack.includes(token)) matched++;
  }
  return matched / queryTokens.length;
}

// ---------------------------------------------------------------------------
// MemdirStore — 核心类
// ---------------------------------------------------------------------------

class MemdirStore {
  private indexCache: IndexEntry[] | null = null;

  private loadIndex(): IndexEntry[] {
    if (this.indexCache) return this.indexCache;
    const content = safeReadFile(getIndexPath());
    this.indexCache = parseIndex(content);
    return this.indexCache;
  }

  private invalidateCache(): void {
    this.indexCache = null;
  }

  isEnabled(): boolean {
    return true;
  }

  /** 保存一条记忆：写 topic 文件 → 更新索引 */
  save(input: MemdirSaveInput): MemdirEntry {
    const topic = input.topic || "general";
    const source = input.source || "agent";
    const summary = input.summary.trim();

    // Step 1: 写入 topic 文件
    appendToTopicFile(topic, summary, input.detail, source);

    // Step 2: 更新索引
    const entries = this.loadIndex();

    // 去重：同 topic 下相同摘要不重复添加
    const duplicate = entries.find(
      (e) =>
        e.topic === topic &&
        e.summary.toLowerCase() === summary.toLowerCase(),
    );
    if (!duplicate) {
      entries.push({ summary, topic });
    }

    // 硬限制检查
    this.enforceIndexLimits(entries);
    atomicWrite(getIndexPath(), renderIndex(entries));
    this.invalidateCache();

    appLogger.info({
      scope: "memdir",
      message: "Memory saved",
      data: { topic, summary: summary.slice(0, 80) },
    });

    return { summary, topic, source };
  }

  /** 删除一条索引记录 */
  remove(summary: string, topic: string): boolean {
    const entries = this.loadIndex();
    const before = entries.length;
    const filtered = entries.filter(
      (e) =>
        !(
          e.topic === topic &&
          e.summary.toLowerCase() === summary.toLowerCase()
        ),
    );
    if (filtered.length === before) return false;
    atomicWrite(getIndexPath(), renderIndex(filtered));
    this.invalidateCache();
    return true;
  }

  /** 搜索：对索引条目 + topic 正文做关键词匹配 */
  search(query: string, limit?: number): MemdirSearchResult[] {
    const entries = this.loadIndex();
    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) return [];

    const cap = limit ?? MAX_SEARCH_RESULTS;
    const results: MemdirSearchResult[] = [];

    for (const entry of entries) {
      const indexScore = computeScore(
        entry.summary + " " + entry.topic,
        queryTokens,
      );
      if (indexScore > 0) {
        results.push({
          summary: entry.summary,
          topic: entry.topic,
          score: indexScore,
        });
      }
    }

    // 对高分结果补充 topic 文件正文
    results.sort((a, b) => b.score - a.score);
    const topResults = results.slice(0, cap);

    // 加载命中 topic 的正文片段
    const loadedTopics = new Set<string>();
    for (const result of topResults) {
      if (loadedTopics.has(result.topic)) continue;
      loadedTopics.add(result.topic);
      const content = readTopicFile(result.topic);
      if (content) {
        // 从正文中找到与该 summary 对应的段落
        const detailBlock = extractDetailBlock(content, result.summary);
        if (detailBlock) {
          result.detail = detailBlock;
        }
      }
    }

    return topResults;
  }

  /** 列出所有索引条目 */
  listIndex(): IndexEntry[] {
    return [...this.loadIndex()];
  }

  /** 列出所有 topic 文件名 */
  listTopics(): string[] {
    const dir = getTopicsDir();
    if (!existsSync(dir)) return [];
    try {
      return readdirSync(dir)
        .filter((f) => f.endsWith(".md"))
        .map((f) => f.replace(/\.md$/, ""));
    } catch {
      return [];
    }
  }

  /** 读取完整 topic 文件 */
  readTopic(topic: string): string {
    return readTopicFile(topic);
  }

  /** 获取当前索引的原始 markdown 内容 */
  getIndexContent(): string {
    return safeReadFile(getIndexPath());
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  private enforceIndexLimits(entries: IndexEntry[]): void {
    // 行数限制
    while (entries.length > MAX_INDEX_LINES) {
      entries.shift(); // 移除最早的
    }

    // 字节限制
    let rendered = renderIndex(entries);
    while (
      Buffer.byteLength(rendered, "utf-8") > MAX_INDEX_BYTES &&
      entries.length > 0
    ) {
      entries.shift();
      rendered = renderIndex(entries);
    }
  }
}

/** 从 topic 文件正文中提取与 summary 匹配的段落 */
function extractDetailBlock(
  content: string,
  summary: string,
): string | undefined {
  const lines = content.split("\n");
  const normalizedSummary = summary.toLowerCase().trim();
  let startIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("### ")) {
      const heading = lines[i].replace(/^###\s+/, "").toLowerCase().trim();
      if (heading === normalizedSummary) {
        startIndex = i;
        break;
      }
    }
  }

  if (startIndex < 0) return undefined;

  // 收集到下一个 ### 或文件结束
  const blockLines: string[] = [];
  for (let i = startIndex + 1; i < lines.length; i++) {
    if (lines[i].startsWith("### ")) break;
    blockLines.push(lines[i]);
  }

  const block = blockLines.join("\n").trim();
  return block || undefined;
}

// ---------------------------------------------------------------------------
// buildMemoryInstructions — 教模型如何正确保存记忆
// ---------------------------------------------------------------------------

export function buildMemoryInstructions(): string {
  return [
    "## 长期记忆系统",
    "",
    "你有一个文件化的长期记忆系统（memdir），用于保存跨会话有价值的信息。",
    "",
    "### 保存纪律",
    "- **只保存长期有价值的事实**：用户偏好、项目约定、架构决定、反复出现的模式",
    "- **不要保存临时信息**：当前任务进度、计划、待办事项、一次性指令",
    "- **每条记忆需要一个 topic 分类**：如 preferences、architecture、conventions、workflow、project-structure",
    "- **摘要必须一句话、可独立理解**：不依赖上下文就能明白含义",
    "- **有详细内容时补充 detail**：detail 会写入 topic 文件供后续深度检索",
    "",
    "### 使用 memory_save 工具",
    "```",
    'memory_save({ summary: "用户偏好用 pnpm 而非 npm", topic: "preferences" })',
    'memory_save({ summary: "项目使用四层架构拆分", topic: "architecture", detail: "Harness Runtime / Context Engine / Memory System / Transcript Persistence" })',
    "```",
    "",
    "### 不该保存的",
    "- 当前对话的上下文（session memory 会处理）",
    "- 任务计划或待办（用 todo 工具）",
    "- 代码片段（存在文件里更好）",
    "- 显而易见的事实（不需要记忆来提醒）",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Singleton & public API
// ---------------------------------------------------------------------------

const memdirStore = new MemdirStore();

export async function getSemanticMemoryPromptSection(input: {
  sessionId: string;
  query: string | null;
}): Promise<string> {
  const query = input.query?.trim();

  // 冷启动（无 query）也注入记忆使用纪律 + 索引概览
  if (!query) {
    const indexContent = memdirStore.getIndexContent().trim();
    const parts: string[] = [buildMemoryInstructions()];
    if (indexContent) {
      parts.push("");
      parts.push("## 已有记忆索引");
      const indexLines = indexContent.split("\n");
      if (indexLines.length > 20) {
        parts.push(indexLines.slice(0, 20).join("\n"));
        parts.push(`_（共 ${indexLines.length} 行，已截断显示前 20 行）_`);
      } else {
        parts.push(indexContent);
      }
    }
    return parts.join("\n");
  }

  // 有 query 时：加载索引 + 搜索命中
  const indexContent = memdirStore.getIndexContent().trim();
  const results = memdirStore.search(query);

  const parts: string[] = [];

  // Part 1: 记忆使用纪律
  parts.push(buildMemoryInstructions());

  // Part 2: 索引概览（如果有记忆）
  if (indexContent) {
    parts.push("");
    parts.push("## 已有记忆索引");
    // 控制注入大小
    const indexLines = indexContent.split("\n");
    if (indexLines.length > 30) {
      parts.push(indexLines.slice(0, 30).join("\n"));
      parts.push(`_（共 ${indexLines.length} 行，已截断显示前 30 行）_`);
    } else {
      parts.push(indexContent);
    }
  }

  // Part 3: 搜索命中的相关记忆（含 detail）
  if (results.length > 0) {
    parts.push("");
    parts.push("## 与当前话题相关的记忆");
    let totalChars = 0;
    for (const result of results) {
      const line = `- **[${result.topic}]** ${result.summary}`;
      totalChars += line.length;
      if (totalChars > MAX_PROMPT_SECTION_CHARS) break;

      parts.push(line);
      if (result.detail) {
        const detailPreview =
          result.detail.length > 300
            ? result.detail.slice(0, 300) + "…"
            : result.detail;
        parts.push(`  > ${detailPreview.replace(/\n/g, "\n  > ")}`);
        totalChars += detailPreview.length;
      }
    }
  }

  return parts.join("\n");
}

export function getMemdirStore(): MemdirStore {
  return memdirStore;
}

// 向后兼容的别名
export { memdirStore as t1MemoryStore };
