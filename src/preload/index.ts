import { contextBridge, ipcRenderer } from "electron";
import type {
  AgentRunScope,
  ChatSession,
  DesktopApi,
  EnqueueQueuedMessageInput,
  RemoveQueuedMessageInput,
  PendingApprovalGroup,
  InterruptedApprovalGroup,
  InterruptedApprovalNotice,
  SessionSearchResult,
  SessionGroup,
  WindowFrameState,
  SendMessageInput,
  TriggerQueuedMessageInput,
  SessionGroupCreateInput,
  TrimSessionMessagesInput,
} from "../shared/contracts.ts";
import type { AgentEvent, ConfirmationResponse } from "../shared/agent-events.ts";
import type { ClipboardShelfState } from "../shared/clipboard-shelf.ts";
import type { PlannerItem } from "../shared/planner.ts";
import {
  IPC_CHANNELS,
  IPC_ERROR_MESSAGE_PREFIX,
  WORKSPACE_PAGES,
  type IpcErrorPayload,
  type WorkspacePage,
} from "../shared/ipc.ts";

type DesktopIpcError = Error & IpcErrorPayload;

let pendingWorkspacePage: WorkspacePage | undefined;
let pendingTaskFocus: string | undefined;
let pendingSessionFocus: string | undefined;
let sessionFocusListener: ((sessionId: string) => void) | undefined;
ipcRenderer.on(IPC_CHANNELS.windowFocusSession, (_event, value: unknown) => {
  if (typeof value !== "string" || !value || value.length > 128) return;
  if (sessionFocusListener) sessionFocusListener(value);
  else pendingSessionFocus = value;
});
let taskFocusListener: ((taskId: string) => void) | undefined;
ipcRenderer.on(IPC_CHANNELS.windowFocusTask, (_event, value: unknown) => {
  if (typeof value !== "string" || !value || value.length > 128) return;
  if (taskFocusListener) taskFocusListener(value);
  else pendingTaskFocus = value;
});
let workspacePageListener: ((page: WorkspacePage) => void) | undefined;
ipcRenderer.on(IPC_CHANNELS.windowWorkspacePageRequested, (_event, value: unknown) => {
  if (typeof value !== "string" || !Object.hasOwn(WORKSPACE_PAGES, value)) return;
  const page = value as WorkspacePage;
  if (workspacePageListener) workspacePageListener(page);
  else pendingWorkspacePage = page;
});

function isIpcErrorPayload(value: unknown): value is IpcErrorPayload {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).code === "string" &&
    typeof (value as Record<string, unknown>).message === "string"
  );
}

