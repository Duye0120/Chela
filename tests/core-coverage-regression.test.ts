import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createBudgetedMessageTransform } from "../src/main/context/budget-transform.ts";
import {
  countMaterializedMessages,
  materializeMessages,
} from "../src/main/session/transcript-materialize.ts";
import {
  globToRegExp,
  lineNumberAt,
  listWorkspaceFiles,
  matchGlob,
  readTextFileSafe,
  resolveWorkspaceBasePath,
  resolveWorkspacePath,
  toRelativeWorkspacePath,
} from "../src/main/tools/fs-utils.ts";
import { throwIfPendingTerminalError } from "../src/main/chat/terminal-error.ts";
import type {
  ChatMessage,
  SessionTranscriptEvent,
} from "../src/shared/contracts.ts";

function withTempDir(test: (dir: string) => void): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "chela-core-coverage-"));
  try {
    test(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

{
  const userMessage: ChatMessage = {
    id: "user-1",
    role: "user",
    content: "继续优化",
    timestamp: 1,
    status: "done",
  };
  const assistantMessage: ChatMessage = {
    id: "assistant-1",
    role: "assistant",
    content: "已处理",
    timestamp: 2,
    status: "done",
  };
  const events: SessionTranscriptEvent[] = [
    {
      seq: 1,
      type: "user_message",
      sessionId: "s1",
      runId: "r1",
      timestamp: 1,
      message: userMessage,
    },
    {
      seq: 2,
      type: "assistant_message",
      sessionId: "s1",
      runId: "r1",
      timestamp: 2,
      message: assistantMessage,
    },
    {
      seq: 3,
      type: "run_finished",
      sessionId: "s1",
      runId: "r2",
      ownerId: "primary",
      timestamp: 3,
      finalState: "failed",
      reason: "app_restart_interrupted",
      metadata: {},
    },
  ];

  assert.equal(countMaterializedMessages(events), 3);
  assert.deepEqual(materializeMessages(events).map((message) => message.role), [
    "user",
    "assistant",
    "system",
  ]);
}

{
  assert.throws(
    () => throwIfPendingTerminalError({ getPendingTerminalErrorMessage: () => "终端失败" }),
    /终端失败/,
  );
  assert.doesNotThrow(() =>
    throwIfPendingTerminalError({ getPendingTerminalErrorMessage: () => null }),
  );
}

{
  withTempDir((dir) => {
    fs.mkdirSync(path.join(dir, "src"));
    fs.mkdirSync(path.join(dir, ".git"));
    fs.writeFileSync(path.join(dir, "src", "main.ts"), "one\ntwo\nthree", "utf8");
    fs.writeFileSync(path.join(dir, "image.png"), Buffer.from([0, 1, 2]));
    fs.writeFileSync(path.join(dir, ".git", "ignored.ts"), "ignored", "utf8");

    const sourcePath = resolveWorkspacePath(dir, "src/main.ts");
    assert.equal(toRelativeWorkspacePath(dir, sourcePath), "src/main.ts");
    assert.equal(resolveWorkspaceBasePath(dir, "").replace(/\\/g, "/"), dir.replace(/\\/g, "/"));
    assert.equal(readTextFileSafe(sourcePath), "one\ntwo\nthree");
    assert.equal(readTextFileSafe(path.join(dir, "image.png")), null);
    assert.equal(lineNumberAt("one\ntwo\nthree", 5), 2);
    assert.equal(matchGlob("src/**/*.ts", "src/main.ts"), true);
    assert.equal(globToRegExp("src/*.ts").test("src/main.ts"), true);
    assert.deepEqual(listWorkspaceFiles(dir, { pattern: "src/**/*.ts" }), ["src/main.ts"]);
  });
}

{
  const transform = createBudgetedMessageTransform(80);
  const messages = [
    { role: "user", content: "短消息 1" },
    { role: "assistant", content: "短回复 1" },
    { role: "tool", content: "x".repeat(600) },
    { role: "user", content: "短消息 2" },
    { role: "assistant", content: "短回复 2" },
    { role: "user", content: "短消息 3" },
    { role: "assistant", content: "短回复 3" },
    { role: "user", content: "短消息 4" },
    { role: "assistant", content: "短回复 4" },
    { role: "user", content: "短消息 5" },
    { role: "assistant", content: "短回复 5" },
    { role: "user", content: "短消息 6" },
    { role: "assistant", content: "短回复 6" },
    { role: "user", content: "保留最近用户消息" },
  ] as any[];

  const transformed = await transform(messages);
  assert.ok(transformed.length < messages.length);
  assert.equal(transformed.at(-1)?.content, "保留最近用户消息");
}

console.log("core coverage regression tests passed");
