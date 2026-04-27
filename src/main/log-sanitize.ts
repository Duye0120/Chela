export type SerializedLogError = {
  name: string;
  message: string;
  stack?: string;
  cause?: unknown;
};

const REDACT_KEYS = [
  "apikey",
  "api_key",
  "authorization",
  "token",
  "password",
  "secret",
  "credential",
];

const INLINE_SECRET_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  {
    pattern: /\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{12,}\b/g,
    replacement: "[redacted-api-key]",
  },
  {
    pattern: /\bAIza[0-9A-Za-z\-_]{20,}\b/g,
    replacement: "[redacted-api-key]",
  },
  {
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9._-]{8,}\.[A-Za-z0-9._-]{8,}\b/g,
    replacement: "[redacted-jwt]",
  },
  {
    pattern: /\bBearer\s+[A-Za-z0-9._-]{16,}\b/gi,
    replacement: "Bearer [redacted]",
  },
];

export function isPlainLogObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function shouldRedact(key: string): boolean {
  const normalized = key.replace(/[^a-z_]/gi, "").toLowerCase();
  return REDACT_KEYS.some((candidate) => normalized.includes(candidate));
}

export function sanitizeStringForLog(value: string): string {
  let next = value;

  for (const { pattern, replacement } of INLINE_SECRET_PATTERNS) {
    next = next.replace(pattern, replacement);
  }

  return next.length <= 500 ? next : next.slice(0, 500) + "…";
}

export function sanitizeLogMessage(value: string): string {
  return sanitizeStringForLog(value);
}

export function sanitizeForLog(value: unknown, depth = 0): unknown {
  if (depth > 4) {
    return "[truncated]";
  }

  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "string") {
    return sanitizeStringForLog(value);
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (typeof value === "function") {
    return `[function ${value.name || "anonymous"}]`;
  }

  if (value instanceof Error) {
    return serializeLogError(value);
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeForLog(item, depth + 1));
  }

  if (!isPlainLogObject(value)) {
    return sanitizeStringForLog(String(value));
  }

  const next: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    next[key] = shouldRedact(key)
      ? "[redacted]"
      : sanitizeForLog(nested, depth + 1);
  }
  return next;
}

export function sanitizeLogValue(value: unknown): unknown {
  return sanitizeForLog(value);
}

export function serializeLogError(error: unknown): SerializedLogError {
  if (error instanceof Error) {
    const serialized: SerializedLogError = {
      name: error.name,
      message: sanitizeStringForLog(error.message),
      stack: error.stack ? sanitizeStringForLog(error.stack) : undefined,
    };

    const withCause = error as Error & { cause?: unknown };
    if (withCause.cause !== undefined) {
      serialized.cause = sanitizeForLog(withCause.cause);
    }

    return serialized;
  }

  return {
    name: "NonError",
    message:
      typeof error === "string"
        ? sanitizeStringForLog(error)
        : sanitizeStringForLog(JSON.stringify(sanitizeForLog(error))),
  };
}
