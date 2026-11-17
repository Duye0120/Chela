import assert from "node:assert/strict";
import { createMemoryPipeline, createMemoryRefreshQueue } from "../src/main/memory/pipeline.ts";

{
  const runs: string[] = [];
  const queue = createMemoryRefreshQueue(async (input) => {
    runs.push(`${input.sessionId}:${input.sourceRunId}`);
    return {
      sessionId: input.sessionId,
      sourceRunId: input.sourceRunId,
      status: "completed",
      extractedCount: 1,
      acceptedCount: 1,
      savedCount: 1,
      duplicateCount: 0,
      mergedCount: 0,
      conflictCount: 0,
      vectorWrittenCount: 1,
      vectorFailedCount: 0,
      completedAt: "2026-04-30T10:00:00.000Z",
    };
  });

  const first = queue.schedule({ sessionId: "s1", sourceRunId: "r1" });
  const second = queue.schedule({ sessionId: "s1", sourceRunId: "r1" });
  assert.equal(first, second);

  const [firstReport, secondReport] = await Promise.all([first, second]);
  assert.equal(firstReport, secondReport);
  assert.deepEqual(runs, ["s1:r1"]);

  await queue.schedule({ sessionId: "s1", sourceRunId: "r1" });
  assert.deepEqual(runs, ["s1:r1", "s1:r1"]);
}

{
  let saves = 0;
  const reports: unknown[] = [];
  const pipeline = createMemoryPipeline({
    saveMemdir(input) {
      if (++saves === 2) throw new Error("disk full");
      return { ...input, topic: input.topic ?? "general", source: "agent", status: "saved", reason: "new-memory" };
    },
    addVector: async () => ({ status: "written" }),
    searchVector: async () => [],
    searchMemdir: () => [],
    rewriteQuery: async (query) => query,
    extractCandidates: async () => [
      { content: "用户偏好简洁回复", topic: "preferences" },
      { content: "项目默认使用 TypeScript", topic: "project" },
    ],
    appendRefreshEvent: (report) => { reports.push(report); },
  });
  const report = await pipeline.refreshAfterRun({ sessionId: "s1", sourceRunId: "r1" });
  assert.equal(report.status, "failed");
  assert.equal(report.extractedCount, 2);
  assert.equal(report.acceptedCount, 2);
  assert.equal(report.savedCount, 1);
  assert.equal(report.vectorWrittenCount, 1);
  assert.equal(report.failureReason, "disk full");
  assert.deepEqual(reports, [report]);
}

{
  let writes = 0;
  const pipeline = createMemoryPipeline({
    saveMemdir: () => { throw new Error("unexpected save"); },
    addVector: async () => ({ status: "written" }),
    searchVector: async () => [],
    searchMemdir: () => [],
    rewriteQuery: async (query) => query,
    extractCandidates: async () => [],
    appendRefreshEvent: () => { writes += 1; throw new Error("transcript unavailable"); },
  });
  await assert.rejects(
    pipeline.refreshAfterRun({ sessionId: "s1", sourceRunId: "r1" }),
    /transcript unavailable/,
  );
  assert.equal(writes, 1);
}

console.log("memory refresh regression tests passed");
