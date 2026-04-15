import type { GenerateCommitMessageRequest } from "../../shared/contracts.js";
import { IPC_CHANNELS } from "../../shared/ipc.js";
import { handleIpc } from "./handle.js";
import { WorkerService } from "../worker-service.js";

export function registerWorkerIpc(): void {
  handleIpc(
    IPC_CHANNELS.workerGenerateCommitMessage,
    async (_event, request: GenerateCommitMessageRequest) => {
      return WorkerService.generateCommitMessage(request);
    },
  );
}
