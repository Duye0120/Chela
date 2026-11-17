export const MEMORY_EMBEDDING_MODELS = [
  {
    id: "Xenova/bge-small-zh",
    label: "bge-small-zh",
    description: "本地中文语义向量模型（@xenova/transformers）",
  },
] as const;

// Embedding 模型 ID 既可以是内置 transformers 模型，也可以是 provider 目录里的远端模型。
// 由于支持自定义 provider 输入任意模型 ID，这里直接用 string。
export type MemoryEmbeddingModelId = string;

export const DEFAULT_MEMORY_EMBEDDING_MODEL_ID: MemoryEmbeddingModelId =
  MEMORY_EMBEDDING_MODELS[0].id;

export const DEFAULT_MEMORY_SEARCH_CANDIDATE_LIMIT = 500;

export function isLocalEmbeddingModelId(modelId: string): boolean {
  return modelId.startsWith("Xenova/") || modelId.startsWith("xenova/");
}
