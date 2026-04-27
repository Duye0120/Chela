export type ProviderErrorCode =
  | "authentication"
  | "network"
  | "timeout"
  | "protocol"
  | "empty_models"
  | "configuration"
  | "unknown";

export type ProviderErrorInfo = {
  errorCode: ProviderErrorCode;
  error: string;
};

const PROVIDER_ERROR_LABELS: Record<ProviderErrorCode, string> = {
  authentication: "认证失败",
  network: "网络失败",
  timeout: "请求超时",
  protocol: "协议失败",
  empty_models: "模型为空",
  configuration: "配置缺失",
  unknown: "未知错误",
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message || error.name;
  }
  return String(error || "Provider 操作失败");
}

export function getProviderErrorLabel(code: ProviderErrorCode): string {
  return PROVIDER_ERROR_LABELS[code];
}

export function classifyProviderError(error: unknown): ProviderErrorInfo {
  const message = getErrorMessage(error);
  if (/AbortError|aborted|timeout|timed out|超时/i.test(message)) {
    return { errorCode: "timeout", error: message };
  }
  if (/\b(401|403)\b|unauthorized|forbidden|api key|invalid key|认证|鉴权/i.test(message)) {
    return { errorCode: "authentication", error: message };
  }
  if (/fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ECONNRESET|network|socket|DNS/i.test(message)) {
    return { errorCode: "network", error: message };
  }
  if (/JSON|schema|response|响应|协议|missing|缺少/i.test(message)) {
    return { errorCode: "protocol", error: message };
  }
  if (/API Key|baseUrl|base url|请先保存|未配置|配置/i.test(message)) {
    return { errorCode: "configuration", error: message };
  }
  return { errorCode: "unknown", error: message };
}

export function createProviderErrorResult(error: unknown): ProviderErrorInfo & {
  success: false;
} {
  return {
    success: false,
    ...classifyProviderError(error),
  };
}

export function createProviderModelsResult(models: string[]): {
  success: boolean;
  errorCode?: ProviderErrorCode;
  error?: string;
  models: string[];
} {
  if (models.length === 0) {
    return {
      success: false,
      errorCode: "empty_models",
      error: "模型列表为空。",
      models: [],
    };
  }
  return { success: true, models };
}
