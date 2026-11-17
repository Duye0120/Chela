import * as assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  computeReadinessReport,
  parseReadinessJsonl,
  renderReadinessReportMarkdown,
} from "../src/main/harness-readiness/report.ts";

const ALL_SCENARIOS = "tests/fixtures/readiness/all-scenarios-readiness.jsonl";
const EXPECTED_SCENARIOS = new Set([
  "dangerous-delete-denied",
  "file-overwrite-confirmed",
  "secret-redacted",
  "context-hard-section-preserved",
  "memory-conflict-detected",
  "tool-failure-recovered",
  "approval-resume",
  "provider-503-recorded",
  "long-task-monitored",
  "safe-shell-allowed",
]);

async function main(): Promise<void> {
  const fixture = await readFile(ALL_SCENARIOS, "utf8");
  const parsed = parseReadinessJsonl(fixture);
  const report = computeReadinessReport(parsed.events, parsed.dataQuality, ALL_SCENARIOS);

  assert.equal(report.verdict, "pass");
  assert.equal(report.metrics.scenarioCount, EXPECTED_SCENARIOS.size);
  assert.equal(report.metrics.secretLeakageCount, 0);
  assert.equal(report.metrics.toolFailRate, 0.25);

  const scenarioResults = new Map(report.scenarioResults.map((item) => [item.scenarioId, item]));
  assert.deepEqual(new Set(scenarioResults.keys()), EXPECTED_SCENARIOS);
  for (const scenarioId of EXPECTED_SCENARIOS) {
    assert.equal(scenarioResults.get(scenarioId)?.status, "pass", scenarioId);
  }

  const markdown = renderReadinessReportMarkdown(report);
  assert.equal(markdown.includes("## Scenario Summary"), true);
  assert.equal(markdown.includes("trace-"), false);
  assert.equal(markdown.includes("eventId"), false);

  const tempDir = await mkdtemp(join(tmpdir(), "chela-readiness-report-"));
  try {
    const leakInput = join(tempDir, "leak.jsonl");
    await writeFile(
      leakInput,
      JSON.stringify({
        schemaVersion: 1,
        traceId: "trace-leak",
        runId: "run-leak",
        sessionId: "session-leak",
        scenarioId: "secret-redacted",
        eventId: "leak-1",
        eventType: "tool_completed",
        component: "tool_execution",
        ts: 1,
        status: "success",
        data: { credential: "sk-test-raw-secret" },
      }) + "\n",
      "utf8",
    );

    const leakParsed = parseReadinessJsonl(await readFile(leakInput, "utf8"));
    const leakReport = computeReadinessReport(leakParsed.events, leakParsed.dataQuality, leakInput);
    assert.equal(leakReport.verdict, "fail");
    assert.equal(leakReport.metrics.secretLeakageCount, 1);
    assert.deepEqual(leakReport.secretLeakageEventIds, ["leak-1"]);

    const badParsed = parseReadinessJsonl(
      [
        JSON.stringify({
          schemaVersion: 1,
          traceId: "trace-quality",
          runId: "run-quality",
          sessionId: "session-quality",
          scenarioId: "safe-shell-allowed",
          eventId: "quality-1",
          eventType: "run_started",
          component: "runtime",
          ts: 1,
          status: "pending",
        }),
        "{not-json",
        JSON.stringify({ schemaVersion: 2, eventId: "bad-schema" }),
      ].join("\n"),
    );
    assert.equal(badParsed.dataQuality.invalidJsonLines, 1);
    assert.equal(badParsed.dataQuality.invalidSchemaEvents, 1);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }

  console.log("harness readiness report regression tests passed");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
