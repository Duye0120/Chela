import { completeRun, destroyAgent, getHandle } from "../agent.ts";
import { PRIMARY_AGENT_OWNER } from "../agent-owners.ts";
import { getGitDiffSnapshot } from "../git.ts";
import { HarnessRunCancelledError } from "../harness/runtime.ts";
import { harnessRuntime } from "../harness/singleton.ts";
import { appLogger } from "../logger.ts";
import { scheduleAutoMemorySummarize } from "../memory/service.ts";
import {
  appendAssistantMessageEvent,
  appendRunFinishedEvent,
  getSessionMeta,
  loadTranscriptEvents,
  renamePersistedSession,
} from "../session/service.ts";
import { indexSessionSearchDocument } from "../session/search.ts";
import { BUS_EVENTS, bus } from "../event-bus.ts";
import { WorkerService } from "../worker-service.ts";
import {
  buildRunChangeSummary,
  collectRunTouchedPaths,
} from "./run-change-summary.ts";
import type { ChatRunContext } from "./types.ts";
import type { ChatMessage, RunChangeSummary } from "../../shared/contracts.ts";
import { formatChatRuntimeErrorMessage } from "../../shared/chat-runtime-errors.ts";

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

  const title = await WorkerService.generateSessionTitle({
    userText,
    assistantText: normalizedAssistantText,
  });
  if (title && title !== meta.title) {
    renamePersistedSession(sessionId, title, { manual: false });
  }
}

async function resolveRunChangeSummary(
  context: ChatRunContext,
  assistantMessage: ChatMessage | null,
) {
  try {
    const touchedPaths = collectRunTouchedPaths(
      assistantMessage?.steps,
      context.settings.workspace,
    );
    const afterDiffOverview = await getGitDiffSnapshot(context.settings.workspace);
    return buildRunChangeSummary(context.beforeDiffOverview, afterDiffOverview, {
      touchedPaths,
    });
  } catch (error) {
    appLogger.warn({
      scope: "chat.send",
      message: "生成本轮 diff 摘要失败",
      data: {
        sessionId: context.input.sessionId,
        runId: context.input.runId,
      },
      error,
    });
    return null;
  }
}

function attachRunChangeSummary(
  assistantMessage: ChatMessage | null,
  runChangeSummary: RunChangeSummary | null,
): void {
  if (!assistantMessage || !runChangeSummary) {
    return;
  }

  assistantMessage.meta = {
    ...(assistantMessage.meta ?? {}),
    runChangeSummary,
  };
}

function attachSendOrigin(
  context: ChatRunContext,
  assistantMessage: ChatMessage | null,
): void {
  const sendOrigin = context.input.origin ?? "user";
  if (!assistantMessage || sendOrigin !== "guided") {
    return;
  }

  assistantMessage.meta = {
    ...(assistantMessage.meta ?? {}),
    sendOrigin,
  };
}

export async function finalizeCompletedChatRun(
  context: ChatRunContext,
): Promise<void> {
  const assistantMessage = context.adapter.buildAssistantMessage(
    "completed",
    undefined,
  );
  const runChangeSummary = await resolveRunChangeSummary(context, assistantMessage);
  harnessRuntime.assertRunActive(context.runScope);
  attachRunChangeSummary(assistantMessage, runChangeSummary);
  attachSendOrigin(context, assistantMessage);
  if (assistantMessage) {
    appendAssistantMessageEvent({
      sessionId: context.input.sessionId,
      runId: context.input.runId,
      message: assistantMessage,
    });
  }
  appendRunFinishedEvent({
    sessionId: context.input.sessionId,
    runId: context.input.runId,
    ownerId: PRIMARY_AGENT_OWNER,
    finalState: "completed",
    metadata: {
      requestedModelEntryId: context.requestedModelEntryId,
      resolvedModelEntryId:
        context.handle?.modelEntryId ?? context.resolvedModel.entry.id,
      prepareFailedEntries: context.failover.prepare.failedEntries,
      executeAttemptedEntryIds: context.failover.execute.attemptedEntryIds,
      ...(runChangeSummary ? { runChangeSummary } : {}),
    },
  });

  // The transcript has committed completion. A follow-up failure cannot change its state.
  const { sessionId, runId } = context.input;
  for (const [message, task] of [
    ["通知会话回复失败", () => assistantMessage && bus.emit(BUS_EVENTS.MESSAGE_ASSISTANT, { sessionId, runId })],
    ["清理已完成的运行失败", () => harnessRuntime.finishRun(context.runScope, "completed")],
    ["自动记忆调度失败", () => scheduleAutoMemorySummarize({ sessionId, sourceRunId: runId })],
    ["更新会话搜索索引失败", () => indexSessionSearchDocument(sessionId)],
    ["自动标题生成失败", () => assistantMessage?.content && maybeAutoRenameSessionTitle(sessionId, assistantMessage.content)],
    ["记录完成日志失败", () => appLogger.info({ scope: "chat.send", message: "消息发送完成", data: { sessionId, runId } })],
    ["通知渲染进程完成失败", () => {
      context.adapter.queueTerminalEnd(runChangeSummary);
      context.adapter.flushTerminalEvent({ type: "agent_end", runChangeSummary });
    }],
  ] as const) {
    try {
      await task();
    } catch (error) {
      try {
        appLogger.warn({ scope: "chat.send", message, data: { sessionId, runId }, error });
      } catch (loggingError) {
        console.warn(message, { sessionId, runId, error, loggingError });
      }
    }
  }
}

