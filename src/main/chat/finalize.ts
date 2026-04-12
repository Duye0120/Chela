import { completeRun, destroyAgent } from "../agent.js";
import { PRIMARY_AGENT_OWNER } from "../agent-owners.js";
import { HarnessRunCancelledError } from "../harness/runtime.js";
import { harnessRuntime } from "../harness/singleton.js";
import { appLogger } from "../logger.js";
import {
  appendAssistantMessageEvent,
  appendRunFinishedEvent,
} from "../session/service.js";
import { bus } from "../event-bus.js";
import type { ChatRunContext } from "./types.js";

export function finalizeCompletedChatRun(context: ChatRunContext): void {
  const assistantMessage = context.adapter.buildAssistantMessage("completed");
  if (assistantMessage) {
    appendAssistantMessageEvent({
      sessionId: context.input.sessionId,
      runId: context.input.runId,
      message: assistantMessage,
    });
    bus.emit("message:assistant", {
      sessionId: context.input.sessionId,
      runId: context.input.runId,
    });
  }
  appendRunFinishedEvent({
    sessionId: context.input.sessionId,
    runId: context.input.runId,
    ownerId: PRIMARY_AGENT_OWNER,
    finalState: "completed",
  });
  harnessRuntime.finishRun(context.runScope, "completed");
  appLogger.info({
    scope: "chat.send",
    message: "消息发送完成",
    data: {
      sessionId: context.input.sessionId,
      runId: context.input.runId,
    },
  });
  context.adapter.flushTerminalEvent({ type: "agent_end" });
}

export async function finalizeFailedChatRun(
  context: ChatRunContext,
  err: unknown,
): Promise<void> {
  if (
    err instanceof HarnessRunCancelledError ||
    harnessRuntime.isCancelRequested(context.runScope)
  ) {
    const cancelledMessage = context.adapter.buildAssistantMessage("cancelled");
    if (cancelledMessage && context.transcriptStarted) {
      appendAssistantMessageEvent({
        sessionId: context.input.sessionId,
        runId: context.input.runId,
        message: cancelledMessage,
      });
    }
    if (context.transcriptStarted) {
      appendRunFinishedEvent({
        sessionId: context.input.sessionId,
        runId: context.input.runId,
        ownerId: PRIMARY_AGENT_OWNER,
        finalState: "aborted",
        reason: "用户取消了当前 run。",
      });
    }
    if (context.createdHandle && context.handle) {
      await destroyAgent(context.handle);
    }
    if (context.runCreated) {
      harnessRuntime.finishRun(context.runScope, "aborted", {
        reason: "用户取消了当前 run。",
      });
    }
    appLogger.warn({
      scope: "chat.send",
      message: "消息发送被取消",
      data: {
        sessionId: context.input.sessionId,
        runId: context.input.runId,
      },
    });
    context.adapter.flushTerminalEvent({ type: "agent_end" });
    return;
  }

  const errorMessage =
    err instanceof Error ? err.message : "Agent 执行失败";
  const failedMessage = context.adapter.buildAssistantMessage(
    "error",
    errorMessage,
  );
  if (failedMessage && context.transcriptStarted) {
    appendAssistantMessageEvent({
      sessionId: context.input.sessionId,
      runId: context.input.runId,
      message: failedMessage,
    });
  }
  if (context.transcriptStarted) {
    appendRunFinishedEvent({
      sessionId: context.input.sessionId,
      runId: context.input.runId,
      ownerId: PRIMARY_AGENT_OWNER,
      finalState: "failed",
      reason: errorMessage,
    });
  }
  if (context.runCreated) {
    harnessRuntime.finishRun(context.runScope, "failed", {
      reason: errorMessage,
    });
  }
  appLogger.error({
    scope: "chat.send",
    message: "消息发送失败",
    data: {
      sessionId: context.input.sessionId,
      runId: context.input.runId,
      createdHandle: context.createdHandle,
      runCreated: context.runCreated,
      transcriptStarted: context.transcriptStarted,
    },
    error: err,
  });
  context.adapter.queueTerminalError(errorMessage);
  context.adapter.flushTerminalEvent({
    type: "agent_error",
    message: errorMessage,
  });
}

export function completeChatRun(context: ChatRunContext): void {
  if (context.handle) {
    completeRun(context.handle, context.input.runId);
  }
}
