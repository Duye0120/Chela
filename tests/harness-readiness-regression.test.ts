import * as assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { createReadinessEvent, sanitizeReadinessData } from "../src/main/harness-readiness/sanitize.ts";
import { ReadinessTraceStore } from "../src/main/harness-readiness/trace-store.ts";

async function main(): Promise<void> {
  const sanitized = sanitizeReadinessData({
    toolName: "terminal",
    decision: "confirm",
    riskLevel: "high",
    durationMs: 42,
    status: "success",
    apiKey: "sk-secret",
    nested: {
      token: "tok-secret",
      fileContent: "const secret = true;",
      safeMetric: 7,
    },
    items: [
      {
        password: "pw-secret",
        latencyMs: 12,
      },
    ],
  });

  assert.equal(sanitized.toolName, "terminal");
  assert.equal(sanitized.decision, "confirm");
  assert.equal(sanitized.riskLevel, "high");
  assert.equal(sanitized.durationMs, 42);
  assert.equal(sanitized.status, "success");
  assert.equal(sanitized.apiKey, "[REDACTED]");
  assert.deepEqual(sanitized.nested, {
    token: "[REDACTED]",
    fileContent: "[REDACTED]",
    safeMetric: 7,
  });
  assert.deepEqual(sanitized.items, [
    {
      password: "[REDACTED]",
      latencyMs: 12,
    },
  ]);

  const event = createReadinessEvent({
    traceId: "trace-1",
    runId: "run-1",
    sessionId: "session-1",
    scenarioId: "safe_shell_readonly",
    eventId: "event-1",
    eventType: "tool_policy_evaluated",
    component: "tool_policy",
    ts: 1_777_777_777_000,
    durationMs: 10,
    status: "success",
    toolName: "terminal",
    decision: "allow",
    riskLevel: "low",
    policyViolation: false,
    tokenIn: 11,
    tokenOut: 22,
    estimatedCostUsd: 0.001,
    latencyMs: 33,
    contextBudget: {
      maxTokens: 1000,
      usedTokens: 300,
      trimmedSections: ["memory"],
    },
    memory: {
      hitCount: 1,
      conflictCount: 0,
      dedupeDecision: "new",
    },
    retrieval: {
      expectedHit: true,
      actualHit: true,
      hitRate: 1,
      groundedness: 0.9,
    },
    data: {
      prompt: "do not persist full prompt",
      modelSafeMeta: "kept",
    },
  });

  assert.equal(event.schemaVersion, 1);
  assert.equal(event.component, "tool_policy");
  assert.equal(event.status, "success");
  assert.equal(event.data?.prompt, "[REDACTED]");
  assert.equal(event.data?.modelSafeMeta, "kept");

  const tempDir = await mkdtemp(join(tmpdir(), "chela-readiness-"));
  try {
    const missingStore = new ReadinessTraceStore(join(tempDir, "missing", "trace.jsonl"));
    assert.deepEqual(await missingStore.readAllEvents(), []);
    assert.deepEqual(await missingStore.readRecentEvents(5), []);

    const store = new ReadinessTraceStore(join(tempDir, "nested", "trace.jsonl"));
    await store.appendEvent(event);
    await store.appendEvent({
      ...event,
      traceId: "trace-2",
      eventId: "event-2",
      ts: event.ts + 1,
    });

    const allEvents = await store.readAllEvents();
    assert.equal(allEvents.length, 2);
    assert.equal(allEvents[0]?.traceId, "trace-1");
    assert.equal(allEvents[1]?.traceId, "trace-2");

    const recentEvents = await store.readRecentEvents(1);
    assert.equal(recentEvents.length, 1);
    assert.equal(recentEvents[0]?.traceId, "trace-2");

    const invalidJsonStore = new ReadinessTraceStore(join(tempDir, "invalid", "trace.jsonl"));
    await mkdir(join(tempDir, "invalid"), { recursive: true });
    await writeFile(
      invalidJsonStore.filePath,
      [
        JSON.stringify(event),
        "not-json",
        JSON.stringify({ ...event, traceId: "trace-valid-after-invalid", eventId: "event-3" }),
        "",
      ].join("\n"),
    );

    const validEvents = await invalidJsonStore.readAllEvents();
    assert.equal(validEvents.length, 2);
    assert.equal(validEvents[0]?.traceId, "trace-1");
    assert.equal(validEvents[1]?.traceId, "trace-valid-after-invalid");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }

  console.log("harness readiness regression tests passed");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
