import { IPC_CHANNELS } from "../../shared/ipc.ts";
import type { GitCommitInput, RightPanelState } from "../../shared/contracts.ts";
import {
  createAndSwitchGitBranch,
  getGitBranchSummary,
  getGitDiffSnapshot,
  listGitBranches,
  switchGitBranch,
  stageGitFiles,
  unstageGitFiles,
  commitGitChanges,
  pullGitChanges,
  pushGitChanges,
} from "../git.ts";
import { getSettings } from "../settings.ts";
import {
  createTerminal,
  destroyTerminal,
  resizeTerminal,
  writeTerminal,
} from "../terminal.ts";
import { getUiState, setDiffPanelOpen, setRightPanelState } from "../ui-state.ts";
import { handleIpc } from "./handle.ts";
import {
  validateGitBranchNamePayload,
  validateGitCommitPayload,
  validateGitPathsPayload,
} from "./schema.ts";

export function registerWorkbenchIpc(): void {
  handleIpc(
    IPC_CHANNELS.terminalCreate,
    async (_event, options?: { cwd?: string }) => createTerminal(options),
  );
  handleIpc(
    IPC_CHANNELS.terminalWrite,
    async (_event, id: string, data: string) => writeTerminal(id, data),
  );
  handleIpc(
    IPC_CHANNELS.terminalResize,
    async (_event, id: string, cols: number, rows: number) =>
      resizeTerminal(id, cols, rows),
  );
  handleIpc(IPC_CHANNELS.terminalDestroy, async (_event, id: string) =>
    destroyTerminal(id),
  );
  handleIpc(IPC_CHANNELS.gitSummary, async () =>
    getGitBranchSummary(getSettings().workspace),
  );
  handleIpc(IPC_CHANNELS.gitStatus, async () =>
    getGitDiffSnapshot(getSettings().workspace),
  );
  handleIpc(IPC_CHANNELS.gitListBranches, async () =>
    listGitBranches(getSettings().workspace),
  );
  handleIpc(
    IPC_CHANNELS.gitSwitchBranch,
    async (_event, branchName: string) =>
      switchGitBranch(
        getSettings().workspace,
        validateGitBranchNamePayload(IPC_CHANNELS.gitSwitchBranch, branchName),
      ),
  );
  handleIpc(
    IPC_CHANNELS.gitCreateBranch,
    async (_event, branchName: string) =>
      createAndSwitchGitBranch(
        getSettings().workspace,
        validateGitBranchNamePayload(IPC_CHANNELS.gitCreateBranch, branchName),
      ),
  );
  handleIpc(
    IPC_CHANNELS.gitStageFiles,
    async (_event, paths: string[]) =>
      stageGitFiles(
        getSettings().workspace,
        validateGitPathsPayload(IPC_CHANNELS.gitStageFiles, paths),
      ),
  );
  handleIpc(
    IPC_CHANNELS.gitUnstageFiles,
    async (_event, paths: string[]) =>
      unstageGitFiles(
        getSettings().workspace,
        validateGitPathsPayload(IPC_CHANNELS.gitUnstageFiles, paths),
      ),
  );
  handleIpc(
    IPC_CHANNELS.gitCommit,
    async (_event, input: GitCommitInput) => {
      const payload = validateGitCommitPayload(input);
      return commitGitChanges(getSettings().workspace, payload.message, payload.paths);
    },
  );
  handleIpc(
    IPC_CHANNELS.gitPush,
    async () => pushGitChanges(getSettings().workspace),
  );
  handleIpc(
    IPC_CHANNELS.gitPull,
    async () => pullGitChanges(getSettings().workspace),
  );
  handleIpc(IPC_CHANNELS.uiGetState, async () => getUiState());
  handleIpc(
    IPC_CHANNELS.uiSetDiffPanelOpen,
    async (_event, open: boolean) => setDiffPanelOpen(open),
  );
  handleIpc(
    IPC_CHANNELS.uiSetRightPanelState,
    async (_event, partial: Partial<RightPanelState>) => setRightPanelState(partial),
  );
}
