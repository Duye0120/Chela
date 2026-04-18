import { randomUUID } from "node:crypto";
import type {
  RedirectMessageInput,
  SendMessageInput,
} from "../../shared/contracts.js";
import { harnessRuntime } from "../harness/singleton.js";
import {
  clearSessionRedirectDraft,
  getSessionRedirectDraft,
  loadSession,
  setSessionRedirectDraft,
} from "../session/facade.js";
import { cancelChatRun } from "./cancel.js";
import { executeChatRun } from "./execute.js";
import {
  completeChatRun,
  finalizeCompletedChatRun,
  finalizeFailedChatRun,
} from "./finalize.js";
import { prepareChatRun, createChatRunContext } from "./prepare.js";

async function dispatchPendingRedirect(sessionId: string): Promise<boolean> {
  if (harnessRuntime.getActiveRunBySession(sessionId)) {
    return false;
  }

  const redirectDraft = getSessionRedirectDraft(sessionId);
  if (!redirectDraft) {
    return false;
  }

  const session = loadSession(sessionId);
  if (!session) {
    return false;
  }

  clearSessionRedirectDraft(sessionId);

  try {
    await sendChatMessage({
      sessionId,
      runId: randomUUID(),
      text: redirectDraft,
      attachments: [],
    });
    return true;
  } catch (error) {
    setSessionRedirectDraft(sessionId, redirectDraft);
    throw error;
  }
}

export async function sendChatMessage(input: SendMessageInput): Promise<void> {
  const context = createChatRunContext(input);

  try {
    await prepareChatRun(context);
    await executeChatRun(context);
    await finalizeCompletedChatRun(context);
    await dispatchPendingRedirect(input.sessionId);
  } catch (err) {
    await finalizeFailedChatRun(context, err);
  } finally {
    completeChatRun(context);
  }
}

export async function queueRedirectMessage(
  input: RedirectMessageInput,
): Promise<void> {
  const nextText = input.text.trim();
  if (!nextText) {
    throw new Error("引导内容不能为空。");
  }

  setSessionRedirectDraft(input.sessionId, nextText);

  const activeRun = harnessRuntime.getActiveRunBySession(input.sessionId);
  if (activeRun && (!input.runId || activeRun.runId === input.runId)) {
    return;
  }

  await dispatchPendingRedirect(input.sessionId);
}

export function clearRedirectDraft(sessionId: string): void {
  clearSessionRedirectDraft(sessionId);
}

export { cancelChatRun };
