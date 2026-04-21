import { IPC_CHANNELS } from "../../shared/ipc.js";
import type {
  EnqueueQueuedMessageInput,
  RemoveQueuedMessageInput,
  TriggerQueuedMessageInput,
  TrimSessionMessagesInput,
} from "../../shared/contracts.js";
import {
  cancelChatRun,
  enqueueQueuedMessage,
  removeQueuedMessage,
  sendChatMessage,
  triggerQueuedMessage,
} from "../chat/service.js";
import { trimSessionMessages } from "../session/facade.js";
import { handleIpc } from "./handle.js";

export function registerChatIpc(): void {
  handleIpc(IPC_CHANNELS.chatSend, async (_event, input) => sendChatMessage(input));
  handleIpc(
    IPC_CHANNELS.chatTrimSessionMessages,
    async (_event, input: TrimSessionMessagesInput) =>
      trimSessionMessages(input.sessionId, input.messageId),
  );
  handleIpc(
    IPC_CHANNELS.chatEnqueueQueuedMessage,
    async (_event, input: EnqueueQueuedMessageInput) =>
      enqueueQueuedMessage(input),
  );
  handleIpc(
    IPC_CHANNELS.chatTriggerQueuedMessage,
    async (_event, input: TriggerQueuedMessageInput) =>
      triggerQueuedMessage(input),
  );
  handleIpc(
    IPC_CHANNELS.chatRemoveQueuedMessage,
    async (_event, input: RemoveQueuedMessageInput) =>
      removeQueuedMessage(input),
  );

  handleIpc(IPC_CHANNELS.agentCancel, async (_event, scope) => cancelChatRun(scope));
}
