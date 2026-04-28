import assert from "node:assert/strict";
import {
  createMemoryWorkerExitError,
} from "../src/main/memory/worker-errors.ts";
import {
  formatMemoryErrorMessage,
} from "../src/renderer/src/components/assistant-ui/settings/memory-status.ts";

assert.equal(
  createMemoryWorkerExitError(1, "Error: Cannot find module better-sqlite3").message,
  "Error: Cannot find module better-sqlite3",
);

assert.equal(
  createMemoryWorkerExitError(1, null).message,
  "Chela memory worker exited with code 1.",
);

assert.match(
  formatMemoryErrorMessage(new Error("Chela memory worker exited with code 1.")),
  /重启 Chela/,
);

console.log("memory worker error regression tests passed");
