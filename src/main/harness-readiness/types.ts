export type ReadinessComponent =
  | "runtime"
  | "tool_policy"
  | "tool_execution"
  | "approval"
  | "context"
  | "context_engine"
  | "memory"
  | "monitor"
  | "adapter"
  | "provider"
  | "unknown";

export type ReadinessTraceStatus = "pending" | "success" | "error" | "cancelled";

export type ReadinessContextBudget = {
  maxTokens?: number;
  usedTokens?: number;
  hardSectionIds?: string[];
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

export type ReadinessReportVerdict = "pass" | "warn" | "fail";

export type ReadinessScenarioStatus = "pass" | "warn" | "fail";

export type ReadinessScenarioResult = {
  scenarioId: string;
  status: ReadinessScenarioStatus;
  reason: string;
  eventCount: number;
};

export type ReadinessReportDataQuality = {
  invalidJsonLines: number;
  invalidSchemaEvents: number;
};

export type ReadinessReportMetrics = {
  totalEvents: number;
  runCount: number;
  scenarioCount: number;
  workflowSuccessRate: number | null;
  toolFailRate: number | null;
  policyViolationCount: number;
  approvalRecoveryRate: number | null;
  p95LatencyMs: number | null;
  secretLeakageCount: number;
  hardSectionPreservedRate: number | null;
};

export type ReadinessReport = {
  schemaVersion: 1;
  generatedAt: string;
  input: string;
  verdict: ReadinessReportVerdict;
  metrics: ReadinessReportMetrics;
  warnings: string[];
  dataQuality: ReadinessReportDataQuality;
  scenarioResults: ReadinessScenarioResult[];
  secretLeakageEventIds: string[];
};
