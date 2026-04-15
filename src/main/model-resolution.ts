import type { ModelRoutingRole } from "../shared/contracts.js";
import { DEFAULT_MODEL_ENTRY_ID } from "../shared/provider-directory.js";
import { resolveModelEntry } from "./providers.js";
import { getSettings } from "./settings.js";

const FALLBACK_MODEL_ENTRY_IDS = [
  DEFAULT_MODEL_ENTRY_ID,
  "builtin:anthropic:claude-sonnet-4-20250514",
];

export type ResolvedRuntimeModel = ReturnType<typeof resolveModelEntry>;

function buildCandidateModelIds(
  role: ModelRoutingRole,
  preferredEntryId?: string | null,
): string[] {
  const settings = getSettings();
  const chatModelId = settings.modelRouting.chat.modelId;
  const roleModelId =
    role === "chat" ? chatModelId : settings.modelRouting[role].modelId;

  return [preferredEntryId, roleModelId, chatModelId, ...FALLBACK_MODEL_ENTRY_IDS]
    .filter((value, index, list): value is string =>
      typeof value === "string" &&
      value.trim().length > 0 &&
      list.findIndex((candidate) => candidate === value) === index,
    );
}

export function resolveModelForRole(
  role: ModelRoutingRole,
  preferredEntryId?: string | null,
): ResolvedRuntimeModel {
  const candidates = buildCandidateModelIds(role, preferredEntryId);

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

export function resolveRuntimeModel(
  preferredEntryId?: string | null,
): ResolvedRuntimeModel {
  return resolveModelForRole("chat", preferredEntryId);
}
