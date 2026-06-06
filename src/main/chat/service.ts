import { randomUUID } from "node:crypto";
import type {
  EnqueueQueuedMessageInput,
  RemoveQueuedMessageInput,
  SendMessageInput,
  TriggerQueuedMessageInput,
} from "../../shared/contracts.ts";
import {
  enqueueSessionQueuedMessage,
  moveSessionQueuedMessageToFront,
  removeSessionQueuedMessage,
} from "../session/facade.ts";
import { cancelChatRun } from "./cancel.ts";
import { executeChatRun } from "./execute.ts";
import {
  completeChatRun,
  finalizeCompletedChatRun,
  finalizeFailedChatRun,
} from "./finalize.ts";
import { createChatRunContext, prepareChatRun } from "./prepare.ts";

export async function sendChatMessage(input: SendMessageInput): Promise<void> {
  const context = createChatRunContext(input);

  try {
    await prepareChatRun(context);
    await executeChatRun(context);
    await finalizeCompletedChatRun(context);
  } catch (err) {
    await finalizeFailedChatRun(context, err);
  } finally {
    completeChatRun(context);
  }
}

export async function enqueueQueuedMessage(
  input: EnqueueQueuedMessageInput,
): Promise<import("../../shared/contracts.ts").QueuedMessage> {
  const nextText = input.text.trim();
  if (!nextText) {
    throw new Error("排队消息不能为空。");
  }

  return enqueueSessionQueuedMessage(input.sessionId, {
    text: nextText,
    displayText: input.displayText,
    browserContextItems: input.browserContextItems,
    source: input.source,
  });
}

export async function triggerQueuedMessage(
  input: TriggerQueuedMessageInput,
): Promise<void> {
  moveSessionQueuedMessageToFront(
    input.sessionId,
    input.messageId,
  );
}

export async function removeQueuedMessage(
  input: RemoveQueuedMessageInput,
): Promise<void> {
  removeSessionQueuedMessage(input.sessionId, input.messageId);
}

export { cancelChatRun };
