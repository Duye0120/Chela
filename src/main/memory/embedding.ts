import { randomUUID } from "node:crypto";
import {
  Worker,
  isMainThread,
  parentPort,
  workerData,
} from "node:worker_threads";
import type {
  MemoryAddInput,
  MemoryListInput,
  MemoryRebuildResult,
  MemoryRecord,
  MemorySearchResult,
  MemoryStats,
} from "../../shared/contracts.js";
import type { MemoryEmbeddingModelId } from "../../shared/memory.js";
import { appLogger } from "../logger.js";
import { QueryVectorCache, rankMemories } from "./retrieval.js";
import { MemoryStore } from "./store.js";

type WorkerState = MemoryStats["workerState"];

type MemoryWorkerInitData = {
  kind: "chela-memory-worker";
  dbPath: string;
  cacheDir: string;
};

type AddRequest = {
  id: string;
  type: "add";
  payload: {
    input: MemoryAddInput;
    modelId: MemoryEmbeddingModelId;
  };
};

type SearchRequest = {
  id: string;
  type: "search";
  payload: {
    query: string;
    limit: number;
    candidateLimit: number;
    minScore: number;
    modelId: MemoryEmbeddingModelId;
  };
};

type StatsRequest = {
  id: string;
  type: "stats";
  payload: {
    selectedModelId: MemoryEmbeddingModelId;
    candidateLimit: number;
  };
};

type ListRequest = {
  id: string;
  type: "list";
  payload: {
    input?: MemoryListInput;
  };
};

type RebuildRequest = {
  id: string;
  type: "rebuild";
  payload: {
    modelId: MemoryEmbeddingModelId;
  };
};

type MemoryWorkerRequest =
  | AddRequest
  | SearchRequest
  | StatsRequest
  | ListRequest
  | RebuildRequest;

type ReadyMessage = {
  type: "ready";
};

type SuccessResponse =
  | {
      id: string;
      ok: true;
      result: MemoryRecord;
    }
  | {
      id: string;
      ok: true;
      result: MemorySearchResult[];
    }
  | {
      id: string;
      ok: true;
      result: MemoryRecord[];
    }
  | {
      id: string;
      ok: true;
      result: Omit<MemoryStats, "workerState">;
    }
  | {
      id: string;
      ok: true;
      result: MemoryRebuildResult;
    };

type ErrorResponse = {
  id: string;
  ok: false;
  error: string;
};

type MemoryWorkerResultResponse = SuccessResponse | ErrorResponse;
type MemoryWorkerResponse = MemoryWorkerResultResponse | ReadyMessage;

