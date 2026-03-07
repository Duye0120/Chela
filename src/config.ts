import { getEnvApiKey, getModel, getProviders } from "@mariozechner/pi-ai";
import type { KnownProvider, Model } from "@mariozechner/pi-ai";

const DEFAULT_PROVIDER: KnownProvider = "google";
const DEFAULT_MODEL_ID = "gemini-2.5-flash-lite-preview-06-17";
const CUSTOM_OPENAI_API = "openai-completions";
const DEFAULT_CONTEXT_WINDOW = 128000;
const DEFAULT_MAX_TOKENS = 8192;
const knownProviders = new Set(getProviders());
const providerApiKeyEnvVarMap: Partial<Record<KnownProvider, string>> = {
  openai: "OPENAI_API_KEY",
  "azure-openai-responses": "AZURE_OPENAI_API_KEY",
  google: "GEMINI_API_KEY",
  groq: "GROQ_API_KEY",
  cerebras: "CEREBRAS_API_KEY",
  xai: "XAI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  "vercel-ai-gateway": "AI_GATEWAY_API_KEY",
  zai: "ZAI_API_KEY",
  mistral: "MISTRAL_API_KEY",
  minimax: "MINIMAX_API_KEY",
  "minimax-cn": "MINIMAX_CN_API_KEY",
  huggingface: "HF_TOKEN",
  opencode: "OPENCODE_API_KEY",
  "opencode-go": "OPENCODE_API_KEY",
  "kimi-coding": "KIMI_API_KEY",
};

export const fixedUserPrompt = "现在几点了？";

export type AgentRuntimeConfig = {
  provider: string;
  modelId: string;
  model: Model<any>;
  apiKey: string;
  apiKeySource: string;
  baseUrl?: string;
  isCustomModel: boolean;
};

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function isKnownProvider(provider: string): provider is KnownProvider {
  return knownProviders.has(provider as KnownProvider);
}

function getProviderCredentialHint(provider: string): string {
  if (!isKnownProvider(provider)) {
    return "PI_API_KEY";
  }

  if (provider === "google-vertex") {
    return "Google Vertex ADC(GOOGLE_APPLICATION_CREDENTIALS/GOOGLE_CLOUD_PROJECT/GOOGLE_CLOUD_LOCATION)";
  }

  if (provider === "amazon-bedrock") {
    return "AWS_PROFILE 或 AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY";
  }

  if (provider === "github-copilot") {
    return "COPILOT_GITHUB_TOKEN/GH_TOKEN/GITHUB_TOKEN";
  }

  if (provider === "anthropic") {
    return "ANTHROPIC_API_KEY 或 ANTHROPIC_OAUTH_TOKEN";
  }

  return providerApiKeyEnvVarMap[provider] ?? "PI_API_KEY";
}

function getApiKeySource(provider: string): string {
  if (readEnv("PI_API_KEY")) {
    return "PI_API_KEY";
  }

  return getProviderCredentialHint(provider);
}

function resolveApiKey(provider: string): { apiKey: string; apiKeySource: string } {
  const apiKey = readEnv("PI_API_KEY") ?? getEnvApiKey(provider);

  if (!apiKey) {
    throw new Error(
      `Missing API credential for provider "${provider}". Set PI_API_KEY or ${getProviderCredentialHint(provider)} before running "npm run dev".`,
    );
  }

  return {
    apiKey,
    apiKeySource: getApiKeySource(provider),
  };
}

function createCustomOpenAiCompatibleModel(provider: string, modelId: string, baseUrl: string): Model<any> {
  return {
    id: modelId,
    name: `${provider}:${modelId}`,
    api: CUSTOM_OPENAI_API,
    provider,
    baseUrl,
    reasoning: false,
    input: ["text"],
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: DEFAULT_CONTEXT_WINDOW,
    maxTokens: DEFAULT_MAX_TOKENS,
  };
}

export function resolveRuntimeConfig(): AgentRuntimeConfig {
  const provider = readEnv("PI_PROVIDER") ?? DEFAULT_PROVIDER;
  const modelIdFromEnv = readEnv("PI_MODEL");
  const baseUrl = readEnv("PI_BASE_URL");
  const { apiKey, apiKeySource } = resolveApiKey(provider);

  if (baseUrl) {
    const modelId = modelIdFromEnv;

    if (!modelId) {
      throw new Error('PI_MODEL is required when PI_BASE_URL is set.');
    }

    return {
      provider,
      modelId,
      model: createCustomOpenAiCompatibleModel(provider, modelId, baseUrl),
      apiKey,
      apiKeySource,
      baseUrl,
      isCustomModel: true,
    };
  }

  if (!isKnownProvider(provider)) {
    throw new Error(
      `Unknown provider "${provider}". Either use one of the built-in providers from @mariozechner/pi-ai, or set PI_BASE_URL to use a custom OpenAI-compatible endpoint.`,
    );
  }

  const modelId = modelIdFromEnv ?? (provider === DEFAULT_PROVIDER ? DEFAULT_MODEL_ID : undefined);

  if (!modelId) {
    throw new Error(
      `PI_MODEL is required when PI_PROVIDER is "${provider}". The current demo only auto-fills the default model for provider "${DEFAULT_PROVIDER}".`,
    );
  }

  return {
    provider,
    modelId,
    model: getModel(provider, modelId as never),
    apiKey,
    apiKeySource,
    isCustomModel: false,
  };
}