export async function finalizeFailedChatRun(
  context: ChatRunContext,
  err: unknown,
): Promise<void> {
  const cancelled = err instanceof HarnessRunCancelledError ||
    harnessRuntime.isCancelRequested(context.runScope);
  const rawErrorMessage = cancelled
    ? "用户取消了当前 run。"
    : err instanceof Error ? err.message : "Agent 执行失败";
  const errorMessage = formatChatRuntimeErrorMessage(err);
  const assistantMessage = context.adapter.buildAssistantMessage(
    cancelled ? "cancelled" : "error",
    cancelled ? undefined : errorMessage,
  );
  const runChangeSummary = await resolveRunChangeSummary(context, assistantMessage);
  attachRunChangeSummary(assistantMessage, runChangeSummary);
  attachSendOrigin(context, assistantMessage);
  const cleanupErrors: unknown[] = [];

  try {
    if (assistantMessage && context.transcriptStarted) {
      appendAssistantMessageEvent({
        sessionId: context.input.sessionId,
        runId: context.input.runId,
        message: assistantMessage,
      });
    }
  } catch (error) {
    cleanupErrors.push(error);
  }
  try {
    if (context.transcriptStarted) {
      appendRunFinishedEvent({
        sessionId: context.input.sessionId,
        runId: context.input.runId,
        ownerId: PRIMARY_AGENT_OWNER,
        finalState: cancelled ? "aborted" : "failed",
        reason: rawErrorMessage,
        metadata: {
          requestedModelEntryId: context.requestedModelEntryId,
          resolvedModelEntryId:
            context.handle?.modelEntryId ?? context.resolvedModel.entry.id,
          executeAttemptedEntryIds: context.failover.execute.attemptedEntryIds,
          ...(!cancelled ? {
            prepareFailedEntries: context.failover.prepare.failedEntries,
            lastExecuteFailoverError: context.failover.execute.lastError,
            userVisibleErrorMessage: errorMessage,
          } : {}),
          ...(runChangeSummary ? { runChangeSummary } : {}),
        },
      });
    }
  } catch (error) {
    cleanupErrors.push(error);
  }
  try {
    const { handle } = context;
    if (
      cancelled && context.createdHandle && handle &&
      (handle.activeRunId === null || handle.activeRunId === context.input.runId) &&
      getHandle(handle.sessionId, handle.ownerId) === handle
    ) {
      await destroyAgent(handle);
    }
  } catch (error) {
    cleanupErrors.push(error);
  }
  try {
    if (context.runCreated) {
      harnessRuntime.finishRun(context.runScope, cancelled ? "aborted" : "failed", {
        reason: rawErrorMessage,
      });
    }
  } catch (error) {
    cleanupErrors.push(error);
  }

  const cleanupError = cleanupErrors.length > 0
    ? new AggregateError([err, ...cleanupErrors], "运行已停止，但会话保存或清理失败。", { cause: err })
    : null;
  appLogger[cancelled && !cleanupError ? "warn" : "error"]({
    scope: "chat.send",
    message: cancelled ? "消息发送被取消" : "消息发送失败",
    data: {
      sessionId: context.input.sessionId,
      runId: context.input.runId,
      createdHandle: context.createdHandle,
      runCreated: context.runCreated,
      transcriptStarted: context.transcriptStarted,
    },
    error: cleanupError ?? err,
  });
  if (cancelled && !cleanupError) {
    context.adapter.queueTerminalEnd(runChangeSummary);
    context.adapter.flushTerminalEvent({ type: "agent_end", runChangeSummary });
  } else {
    const terminalMessage = cleanupError
      ? `${errorMessage}\n${cleanupError.message}`
      : errorMessage;
    context.adapter.queueTerminalError(terminalMessage);
    context.adapter.flushTerminalEvent({ type: "agent_error", message: terminalMessage });
  }
  if (cleanupError) {
    throw cleanupError;
  }
}

export function completeChatRun(context: ChatRunContext): void {
  if (context.handle) {
    completeRun(context.handle, context.input.runId);
  }
}
