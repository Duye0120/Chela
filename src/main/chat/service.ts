import type { SendMessageInput } from "../../shared/contracts.js";
import { cancelChatRun } from "./cancel.js";
import { executeChatRun } from "./execute.js";
import {
  completeChatRun,
  finalizeCompletedChatRun,
  finalizeFailedChatRun,
} from "./finalize.js";
import { prepareChatRun, createChatRunContext } from "./prepare.js";

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

export { cancelChatRun };
