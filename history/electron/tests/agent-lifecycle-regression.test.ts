import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const agentSource = readFileSync(
  new URL("../src/main/agent.ts", import.meta.url),
  "utf8",
);
const adapterSource = readFileSync(
  new URL("../src/main/adapter.ts", import.meta.url),
  "utf8",
);

assert.match(
  agentSource,
  /initGenerations\.delete\(ownerKey\);/,
  "destroyAgent should release superseded-init generation entries for destroyed owners.",
);
assert.ok(
  agentSource.indexOf("registerParallelExecutors(ownerKey, rawTools);") >
    agentSource.indexOf("if (initGenerations.get(ownerKey) !== generation)"),
  "Parallel executors should be registered after superseded initialization checks.",
);
assert.doesNotMatch(
  adapterSource,
  /flushedTerminalRunIds\s*=\s*new Set<string>\(\)/,
  "ElectronAdapter should track its single run flush state with a bounded field.",
);
assert.match(
  agentSource,
  /message:\s*"MCP server 连接失败，已跳过。"/,
  "MCP server connection failures should be logged with context.",
);
assert.match(
  agentSource,
  /message:\s*"MCP 初始化失败，已跳过。"/,
  "MCP initialization failures should be logged instead of silently swallowed.",
);

console.log("agent lifecycle regression tests passed");
