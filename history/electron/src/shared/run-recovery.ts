export type RunFailureKind =
  | "user_cancelled"
  | "app_restart_interrupted"
  | "tool_failure"
  | "provider_failure"
  | "approval_interrupted"
  | "unknown";

export type RunRecoveryTodo = {
  id: string;
  content: string;
  status: string;
};

export type RunRecoveryTranscriptLine = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type RunRecoveryPromptInput = {
  runId: string;
  finalState: "failed" | "aborted";
  reason: string;
  latestToolFailure?: {
    toolName: string;
    error: string;
  } | null;
  todos?: RunRecoveryTodo[];
  transcriptTail?: RunRecoveryTranscriptLine[];
};

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function classifyRunFailureReason(reason: string): RunFailureKind {
  const normalized = normalizeText(reason);
  if (/用户取消|cancelled|canceled|aborted/i.test(normalized)) {
    return "user_cancelled";
  }
  if (/app_restart_interrupted|重启打断|restart interrupted/i.test(normalized)) {
    return "app_restart_interrupted";
  }
  if (/awaiting_confirmation|approval|审批|确认/i.test(normalized)) {
    return "approval_interrupted";
  }
  if (/tool|工具|file_edit|shell|command|permission denied/i.test(normalized)) {
    return "tool_failure";
  }
  if (/provider|model|模型|API Key|fetch failed|network|所有模型均不可用/i.test(normalized)) {
    return "provider_failure";
  }
  return "unknown";
}

export function buildRunRecoveryPrompt(input: RunRecoveryPromptInput): string {
  const failureKind = classifyRunFailureReason(input.reason);
  const lines = [
    "请恢复上次未完成的任务，并基于当前工作区真实状态继续推进。",
    "",
    "恢复原则：",
    "- 先核对当前文件状态和最新用户意图。",
    "- 先处理导致上次 run 中断的直接原因。",
    "- 需要执行工具时按正式队列继续，不要依赖过期现场。",
    "",
    "Run 恢复上下文：",
    `- runId: ${input.runId}`,
    `- finalState: ${input.finalState}`,
    `- failureKind: ${failureKind}`,
    `- reason: ${input.reason}`,
  ];

  if (input.latestToolFailure) {
    lines.push(
      "",
      "最近工具失败：",
      `- toolName: ${input.latestToolFailure.toolName}`,
      `- error: ${input.latestToolFailure.error}`,
    );
  }

  if (input.todos?.length) {
    lines.push(
      "",
      "任务板：",
      ...input.todos.map((todo) => `- [${todo.status}] ${todo.content}`),
    );
  }

  if (input.transcriptTail?.length) {
    lines.push(
      "",
      "最近对话片段：",
      ...input.transcriptTail.map(
        (line) => `- ${line.role}: ${normalizeText(line.content)}`,
      ),
    );
  }

  return lines.join("\n");
}
