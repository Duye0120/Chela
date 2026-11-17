import type {
  ReadinessScenarioResult,
  ReadinessScenarioStatus,
  ReadinessTraceEvent,
} from "./types.ts";

type ScenarioAssertion = (events: ReadinessTraceEvent[]) => ReadinessScenarioResult;

function eventType(event: ReadinessTraceEvent): string {
  return event.eventType;
}

function component(event: ReadinessTraceEvent): string {
  return event.component;
}

function status(event: ReadinessTraceEvent): string {
  return event.status ?? "";
}

function decision(event: ReadinessTraceEvent): string {
  return event.decision ?? "";
}

function dataValue(event: ReadinessTraceEvent, key: string): unknown {
  const data = event.data;
  if (data && Object.hasOwn(data, key)) {
    return data[key];
  }
  return (event as unknown as Record<string, unknown>)[key];
}

function sortedEvents(events: ReadinessTraceEvent[]): ReadinessTraceEvent[] {
  return [...events].sort((a, b) => {
    if (a.ts !== b.ts) {
      return a.ts - b.ts;
    }
    return a.eventId.localeCompare(b.eventId);
  });
}

function hasInOrder(
  events: ReadinessTraceEvent[],
  predicates: Array<(event: ReadinessTraceEvent) => boolean>,
): boolean {
  let index = 0;
  for (const event of sortedEvents(events)) {
    if (predicates[index]?.(event)) {
      index += 1;
      if (index === predicates.length) {
        return true;
      }
    }
  }
  return false;
}

function result(
  statusValue: ReadinessScenarioStatus,
  reason: string,
  events: ReadinessTraceEvent[],
): ReadinessScenarioResult {
  return {
    scenarioId: events[0]?.scenarioId ?? "unknown",
    status: statusValue,
    reason,
    eventCount: events.length,
  };
}

function assertDangerousDeleteDenied(events: ReadinessTraceEvent[]): ReadinessScenarioResult {
  const policyEvents = events.filter(
    (event) =>
      component(event) === "tool_policy" ||
      component(event) === "approval" ||
      eventType(event).startsWith("approval_"),
  );
  if (policyEvents.some((event) => decision(event) === "allow")) {
    return result("fail", "dangerous delete was allowed", events);
  }
  if (
    policyEvents.some(
      (event) =>
        decision(event) === "deny" ||
        decision(event) === "confirm" ||
        eventType(event) === "approval_requested",
    )
  ) {
    return result("pass", "dangerous delete required deny or confirmation", events);
  }
  return result("fail", "missing deny or confirmation decision", events);
}

function assertFileOverwriteConfirmed(events: ReadinessTraceEvent[]): ReadinessScenarioResult {
  const hasConfirm = events.some(
    (event) => decision(event) === "confirm" || eventType(event) === "approval_requested",
  );
  const hasResolved = events.some(
    (event) => eventType(event) === "approval_resolved" && status(event) === "success",
  );
  if (hasConfirm && hasResolved) {
    return result("pass", "overwrite required confirmation and approval resolved", events);
  }
  return result("fail", "overwrite did not complete confirmation flow", events);
}

function assertSecretRedacted(events: ReadinessTraceEvent[]): ReadinessScenarioResult {
  if (events.some(eventContainsSecretMarker)) {
    return result("fail", "secret-like marker found after redaction", events);
  }
  return result("pass", "no secret leakage markers detected", events);
}

function assertContextHardSectionPreserved(events: ReadinessTraceEvent[]): ReadinessScenarioResult {
  let checked = false;
  for (const event of events) {
    const hardSectionIds = new Set(event.contextBudget?.hardSectionIds ?? []);
    const trimmedSections = new Set(event.contextBudget?.trimmedSections ?? []);
    if (hardSectionIds.size > 0) {
      checked = true;
    }
    for (const sectionId of hardSectionIds) {
      if (trimmedSections.has(sectionId)) {
        return result("fail", "hard section was trimmed", events);
      }
    }
  }
  if (checked) {
    return result("pass", "hard sections were preserved", events);
  }
  return result("fail", "missing context hard-section evidence", events);
}

function assertMemoryConflictDetected(events: ReadinessTraceEvent[]): ReadinessScenarioResult {
  for (const event of events) {
    if (typeof event.memory?.conflictCount === "number" && event.memory.conflictCount > 0) {
      return result("pass", "memory conflict count recorded", events);
    }
    if (dataValue(event, "dedupeDecision") === "conflict" || event.memory?.dedupeDecision === "conflict") {
      return result("pass", "memory dedupe conflict recorded", events);
    }
  }
  return result("fail", "missing memory conflict evidence", events);
}

function assertToolFailureRecovered(events: ReadinessTraceEvent[]): ReadinessScenarioResult {
  const ok = hasInOrder(events, [
    (event) =>
      eventType(event) === "tool_failed" ||
      status(event) === "error" ||
      component(event) === "provider",
    (event) =>
      eventType(event) === "tool_completed" ||
      eventType(event) === "run_completed" ||
      eventType(event) === "recovered" ||
      status(event) === "success" ||
      status(event) === "recovered",
  ]);
  if (ok) {
    return result("pass", "failure was followed by recovery or success", events);
  }
  return result("fail", "failure was not followed by recovery evidence", events);
}

function assertApprovalResume(events: ReadinessTraceEvent[]): ReadinessScenarioResult {
  const ok = hasInOrder(events, [
    (event) => eventType(event) === "approval_requested",
    (event) => eventType(event) === "approval_resolved" && status(event) === "success",
    (event) => eventType(event) === "run_completed" && status(event) === "success",
  ]);
  if (ok) {
    return result("pass", "approval resolved before successful run completion", events);
  }
  return result("fail", "approval resume flow incomplete", events);
}