type PendingRequest<T> = {
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

type FeatureExtractionResult = {
  data: ArrayLike<number>;
};

type FeatureExtractionPipeline = (
  input: string,
  options: { pooling: "mean"; normalize: boolean },
) => Promise<FeatureExtractionResult>;

type TransformersModule = {
  env: {
    allowLocalModels?: boolean;
    allowRemoteModels?: boolean;
    cacheDir?: string;
  };
  pipeline: (
    task: "feature-extraction",
    modelId: string,
  ) => Promise<FeatureExtractionPipeline>;
};

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeVector(vector: number[]): number[] {
  let magnitude = 0;
  for (const value of vector) {
    magnitude += value * value;
  }

  if (magnitude === 0) {
    return vector.map(() => 0);
  }

  const denominator = Math.sqrt(magnitude);
  return vector.map((value) => value / denominator);
}

async function createEmbeddingRuntime(cacheDir: string) {
  let activeModelId: string | null = null;
  let pipelinePromise: Promise<FeatureExtractionPipeline> | null = null;
  let modelLoaded = false;

  async function getPipeline(
    modelId: MemoryEmbeddingModelId,
  ): Promise<FeatureExtractionPipeline> {
    if (activeModelId === modelId && pipelinePromise) {
      return pipelinePromise;
    }

    pipelinePromise = (async () => {
      try {
        const transformers = await import("@xenova/transformers") as unknown as TransformersModule;
        transformers.env.cacheDir = cacheDir;
        transformers.env.allowLocalModels = true;
        transformers.env.allowRemoteModels = true;
        const pipeline = await transformers.pipeline(
          "feature-extraction",
          modelId,
        );
        modelLoaded = true;
        return pipeline;
      } catch (error) {
        activeModelId = null;
        pipelinePromise = null;
        modelLoaded = false;
        throw error;
      }
    })();
    activeModelId = modelId;
    return pipelinePromise;
  }

  return {
    async encode(
      text: string,
      modelId: MemoryEmbeddingModelId,
    ): Promise<number[]> {
      const pipeline = await getPipeline(modelId);
      const result = await pipeline(text, {
        pooling: "mean",
        normalize: true,
      });
      return normalizeVector(Array.from(result.data, (value) => Number(value)));
    },
    isModelLoaded(): boolean {
      return modelLoaded;
    },
  };
}

async function startMemoryWorker(data: MemoryWorkerInitData): Promise<void> {
  const port = parentPort;
  if (!port) {
    throw new Error("Chela memory worker missing parent port.");
  }

  const store = new MemoryStore(data.dbPath);
  const embeddingRuntime = await createEmbeddingRuntime(data.cacheDir);
  const queryCache = new QueryVectorCache();
  let queue = Promise.resolve();

  const getQueryVector = async (
    query: string,
    modelId: MemoryEmbeddingModelId,
  ): Promise<number[]> => {
    const cached = queryCache.get(query, modelId);
    if (cached) {
      return cached;
    }

    const nextVector = await embeddingRuntime.encode(query, modelId);
    queryCache.set(query, modelId, nextVector);
    return nextVector;
  };

  const handleRequest = async (
    request: MemoryWorkerRequest,
  ): Promise<MemoryWorkerResultResponse> => {
    switch (request.type) {
      case "add": {
        const content = normalizeText(request.payload.input.content);
        if (!content) {
          throw new Error("Memory content cannot be empty.");
        }

        const record = store.add(
          {
            content,
            metadata: request.payload.input.metadata ?? null,
          },
          await embeddingRuntime.encode(content, request.payload.modelId),
          request.payload.modelId,
        );

        return { id: request.id, ok: true, result: record };
      }

      case "search": {
        const query = normalizeText(request.payload.query);
        if (!query) {
          return { id: request.id, ok: true, result: [] };
        }

        const queryVector = await getQueryVector(query, request.payload.modelId);
        const candidates = store.listCandidates(request.payload.candidateLimit);
        const results = rankMemories(
          queryVector,
          candidates,
          request.payload.limit,
        ).filter((result) => result.score >= request.payload.minScore);
        store.recordMatches(results.map((result) => result.id));

        return { id: request.id, ok: true, result: results };
      }

      case "stats": {
        const stats = store.getStats();
        return {
          id: request.id,
          ok: true,
          result: {
            ...stats,
            dbPath: store.getPath(),
            selectedModelId: request.payload.selectedModelId,
            modelLoaded: embeddingRuntime.isModelLoaded(),
            candidateLimit: request.payload.candidateLimit,
          },
        };
      }

      case "list": {
        const limit = Math.min(
          200,
          Math.max(1, Math.round(request.payload.input?.limit ?? 80)),
        );
        const sort = request.payload.input?.sort ?? "confidence_desc";
        return {
          id: request.id,
          ok: true,
          result: store.listMemories({
            sort,
            limit,
          }),
        };
      }

      case "rebuild": {
        const candidates = store.listAllCandidates();
        const updates: Array<{ id: number; embedding: number[] }> = [];

        for (const candidate of candidates) {
          updates.push({
            id: candidate.id,
            embedding: await embeddingRuntime.encode(
              candidate.content,
              request.payload.modelId,
            ),
          });
        }

        queryCache.clear();
        const updatedCount = store.rebuildEmbeddings(
          updates,
          request.payload.modelId,
        );
        const completedAt = new Date().toISOString();
        return {
          id: request.id,
          ok: true,
          result: {
            rebuiltCount: updatedCount,
            modelId: request.payload.modelId,
            completedAt,
          },
        };
      }
    }
  };

  port.postMessage({ type: "ready" } satisfies ReadyMessage);

  port.on("message", (request: MemoryWorkerRequest) => {
    queue = queue
      .then(async () => {
        try {
          port.postMessage(await handleRequest(request));
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Chela memory worker failed.";
          port.postMessage({
            id: request.id,
            ok: false,
            error: message,
          } satisfies ErrorResponse);
        }
      })
      .catch((error) => {
        const message =
          error instanceof Error ? error.message : "Chela memory worker queue failed.";
        port.postMessage({
          id: request.id,
          ok: false,
          error: message,
        } satisfies ErrorResponse);
      });
  });
}

function isWorkerBootstrapData(value: unknown): value is MemoryWorkerInitData {
  return (
    !!value &&
    typeof value === "object" &&
    "kind" in value &&
    value.kind === "chela-memory-worker"
  );
}

function isReadyMessage(message: MemoryWorkerResponse): message is ReadyMessage {
  return "type" in message && message.type === "ready";
}

export class MemoryWorkerClient {
  private worker: Worker | null = null;
  private readyPromise: Promise<void> | null = null;
  private state: WorkerState = "idle";
  private readonly pending = new Map<string, PendingRequest<unknown>>();

  constructor(private readonly initData: MemoryWorkerInitData) {}

  getState(): WorkerState {
    return this.state;
  }

  async add(input: {
    input: MemoryAddInput;
    modelId: MemoryEmbeddingModelId;
  }): Promise<MemoryRecord> {
    return this.call<MemoryRecord>({
      id: randomUUID(),
      type: "add",
      payload: input,
    });
  }

  async search(input: {
    query: string;
    limit: number;
    candidateLimit: number;
    minScore: number;
    modelId: MemoryEmbeddingModelId;
  }): Promise<MemorySearchResult[]> {
    return this.call<MemorySearchResult[]>({
      id: randomUUID(),
      type: "search",
      payload: input,
    });
  }

  async getStats(input: {
    selectedModelId: MemoryEmbeddingModelId;
    candidateLimit: number;
  }): Promise<Omit<MemoryStats, "workerState">> {
    return this.call<Omit<MemoryStats, "workerState">>({
      id: randomUUID(),
      type: "stats",
      payload: input,
    });
  }

  async list(input?: MemoryListInput): Promise<MemoryRecord[]> {
    return this.call<MemoryRecord[]>({
      id: randomUUID(),
      type: "list",
      payload: { input },
    });
  }

  async rebuild(input: {
    modelId: MemoryEmbeddingModelId;
  }): Promise<MemoryRebuildResult> {
    return this.call<MemoryRebuildResult>({
      id: randomUUID(),
      type: "rebuild",
      payload: input,
    });
  }

  private async ensureWorker(): Promise<Worker> {
    if (this.worker && this.readyPromise) {
      await this.readyPromise;
      return this.worker;
    }

    this.state = "starting";
    const worker = new Worker(new URL(import.meta.url), {
      workerData: this.initData,
    });
    this.worker = worker;
    this.readyPromise = new Promise<void>((resolve, reject) => {
      const handleMessage = (message: MemoryWorkerResponse) => {
        if (!isReadyMessage(message)) {
          return;
        }

        worker.off("message", handleMessage);
        this.state = "ready";
        resolve();
      };

      worker.on("message", handleMessage);
      worker.once("error", (error) => {
        worker.off("message", handleMessage);
        this.state = "error";
        reject(error);
      });
      worker.once("exit", (code) => {
        if (code !== 0) {
          worker.off("message", handleMessage);
          this.state = "error";
          reject(new Error(`Chela memory worker exited with code ${code}.`));
        }
      });
    });

    worker.on("message", (message: MemoryWorkerResponse) => {
      if (isReadyMessage(message)) {
        return;
      }

      const pending = this.pending.get(message.id);
      if (!pending) {
        return;
      }

      this.pending.delete(message.id);
      if (message.ok) {
        pending.resolve(message.result);
        return;
      }

      pending.reject(new Error(message.error));
    });

    worker.on("error", (error) => {
      this.state = "error";
      this.rejectPending(error);
      appLogger.error({
        scope: "memory.worker",
        message: "Chela memory worker crashed",
        error,
      });
    });

    worker.on("exit", (code) => {
      if (code !== 0) {
        this.state = "error";
        this.rejectPending(new Error(`Chela memory worker exited with code ${code}.`));
      } else if (this.state !== "error") {
        this.state = "idle";
      }

      this.worker = null;
      this.readyPromise = null;
    });

    await this.readyPromise;
    return worker;
  }

  private async call<T>(request: MemoryWorkerRequest): Promise<T> {
    const worker = await this.ensureWorker();

    return new Promise<T>((resolve, reject) => {
      this.pending.set(request.id, {
        resolve: resolve as PendingRequest<unknown>["resolve"],
        reject,
      });
      worker.postMessage(request);
    });
  }

  private rejectPending(error: unknown): void {
    for (const pending of this.pending.values()) {
      pending.reject(error);
    }
    this.pending.clear();
  }
}

if (!isMainThread && isWorkerBootstrapData(workerData)) {
  void startMemoryWorker(workerData).catch((error) => {
    const message =
      error instanceof Error ? error.message : "Chela memory worker bootstrap failed.";
    if (parentPort) {
      parentPort.postMessage({
        id: "bootstrap",
        ok: false,
        error: message,
      } satisfies ErrorResponse);
    }
    process.exit(1);
  });
}
