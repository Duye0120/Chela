import * as assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { buildAnalysisSidecarEnv } from "../src/main/analysis-sidecar/env.js";
import { runAnalysisSidecar } from "../src/main/analysis-sidecar/runner.js";

async function main(): Promise<void> {
  const env = buildAnalysisSidecarEnv({
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

  const ok = await runAnalysisSidecar({
    command: process.execPath,
    args: ["-e", "process.stdout.write('ok'); process.stderr.write('warn')"],
    env: buildAnalysisSidecarEnv(process.env),
    timeoutMs: 5_000,
  });
  assert.equal(ok.code, 0, ok.stderr);
  assert.equal(ok.stdout, "ok");
  assert.equal(ok.stderr, "warn");
  assert.equal(ok.timedOut, false);

  const failed = await runAnalysisSidecar({
    command: process.execPath,
    args: ["-e", "process.stderr.write('bad'); process.exit(7)"],
    env: buildAnalysisSidecarEnv(process.env),
    timeoutMs: 5_000,
  });
  assert.equal(failed.code, 7);
  assert.equal(failed.stderr, "bad");

  const limited = await runAnalysisSidecar({
    command: process.execPath,
    args: ["-e", "process.stdout.write('abcdef'); process.stderr.write('uvwxyz')"],
    env: buildAnalysisSidecarEnv(process.env),
    timeoutMs: 5_000,
    stdoutLimitBytes: 3,
    stderrLimitBytes: 4,
  });
  assert.equal(limited.stdout, "abc");
  assert.equal(limited.stderr, "uvwx");
  assert.equal(limited.stdoutTruncated, true);
  assert.equal(limited.stderrTruncated, true);

  const timedOut = await runAnalysisSidecar({
    command: process.execPath,
    args: ["-e", "setTimeout(() => {}, 10_000)"],
    env: buildAnalysisSidecarEnv(process.env),
    timeoutMs: 50,
  });
  assert.equal(timedOut.timedOut, true);

  const tempDir = await mkdtemp(join(tmpdir(), "chela-analysis-sidecar-"));
  try {
    const script = join(tempDir, "cwd-check.js");
    await writeFile(script, "process.stdout.write(process.cwd())", "utf8");
    const cwdResult = await runAnalysisSidecar({
      command: process.execPath,
      args: [script],
      cwd: tempDir,
      env: buildAnalysisSidecarEnv(process.env),
      timeoutMs: 5_000,
    });
    assert.equal(cwdResult.stdout, tempDir);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }

  console.log("analysis sidecar runner regression tests passed");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