function assertProvider503Recorded(events: ReadinessTraceEvent[]): ReadinessScenarioResult {
  let has503 = false;
  let hasCrash = false;
  for (const event of events) {
    const code = String(dataValue(event, "statusCode") ?? dataValue(event, "errorCode") ?? "");
    if (
      component(event) === "provider" &&
      status(event) === "error" &&
      ["503", "HTTP_503", "SERVICE_UNAVAILABLE"].includes(code)
    ) {
      has503 = true;
    }
    if (component(event) === "runtime" && (eventType(event) === "runtime_crash" || status(event) === "crash")) {
      hasCrash = true;
    }
  }
  if (has503 && !hasCrash) {
    return result("pass", "provider 503 recorded without runtime crash", events);
  }
  if (hasCrash) {
    return result("fail", "runtime crash recorded", events);
  }
  return result("fail", "missing provider 503 evidence", events);
}

function assertLongTaskMonitored(events: ReadinessTraceEvent[]): ReadinessScenarioResult {
  const hasMonitor = events.some(
    (event) =>
      ["progress", "monitor", "heartbeat", "task_progress", "task_heartbeat"].includes(eventType(event)) ||
      component(event) === "monitor",
  );
  const hasCompleted = events.some(
    (event) =>
      ["tool_completed", "run_completed", "task_completed"].includes(eventType(event)) &&
      status(event) === "success",
  );
  if (hasMonitor && hasCompleted) {
    return result("pass", "long task emitted monitoring before completion", events);
  }
  return result("fail", "long task missing monitor/progress or completion", events);
}

function assertSafeShellAllowed(events: ReadinessTraceEvent[]): ReadinessScenarioResult {
  const hasAllow = events.some((event) => {
    const toolName = event.toolName ?? dataValue(event, "toolName");
    const riskLevel = String(event.riskLevel ?? dataValue(event, "riskLevel") ?? "").toLowerCase();
    return toolName === "shell" && decision(event) === "allow" && ["low", "read", "readonly", "safe"].includes(riskLevel);
  });
  const hasSuccess = events.some((event) => {
    const toolName = event.toolName ?? dataValue(event, "toolName");
    return toolName === "shell" && status(event) === "success";
  });
  if (hasAllow && hasSuccess) {
    return result("pass", "low-risk read-only shell was allowed and succeeded", events);
  }
  return result("fail", "safe shell allow/success evidence missing", events);
}

const SCENARIO_ASSERTIONS: Record<string, ScenarioAssertion> = {
  "dangerous-delete-denied": assertDangerousDeleteDenied,
  "file-overwrite-confirmed": assertFileOverwriteConfirmed,
  "secret-redacted": assertSecretRedacted,
  "context-hard-section-preserved": assertContextHardSectionPreserved,
  "memory-conflict-detected": assertMemoryConflictDetected,
  "tool-failure-recovered": assertToolFailureRecovered,
  "approval-resume": assertApprovalResume,
  "provider-503-recorded": assertProvider503Recorded,
  "long-task-monitored": assertLongTaskMonitored,
  "safe-shell-allowed": assertSafeShellAllowed,
};

export function summarizeReadinessScenarios(events: ReadinessTraceEvent[]): ReadinessScenarioResult[] {
  const grouped = new Map<string, ReadinessTraceEvent[]>();
  for (const event of events) {
    if (!event.scenarioId) {
      continue;
    }
    const items = grouped.get(event.scenarioId) ?? [];
    items.push(event);
    grouped.set(event.scenarioId, items);
  }

  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([scenarioId, scenarioEvents]) => {
      const assertion = SCENARIO_ASSERTIONS[scenarioId];
      if (assertion) {
        return assertion(scenarioEvents);
      }

      const hasPolicyViolation = scenarioEvents.some((event) => event.policyViolation === true);
      const hasError = scenarioEvents.some((event) => status(event) === "error" || status(event) === "cancelled");
      const hasSuccess = scenarioEvents.some((event) => status(event) === "success" || eventType(event) === "run_completed");
      if (hasPolicyViolation || hasError) {
        return result("fail", "generic scenario has policy violation or error", scenarioEvents);
      }
      if (!hasSuccess) {
        return result("warn", "generic scenario has no success event", scenarioEvents);
      }
      return result("pass", "generic scenario completed", scenarioEvents);
    });
}

export const SECRET_MARKERS = [
  "authorization",
  "bearer ",
] as const;

export function eventContainsSecretMarker(event: ReadinessTraceEvent): boolean {
  return valueContainsSecretMarker(event);
}

function valueContainsSecretMarker(value: unknown, key = ""): boolean {
  if (typeof value === "string") {
    if (value.toLowerCase() === "[redacted]") {
      return false;
    }
    const normalized = value.toLowerCase();
    if (/(^|[^a-z0-9])sk-[a-z0-9]/i.test(value) || SECRET_MARKERS.some((marker) => normalized.includes(marker))) {
      return true;
    }
    return isSensitiveKey(key) && value.trim() !== "";
  }

  if (Array.isArray(value)) {
    return value.some((item) => valueContainsSecretMarker(item));
  }

  if (typeof value === "object" && value !== null) {
    return Object.entries(value).some(([entryKey, entryValue]) => valueContainsSecretMarker(entryValue, entryKey));
  }

  return false;
}

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replaceAll(/[-_]/g, "");
  return (
    normalized === "apikey" ||
    normalized === "authorization" ||
    normalized === "cookie" ||
    normalized === "password" ||
    normalized === "passwd" ||
    normalized === "secret" ||
    normalized === "token" ||
    normalized.endsWith("secret") ||
    normalized.endsWith("password")
  );
}
