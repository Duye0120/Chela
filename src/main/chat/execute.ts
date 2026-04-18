import { bindHandleToRun, initAgent, promptAgent } from "../agent.js";
import { harnessRuntime } from "../harness/singleton.js";
import { appLogger } from "../logger.js";
import { reactiveCompact } from "../context/service.js";
import {
  isProviderTransientError,
  listFailoverCandidateEntryIds,
  withRetry,
} from "../failover.js";
import { resolveModelEntry } from "../providers.js";
import { loadSession } from "../session/facade.js";
import type { ChatRunContext } from "./types.js";

function isPromptTooLongError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes("prompt is too long") ||
    msg.includes("context_length_exceeded") ||
    msg.includes("maximum context length") ||
    msg.includes("too many tokens") ||
    msg.includes("prompt_too_long") ||
    msg.includes("request too large") ||
    msg.includes("请求过长") ||
    (msg.includes("context") && msg.includes("exceed"))
  );
}

function isMaxTokensTruncation(stopReason: string | undefined): boolean {
  if (!stopReason) return false;
  const normalized = stopReason.toLowerCase();
  return normalized === "max_tokens" || normalized === "length";
}

async function promptWithPromptTooLongRecovery(
  context: ChatRunContext,
): Promise<void> {
  if (!context.handle) {
    throw new Error("Agent handle 未就绪，无法执行聊天 run。");
  }

  try {
    await promptAgent(context.handle, context.input.text, context.input.attachments);
  } catch (promptErr) {
    if (
      isPromptTooLongError(promptErr) &&
      !harnessRuntime.isCancelRequested(context.runScope)
    ) {
      appLogger.warn({
        scope: "chat.send",
        message: "检测到 prompt-too-long，尝试反应式 compact 后重试",
        data: {
          sessionId: context.input.sessionId,
          runId: context.input.runId,
          modelEntryId: context.handle.modelEntryId,
        },
      });
      const compacted = await reactiveCompact(context.input.sessionId);
      if (compacted) {
        await promptAgent(context.handle, context.input.text, context.input.attachments);
        return;
      }
    }

    throw promptErr;
  }
}

async function switchExecuteFailoverHandle(
  context: ChatRunContext,
  entryId: string,
): Promise<void> {
  const resolvedModel = resolveModelEntry(entryId);
  const session = loadSession(context.input.sessionId);

  if (!session) {
    throw new Error("会话不存在，无法重建 failover handle。");
  }

  const nextHandle = await initAgent(
    context.input.sessionId,
    context.adapter,
    resolvedModel,
    context.handle?.ownerId,
    session.messages,
  );

  context.handle = nextHandle;
  bindHandleToRun(nextHandle, context.adapter, context.input.runId);
  harnessRuntime.attachHandle(context.runScope, nextHandle);
}

async function executePromptWithFailover(
  context: ChatRunContext,
): Promise<void> {
  if (!context.handle) {
    throw new Error("Agent handle 未就绪，无法执行聊天 run。");
  }

  const prepareFailedEntries = new Set(context.failover.prepare.failedEntries);
  const candidateEntryIds = [
    context.handle.modelEntryId,
    ...listFailoverCandidateEntryIds(context.requestedModelEntryId),
  ].filter(
    (entryId, index, all) =>
      all.indexOf(entryId) === index && !prepareFailedEntries.has(entryId),
  );

  let lastTransientError: unknown = null;

  for (const entryId of candidateEntryIds) {
    if (!context.handle) {
      throw new Error("Agent handle 丢失，无法继续 failover。");
    }

    if (!context.failover.execute.attemptedEntryIds.includes(entryId)) {
      context.failover.execute.attemptedEntryIds.push(entryId);
    }

    if (context.handle.modelEntryId !== entryId) {
      await switchExecuteFailoverHandle(context, entryId);
      appLogger.warn({
        scope: "chat.send",
        message: "执行层 failover 已切到候选模型",
        data: {
          sessionId: context.input.sessionId,
          runId: context.input.runId,
          requestedModelEntryId: context.requestedModelEntryId,
          nextModelEntryId: entryId,
        },
      });
    }

    try {
      await withRetry(
        () => promptWithPromptTooLongRecovery(context),
        {
          maxRetries: entryId === candidateEntryIds[0] ? 1 : 0,
          retryDelayMs: 1_000,
        },
      );
      return;
    } catch (error) {
      context.failover.execute.lastError =
        error instanceof Error ? error.message : String(error);

      if (
        harnessRuntime.isCancelRequested(context.runScope) ||
        !isProviderTransientError(error)
      ) {
        throw error;
      }

      lastTransientError = error;
      appLogger.warn({
        scope: "chat.send",
        message: "执行层模型请求失败，准备尝试下一个候选模型",
        data: {
          sessionId: context.input.sessionId,
          runId: context.input.runId,
          attemptedModelEntryId: entryId,
        },
        error,
      });
    }
  }

  throw (
    lastTransientError instanceof Error
      ? new Error(
        `所有候选模型执行失败：${lastTransientError.message}`,
        { cause: lastTransientError },
      )
      : new Error("所有候选模型执行失败。")
  );
}

export async function executeChatRun(context: ChatRunContext): Promise<void> {
  if (!context.handle) {
    throw new Error("Agent handle 未就绪，无法执行聊天 run。");
  }

  await executePromptWithFailover(context);

  const stopReason = context.adapter.getLastStopReason();
  if (
    isMaxTokensTruncation(stopReason) &&
    !harnessRuntime.isCancelRequested(context.runScope)
  ) {
    appLogger.info({
      scope: "chat.send",
      message: "检测到 max_output_tokens 截断，注入续写指令",
      data: {
        sessionId: context.input.sessionId,
        runId: context.input.runId,
        stopReason,
      },
    });
    try {
      await promptAgent(
        context.handle,
        "直接继续，不要道歉，不要回顾，从中断处接着写。",
        [],
      );
    } catch (contErr) {
      appLogger.warn({
        scope: "chat.send",
        message: "max_tokens 续写失败",
        error: contErr,
      });
    }
  }
}
