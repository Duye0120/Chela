import { DEFAULT_MODEL_ENTRY_ID } from "../shared/provider-directory.js";
import { resolveModelEntry } from "./providers.js";
import { getSettings } from "./settings.js";

const FALLBACK_MODEL_ENTRY_IDS = [
  DEFAULT_MODEL_ENTRY_ID,
  "builtin:anthropic:claude-sonnet-4-20250514",
];

export type ResolvedRuntimeModel = ReturnType<typeof resolveModelEntry>;

export function resolveRuntimeModel(
  preferredEntryId?: string | null,
): ResolvedRuntimeModel {
  const candidates = [
    preferredEntryId,
    getSettings().defaultModelId,
    ...FALLBACK_MODEL_ENTRY_IDS,
  ].filter((value, index, list): value is string =>
    typeof value === "string" &&
    value.trim().length > 0 &&
    list.findIndex((candidate) => candidate === value) === index,
  );

  let lastError: unknown = null;
  for (const candidateId of candidates) {
    try {
      return resolveModelEntry(candidateId);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("没有可用的模型配置。");
}
