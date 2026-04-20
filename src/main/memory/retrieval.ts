import type {
  MemoryMetadata,
  MemorySearchResult,
} from "../../shared/contracts.js";
import type { StoredMemoryCandidate } from "./store.js";

type RankedCandidate = {
  id: number;
  content: string;
  metadata: MemoryMetadata | null;
  createdAt: string;
  score: number;
};

function parseVector(value: string): number[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((item) => (typeof item === "number" ? item : Number(item)))
      .filter((item) => Number.isFinite(item));
  } catch {
    return [];
  }
}

export function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length === 0 || right.length === 0 || left.length !== right.length) {
    return 0;
  }

  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    dot += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  }

  if (leftMagnitude === 0 || rightMagnitude === 0) {
    return 0;
  }

  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

export function rankMemories(
  queryVector: number[],
  candidates: StoredMemoryCandidate[],
  limit: number,
): MemorySearchResult[] {
  const ranked: RankedCandidate[] = [];

  for (const candidate of candidates) {
    const score = cosineSimilarity(queryVector, parseVector(candidate.embedding));
    if (!Number.isFinite(score) || score <= 0) {
      continue;
    }

    ranked.push({
      id: candidate.id,
      content: candidate.content,
      metadata: candidate.metadata,
      createdAt: candidate.createdAt,
      score,
    });
  }

  ranked.sort((left, right) => right.score - left.score);

  return ranked.slice(0, limit).map((item) => ({
    id: item.id,
    content: item.content,
    metadata: item.metadata,
    createdAt: item.createdAt,
    score: item.score,
  }));
}

export class QueryVectorCache {
  private readonly cache = new Map<string, number[]>();

  constructor(private readonly maxEntries = 64) {}

  get(query: string, modelId: string): number[] | null {
    const key = this.buildKey(query, modelId);
    const cached = this.cache.get(key);
    if (!cached) {
      return null;
    }

    this.cache.delete(key);
    this.cache.set(key, cached);
    return cached;
  }

  set(query: string, modelId: string, vector: number[]): void {
    const key = this.buildKey(query, modelId);
    this.cache.delete(key);
    this.cache.set(key, vector);

    if (this.cache.size <= this.maxEntries) {
      return;
    }

    const oldestKey = this.cache.keys().next().value;
    if (typeof oldestKey === "string") {
      this.cache.delete(oldestKey);
    }
  }

  clear(): void {
    this.cache.clear();
  }

  private buildKey(query: string, modelId: string): string {
    return `${modelId}::${query.trim().toLowerCase()}`;
  }
}
