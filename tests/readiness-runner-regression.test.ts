import * as assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  buildReadinessReportArgs,
  DEFAULT_READINESS_FIXTURE_PATH,
  DEFAULT_READINESS_JSON_OUT_PATH,
  DEFAULT_READINESS_MARKDOWN_OUT_PATH,
  runReadinessReport,
} from "../scripts/readiness/run-readiness-report";

async function main(): Promise<void> {
  const tempDir = await mkdtemp(join(tmpdir(), "chela-readiness-runner-"));
  try {
    const input = join(tempDir, "fixture.jsonl");
    const jsonOut = join(tempDir, "report.json");
    const mdOut = join(tempDir, "report.md");
    await writeFile(
      input,
      JSON.stringify({
        schemaVersion: 1,
        traceId: "trace-safe-shell-allowed",
        runId: "run-safe-shell-allowed",
        sessionId: "session-mini-eval",
        scenarioId: "safe-shell-allowed",
        eventId: "safe-shell-allowed-1",
        eventType: "tool_policy_evaluated",
        component: "tool_policy",
        ts: 1,
        status: "success",
        toolName: "shell",
        decision: "allow",
        riskLevel: "low",
      }) + "\n" +
        JSON.stringify({
          schemaVersion: 1,
          traceId: "trace-safe-shell-allowed",
          runId: "run-safe-shell-allowed",
          sessionId: "session-mini-eval",
          scenarioId: "safe-shell-allowed",
          eventId: "safe-shell-allowed-2",
          eventType: "tool_completed",
          component: "tool_execution",
          ts: 2,
          status: "success",
          toolName: "shell",
        }) + "\n",
      "utf8",
    );

    const args = buildReadinessReportArgs({ input, jsonOut, mdOut, failOnSecretLeak: true });
    assert.deepEqual(args, ["--input", input, "--json-out", jsonOut, "--md-out", mdOut, "--fail-on-secret-leak"]);

    const defaultArgs = buildReadinessReportArgs({});
    assert.deepEqual(defaultArgs, [
      "--input",
      DEFAULT_READINESS_FIXTURE_PATH,
      "--json-out",
      DEFAULT_READINESS_JSON_OUT_PATH,
      "--md-out",
      DEFAULT_READINESS_MARKDOWN_OUT_PATH,
      "--fail-on-secret-leak",
    ]);

    const result = await runReadinessReport({
      input,
      jsonOut,
      mdOut,
      failOnSecretLeak: true,
    });
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stderr, "");
    const report = JSON.parse(await readFile(jsonOut, "utf8"));
    assert.equal(report.scenarioResults[0].scenarioId, "safe-shell-allowed");
    assert.equal(report.scenarioResults[0].status, "pass");
    const markdown = await readFile(mdOut, "utf8");
    assert.equal(markdown.includes("## Scenario Summary"), true);

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
    const leakResult = await runReadinessReport({ input: leakInput, failOnSecretLeak: true });
    assert.equal(leakResult.code, 2);
    assert.equal(leakResult.stdout.includes("sk-test-raw-secret"), false);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }

  console.log("readiness runner regression tests passed");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
