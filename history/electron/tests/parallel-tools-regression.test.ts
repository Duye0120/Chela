import assert from "node:assert/strict";
import { parallelManager } from "../src/main/parallel-tools.ts";

const ownerA = "parallel-test-session:owner-a";
const ownerB = "parallel-test-session:owner-b";
const runA = "parallel-test-run-a";
const runB = "parallel-test-run-b";

parallelManager.clearOwner(ownerA);
parallelManager.clearOwner(ownerB);

parallelManager.registerExecutors(ownerA, [
  {
    toolName: "file_read",
    executor: async (_toolCallId, args) =>
      ({
        type: "text",
        text: `owner-a:${String(args.value)}`,
      }) as any,
  },
]);
parallelManager.registerExecutors(ownerB, [
  {
    toolName: "file_read",
    executor: async (_toolCallId, args) =>
      ({
        type: "text",
        text: `owner-b:${String(args.value)}`,
      }) as any,
  },
]);

parallelManager.registerBatch(
  runA,
  ownerA,
  [
    { toolCallId: "call-a-current", toolName: "file_read", args: { value: "current" } },
    { toolCallId: "call-a-next", toolName: "file_read", args: { value: "next" } },
  ],
  new AbortController().signal,
);
parallelManager.startPreExecution(runA, "call-a-current");

assert.equal(parallelManager.hasCached("call-a-next"), true);
assert.deepEqual(await parallelManager.getCachedResult("call-a-next"), {
  type: "text",
  text: "owner-a:next",
});

parallelManager.registerBatch(
  runB,
  ownerB,
  [
    { toolCallId: "call-b-current", toolName: "file_read", args: { value: "current" } },
    { toolCallId: "call-b-next", toolName: "file_read", args: { value: "next" } },
  ],
  new AbortController().signal,
);
parallelManager.clearOwner(ownerB);
parallelManager.startPreExecution(runB, "call-b-current");

assert.equal(parallelManager.hasCached("call-b-next"), false);

parallelManager.clearOwner(ownerA);
parallelManager.clearOwner(ownerB);

console.log("parallel tools regression tests passed");
