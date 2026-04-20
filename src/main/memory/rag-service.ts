import { app } from "electron";
import { join } from "node:path";
import type {
  MemoryAddInput,
  MemoryRebuildResult,
  MemorySearchResult,
  MemoryStats,
} from "../../shared/contracts.js";
import { MemoryWorkerClient } from "./embedding.js";
import { getSettings } from "../settings.js";

function getMemoryDbPath(): string {
  return join(app.getPath("userData"), "chela-memory.db");
}

function getMemoryCacheDir(): string {
  return join(app.getPath("userData"), "cache", "transformers");
}

class ChelaMemoryService {
  private readonly workerClient = new MemoryWorkerClient({
    kind: "chela-memory-worker",
    dbPath: getMemoryDbPath(),
    cacheDir: getMemoryCacheDir(),
  });

  async add(input: MemoryAddInput) {
    const settings = getSettings();
    return this.workerClient.add({
      input,
      modelId: settings.memory.embeddingModelId,
    });
  }

  async search(query: string, limit = 5): Promise<MemorySearchResult[]> {
    const settings = getSettings();
    const normalizedLimit = Math.min(20, Math.max(1, Math.round(limit)));
    return this.workerClient.search({
      query,
      limit: normalizedLimit,
      candidateLimit: settings.memory.searchCandidateLimit,
      modelId: settings.memory.embeddingModelId,
    });
  }

  async getStats(): Promise<MemoryStats> {
    const settings = getSettings();
    const stats = await this.workerClient.getStats({
      selectedModelId: settings.memory.embeddingModelId,
      candidateLimit: settings.memory.searchCandidateLimit,
    });

    return {
      ...stats,
      workerState: this.workerClient.getState(),
    };
  }

  async rebuild(): Promise<MemoryRebuildResult> {
    const settings = getSettings();
    return this.workerClient.rebuild({
      modelId: settings.memory.embeddingModelId,
    });
  }
}

const chelaMemoryService = new ChelaMemoryService();

export function getChelaMemoryService(): ChelaMemoryService {
  return chelaMemoryService;
}
