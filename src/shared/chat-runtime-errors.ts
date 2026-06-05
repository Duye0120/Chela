export function formatChatRuntimeErrorMessage(error: unknown): string {
  const rawMessage = error instanceof Error ? error.message : String(error ?? "");
  const message = rawMessage.trim();
  if (!message) {
    return "执行失败，请检查当前模型配置后重试。";
  }

  if (
    /\b(401|403)\b|unauthorized|forbidden|invalid (?:access )?token|token expired|api key|invalid key|认证|鉴权/i.test(
      message,
    )
  ) {
    return `模型认证失败：${message}`;
  }

  if (/plan.*expired|expired.*plan|subscription|billing|quota|insufficient_quota|credit|credits|额度|套餐|订阅|余额|欠费/i.test(message)) {
    return `账号计划不可用：${message}`;
  }

  if (/\b404\b|model .*not found|模型.*不存在/i.test(message)) {
    return `模型不可用：${message}`;
  }

  if (/source.*禁用|已被禁用|disabled/i.test(message)) {
    return `模型源不可用：${message}`;
  }

  return `执行失败：${message}`;
}
