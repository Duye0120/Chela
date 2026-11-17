import type {
  GenerateCommitMessageRequest,
  GenerateCommitPlanRequest,
} from "../../shared/contracts.ts";
import { IPC_CHANNELS } from "../../shared/ipc.ts";
import { handleIpc } from "./handle.ts";
import { WorkerService } from "../worker-service.ts";
import {
  getDiffForFiles,
  getGitBranchSummary,
  getLatestCommitSubject,
} from "../git.ts";
import { getSettings } from "../settings.ts";

export function registerWorkerIpc(): void {
  handleIpc(
    IPC_CHANNELS.workerGenerateCommitMessage,
    async (_event, request: GenerateCommitMessageRequest) => {
      const workspacePath = getSettings().workspace;
      let diffContent = request.diffContent;

      // If UI didn't provide diff content, fetch it from git in the main process.
      if (!diffContent || diffContent.trim().length === 0) {
        const filePaths = request.selectedFiles.map((f) => f.path);
        if (filePaths.length > 0) {
          diffContent = await getDiffForFiles(workspacePath, filePaths);
        }
      }

      const [branchSummary, latestCommitSubject] = await Promise.all([
        getGitBranchSummary(workspacePath),
        getLatestCommitSubject(workspacePath),
      ]);

      return WorkerService.generateCommitMessage({
        selectedFiles: request.selectedFiles,
        diffContent,
        branchName: branchSummary.branchName,
        latestCommitSubject,
      });
    },
  );

  handleIpc(
    IPC_CHANNELS.workerGenerateCommitPlan,
    async (_event, request: GenerateCommitPlanRequest) => {
      const workspacePath = getSettings().workspace;
      let diffContent = request.diffContent;

      if (!diffContent || diffContent.trim().length === 0) {
        const filePaths = request.selectedFiles.map((file) => file.path);
        if (filePaths.length > 0) {
          diffContent = await getDiffForFiles(workspacePath, filePaths);
        }
      }

      const [branchSummary, latestCommitSubject] = await Promise.all([
        getGitBranchSummary(workspacePath),
        getLatestCommitSubject(workspacePath),
      ]);

      return WorkerService.generateCommitPlan({
        selectedFiles: request.selectedFiles,
        diffContent,
        branchName: branchSummary.branchName,
        latestCommitSubject,
      });
    },
  );
}
