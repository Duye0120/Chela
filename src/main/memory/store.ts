import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type {
  MemoryAddInput,
  MemoryMetadata,
  MemoryRecord,
} from "../../shared/contracts.js";

type MemoryRow = {
  id: number;
  content: string;
  embedding: string;
  metadata: string | null;
  created_at: string;
};

type MemoryMetaRow = {
  value: string;
};

export type MemoryStoreStats = {
  totalMemories: number;
  indexedModelId: string | null;
  lastIndexedAt: string | null;
  lastRebuiltAt: string | null;
};

export type StoredMemoryCandidate = {
  id: number;
  content: string;
  embedding: string;
  metadata: MemoryMetadata | null;
  createdAt: string;
};

export type StoredMemoryEmbeddingUpdate = {
  id: number;
  embedding: number[];
};

function ensureParentDir(filePath: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
}

function parseMetadata(value: string | null): MemoryMetadata | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object"
      ? (parsed as MemoryMetadata)
      : null;
  } catch {
    return null;
  }
}

function normalizeRecord(row: MemoryRow): MemoryRecord {
  return {
    id: row.id,
    content: row.content,
    metadata: parseMetadata(row.metadata),
    createdAt: row.created_at,
  };
}

export class MemoryStore {
  private readonly db: Database.Database;

  constructor(private readonly dbPath: string) {
    ensureParentDir(dbPath);
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT NOT NULL,
        embedding TEXT NOT NULL,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_memories_created_at
      ON memories (created_at DESC);

      CREATE TABLE IF NOT EXISTS memory_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  getPath(): string {
    return this.dbPath;
  }

  add(
    input: MemoryAddInput,
    embedding: number[],
    modelId: string,
  ): MemoryRecord {
    const metadataJson = input.metadata
      ? JSON.stringify(input.metadata)
      : null;
    const embeddingJson = JSON.stringify(embedding);
    const insert = this.db.prepare(`
      INSERT INTO memories (content, embedding, metadata)
      VALUES (?, ?, ?)
    `);
    const result = insert.run(input.content, embeddingJson, metadataJson);
    this.setMeta("indexed_model_id", modelId);
    this.setMeta("last_indexed_at", new Date().toISOString());

    const row = this.db
      .prepare(`
        SELECT id, content, embedding, metadata, created_at
        FROM memories
        WHERE id = ?
      `)
      .get(result.lastInsertRowid) as MemoryRow | undefined;

    if (!row) {
      throw new Error("Memory inserted but could not be reloaded.");
    }

    return normalizeRecord(row);
  }

  addMany(
    entries: Array<{ input: MemoryAddInput; embedding: number[] }>,
    modelId: string,
  ): number {
    if (entries.length === 0) {
      return 0;
    }

    const insert = this.db.prepare(`
      INSERT INTO memories (content, embedding, metadata)
      VALUES (?, ?, ?)
    `);
    const transaction = this.db.transaction(
      (
        batch: Array<{
          input: MemoryAddInput;
          embedding: number[];
        }>,
      ) => {
        for (const entry of batch) {
          insert.run(
            entry.input.content,
            JSON.stringify(entry.embedding),
            entry.input.metadata ? JSON.stringify(entry.input.metadata) : null,
          );
        }
      },
    );

    transaction(entries);
    this.setMeta("indexed_model_id", modelId);
    this.setMeta("last_indexed_at", new Date().toISOString());

    return entries.length;
  }

  listCandidates(limit: number): StoredMemoryCandidate[] {
    const rows = this.db
      .prepare(`
        SELECT id, content, embedding, metadata, created_at
        FROM memories
        ORDER BY created_at DESC
        LIMIT ?
      `)
      .all(limit) as MemoryRow[];

    return rows.map((row) => ({
      id: row.id,
      content: row.content,
      embedding: row.embedding,
      metadata: parseMetadata(row.metadata),
      createdAt: row.created_at,
    }));
  }

  listAllCandidates(): StoredMemoryCandidate[] {
    const rows = this.db
      .prepare(`
        SELECT id, content, embedding, metadata, created_at
        FROM memories
        ORDER BY id ASC
      `)
      .all() as MemoryRow[];

    return rows.map((row) => ({
      id: row.id,
      content: row.content,
      embedding: row.embedding,
      metadata: parseMetadata(row.metadata),
      createdAt: row.created_at,
    }));
  }

  rebuildEmbeddings(
    updates: StoredMemoryEmbeddingUpdate[],
    modelId: string,
  ): number {
    if (updates.length === 0) {
      this.setMeta("indexed_model_id", modelId);
      this.setMeta("last_rebuilt_at", new Date().toISOString());
      return 0;
    }

    const update = this.db.prepare(`
      UPDATE memories
      SET embedding = ?
      WHERE id = ?
    `);

    const transaction = this.db.transaction(
      (items: StoredMemoryEmbeddingUpdate[]) => {
        for (const item of items) {
          update.run(JSON.stringify(item.embedding), item.id);
        }
      },
    );

    transaction(updates);
    this.setMeta("indexed_model_id", modelId);
    this.setMeta("last_indexed_at", new Date().toISOString());
    this.setMeta("last_rebuilt_at", new Date().toISOString());

    return updates.length;
  }

  getStats(): MemoryStoreStats {
    const row = this.db
      .prepare(`SELECT COUNT(*) as total FROM memories`)
      .get() as { total: number };

    return {
      totalMemories: row.total,
      indexedModelId: this.getMeta("indexed_model_id"),
      lastIndexedAt: this.getMeta("last_indexed_at"),
      lastRebuiltAt: this.getMeta("last_rebuilt_at"),
    };
  }

  private getMeta(key: string): string | null {
    const row = this.db
      .prepare(`
        SELECT value
        FROM memory_meta
        WHERE key = ?
      `)
      .get(key) as MemoryMetaRow | undefined;

    return row?.value ?? null;
  }

  private setMeta(key: string, value: string): void {
    this.db
      .prepare(`
        INSERT INTO memory_meta (key, value, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = CURRENT_TIMESTAMP
      `)
      .run(key, value);
  }
}
