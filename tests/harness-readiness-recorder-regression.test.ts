import * as assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import type { BusEventName } from "../src/main/event-bus.js";
import { ReadinessTraceRecorder } from "../src/main/harness-readiness/trace-recorder.js";
import { ReadinessTraceStore } from "../src/main/harness-readiness/trace-store.js";
import type { ReadinessTraceEvent } from "../src/main/harness-readiness/types.js";

const TEST_EVENTS = {
  MESSAGE_USER: "message:user",
  RUN_CREATED: "run:created",
  TOOL_POLICY_EVALUATED: "tool:policy_evaluated",
  TOOL_FAILED: "tool:failed",
  APPROVAL_RESOLVED: "approval:resolved",
} as const satisfies Record<string, BusEventName>;

async function main(): Promise<void> {
  const tempDir = await mkdtemp(join(tmpdir(), "chela-readiness-recorder-"));
  try {
    const filePath = join(tempDir, "readiness.jsonl");
    const store = new ReadinessTraceStore(filePath);
    let now = 1_800_000_000_000;
    const recorder = new ReadinessTraceRecorder({ store, now: () => now++ });

    assert.equal(
      recorder.toReadinessEvent(TEST_EVENTS.MESSAGE_USER, { sessionId: "s", text: "secret prompt" }),
      null,
    );

    const runCreated = recorder.toReadinessEvent(TEST_EVENTS.RUN_CREATED, {
      sessionId: "session-1",
      runId: "run-1",
      modelEntryId: "model-a",
      runKind: "chat",
      lane: "default",
    });
    assert.ok(runCreated);
    assert.equal(runCreated.traceId, "run:run-1");
    assert.equal(runCreated.eventType, "run_created");
    assert.equal(runCreated.component, "runtime");
    assert.equal(runCreated.status, "pending");
    assert.deepEqual(runCreated.data, { runKind: "chat", lane: "default" });

    const policy = recorder.toReadinessEvent(TEST_EVENTS.TOOL_POLICY_EVALUATED, {
      sessionId: "session-1",
      runId: "run-1",
      toolName: "terminal",
      decision: "allow",
      riskLevel: "high",
      prompt: "do not leak",
    });
    assert.ok(policy);
    assert.equal(policy.component, "tool_policy");
    assert.equal(policy.decision, "allow");
    assert.equal(policy.riskLevel, "high");
    assert.equal(policy.policyViolation, true);
    assert.equal(policy.data?.prompt, undefined);

    const toolFailed = recorder.toReadinessEvent(TEST_EVENTS.TOOL_FAILED, {
      sessionId: "session-1",
      runId: "run-1",
      toolName: "terminal",
      toolCallId: "call-1",
      error: "raw error with sk-secret",
    });
    assert.ok(toolFailed);
    assert.equal(toolFailed.eventType, "tool_failed");
    assert.equal(toolFailed.status, "error");
    assert.deepEqual(toolFailed.data, { errorKind: "tool_failed" });

    const approvalResolved = recorder.toReadinessEvent(TEST_EVENTS.APPROVAL_RESOLVED, {
      sessionId: "session-1",
      runId: "run-1",
      requestId: "approval-1",
      allowed: false,
    });
    assert.ok(approvalResolved);
    assert.equal(approvalResolved.component, "approval");
    assert.equal(approvalResolved.decision, "deny");
    assert.deepEqual(approvalResolved.data, { allowed: false });

    await store.appendEvent(runCreated);
    await store.appendEvent(policy);
    await store.appendEvent(toolFailed);
    await store.appendEvent(approvalResolved);
    const events = await store.readAllEvents();
    assert.equal(events.length, 4);
    assert.equal(JSON.stringify(events).includes("sk-secret"), false);
    assert.equal(JSON.stringify(events).includes("do not leak"), false);

    const writeErrors: string[] = [];
    const failingStore = {
      appendEvent: async () => {
        throw new Error("disk full");
      },
    } satisfies Pick<ReadinessTraceStore, "appendEvent">;
    const subscriptions: Array<(event: string, data: unknown) => void> = [];
    const failingRecorder = new ReadinessTraceRecorder({
      store: failingStore as ReadinessTraceStore,
      now: () => now++,
      onWriteError: (error) => writeErrors.push(error instanceof Error ? error.message : String(error)),
      bus: {
        onAny(handler) {
          subscriptions.push(handler);
          return () => undefined;
        },
      },
    });
    failingRecorder.init();
    subscriptions[0]?.(TEST_EVENTS.RUN_CREATED, {
      sessionId: "session-2",
      runId: "run-2",
      runKind: "chat",
    });
    await failingRecorder.flush();
    assert.deepEqual(writeErrors, ["disk full"]);
    assert.equal(failingRecorder.getHealth().status, "degraded");
    assert.match(failingRecorder.getHealth().message ?? "", /disk full/);

    const stoppedRecorder = new ReadinessTraceRecorder({
      store: {
        appendEvent: async (_event: ReadinessTraceEvent) => undefined,
      } as ReadinessTraceStore,
      now: () => now++,
    });
    assert.equal(stoppedRecorder.getHealth().status, "stopped");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }

  console.log("harness readiness recorder regression tests passed");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
