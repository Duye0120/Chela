import * as assert from "node:assert/strict";
import { join } from "node:path";

import { resolveRuntimePaths } from "../src/main/runtime-paths.js";

function main(): void {
  const paths = resolveRuntimePaths(join("tmp", "ChelaUserData"));
  assert.equal(paths.userDataDir, join("tmp", "ChelaUserData"));
  assert.equal(paths.dataDir, join("tmp", "ChelaUserData", "data"));
  assert.equal(paths.logsDir, join("tmp", "ChelaUserData", "logs"));
  assert.equal(paths.artifactsDir, join("tmp", "ChelaUserData", "artifacts"));
  assert.equal(paths.readinessDir, join("tmp", "ChelaUserData", "artifacts", "readiness"));
  assert.equal(paths.readinessTracePath, join(paths.readinessDir, "readiness-trace.jsonl"));
  assert.equal(paths.readinessLatestJsonPath, join(paths.readinessDir, "latest-readiness-report.json"));
  assert.equal(paths.readinessLatestMarkdownPath, join(paths.readinessDir, "latest-readiness-report.md"));
  console.log("runtime paths regression tests passed");
}

main();
