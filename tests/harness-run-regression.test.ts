import assert from "node:assert/strict";
import {
  buildRunRecoveryPrompt,
  classifyRunFailureReason,
} from "../src/shared/run-recovery.ts";

assert.equal(
  classifyRunFailureReason("用户取消了当前 run。"),
  "user_cancelled",
);
assert.equal(
  classifyRunFailureReason("app_restart_interrupted"),
  "app_restart_interrupted",
);
assert.equal(
  classifyRunFailureReason("Tool file_edit failed with permission denied"),
  "tool_failure",
);
assert.equal(
  classifyRunFailureReason("所有模型均不可用，请检查 API Key"),
  "provider_failure",
);
assert.equal(classifyRunFailureReason("unexpected"), "unknown");

const prompt = buildRunRecoveryPrompt({
  runId: "run-123",
  finalState: "failed",
  reason: "Tool file_edit failed with permission denied",
  latestToolFailure: {
    toolName: "file_edit",
    error: "permission denied",
  },
  todos: [
    { id: "todo-1", content: "修复提交恢复", status: "in_progress" },
    { id: "todo-2", content: "补回归测试", status: "pending" },
  ],
  transcriptTail: [
    { role: "user", content: "继续调整" },
    { role: "assistant", content: "准备恢复上次失败的 run" },
  ],
});

assert.match(prompt, /run-123/);
assert.match(prompt, /tool_failure/);
assert.match(prompt, /file_edit/);
assert.match(prompt, /permission denied/);
assert.match(prompt, /\[in_progress\] 修复提交恢复/);
assert.match(prompt, /user: 继续调整/);
assert.match(prompt, /assistant: 准备恢复上次失败的 run/);

console.log("harness run regression tests passed");
