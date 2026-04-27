import type { ProviderSource } from "../shared/contracts.js";

type FetchLike = typeof fetch;

export type ProviderModelFetchOptions = {
  timeoutMs?: number;
  signal?: AbortSignal;
  fetchImpl?: FetchLike;
};

const DEFAULT_PROVIDER_FETCH_TIMEOUT_MS = 15_000;

function joinPath(baseUrl: string, suffix: string): string {
  const trimmedBase = baseUrl.replace(/\/+$/u, "");
  const trimmedSuffix = suffix.startsWith("/") ? suffix : `/${suffix}`;
  return `${trimmedBase}${trimmedSuffix}`;
}

function createTimeoutSignal(
  timeoutMs: number,
  parentSignal?: AbortSignal,
): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const abortFromParent = () => controller.abort();
  parentSignal?.addEventListener("abort", abortFromParent, { once: true });

  return {
    signal: controller.signal,
    clear: () => {
      clearTimeout(timer);
      parentSignal?.removeEventListener("abort", abortFromParent);
    },
  };
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!response.ok) {
    const snippet = text.slice(0, 240).trim();
    throw new Error(
      snippet
        ? `请求失败 ${response.status}: ${snippet}`
        : `请求失败 ${response.status}`,
    );
  }
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("响应不是合法的 JSON。");
  }
}

export async function fetchProviderModelIds(
  source: ProviderSource,
  apiKey: string,
  options: ProviderModelFetchOptions = {},
): Promise<string[]> {
  const timeout = createTimeoutSignal(
    options.timeoutMs ?? DEFAULT_PROVIDER_FETCH_TIMEOUT_MS,
    options.signal,
  );
  const fetchImpl = options.fetchImpl ?? fetch;

  try {
    if (source.providerType === "anthropic") {
      const baseUrl = source.baseUrl ?? "https://api.anthropic.com";
      const url = joinPath(baseUrl, "/v1/models");
      const response = await fetchImpl(url, {
        method: "GET",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        signal: timeout.signal,
      });
      const json = await readJson(response);
      const data = Array.isArray((json as { data?: unknown }).data)
        ? ((json as { data: unknown[] }).data)
        : [];
      return data
        .map((item) => (item as { id?: unknown }).id)
        .filter((id): id is string => typeof id === "string" && id.length > 0);
    }

    if (source.providerType === "google") {
      const baseUrl = source.baseUrl ?? "https://generativelanguage.googleapis.com";
      const url = `${joinPath(baseUrl, "/v1beta/models")}?key=${encodeURIComponent(apiKey)}&pageSize=200`;
      const response = await fetchImpl(url, {
        method: "GET",
        signal: timeout.signal,
      });
      const json = await readJson(response);
      const models = Array.isArray((json as { models?: unknown }).models)
        ? ((json as { models: unknown[] }).models)
        : [];
      return models
        .map((item) => (item as { name?: unknown }).name)
        .filter((name): name is string => typeof name === "string" && name.length > 0)
        .map((name) => name.replace(/^models\//, ""));
    }

    const baseUrl = source.baseUrl ?? "https://api.openai.com/v1";
    const url = joinPath(baseUrl, "/models");
    const response = await fetchImpl(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      signal: timeout.signal,
    });
    const json = await readJson(response);
    const data = Array.isArray((json as { data?: unknown }).data)
      ? ((json as { data: unknown[] }).data)
      : Array.isArray((json as { models?: unknown }).models)
        ? ((json as { models: unknown[] }).models)
        : [];
    return data
      .map((item) => {
        if (typeof item === "string") return item;
        const obj = item as { id?: unknown; name?: unknown; model?: unknown };
        if (typeof obj.id === "string") return obj.id;
        if (typeof obj.model === "string") return obj.model;
        if (typeof obj.name === "string") return obj.name;
        return "";
      })
      .filter((id): id is string => typeof id === "string" && id.length > 0);
  } finally {
    timeout.clear();
  }
}
