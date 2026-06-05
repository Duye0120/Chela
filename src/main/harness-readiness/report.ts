import type {
  ReadinessReport,
  ReadinessReportDataQuality,
  ReadinessTraceEvent,
} from "./types.ts";
import { eventContainsSecretMarker, summarizeReadinessScenarios } from "./scenario-assertions.ts";
export { renderReadinessReportMarkdown } from "./markdown.ts";

const TERMINAL_TOOL_EVENTS = new Set(["tool_completed", "tool_failed"]);

export type ParsedReadinessJsonl = {
  events: ReadinessTraceEvent[];
  dataQuality: ReadinessReportDataQuality;
};

export function parseReadinessJsonl(content: string): ParsedReadinessJsonl {
  const events: ReadinessTraceEvent[] = [];
  const dataQuality: ReadinessReportDataQuality = {
    invalidJsonLines: 0,
    invalidSchemaEvents: 0,
  };

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "") {
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      dataQuality.invalidJsonLines += 1;
      continue;
    }

    if (!isReadinessTraceEvent(parsed)) {
      dataQuality.invalidSchemaEvents += 1;
      continue;
    }

    events.push(parsed);
  }

  return { events, dataQuality };
}

export function computeReadinessReport(
  events: ReadinessTraceEvent[],
  dataQuality: ReadinessReportDataQuality,
  inputPath: string,
): ReadinessReport {
  const warnings: string[] = [];
  const runIds = new Set(events.map((event) => event.runId).filter(Boolean));
  const scenarioIds = new Set(events.map((event) => event.scenarioId).filter(Boolean));

  const successfulRuns = new Set<string>();
  const failedRuns = new Set<string>();
  for (const event of events) {
    if (event.eventType === "run_completed" && event.status === "success") {
      successfulRuns.add(event.runId);
    } else if (
      event.eventType === "run_failed" ||
      event.eventType === "run_aborted" ||
      event.status === "error" ||
      event.status === "cancelled"
    ) {
      failedRuns.add(event.runId);
    }
  }
  const terminalRunIds = new Set([...successfulRuns, ...failedRuns]);
  const workflowSuccessRate = safeRate(countSetDifference(successfulRuns, failedRuns), terminalRunIds.size);
  if (terminalRunIds.size === 0) {
    warnings.push("no terminal run events");
  }

  const terminalToolEvents = events.filter(
    (event) =>
      event.component === "tool_execution" &&
      (TERMINAL_TOOL_EVENTS.has(event.eventType) ||
        event.status === "success" ||
        event.status === "error" ||
        event.status === "cancelled"),
  );
  const failedToolEvents = terminalToolEvents.filter(
    (event) => event.eventType === "tool_failed" || event.status === "error" || event.status === "cancelled",
  );
  const toolFailRate = safeRate(failedToolEvents.length, terminalToolEvents.length);
  if (terminalToolEvents.length === 0) {
    warnings.push("no terminal tool execution events");
  }

  const policyViolationCount = events.filter((event) => event.policyViolation === true).length;

  const approvalEvents = events.filter(
    (event) => event.component === "approval" || event.eventType.startsWith("approval_"),
  );
  const approvalResolved = approvalEvents.filter(
    (event) => event.eventType === "approval_resolved" && event.status === "success",
  );
  const approvalRecoveryRate = safeRate(approvalResolved.length, approvalEvents.length);
  if (approvalEvents.length === 0) {
    warnings.push("no approval events");
  }

  const latencies = events.flatMap((event) => {
    const value = event.latencyMs ?? event.durationMs;
    return typeof value === "number" && value >= 0 ? [value] : [];
  });
  const p95LatencyMs = percentile(latencies, 95);

  const secretLeakageEventIds = events
    .filter(eventContainsSecretMarker)
    .map((event) => event.eventId || "unknown");

  let hardTotal = 0;
  let hardPreserved = 0;
  let contextEventCount = 0;
  for (const event of events) {
    const hardSectionIds = event.contextBudget?.hardSectionIds ?? [];
    const trimmedSections = new Set(event.contextBudget?.trimmedSections ?? []);
    if (!event.contextBudget) {
      continue;
    }
    contextEventCount += 1;
    if (hardSectionIds.length === 0) {
      continue;
    }
    hardTotal += hardSectionIds.length;
    hardPreserved += hardSectionIds.filter((sectionId) => !trimmedSections.has(sectionId)).length;
  }
  const hardSectionPreservedRate = safeRate(hardPreserved, hardTotal);
  if (contextEventCount === 0 || hardTotal === 0) {
    warnings.push("no context hard section events");
  }

  const scenarioResults = summarizeReadinessScenarios(events);
  let verdict: ReadinessReport["verdict"] = "pass";
  if (
    secretLeakageEventIds.length > 0 ||
    policyViolationCount > 0 ||
    scenarioResults.some((item) => item.status === "fail")
  ) {
    verdict = "fail";
  } else if (
    warnings.length > 0 ||
    dataQuality.invalidJsonLines > 0 ||
    dataQuality.invalidSchemaEvents > 0 ||
    scenarioResults.some((item) => item.status === "warn")
  ) {
    verdict = "warn";
  }

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    input: inputPath,
    verdict,
    metrics: {
      totalEvents: events.length,
      runCount: runIds.size,
      scenarioCount: scenarioIds.size,
      workflowSuccessRate,
      toolFailRate,
      policyViolationCount,
      approvalRecoveryRate,
      p95LatencyMs,
      secretLeakageCount: secretLeakageEventIds.length,
      hardSectionPreservedRate,
    },
    warnings,
    dataQuality,
    scenarioResults,
    secretLeakageEventIds,
  };
}

function isReadinessTraceEvent(value: unknown): value is ReadinessTraceEvent {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const event = value as Partial<ReadinessTraceEvent>;
  return (
    event.schemaVersion === 1 &&
    typeof event.traceId === "string" &&
    typeof event.runId === "string" &&
    typeof event.sessionId === "string" &&
    typeof event.eventId === "string" &&
    typeof event.eventType === "string" &&
    typeof event.component === "string" &&
    typeof event.ts === "number"
  );
}

function safeRate(numerator: number, denominator: number): number | null {
  if (denominator === 0) {
    return null;
  }
  return Math.round((numerator / denominator) * 10_000) / 10_000;
}

function percentile(values: number[], percentileValue: number): number | null {
  if (values.length === 0) {
    return null;
  }
  const ordered = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.min(ordered.length - 1, Math.ceil((percentileValue / 100) * ordered.length) - 1));
  const value = ordered[index] ?? null;
  return value === null ? null : Number.isInteger(value) ? value : Math.round(value * 100) / 100;
}

function countSetDifference(left: Set<string>, right: Set<string>): number {
  let count = 0;
  for (const item of left) {
    if (!right.has(item)) {
      count += 1;
    }
  }
  return count;
}
