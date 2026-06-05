import assert from "node:assert/strict";
import fs from "node:fs";

const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8")) as {
  scripts: Record<string, string>;
};

assert.equal(
  packageJson.scripts["native:rebuild:electron"],
  "pnpm dlx @electron/rebuild -f -o better-sqlite3 -v 41.1.0",
);
assert.equal(packageJson.scripts["native:verify:electron"], "tsx scripts/verify-electron-native.ts");
assert.match(packageJson.scripts.build, /native:rebuild:electron/);
assert.match(packageJson.scripts.build, /native:verify:electron/);
assert.match(packageJson.scripts.build, /electron-vite build/);
assert.equal(packageJson.scripts["build:raw"], "electron-vite build");
assert.equal(
  packageJson.scripts["chela:harness:eval"],
  "tsx scripts/readiness/run-readiness-report.ts --input tests/fixtures/readiness/all-scenarios-readiness.jsonl --json-out artifacts/readiness/eval-latest.json --md-out artifacts/readiness/eval-latest.md --fail-on-secret-leak",
);
assert.match(packageJson.scripts["test:regression"], /tests\/harness-readiness-report-regression\.test\.ts/);
assert.match(packageJson.scripts["test:regression"], /tests\/readiness-runner-regression\.test\.ts/);
assert.match(packageJson.scripts["test:regression"], /tests\/runtime-diagnostics-regression\.test\.ts/);
assert.match(packageJson.scripts["test:regression"], /tests\/runtime-diagnostics-display-regression\.test\.ts/);
assert.match(packageJson.scripts["test:regression"], /tests\/provider-autosave-ui-regression\.test\.ts/);
assert.doesNotMatch(packageJson.scripts["test:regression"], /readiness_report_regression\.py/);

console.log("package scripts regression tests passed");
