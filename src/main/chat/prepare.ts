import {
  bindHandleToRun,
  getHandle,
  initAgent,
  type AgentHandle,
} from "../agent.js";
import { ElectronAdapter } from "../adapter.js";
import { PRIMARY_AGENT_OWNER } from "../agent-owners.js";
import { harnessRuntime } from "../harness/singleton.js";
import { appLogger } from "../logger.js";
import { resolveWithFailover } from "../failover.js";
import { getGitDiffSnapshot } from "../git.js";
import { getSettings } from "../settings.js";
import {
  appendRunStartedEvent,
  appendUserMessageEvent,
} from "../session/service.js";
import { loadSession } from "../session/facade.js";
import { requireMainWindow } from "../window.js";
import { BUS_EVENTS, bus } from "../event-bus.js";
import type { ChatRunContext } from "./types.js";
import type { SendMessageInput } from "../../shared/contracts.js";
import type { ResolvedRuntimeModel } from "../model-resolution.js";

function isHandlePromptRuntimeCurrent(
  handle: AgentHandle,
  resolvedModel: ResolvedRuntimeModel,
): boolean {
  return (
    handle.promptRuntime.sourceName === resolvedModel.source.name &&
    handle.promptRuntime.providerType === resolvedModel.source.providerType &&
    handle.promptRuntime.modelName === resolvedModel.entry.name &&
    handle.promptRuntime.modelId === resolvedModel.entry.modelId
  );
}

export function createChatRunContext(input: SendMessageInput): ChatRunContext {
  const settings = getSettings();
  const existingSession = loadSession(input.sessionId);
  if (!existingSession) {
    throw new Error("会话不存在，无法继续发送。");
  }

  const requestedModelEntryId =
    input.modelEntryId?.trim() || settings.modelRouting.chat.modelId;
  const failoverResult = resolveWithFailover(requestedModelEntryId);
  const runScope = {
    sessionId: input.sessionId,
    runId: input.runId,
  };
  const adapter = new ElectronAdapter(requireMainWindow(), {
    sessionId: input.sessionId,
    runId: input.runId,
  });

  return {
    input,
    runScope,
    settings,
    existingSession,
    requestedModelEntryId,
    resolvedModel: failoverResult.resolved,
    failover: {
      prepare: {
        failedEntries: failoverResult.failedEntries,
        isFailover: failoverResult.isFailover,
      },
      execute: {
        attemptedEntryIds: [],
        lastError: null,
      },
    },
    adapter,
    createdHandle: false,
    handle: null,
    runCreated: false,
    transcriptStarted: false,
    beforeDiffOverview: null,
  };
}

export async function prepareChatRun(context: ChatRunContext): Promise<void> {
  const { input, runScope, resolvedModel, settings, requestedModelEntryId } = context;
  const origin = input.origin ?? "user";

  appLogger.info({
    scope: "chat.send",
    message: "开始发送消息",
    data: {
      sessionId: input.sessionId,
      runId: input.runId,
      textLength: input.text.length,
      attachmentCount: input.attachments.length,
      origin,
      requestedModelEntryId,
      modelEntryId: resolvedModel.entry.id,
      prepareFailover: context.failover.prepare,
    },
  });

  harnessRuntime.createRun({
    ...runScope,
    ownerId: PRIMARY_AGENT_OWNER,
    modelEntryId: resolvedModel.entry.id,
    runKind: "chat",
    runSource: "user",
    lane: "foreground",
  });
  context.runCreated = true;

  if (origin === "user" || origin === "guided") {
    appendUserMessageEvent({
      sessionId: input.sessionId,
      text: input.text,
      attachments: input.attachments,
      modelEntryId: resolvedModel.entry.id,
      thinkingLevel: settings.thinkingLevel,
      sendOrigin: origin,
    });
    bus.emit(BUS_EVENTS.MESSAGE_USER, {
      sessionId: input.sessionId,
      text: input.text,
    });
  }

  appendRunStartedEvent({
    sessionId: input.sessionId,
    runId: input.runId,
    ownerId: PRIMARY_AGENT_OWNER,
    runKind: "chat",
    modelEntryId: resolvedModel.entry.id,
    thinkingLevel: settings.thinkingLevel,
    metadata: {
      origin,
      requestedModelEntryId,
      prepareFailedEntries: context.failover.prepare.failedEntries,
      prepareFailover: context.failover.prepare.isFailover,
    },
  });
  context.transcriptStarted = true;

  try {
    context.beforeDiffOverview = await getGitDiffSnapshot(settings.workspace);
  } catch (error) {
    context.beforeDiffOverview = null;
    appLogger.warn({
      scope: "chat.send",
      message: "读取运行前 diff 快照失败",
      data: {
        sessionId: input.sessionId,
        runId: input.runId,
      },
      error,
    });
  }

  harnessRuntime.assertRunActive(runScope);

  let handle = getHandle(input.sessionId);
  if (
    !handle ||
    handle.modelEntryId !== resolvedModel.entry.id ||
    handle.runtimeSignature !== resolvedModel.runtimeSignature ||
    !isHandlePromptRuntimeCurrent(handle, resolvedModel) ||
    handle.thinkingLevel !== settings.thinkingLevel
  ) {
    harnessRuntime.assertRunActive(runScope);
    handle = await initAgent(
      input.sessionId,
      context.adapter,
      resolvedModel,
      PRIMARY_AGENT_OWNER,
      context.existingSession.messages,
    );
    context.createdHandle = true;
  }

  context.handle = handle;
  bindHandleToRun(handle, context.adapter, input.runId);
  harnessRuntime.attachHandle(runScope, handle);
  harnessRuntime.assertRunActive(runScope);
}
