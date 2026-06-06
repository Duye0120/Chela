import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  readTodayMetricsSummary,
  type MetricsSummaryCache,
  type RunMetrics,
} from "../src/main/metrics-summary.ts";

function withTempDir(test: (dir: string) => void): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "chela-metrics-"));
  try {
    test(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function metric(overrides: Partial<RunMetrics> = {}): RunMetrics {
  const now = Date.now();
  return {
    runId: "run-1",
    sessionId: "session-1",
    modelEntryId: "model-1",
    startedAt: now,
    endedAt: now + 100,
    durationMs: 100,
    toolCallCount: 2,
    toolFailCount: 0,
    finalState: "completed",
    ...overrides,
  };
}

withTempDir((dir) => {
  const filePath = path.join(dir, "metrics.jsonl");
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayTs = todayStart.getTime();
  let cache: MetricsSummaryCache = null;
  const firstLine = `${JSON.stringify(metric())}\n`;
  fs.writeFileSync(filePath, firstLine, "utf8");

  let result = readTodayMetricsSummary(filePath, todayTs, cache);
  cache = result.cache;
  assert.equal(result.summary.totalRuns, 1);

  result = readTodayMetricsSummary(filePath, todayTs, cache);
  assert.equal(result.cache, cache);
  assert.equal(result.summary, cache?.summary);
  cache = result.cache;
  assert.equal(result.summary.totalRuns, 1);

  fs.writeFileSync(
    filePath,
    [
      JSON.stringify(metric()),
      JSON.stringify(metric({ runId: "run-2" })),
      "",
    ].join("\n"),
    "utf8",
  );
  result = readTodayMetricsSummary(filePath, todayTs, cache);
  assert.equal(result.summary.totalRuns, 2);
});

console.log("metrics cache regression tests passed");
