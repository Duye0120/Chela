export type ReadinessComponent =
  | "runtime"
  | "tool_policy"
  | "tool_execution"
  | "approval"
  | "context"
  | "memory"
  | "adapter"
  | "provider"
  | "unknown";

export type ReadinessTraceStatus = "pending" | "success" | "error" | "cancelled";

export type ReadinessContextBudget = {
  maxTokens?: number;
  usedTokens?: number;
  trimmedSections?: string[];
};

export type ReadinessMemory = {
  hitCount?: number;
  conflictCount?: number;
  dedupeDecision?: "duplicate" | "merged" | "conflict" | "new" | string;
};

export type ReadinessRetrieval = {
  expectedHit?: boolean;
  actualHit?: boolean;
  hitRate?: number;
  groundedness?: number;
};

export type ReadinessTraceEvent = {
  schemaVersion: 1;
  traceId: string;
  runId: string;
  sessionId: string;
  scenarioId?: string;
  eventId: string;
  eventType: string;
  component: ReadinessComponent;
  ts: number;
  durationMs?: number;
  status?: ReadinessTraceStatus;

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
