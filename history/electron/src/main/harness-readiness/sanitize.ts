import type {
  ReadinessComponent,
  ReadinessContextBudget,
  ReadinessMemory,
  ReadinessRetrieval,
  ReadinessTraceEvent,
  ReadinessTraceStatus,
} from "./types.ts";

const SENSITIVE_KEY_PATTERN =
  /(^|[-_])(?:api[-_]?key|key|token|password|passwd|secret|authorization|auth|cookie|content|prompt|file[-_]?content|code|source|body|message)([-_]|$)/i;

const READINESS_COMPONENTS = new Set<ReadinessComponent>([
  "runtime",
  "tool_policy",
  "tool_execution",
  "approval",
  "context",
  "memory",
  "adapter",
  "provider",
  "unknown",
]);

const READINESS_STATUSES = new Set<ReadinessTraceStatus>([
  "pending",
  "success",
  "error",
  "cancelled",
]);

export type CreateReadinessEventInput = {
  traceId: string;
  runId: string;
  sessionId: string;
  scenarioId?: string;
  eventId: string;
  eventType: string;
  component?: ReadinessComponent | string;
  ts: number;
  durationMs?: number;
  status?: ReadinessTraceStatus | string;
  modelEntryId?: string;
  toolName?: string;
  decision?: "allow" | "confirm" | "deny" | string;
  riskLevel?: string;
  policyViolation?: boolean;
  tokenIn?: number;
  tokenOut?: number;
  estimatedCostUsd?: number;
  latencyMs?: number;
  contextBudget?: ReadinessContextBudget;
  memory?: ReadinessMemory;
  retrieval?: ReadinessRetrieval;
  data?: Record<string, unknown>;
};

export function sanitizeReadinessData(
  input: Record<string, unknown>,
): Record<string, unknown> {
  return sanitizeRecord(input, new WeakSet<object>());
}

export function createReadinessEvent(
  input: CreateReadinessEventInput,
): ReadinessTraceEvent {
  const event: ReadinessTraceEvent = {
    schemaVersion: 1,
    traceId: input.traceId,
    runId: input.runId,
    sessionId: input.sessionId,
    scenarioId: input.scenarioId,
    eventId: input.eventId,
    eventType: input.eventType,
    component: normalizeComponent(input.component),
    ts: input.ts,
    durationMs: input.durationMs,
    status: normalizeStatus(input.status),
    modelEntryId: input.modelEntryId,
    toolName: input.toolName,
    decision: input.decision,
    riskLevel: input.riskLevel,
    policyViolation: input.policyViolation,
    tokenIn: input.tokenIn,
    tokenOut: input.tokenOut,
    estimatedCostUsd: input.estimatedCostUsd,
    latencyMs: input.latencyMs,
    contextBudget: input.contextBudget,
    memory: input.memory,
    retrieval: input.retrieval,
    data: input.data === undefined ? undefined : sanitizeReadinessData(input.data),
  };

  return dropUndefined(event) as ReadinessTraceEvent;
}

export const normalizeReadinessEvent = createReadinessEvent;

function sanitizeRecord(
  input: Record<string, unknown>,
  seen: WeakSet<object>,
): Record<string, unknown> {
  if (seen.has(input)) {
    return { circular: "[REDACTED]" };
  }
  seen.add(input);

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    sanitized[key] = isSensitiveKey(key) ? "[REDACTED]" : sanitizeValue(value, seen);
  }
  return sanitized;
}

function sanitizeValue(value: unknown, seen: WeakSet<object>): unknown {
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return "[REDACTED]";
    }
    seen.add(value);
    return value.map((item) => sanitizeValue(item, seen));
  }

  if (isPlainRecord(value)) {
    return sanitizeRecord(value, seen);
  }

  return value;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERN.test(key);
}

function normalizeComponent(component: CreateReadinessEventInput["component"]): ReadinessComponent {
  if (typeof component === "string" && READINESS_COMPONENTS.has(component as ReadinessComponent)) {
    return component as ReadinessComponent;
  }
  return "unknown";
}

function normalizeStatus(status: CreateReadinessEventInput["status"]): ReadinessTraceStatus | undefined {
  if (typeof status === "string" && READINESS_STATUSES.has(status as ReadinessTraceStatus)) {
    return status as ReadinessTraceStatus;
  }
  return undefined;
}

function dropUndefined(input: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) {
      output[key] = value;
    }
  }
  return output;
}
