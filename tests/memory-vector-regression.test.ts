import assert from "node:assert/strict";
import {
  buildMemoryVectorAddInput,
  shouldPersistMemoryToVectorStore,
} from "../src/main/tools/memory-vector.ts";

{
  assert.equal(shouldPersistMemoryToVectorStore("saved"), true);
  assert.equal(shouldPersistMemoryToVectorStore("merged"), true);
  assert.equal(shouldPersistMemoryToVectorStore("conflict"), true);
  assert.equal(shouldPersistMemoryToVectorStore("duplicate"), false);
}

{
  const input = buildMemoryVectorAddInput(
    {
      summary: "用户要求以后称呼为老板",
      topic: "preferences",
      source: "agent",
      status: "saved",
      reason: "new-memory",
    },
    "用户明确要求以后称呼为老板。",
  );

  assert.equal(input.content, "用户要求以后称呼为老板\n\n用户明确要求以后称呼为老板。");
  assert.deepEqual(input.metadata?.tags, ["preferences", "memory_save", "saved"]);
  assert.equal(input.metadata?.source, "memory_save");
  assert.equal(input.metadata?.topic, "preferences");
  assert.equal(input.metadata?.memdirStatus, "saved");
}

console.log("memory vector regression tests passed");
