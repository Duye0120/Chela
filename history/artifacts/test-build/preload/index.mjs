import { contextBridge, ipcRenderer } from "electron";
const IPC_CHANNELS = {
  // Files
  filesPick: "files:pick",
  filesReadPreview: "files:read-preview",
  filesReadImageDataUrl: "files:read-image-data-url",
  filesSaveFromClipboard: "files:save-from-clipboard",
  // Sessions
  sessionsList: "sessions:list",
  sessionsLoad: "sessions:load",
  sessionsSave: "sessions:save",
  sessionsCreate: "sessions:create",
  sessionsArchive: "sessions:archive",
  sessionsUnarchive: "sessions:unarchive",
  sessionsListArchived: "sessions:list-archived",
  sessionsDelete: "sessions:delete",
  sessionsSetGroup: "sessions:set-group",
  sessionsRename: "sessions:rename",
  sessionsSetPinned: "sessions:set-pinned",
  // Groups
  groupsList: "groups:list",
  groupsCreate: "groups:create",
  groupsRename: "groups:rename",
  groupsDelete: "groups:delete",
  // Chat
  chatSend: "chat:send",
  chatTrimSessionMessages: "chat:trim-session-messages",
  contextGetSummary: "context:get-summary",
  contextCompact: "context:compact",
  // Agent events (main → renderer push)
  agentEvent: "agent:event",
  agentCancel: "agent:cancel",
  agentConfirmResponse: "agent:confirm-response",
  agentListPendingApprovalGroups: "agent:list-pending-approval-groups",
  agentListInterruptedApprovals: "agent:list-interrupted-approvals",
  agentListInterruptedApprovalGroups: "agent:list-interrupted-approval-groups",
  agentDismissInterruptedApproval: "agent:dismiss-interrupted-approval",
  agentResumeInterruptedApproval: "agent:resume-interrupted-approval",
  // Settings
  settingsGet: "settings:get",
  settingsUpdate: "settings:update",
  settingsGetLogSnapshot: "settings:get-log-snapshot",
  settingsOpenLogFolder: "settings:open-log-folder",
  // Providers
  providersListSources: "providers:list-sources",
  providersGetSource: "providers:get-source",
  providersSaveSource: "providers:save-source",
  providersDeleteSource: "providers:delete-source",
  providersTestSource: "providers:test-source",
  providersGetCredentials: "providers:get-credentials",
  providersSetCredentials: "providers:set-credentials",
  // Models
  modelsListEntries: "models:list-entries",
  modelsListEntriesBySource: "models:list-entries-by-source",
  modelsSaveEntry: "models:save-entry",
  modelsDeleteEntry: "models:delete-entry",
  modelsGetEntry: "models:get-entry",
  // Workspace
  workspaceChange: "workspace:change",
  workspaceGetSoul: "workspace:get-soul",
  workspacePickFolder: "workspace:pick-folder",
  workspaceOpenFolder: "workspace:open-folder",
  // Terminal (main ↔ renderer)
  terminalCreate: "terminal:create",
  terminalWrite: "terminal:write",
  terminalResize: "terminal:resize",
  terminalDestroy: "terminal:destroy",
  terminalData: "terminal:data",
  terminalExit: "terminal:exit",
  gitStageFiles: "git:stage-files",
  gitUnstageFiles: "git:unstage-files",
  gitCommit: "git:commit",
  gitPush: "git:push",
  gitPull: "git:pull",
  gitSummary: "git:summary",
  gitStatus: "git:status",
  gitListBranches: "git:list-branches",
  gitSwitchBranch: "git:switch-branch",
  gitCreateBranch: "git:create-branch",
  // Worker (background model tasks)
  workerGenerateCommitMessage: "worker:generate-commit-message",
  // UI
  uiGetState: "ui:get-state",
  uiSetDiffPanelOpen: "ui:set-diff-panel-open",
  // Window
  windowGetState: "window:get-state",
  windowMinimize: "window:minimize",
  windowToggleMaximize: "window:toggle-maximize",
  windowClose: "window:close",
  windowStateChanged: "window:state-changed"
};
const desktopApi = {
  files: {
    pick: () => ipcRenderer.invoke(IPC_CHANNELS.filesPick),
    readPreview: (filePath) => ipcRenderer.invoke(IPC_CHANNELS.filesReadPreview, filePath),
    readImageDataUrl: (filePath) => ipcRenderer.invoke(IPC_CHANNELS.filesReadImageDataUrl, filePath),
    saveFromClipboard: (payload) => ipcRenderer.invoke(IPC_CHANNELS.filesSaveFromClipboard, payload)
  },
  sessions: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.sessionsList),
    load: (sessionId) => ipcRenderer.invoke(IPC_CHANNELS.sessionsLoad, sessionId),
    save: (session) => ipcRenderer.invoke(IPC_CHANNELS.sessionsSave, session),
    create: () => ipcRenderer.invoke(IPC_CHANNELS.sessionsCreate),
    archive: (sessionId) => ipcRenderer.invoke(IPC_CHANNELS.sessionsArchive, sessionId),
    unarchive: (sessionId) => ipcRenderer.invoke(IPC_CHANNELS.sessionsUnarchive, sessionId),
    listArchived: () => ipcRenderer.invoke(IPC_CHANNELS.sessionsListArchived),
    delete: (sessionId) => ipcRenderer.invoke(IPC_CHANNELS.sessionsDelete, sessionId),
    setGroup: (sessionId, groupId) => ipcRenderer.invoke(IPC_CHANNELS.sessionsSetGroup, sessionId, groupId),
    rename: (sessionId, title) => ipcRenderer.invoke(IPC_CHANNELS.sessionsRename, sessionId, title),
    setPinned: (sessionId, pinned) => ipcRenderer.invoke(IPC_CHANNELS.sessionsSetPinned, sessionId, pinned)
  },
  groups: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.groupsList),
    create: (name) => ipcRenderer.invoke(IPC_CHANNELS.groupsCreate, name),
    rename: (groupId, name) => ipcRenderer.invoke(IPC_CHANNELS.groupsRename, groupId, name),
    delete: (groupId) => ipcRenderer.invoke(IPC_CHANNELS.groupsDelete, groupId)
  },
  chat: {
    send: (input) => ipcRenderer.invoke(IPC_CHANNELS.chatSend, input),
    trimSessionMessages: (input) => ipcRenderer.invoke(IPC_CHANNELS.chatTrimSessionMessages, input)
  },
  context: {
    getSummary: (sessionId) => ipcRenderer.invoke(IPC_CHANNELS.contextGetSummary, sessionId),
    compact: (sessionId) => ipcRenderer.invoke(IPC_CHANNELS.contextCompact, sessionId)
  },
  // ── Agent (wired in Phase 1) ──────────────────────────────
  agent: {
    onEvent: (callback) => {
      const handler = (_e, event) => callback(event);
      ipcRenderer.on(IPC_CHANNELS.agentEvent, handler);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.agentEvent, handler);
      };
    },
    cancel: (scope) => ipcRenderer.invoke(IPC_CHANNELS.agentCancel, scope),
    confirmResponse: (response) => ipcRenderer.invoke(IPC_CHANNELS.agentConfirmResponse, response),
    listPendingApprovalGroups: (sessionId) => ipcRenderer.invoke(IPC_CHANNELS.agentListPendingApprovalGroups, sessionId),
    listInterruptedApprovals: (sessionId) => ipcRenderer.invoke(IPC_CHANNELS.agentListInterruptedApprovals, sessionId),
    listInterruptedApprovalGroups: (sessionId) => ipcRenderer.invoke(IPC_CHANNELS.agentListInterruptedApprovalGroups, sessionId),
    dismissInterruptedApproval: (runId) => ipcRenderer.invoke(IPC_CHANNELS.agentDismissInterruptedApproval, runId),
    resumeInterruptedApproval: (runId) => ipcRenderer.invoke(IPC_CHANNELS.agentResumeInterruptedApproval, runId)
  },
  // ── Settings (wired in Phase 1) ───────────────────────────
  settings: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.settingsGet),
    update: (partial) => ipcRenderer.invoke(IPC_CHANNELS.settingsUpdate, partial),
    getLogSnapshot: () => ipcRenderer.invoke(IPC_CHANNELS.settingsGetLogSnapshot),
    openLogFolder: (logId) => ipcRenderer.invoke(IPC_CHANNELS.settingsOpenLogFolder, logId)
  },
  // ── Providers / Models ─────────────────────────────────────
  providers: {
    listSources: () => ipcRenderer.invoke(IPC_CHANNELS.providersListSources),
    getSource: (sourceId) => ipcRenderer.invoke(IPC_CHANNELS.providersGetSource, sourceId),
    saveSource: (draft) => ipcRenderer.invoke(IPC_CHANNELS.providersSaveSource, draft),
    deleteSource: (sourceId) => ipcRenderer.invoke(IPC_CHANNELS.providersDeleteSource, sourceId),
    testSource: (draft) => ipcRenderer.invoke(IPC_CHANNELS.providersTestSource, draft),
    getCredentials: (sourceId) => ipcRenderer.invoke(IPC_CHANNELS.providersGetCredentials, sourceId),
    setCredentials: (sourceId, apiKey) => ipcRenderer.invoke(IPC_CHANNELS.providersSetCredentials, sourceId, apiKey)
  },
  models: {
    listEntries: () => ipcRenderer.invoke(IPC_CHANNELS.modelsListEntries),
    listEntriesBySource: (sourceId) => ipcRenderer.invoke(IPC_CHANNELS.modelsListEntriesBySource, sourceId),
    saveEntry: (draft) => ipcRenderer.invoke(IPC_CHANNELS.modelsSaveEntry, draft),
    deleteEntry: (entryId) => ipcRenderer.invoke(IPC_CHANNELS.modelsDeleteEntry, entryId),
    getEntry: (entryId) => ipcRenderer.invoke(IPC_CHANNELS.modelsGetEntry, entryId)
  },
  // ── Workspace (wired in Phase 5) ──────────────────────────
  workspace: {
    change: (path) => ipcRenderer.invoke(IPC_CHANNELS.workspaceChange, path),
    getSoul: () => ipcRenderer.invoke(IPC_CHANNELS.workspaceGetSoul),
    pickFolder: () => ipcRenderer.invoke(IPC_CHANNELS.workspacePickFolder),
    openFolder: () => ipcRenderer.invoke(IPC_CHANNELS.workspaceOpenFolder)
  },
  // ── Terminal (wired in Phase 7) ───────────────────────────
  terminal: {
    create: (options) => ipcRenderer.invoke(IPC_CHANNELS.terminalCreate, options),
    write: (id, data) => ipcRenderer.invoke(IPC_CHANNELS.terminalWrite, id, data),
    resize: (id, cols, rows) => ipcRenderer.invoke(IPC_CHANNELS.terminalResize, id, cols, rows),
    destroy: (id) => ipcRenderer.invoke(IPC_CHANNELS.terminalDestroy, id),
    onData: (callback) => {
      const handler = (_e, id, data) => callback(id, data);
      ipcRenderer.on(IPC_CHANNELS.terminalData, handler);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.terminalData, handler);
      };
    },
    onExit: (callback) => {
      const handler = (_e, id, code) => callback(id, code);
      ipcRenderer.on(IPC_CHANNELS.terminalExit, handler);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.terminalExit, handler);
      };
    }
  },
  git: {
    getSummary: () => ipcRenderer.invoke(IPC_CHANNELS.gitSummary),
    getSnapshot: () => ipcRenderer.invoke(IPC_CHANNELS.gitStatus),
    listBranches: () => ipcRenderer.invoke(IPC_CHANNELS.gitListBranches),
    switchBranch: (branchName) => ipcRenderer.invoke(IPC_CHANNELS.gitSwitchBranch, branchName),
    createAndSwitchBranch: (branchName) => ipcRenderer.invoke(IPC_CHANNELS.gitCreateBranch, branchName),
    stageFiles: (paths) => ipcRenderer.invoke(IPC_CHANNELS.gitStageFiles, paths),
    unstageFiles: (paths) => ipcRenderer.invoke(IPC_CHANNELS.gitUnstageFiles, paths),
    commit: (message) => ipcRenderer.invoke(IPC_CHANNELS.gitCommit, message),
    push: () => ipcRenderer.invoke(IPC_CHANNELS.gitPush),
    pull: () => ipcRenderer.invoke(IPC_CHANNELS.gitPull)
  },
  worker: {
    generateCommitMessage: (request) => ipcRenderer.invoke(IPC_CHANNELS.workerGenerateCommitMessage, request)
  },
  ui: {
    getState: () => ipcRenderer.invoke(IPC_CHANNELS.uiGetState),
    setDiffPanelOpen: (open) => ipcRenderer.invoke(IPC_CHANNELS.uiSetDiffPanelOpen, open)
  },
  window: {
    getState: () => ipcRenderer.invoke(IPC_CHANNELS.windowGetState),
    minimize: () => ipcRenderer.send(IPC_CHANNELS.windowMinimize),
    toggleMaximize: () => ipcRenderer.invoke(IPC_CHANNELS.windowToggleMaximize),
    close: () => ipcRenderer.send(IPC_CHANNELS.windowClose),
    onStateChange: (listener) => {
      const wrappedListener = (_event, state) => {
        listener(state);
      };
      ipcRenderer.on(IPC_CHANNELS.windowStateChanged, wrappedListener);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.windowStateChanged, wrappedListener);
      };
    }
  },
  quickInvoke: {
    onFocusComposer: (listener) => {
      const handler = () => listener();
      ipcRenderer.on("quick-invoke:focus-composer", handler);
      return () => {
        ipcRenderer.removeListener("quick-invoke:focus-composer", handler);
      };
    }
  }
};
contextBridge.exposeInMainWorld("desktopApi", desktopApi);
