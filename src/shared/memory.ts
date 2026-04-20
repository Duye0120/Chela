export const MEMORY_EMBEDDING_MODELS = [
  {
    id: "Xenova/bge-small-zh",
    label: "bge-small-zh",
    description: "本地中文语义向量模型（@xenova/transformers）",
  },
] as const;

export type MemoryEmbeddingModelId =
  (typeof MEMORY_EMBEDDING_MODELS)[number]["id"];

export const DEFAULT_MEMORY_EMBEDDING_MODEL_ID: MemoryEmbeddingModelId =
  MEMORY_EMBEDDING_MODELS[0].id;

export const DEFAULT_MEMORY_SEARCH_CANDIDATE_LIMIT = 500;
