import { createHash } from "node:crypto";
import { getModel, type Model } from "@earendil-works/pi-ai";
import type {
  ModelCapabilities,
  ModelEntry,
  ModelLimits,
  ProviderSource,
} from "../shared/contracts.ts";
import { getRuntimeApiForProviderType } from "../shared/provider-directory.ts";
import type { CredentialsStore } from "./provider-credentials.ts";

const DEFAULT_CONTEXT_WINDOW = 128_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 8_192;

function resolveCapabilities(entry: ModelEntry): ModelCapabilities {
  return {
    vision: entry.capabilities.vision ?? entry.detectedCapabilities.vision,
    imageOutput:
      entry.capabilities.imageOutput ?? entry.detectedCapabilities.imageOutput,
    toolCalling:
      entry.capabilities.toolCalling ?? entry.detectedCapabilities.toolCalling,
    reasoning:
      entry.capabilities.reasoning ?? entry.detectedCapabilities.reasoning,
    embedding:
      entry.capabilities.embedding ?? entry.detectedCapabilities.embedding,
  };
}

function resolveLimits(entry: ModelEntry): ModelLimits {
  return {
    contextWindow:
      entry.limits.contextWindow ?? entry.detectedLimits.contextWindow,
    maxOutputTokens:
      entry.limits.maxOutputTokens ?? entry.detectedLimits.maxOutputTokens,
  };
}

function extractCompat(entry: ModelEntry): Record<string, unknown> | undefined {
  const compat = entry.providerOptions?.compat;
  if (!compat || typeof compat !== "object" || Array.isArray(compat)) {
    return undefined;
  }
  return compat as Record<string, unknown>;
}

export function isLocalOpenAiCompatibleSource(source: ProviderSource): boolean {
  if (source.providerType !== "openai-compatible" || !source.baseUrl) {
    return false;
  }

  try {
    const url = new URL(source.baseUrl);
    return (
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "::1" ||
      url.hostname === "[::1]"
    );
  } catch {
    return false;
  }
}

function inferOpenAiCompatibleCompat(
  source: ProviderSource,
): Record<string, unknown> | undefined {
  if (source.providerType !== "openai-compatible") {
    return undefined;
  }

  const baseUrl = source.baseUrl?.trim().toLowerCase();
  if (!baseUrl) {
    return undefined;
  }

  // DashScope's OpenAI-compatible endpoints reject the `developer` role and
  // follow the older `max_tokens` style rather than newer OpenAI defaults.
  if (baseUrl.includes("dashscope.aliyuncs.com")) {
    return {
      supportsStore: false,
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      maxTokensField: "max_tokens",
    };
  }

  if (isLocalOpenAiCompatibleSource(source)) {
    return {
      supportsStore: false,
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      maxTokensField: "max_tokens",
    };
  }

  return undefined;
}

export function getApiKeyForSource(
  credentials: CredentialsStore,
  source: ProviderSource,
): string {
  const apiKey = credentials[source.id]?.apiKey?.trim();
  if (apiKey) {
    return apiKey;
  }

  return isLocalOpenAiCompatibleSource(source) ? "local" : "";
}

function resolveCompat(
  source: ProviderSource,
  entry: ModelEntry,
): Record<string, unknown> | undefined {
  const inferredCompat = inferOpenAiCompatibleCompat(source);
  const explicitCompat = extractCompat(entry);

  if (!inferredCompat && !explicitCompat) {
    return undefined;
  }

  return {
    ...(inferredCompat ?? {}),
    ...(explicitCompat ?? {}),
  };
}

function extractHeaders(entry: ModelEntry): Record<string, string> | undefined {
  const headers = entry.providerOptions?.headers;
  if (!headers || typeof headers !== "object" || Array.isArray(headers)) {
    return undefined;
  }

  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers as Record<string, unknown>)) {
    if (typeof value === "string") {
      result[key] = value;
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

function buildCustomModel(source: ProviderSource, entry: ModelEntry): Model<any> {
  const capabilities = resolveCapabilities(entry);
  const limits = resolveLimits(entry);
  return {
    id: entry.modelId,
    name: entry.name,
    api: getRuntimeApiForProviderType(source.providerType),
    provider: source.providerType,
    baseUrl: source.baseUrl ?? "",
    reasoning: capabilities.reasoning ?? false,
    input: capabilities.vision ? ["text", "image"] : ["text"],
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: limits.contextWindow ?? DEFAULT_CONTEXT_WINDOW,
    maxTokens: limits.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
    headers: extractHeaders(entry),
    compat:
      source.providerType === "openai-compatible"
        ? (resolveCompat(source, entry) as any)
        : undefined,
  };
}

function buildNativeModel(source: ProviderSource, entry: ModelEntry): Model<any> {
  const baseModel = getModel(source.providerType as any, entry.modelId as never);
  if (!baseModel) {
    throw new Error(`找不到内置模型：${entry.modelId}`);
  }
  const limits = resolveLimits(entry);
  return {
    ...baseModel,
    name: entry.name,
    contextWindow: limits.contextWindow ?? baseModel.contextWindow,
    maxTokens: limits.maxOutputTokens ?? baseModel.maxTokens,
    headers: extractHeaders(entry) ?? baseModel.headers,
  };
}

export function buildProviderModel(
  source: ProviderSource,
  entry: ModelEntry,
): Model<any> {
  return source.kind === "builtin" && source.mode === "native"
    ? buildNativeModel(source, entry)
    : buildCustomModel(source, entry);
}

export function fingerprintApiKey(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex").slice(0, 16);
}
