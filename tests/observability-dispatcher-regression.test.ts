import * as assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { ObservabilityDispatcher, type ObservabilitySink } from "../src/main/observability/dispatcher.ts";
import { ReadinessObservabilitySink } from "../src/main/observability/sinks/readiness-sink.ts";
import { ReadinessTraceRecorder } from "../src/main/harness-readiness/trace-recorder.ts";
import { ReadinessTraceStore } from "../src/main/harness-readiness/trace-store.ts";

type TestBusHandler = (event: string, data: unknown) => void;

class TestBus {
  private readonly handlers = new Set<TestBusHandler>();

  onAny(handler: TestBusHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  emit(event: string, data: unknown): void {
    for (const handler of this.handlers) {
      handler(event, data);
    }
  }
}

async function main(): Promise<void> {
  const bus = new TestBus();
  const errors: string[] = [];
  const syncFailingSink: ObservabilitySink = {
    name: "sync-failing",
    handleEvent: () => {
      throw new Error("sync sink failed");
    },
  };
  const dispatcher = new ObservabilityDispatcher({
    bus,
    sinks: [syncFailingSink],
    onSinkError: (_sink, error) => errors.push(error instanceof Error ? error.message : String(error)),
  });
  dispatcher.start();
  assert.doesNotThrow(() => {
    bus.emit("run:created", { sessionId: "s", runId: "r", runKind: "chat", lane: "default" });
  });
  assert.deepEqual(errors, ["sync sink failed"]);
  assert.equal(dispatcher.getSinkHealth("sync-failing")?.status, "degraded");
  dispatcher.stop();

  const asyncBus = new TestBus();
  const asyncErrors: string[] = [];
  const asyncFailingSink: ObservabilitySink = {
    name: "async-failing",
    handleEvent: async () => {
      throw new Error("async sink failed");
    },
  };
  const asyncDispatcher = new ObservabilityDispatcher({
    bus: asyncBus,
    sinks: [asyncFailingSink],
    onSinkError: (_sink, error) => asyncErrors.push(error instanceof Error ? error.message : String(error)),
  });
  asyncDispatcher.start();
  assert.doesNotThrow(() => {
    asyncBus.emit("run:created", { sessionId: "s", runId: "r", runKind: "chat", lane: "default" });
  });
  await asyncDispatcher.flush();
  assert.deepEqual(asyncErrors, ["async sink failed"]);
  assert.equal(asyncDispatcher.getHealth().status, "degraded");
  asyncDispatcher.stop();

  const tempDir = await mkdtemp(join(tmpdir(), "chela-observability-dispatcher-"));
  try {
    const readinessBus = new TestBus();
    const filePath = join(tempDir, "readiness.jsonl");
    const store = new ReadinessTraceStore(filePath);
    let now = 1_800_000_000_000;
    const recorder = new ReadinessTraceRecorder({ store, now: () => now++ });
    const readinessDispatcher = new ObservabilityDispatcher({
      bus: readinessBus,
      sinks: [new ReadinessObservabilitySink({ recorder })],
    });

    readinessDispatcher.start();
    readinessBus.emit("run:created", {
      sessionId: "session-1",
      runId: "run-1",
      modelEntryId: "model-a",
      runKind: "chat",
      lane: "default",
    });
    readinessBus.emit("message:user", { sessionId: "session-1", text: "ignored" });
    readinessBus.emit("tool:policy_evaluated", {
      sessionId: "session-1",
      runId: "run-1",
      toolName: "terminal",
      decision: "allow",
      riskLevel: "high",
      prompt: "do not leak",
    });
    await readinessDispatcher.flush();

    const events = await store.readAllEvents();
    assert.equal(events.length, 2);
    const runCreated = events.find((event) => event.eventType === "run_created");
    const policyEvaluated = events.find((event) => event.eventType === "tool_policy_evaluated");
    assert.ok(runCreated);
    assert.equal(runCreated.component, "runtime");
    assert.deepEqual(runCreated.data, { runKind: "chat", lane: "default" });
    assert.ok(policyEvaluated);
    assert.equal(policyEvaluated.component, "tool_policy");
    assert.equal(policyEvaluated.policyViolation, true);
    assert.equal(JSON.stringify(events).includes("do not leak"), false);
    assert.equal(readinessDispatcher.getHealth().status, "healthy");

    readinessDispatcher.stop();
    readinessBus.emit("run:created", {
      sessionId: "session-1",
      runId: "run-2",
      modelEntryId: "model-a",
      runKind: "chat",
      lane: "default",
    });
    await readinessDispatcher.flush();
    assert.equal((await store.readAllEvents()).length, 2);
    assert.equal(readinessDispatcher.getHealth().status, "stopped");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }

  console.log("observability dispatcher regression tests passed");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
