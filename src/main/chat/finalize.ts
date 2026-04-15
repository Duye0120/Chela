import { completeRun, destroyAgent } from "../agent.js";
import { PRIMARY_AGENT_OWNER } from "../agent-owners.js";
import { HarnessRunCancelledError } from "../harness/runtime.js";
import { harnessRuntime } from "../harness/singleton.js";
import { appLogger } from "../logger.js";
import {
  appendAssistantMessageEvent,
  appendRunFinishedEvent,
  getSessionMeta,
  loadTranscriptEvents,
  renamePersistedSession,
} from "../session/service.js";
import { bus } from "../event-bus.js";
import { WorkerService } from "../worker-service.js";
import type { ChatRunContext } from "./types.js";

async function maybeAutoRenameSessionTitle(
  sessionId: string,
  assistantText: string,
): Promise<void> {
  const meta = getSessionMeta(sessionId);
  if (!meta || meta.titleManuallySet) {
    return;
  }

  const events = loadTranscriptEvents(sessionId);
  const assistantMessages = events.filter(
    (event) => event.type === "assistant_message",
  );
  if (assistantMessages.length !== 1) {
    return;
  }

  const firstUserMessage = events.find((event) => event.type === "user_message");
  const userText =
    firstUserMessage?.type === "user_message"
      ? firstUserMessage.message.content.trim()
      : "";
  const normalizedAssistantText = assistantText.trim();
  if (!userText || !normalizedAssistantText) {
    return;
  }

  try {
    const title = await WorkerService.generateSessionTitle({
      userText,
      assistantText: normalizedAssistantText,
    });
    if (!title || title === meta.title) {
      return;
    }

    renamePersistedSession(sessionId, title, { manual: false });
  } catch (error) {
    appLogger.warn({
      scope: "chat.send",
      message: "自动标题生成失败",
      data: {
        sessionId,
      },
      error,
    });
  }
}

export async function finalizeCompletedChatRun(
  context: ChatRunContext,
): Promise<void> {
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
  if (assistantMessage?.content) {
    await maybeAutoRenameSessionTitle(
      context.input.sessionId,
      assistantMessage.content,
    );
  }
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
