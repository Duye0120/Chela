import { createReadinessEvent } from "./sanitize.js";
import { ReadinessTraceStore } from "./trace-store.js";
import type { ReadinessComponent, ReadinessTraceEvent, ReadinessTraceStatus } from "./types.js";

export const READINESS_BUS_EVENTS = {
  RUN_CREATED: "run:created",
  RUN_STARTED: "run:started",
  RUN_STATE_CHANGED: "run:state_changed",
  RUN_CANCEL_REQUESTED: "run:cancel_requested",
  RUN_COMPLETED: "run:completed",
  RUN_ABORTED: "run:aborted",
  RUN_FAILED: "run:failed",
  TOOL_EXECUTING: "tool:executing",
  TOOL_COMPLETED: "tool:completed",
  TOOL_FAILED: "tool:failed",
  TOOL_POLICY_EVALUATED: "tool:policy_evaluated",
  APPROVAL_REQUESTED: "approval:requested",
  APPROVAL_RESOLVED: "approval:resolved",
} as const;

type ReadinessBusEventName = (typeof READINESS_BUS_EVENTS)[keyof typeof READINESS_BUS_EVENTS];
type BusLike = {
  onAny(handler: (event: string, data: unknown) => void): () => void;
};

const EVENT_COMPONENTS: Partial<Record<ReadinessBusEventName, ReadinessComponent>> = {
  [READINESS_BUS_EVENTS.RUN_CREATED]: "runtime",
  [READINESS_BUS_EVENTS.RUN_STARTED]: "runtime",
  [READINESS_BUS_EVENTS.RUN_STATE_CHANGED]: "runtime",
  [READINESS_BUS_EVENTS.RUN_CANCEL_REQUESTED]: "runtime",
  [READINESS_BUS_EVENTS.RUN_COMPLETED]: "runtime",
  [READINESS_BUS_EVENTS.RUN_ABORTED]: "runtime",
  [READINESS_BUS_EVENTS.RUN_FAILED]: "runtime",
  [READINESS_BUS_EVENTS.TOOL_POLICY_EVALUATED]: "tool_policy",
  [READINESS_BUS_EVENTS.TOOL_EXECUTING]: "tool_execution",
  [READINESS_BUS_EVENTS.TOOL_COMPLETED]: "tool_execution",
  [READINESS_BUS_EVENTS.TOOL_FAILED]: "tool_execution",
  [READINESS_BUS_EVENTS.APPROVAL_REQUESTED]: "approval",
  [READINESS_BUS_EVENTS.APPROVAL_RESOLVED]: "approval",
};

const EVENT_TYPES: Partial<Record<ReadinessBusEventName, string>> = {
  [READINESS_BUS_EVENTS.RUN_CREATED]: "run_created",
  [READINESS_BUS_EVENTS.RUN_STARTED]: "run_started",
  [READINESS_BUS_EVENTS.RUN_STATE_CHANGED]: "run_state_changed",
  [READINESS_BUS_EVENTS.RUN_CANCEL_REQUESTED]: "run_cancel_requested",
  [READINESS_BUS_EVENTS.RUN_COMPLETED]: "run_completed",
  [READINESS_BUS_EVENTS.RUN_ABORTED]: "run_aborted",
  [READINESS_BUS_EVENTS.RUN_FAILED]: "run_failed",
  [READINESS_BUS_EVENTS.TOOL_POLICY_EVALUATED]: "tool_policy_evaluated",
  [READINESS_BUS_EVENTS.TOOL_EXECUTING]: "tool_executing",
  [READINESS_BUS_EVENTS.TOOL_COMPLETED]: "tool_completed",
  [READINESS_BUS_EVENTS.TOOL_FAILED]: "tool_failed",
  [READINESS_BUS_EVENTS.APPROVAL_REQUESTED]: "approval_requested",
  [READINESS_BUS_EVENTS.APPROVAL_RESOLVED]: "approval_resolved",
};

export type ReadinessTraceRecorderOptions = {
  store?: ReadinessTraceStore;
  filePath?: string;
  bus?: BusLike;
  now?: () => number;
};

export class ReadinessTraceRecorder {
  private readonly store: ReadinessTraceStore;
  private readonly now: () => number;
  private readonly bus?: BusLike;
  private unsubscribe?: () => void;
  private sequence = 0;
  private readonly pendingWrites = new Set<Promise<void>>();

  constructor(options: ReadinessTraceRecorderOptions = {}) {
    const filePath = options.filePath ?? process.env.CHELA_READINESS_TRACE_PATH;
    if (!options.store && !filePath) {
      throw new Error("ReadinessTraceRecorder requires store or filePath");
    }
    this.store = options.store ?? new ReadinessTraceStore(filePath!);
    this.bus = options.bus;
    this.now = options.now ?? Date.now;
  }