function decodeIpcErrorPayload(error: unknown): IpcErrorPayload | null {
  if (isIpcErrorPayload(error)) {
    return error;
  }

  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  const prefixIndex = message.indexOf(IPC_ERROR_MESSAGE_PREFIX);
  if (prefixIndex < 0) {
    return null;
  }

  const encoded = message.slice(prefixIndex + IPC_ERROR_MESSAGE_PREFIX.length).trim();
  try {
    const parsed = JSON.parse(encoded) as unknown;
    return isIpcErrorPayload(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function createDesktopIpcError(payload: IpcErrorPayload): DesktopIpcError {
  const error = new Error(payload.message) as DesktopIpcError;
  error.code = payload.code;
  return error;
}

async function invokeIpc<T = unknown>(
  channel: string,
  ...args: unknown[]
): Promise<T> {
  try {
    return await ipcRenderer.invoke(channel, ...args);
  } catch (error) {
    const payload = decodeIpcErrorPayload(error) ?? {
      code: "IPC_INVOKE_FAILED",
      message: error instanceof Error ? error.message : "IPC 调用失败。",
    };
    throw createDesktopIpcError(payload);
  }
}

const desktopApi: DesktopApi = {
  files: {
    pick: () => invokeIpc(IPC_CHANNELS.filesPick),
    readPreview: (filePath: string) => invokeIpc(IPC_CHANNELS.filesReadPreview, filePath),
    readImageDataUrl: (filePath: string) => invokeIpc(IPC_CHANNELS.filesReadImageDataUrl, filePath),
    saveFromClipboard: (payload) => invokeIpc(IPC_CHANNELS.filesSaveFromClipboard, payload),
  },
  sessions: {
    list: () => invokeIpc(IPC_CHANNELS.sessionsList),
    load: (sessionId: string) => invokeIpc(IPC_CHANNELS.sessionsLoad, sessionId),
    save: (session: ChatSession) => invokeIpc(IPC_CHANNELS.sessionsSave, session),
    create: () => invokeIpc(IPC_CHANNELS.sessionsCreate),
    archive: (sessionId: string) => invokeIpc(IPC_CHANNELS.sessionsArchive, sessionId),
    unarchive: (sessionId: string) => invokeIpc(IPC_CHANNELS.sessionsUnarchive, sessionId),
    listArchived: () => invokeIpc(IPC_CHANNELS.sessionsListArchived),
    delete: (sessionId: string) => invokeIpc(IPC_CHANNELS.sessionsDelete, sessionId),
    setGroup: (sessionId: string, groupId: string | null) => invokeIpc(IPC_CHANNELS.sessionsSetGroup, sessionId, groupId),
    rename: (sessionId: string, title: string) => invokeIpc(IPC_CHANNELS.sessionsRename, sessionId, title),
    setPinned: (sessionId: string, pinned: boolean) => invokeIpc(IPC_CHANNELS.sessionsSetPinned, sessionId, pinned),
    search: (query: string, limit?: number): Promise<SessionSearchResult[]> =>
      invokeIpc(IPC_CHANNELS.sessionsSearch, query, limit),
    reindexSearch: (): Promise<void> =>
      invokeIpc(IPC_CHANNELS.sessionsReindexSearch),
  },
  groups: {
    list: (): Promise<SessionGroup[]> => invokeIpc(IPC_CHANNELS.groupsList),
    create: (input: SessionGroupCreateInput): Promise<SessionGroup> =>
      invokeIpc(IPC_CHANNELS.groupsCreate, input),
    rename: (groupId: string, name: string): Promise<void> => invokeIpc(IPC_CHANNELS.groupsRename, groupId, name),
    delete: (groupId: string): Promise<void> => invokeIpc(IPC_CHANNELS.groupsDelete, groupId),
  },
  chat: {
    send: (input: SendMessageInput) => invokeIpc(IPC_CHANNELS.chatSend, input),
    trimSessionMessages: (input: TrimSessionMessagesInput) =>
      invokeIpc(IPC_CHANNELS.chatTrimSessionMessages, input),
    enqueueQueuedMessage: (input: EnqueueQueuedMessageInput) =>
      invokeIpc(IPC_CHANNELS.chatEnqueueQueuedMessage, input),
    triggerQueuedMessage: (input: TriggerQueuedMessageInput) =>
      invokeIpc(IPC_CHANNELS.chatTriggerQueuedMessage, input),
    removeQueuedMessage: (input: RemoveQueuedMessageInput) =>
      invokeIpc(IPC_CHANNELS.chatRemoveQueuedMessage, input),
  },
  context: {
    getSummary: (sessionId: string) =>
      invokeIpc(IPC_CHANNELS.contextGetSummary, sessionId),
    compact: (sessionId: string) =>
      invokeIpc(IPC_CHANNELS.contextCompact, sessionId),
  },

  // ── Agent (wired in Phase 1) ──────────────────────────────
  agent: {
    onEvent: (callback: (event: AgentEvent) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, event: AgentEvent) => callback(event);
      ipcRenderer.on(IPC_CHANNELS.agentEvent, handler);
      return () => { ipcRenderer.removeListener(IPC_CHANNELS.agentEvent, handler); };
    },
    cancel: (scope: AgentRunScope) => invokeIpc(IPC_CHANNELS.agentCancel, scope),
    confirmResponse: (response: ConfirmationResponse) =>
      invokeIpc(IPC_CHANNELS.agentConfirmResponse, response),
    listPendingApprovalGroups: (sessionId?: string): Promise<PendingApprovalGroup[]> =>
      invokeIpc(IPC_CHANNELS.agentListPendingApprovalGroups, sessionId),
    listInterruptedApprovals: (sessionId?: string): Promise<InterruptedApprovalNotice[]> =>
      invokeIpc(IPC_CHANNELS.agentListInterruptedApprovals, sessionId),
    listInterruptedApprovalGroups: (sessionId?: string): Promise<InterruptedApprovalGroup[]> =>
      invokeIpc(IPC_CHANNELS.agentListInterruptedApprovalGroups, sessionId),
    dismissInterruptedApproval: (runId: string): Promise<boolean> =>
      invokeIpc(IPC_CHANNELS.agentDismissInterruptedApproval, runId),
    resumeInterruptedApproval: (runId: string): Promise<string> =>
      invokeIpc(IPC_CHANNELS.agentResumeInterruptedApproval, runId),
  },

  // ── Settings (wired in Phase 1) ───────────────────────────
  settings: {
    get: () => invokeIpc(IPC_CHANNELS.settingsGet),
    update: (partial) => invokeIpc(IPC_CHANNELS.settingsUpdate, partial),
    getLogSnapshot: () => invokeIpc(IPC_CHANNELS.settingsGetLogSnapshot),
    openLogFolder: (logId) => invokeIpc(IPC_CHANNELS.settingsOpenLogFolder, logId),
  },
  runtime: {
    getDiagnostics: () => invokeIpc(IPC_CHANNELS.runtimeGetDiagnostics),
  },
  memory: {
    add: (input) => invokeIpc(IPC_CHANNELS.memoryAdd, input),
    search: (query, limit) => invokeIpc(IPC_CHANNELS.memorySearch, query, limit),
    list: (input) => invokeIpc(IPC_CHANNELS.memoryList, input),
    getStats: () => invokeIpc(IPC_CHANNELS.memoryGetStats),
    rebuild: () => invokeIpc(IPC_CHANNELS.memoryRebuild),
    delete: (memoryId) => invokeIpc(IPC_CHANNELS.memoryDelete, memoryId),
    feedback: (memoryId, delta) =>
      invokeIpc(IPC_CHANNELS.memoryFeedback, memoryId, delta),
  },
  skills: {
    listInstalled: () => invokeIpc(IPC_CHANNELS.skillsListInstalled),
    searchCatalog: (query: string) => invokeIpc(IPC_CHANNELS.skillsSearchCatalog, query),
    install: (request) => invokeIpc(IPC_CHANNELS.skillsInstall, request),
    openDirectory: (skillId: string, source) =>
      invokeIpc(IPC_CHANNELS.skillsOpenDirectory, skillId, source),
    openSkillFile: (skillId: string, source) =>
      invokeIpc(IPC_CHANNELS.skillsOpenSkillFile, skillId, source),
  },
  mcp: {
    listStatus: () => invokeIpc(IPC_CHANNELS.mcpListStatus),
    reloadConfig: () => invokeIpc(IPC_CHANNELS.mcpReloadConfig),
    restartServer: (serverName: string) =>
      invokeIpc(IPC_CHANNELS.mcpRestartServer, serverName),
    disconnectServer: (serverName: string) =>
      invokeIpc(IPC_CHANNELS.mcpDisconnectServer, serverName),
    openConfig: () => invokeIpc(IPC_CHANNELS.mcpOpenConfig),
    saveServer: (draft) => invokeIpc(IPC_CHANNELS.mcpSaveServer, draft),
    deleteServer: (serverName: string) =>
      invokeIpc(IPC_CHANNELS.mcpDeleteServer, serverName),
  },
  plugins: {
    listStatus: () => invokeIpc(IPC_CHANNELS.pluginsListStatus),
    setEnabled: (pluginId: string, enabled: boolean) =>
      invokeIpc(IPC_CHANNELS.pluginsSetEnabled, pluginId, enabled),
    openRootDirectory: () => invokeIpc(IPC_CHANNELS.pluginsOpenRootDirectory),
    openDirectory: (pluginId: string) =>
      invokeIpc(IPC_CHANNELS.pluginsOpenDirectory, pluginId),
    openManifest: (pluginId: string) =>
      invokeIpc(IPC_CHANNELS.pluginsOpenManifest, pluginId),
  },

  // ── Providers / Models ─────────────────────────────────────
  providers: {
    listSources: () => invokeIpc(IPC_CHANNELS.providersListSources),
    getSource: (sourceId) => invokeIpc(IPC_CHANNELS.providersGetSource, sourceId),
    saveSource: (draft) => invokeIpc(IPC_CHANNELS.providersSaveSource, draft),
    deleteSource: (sourceId) => invokeIpc(IPC_CHANNELS.providersDeleteSource, sourceId),
    testSource: (draft) => invokeIpc(IPC_CHANNELS.providersTestSource, draft),
    fetchModels: (draft) => invokeIpc(IPC_CHANNELS.providersFetchModels, draft),
    getCredentials: (sourceId) => invokeIpc(IPC_CHANNELS.providersGetCredentials, sourceId),
    setCredentials: (sourceId, apiKey) => invokeIpc(IPC_CHANNELS.providersSetCredentials, sourceId, apiKey),
  },
  models: {
    listEntries: () => invokeIpc(IPC_CHANNELS.modelsListEntries),
    listEntriesBySource: (sourceId) => invokeIpc(IPC_CHANNELS.modelsListEntriesBySource, sourceId),
    saveEntry: (draft) => invokeIpc(IPC_CHANNELS.modelsSaveEntry, draft),
    deleteEntry: (entryId) => invokeIpc(IPC_CHANNELS.modelsDeleteEntry, entryId),
    getEntry: (entryId) => invokeIpc(IPC_CHANNELS.modelsGetEntry, entryId),
  },

  // ── Workspace (wired in Phase 5) ──────────────────────────
  workspace: {
    change: (path) => invokeIpc(IPC_CHANNELS.workspaceChange, path),
    getSoul: () => invokeIpc(IPC_CHANNELS.workspaceGetSoul),
    pickFolder: () => invokeIpc(IPC_CHANNELS.workspacePickFolder),
    openFolder: () => invokeIpc(IPC_CHANNELS.workspaceOpenFolder),
    listDirectory: (relativePath?: string) =>
      invokeIpc(IPC_CHANNELS.workspaceListDirectory, relativePath),
    readFilePreview: (relativePath: string) =>
      invokeIpc(IPC_CHANNELS.workspaceReadFilePreview, relativePath),
  },

  // ── Terminal (wired in Phase 7) ───────────────────────────
  terminal: {
    create: (options) => invokeIpc(IPC_CHANNELS.terminalCreate, options),
    attach: (id) => invokeIpc(IPC_CHANNELS.terminalAttach, id),
    list: () => invokeIpc(IPC_CHANNELS.terminalList),
    write: (id, data) => invokeIpc(IPC_CHANNELS.terminalWrite, id, data),
    resize: (id, cols, rows) => invokeIpc(IPC_CHANNELS.terminalResize, id, cols, rows),
    destroy: (id) => invokeIpc(IPC_CHANNELS.terminalDestroy, id),
    onData: (callback: (terminalId: string, data: string) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, id: string, data: string) => callback(id, data);
      ipcRenderer.on(IPC_CHANNELS.terminalData, handler);
      return () => { ipcRenderer.removeListener(IPC_CHANNELS.terminalData, handler); };
    },
    onExit: (callback: (terminalId: string, exitCode: number) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, id: string, code: number) => callback(id, code);
      ipcRenderer.on(IPC_CHANNELS.terminalExit, handler);
      return () => { ipcRenderer.removeListener(IPC_CHANNELS.terminalExit, handler); };
    },
  },
  git: {
    getSnapshotForDirectory: (directory) => invokeIpc(IPC_CHANNELS.gitTaskSnapshot, directory),
    getSummary: () => invokeIpc(IPC_CHANNELS.gitSummary),
    getSnapshot: () => invokeIpc(IPC_CHANNELS.gitStatus),
    listBranches: () => invokeIpc(IPC_CHANNELS.gitListBranches),
    switchBranch: (branchName: string) =>
      invokeIpc(IPC_CHANNELS.gitSwitchBranch, branchName),
    createAndSwitchBranch: (branchName: string) =>
      invokeIpc(IPC_CHANNELS.gitCreateBranch, branchName),
    stageFiles: (paths: string[]) => invokeIpc(IPC_CHANNELS.gitStageFiles, paths),
    unstageFiles: (paths: string[]) => invokeIpc(IPC_CHANNELS.gitUnstageFiles, paths),
    commit: (input) => invokeIpc(IPC_CHANNELS.gitCommit, input),
    push: () => invokeIpc(IPC_CHANNELS.gitPush),
    pull: () => invokeIpc(IPC_CHANNELS.gitPull),
  },
  worker: {
    generateCommitMessage: (request) =>
      invokeIpc(IPC_CHANNELS.workerGenerateCommitMessage, request),
    generateCommitPlan: (request) =>
      invokeIpc(IPC_CHANNELS.workerGenerateCommitPlan, request),
  },

  ui: {
    getState: () => invokeIpc(IPC_CHANNELS.uiGetState),
    setDiffPanelOpen: (open: boolean) => invokeIpc(IPC_CHANNELS.uiSetDiffPanelOpen, open),
    setRightPanelState: (partial) => invokeIpc(IPC_CHANNELS.uiSetRightPanelState, partial),
  },
  window: {
    showCompanion: () => invokeIpc(IPC_CHANNELS.windowShowCompanion),
    onSessionFocusRequested: (listener) => {
      sessionFocusListener = listener;
      if (pendingSessionFocus) {
        const sessionId = pendingSessionFocus;
        pendingSessionFocus = undefined;
        listener(sessionId);
      }
      return () => { if (sessionFocusListener === listener) sessionFocusListener = undefined; };
    },
    onTaskFocusRequested: (listener) => {
      taskFocusListener = listener;
      if (pendingTaskFocus) {
        const taskId = pendingTaskFocus;
        pendingTaskFocus = undefined;
        listener(taskId);
      }
      return () => { if (taskFocusListener === listener) taskFocusListener = undefined; };
    },
    onWorkspacePageRequested: (listener) => {
      workspacePageListener = listener;
      if (pendingWorkspacePage !== undefined) {
        const page = pendingWorkspacePage;
        pendingWorkspacePage = undefined;
        listener(page);
      }
      return () => {
        if (workspacePageListener === listener) workspacePageListener = undefined;
      };
    },
    getState: () => invokeIpc(IPC_CHANNELS.windowGetState),
    getBounds: () => invokeIpc(IPC_CHANNELS.windowGetBounds),
    setBounds: (bounds) => invokeIpc(IPC_CHANNELS.windowSetBounds, bounds),
    minimize: () => ipcRenderer.send(IPC_CHANNELS.windowMinimize),
    toggleMaximize: () => invokeIpc(IPC_CHANNELS.windowToggleMaximize),
    close: () => ipcRenderer.send(IPC_CHANNELS.windowClose),
    onStateChange: (listener: (state: WindowFrameState) => void) => {
      const wrappedListener = (_event: Electron.IpcRendererEvent, state: WindowFrameState) => {
        listener(state);
      };
      ipcRenderer.on(IPC_CHANNELS.windowStateChanged, wrappedListener);
      return () => { ipcRenderer.removeListener(IPC_CHANNELS.windowStateChanged, wrappedListener); };
    },
  },
  quickInvoke: {
    onFocusComposer: (listener: () => void) => {
      const handler = () => listener();
      ipcRenderer.on("quick-invoke:focus-composer", handler);
      return () => { ipcRenderer.removeListener("quick-invoke:focus-composer", handler); };
    },
  },
  clipboardShelf: {
    show: () => invokeIpc(IPC_CHANNELS.clipboardShelfShow),
    getState: () => invokeIpc(IPC_CHANNELS.clipboardShelfGetState),
    setPaused: (paused) => invokeIpc(IPC_CHANNELS.clipboardShelfSetPaused, paused),
    copy: (id) => invokeIpc(IPC_CHANNELS.clipboardShelfCopy, id),
    remove: (id) => invokeIpc(IPC_CHANNELS.clipboardShelfRemove, id),
    clear: () => invokeIpc(IPC_CHANNELS.clipboardShelfClear),
    onChange: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, snapshot: ClipboardShelfState) => listener(snapshot);
      ipcRenderer.on(IPC_CHANNELS.clipboardShelfChanged, handler);
      return () => { ipcRenderer.removeListener(IPC_CHANNELS.clipboardShelfChanged, handler); };
    },
  },
  planner: {
    startCodex: (id, updatedAt) => invokeIpc(IPC_CHANNELS.plannerStartCodex, id, updatedAt),
    cancelCodex: (taskId, executionId) => invokeIpc(IPC_CHANNELS.plannerCancelCodex, taskId, executionId),
    discuss: (id, updatedAt) => invokeIpc(IPC_CHANNELS.plannerDiscuss, id, updatedAt),
    recordExecution: (taskId, update) => invokeIpc(IPC_CHANNELS.plannerRecordExecution, taskId, update),
    list: () => invokeIpc(IPC_CHANNELS.plannerList),
    save: (input, expectedUpdatedAt) => invokeIpc(IPC_CHANNELS.plannerSave, input, expectedUpdatedAt),
    remove: (id, expectedUpdatedAt) => invokeIpc(IPC_CHANNELS.plannerRemove, id, expectedUpdatedAt),
    show: (taskId) => invokeIpc(IPC_CHANNELS.plannerShow, taskId),
    onChange: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, items: PlannerItem[]) => listener(items);
      ipcRenderer.on(IPC_CHANNELS.plannerChanged, handler);
      return () => { ipcRenderer.removeListener(IPC_CHANNELS.plannerChanged, handler); };
    },
  },
};

contextBridge.exposeInMainWorld("desktopApi", desktopApi);
