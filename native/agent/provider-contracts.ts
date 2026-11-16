export type ProviderType =
  | "anthropic"
  | "openai"
  | "google"
  | "openai-compatible";

export type ProviderSourceKind = "builtin" | "custom";
export type ProviderSourceMode = "native" | "custom";

export type ModelCapabilities = {
  vision: boolean | null;
  imageOutput: boolean | null;
  toolCalling: boolean | null;
  reasoning: boolean | null;
  embedding: boolean | null;
};

export type ModelCapabilitiesOverride = ModelCapabilities;

export type ModelLimits = {
  contextWindow: number | null;
  maxOutputTokens: number | null;
};

export type ModelLimitsOverride = ModelLimits;

export type ProviderSource = {
  id: string;
  name: string;
  kind: ProviderSourceKind;
  providerType: ProviderType;
  mode: ProviderSourceMode;
  enabled: boolean;
  baseUrl: string | null;
};

export type ModelEntry = {
  id: string;
  sourceId: string;
  name: string;
  modelId: string;
  enabled: boolean;
  builtin: boolean;
  capabilities: ModelCapabilitiesOverride;
  limits: ModelLimitsOverride;
  providerOptions: Record<string, unknown> | null;
  detectedCapabilities: ModelCapabilities;
  detectedLimits: ModelLimits;
};

export function getRuntimeApiForProviderType(providerType: ProviderType):
  | "anthropic-messages"
  | "openai-responses"
  | "google-generative-ai"
  | "openai-completions" {
  switch (providerType) {
    case "anthropic":
      return "anthropic-messages";
    case "openai":
      return "openai-responses";
    case "google":
      return "google-generative-ai";
    case "openai-compatible":
      return "openai-completions";
  }
}
