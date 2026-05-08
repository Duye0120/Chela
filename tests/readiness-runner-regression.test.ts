import * as assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  buildReadinessReportArgs,
  buildReadinessReportEnv,
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
    assert.equal(args[0].endsWith("scripts/readiness/readiness_report.py"), true);
    assert.deepEqual(args.slice(1), ["--input", input, "--json-out", jsonOut, "--md-out", mdOut, "--fail-on-secret-leak"]);

    const env = buildReadinessReportEnv({
      PATH: "/usr/bin",
      HOME: "/home/test",
      USERPROFILE: "C:\\Users\\test",
      SystemRoot: "C:\\Windows",
      TEMP: "/tmp",
      TMP: "/tmp",
      CHELA_PYTHON: "python3",
      API_KEY: "must-not-pass",
      Authorization: "must-not-pass",
    });
    assert.deepEqual(Object.keys(env).sort(), ["CHELA_PYTHON", "HOME", "PATH", "SystemRoot", "TEMP", "TMP", "USERPROFILE"].sort());
    assert.equal(env.API_KEY, undefined);
    assert.equal(env.Authorization, undefined);

    const result = await runReadinessReport({
      input,
      jsonOut,
      mdOut,
      timeoutMs: 30_000,
      env: { PATH: process.env.PATH ?? "", CHELA_PYTHON: "python3" },
    });
    assert.equal(result.python, "python3");
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.timedOut, false);
    assert.equal(result.stderr, "");
    const report = JSON.parse(await readFile(jsonOut, "utf8"));
    assert.equal(report.scenarioResults[0].scenarioId, "safe-shell-allowed");
    assert.equal(report.scenarioResults[0].status, "pass");
    const markdown = await readFile(mdOut, "utf8");
    assert.equal(markdown.includes("## Scenario Summary"), true);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }

  console.log("readiness runner regression tests passed");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