  init(): void {
    if (this.unsubscribe) {
      return;
    }

    if (!this.bus) {
      throw new Error("ReadinessTraceRecorder.init requires a bus instance");
    }

    this.unsubscribe = this.bus.onAny((eventName, payload) => {
      const event = this.toReadinessEvent(eventName as ReadinessBusEventName, payload);
      if (!event) {
        return;
      }
      const write = this.store.appendEvent(event).finally(() => {
        this.pendingWrites.delete(write);
      });
      this.pendingWrites.add(write);
    });
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }

  async flush(): Promise<void> {
    await Promise.all(Array.from(this.pendingWrites));
  }

  toReadinessEvent(eventName: ReadinessBusEventName, payload: unknown): ReadinessTraceEvent | null {
    const component = EVENT_COMPONENTS[eventName];
    const eventType = EVENT_TYPES[eventName];
    if (!component || !eventType || !isRecord(payload)) {
      return null;
    }

    const sessionId = readString(payload.sessionId) ?? "unknown-session";
    const runId = readString(payload.runId) ?? `${eventName}:no-run`;
    const timestamp = this.now();
    const eventId = `${eventType}:${runId}:${timestamp}:${this.sequence++}`;

    return createReadinessEvent({
      traceId: `run:${runId}`,
      runId,
      sessionId,
      eventId,
      eventType,
      component,
      ts: timestamp,
      status: statusForEvent(eventName, payload),
      modelEntryId: readString(payload.modelEntryId),
      toolName: readString(payload.toolName),
      decision: decisionForEvent(eventName, payload),
      riskLevel: readString(payload.riskLevel),
      policyViolation: policyViolationForEvent(eventName, payload),
      data: safeDataForEvent(eventName, payload),
    });
  }
}

function statusForEvent(eventName: ReadinessBusEventName, payload: Record<string, unknown>): ReadinessTraceStatus {
  if (eventName === READINESS_BUS_EVENTS.RUN_FAILED || eventName === READINESS_BUS_EVENTS.TOOL_FAILED) {
    return "error";
  }
  if (eventName === READINESS_BUS_EVENTS.RUN_ABORTED || eventName === READINESS_BUS_EVENTS.RUN_CANCEL_REQUESTED) {
    return "cancelled";
  }
  if (eventName === READINESS_BUS_EVENTS.RUN_COMPLETED) {
    return readString(payload.finalState) === "completed" ? "success" : "error";
  }
  if (eventName === READINESS_BUS_EVENTS.APPROVAL_RESOLVED) {
    return "success";
  }
  if (eventName === READINESS_BUS_EVENTS.RUN_CREATED || eventName === READINESS_BUS_EVENTS.TOOL_EXECUTING || eventName === READINESS_BUS_EVENTS.APPROVAL_REQUESTED) {
    return "pending";
  }
  return "success";
}

function decisionForEvent(eventName: ReadinessBusEventName, payload: Record<string, unknown>): string | undefined {
  if (eventName === READINESS_BUS_EVENTS.APPROVAL_RESOLVED) {
    return payload.allowed === true ? "allow" : "deny";
  }
  return readString(payload.decision);
}

function policyViolationForEvent(eventName: ReadinessBusEventName, payload: Record<string, unknown>): boolean | undefined {
  if (eventName !== READINESS_BUS_EVENTS.TOOL_POLICY_EVALUATED) {
    return undefined;
  }
  return readString(payload.decision) === "allow" && readString(payload.riskLevel) === "high";
}

function safeDataForEvent(eventName: ReadinessBusEventName, payload: Record<string, unknown>): Record<string, unknown> {
  switch (eventName) {
    case READINESS_BUS_EVENTS.RUN_CREATED:
      return pick(payload, ["runKind", "lane"]);
    case READINESS_BUS_EVENTS.RUN_STATE_CHANGED:
      return pick(payload, ["state", "currentStepId"]);
    case READINESS_BUS_EVENTS.RUN_COMPLETED:
      return pick(payload, ["finalState"]);
    case READINESS_BUS_EVENTS.TOOL_FAILED:
      return { errorKind: "tool_failed" };
    case READINESS_BUS_EVENTS.RUN_FAILED:
      return { errorKind: "run_failed" };
    case READINESS_BUS_EVENTS.RUN_ABORTED:
      return { errorKind: "run_aborted" };
    case READINESS_BUS_EVENTS.APPROVAL_RESOLVED:
      return { allowed: payload.allowed === true };
    default:
      return {};
  }
}

function pick(source: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const key of keys) {
    if (source[key] !== undefined) {
      output[key] = source[key];
    }
  }
  return output;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
