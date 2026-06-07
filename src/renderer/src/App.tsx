import { lazy, Suspense, useCallback, useEffect, useMemo, useRef } from "react";
import {
  CommandLineIcon,
} from "@heroicons/react/24/outline";
import { ActivityIcon, Globe2Icon, PanelRightClose, PanelRightOpen } from "lucide-react";
import { useShallow } from "zustand/shallow";
import type {
  ChatSession,
  ChatSessionSummary,
  ModelRoutingRole,
  RightPanelState,
  SelectedFile,
  Settings,
  SessionGroup,
  ThinkingLevel,
} from "@shared/contracts";
import {
  AppBootErrorScreen,
  AppBootingScreen,
} from "@renderer/components/assistant-ui/app-shell-states";
import { Button } from "@renderer/components/assistant-ui/button";
import {
  SettingsView,
  type SettingsSection,
} from "@renderer/components/assistant-ui/settings-view";
import { Sidebar } from "@renderer/components/assistant-ui/sidebar";
import { TerminalDrawer } from "@renderer/components/assistant-ui/terminal-drawer";
import { ThreadRuntimeLayer } from "@renderer/components/assistant-ui/thread-runtime-layer";
import { TitleBar } from "@renderer/components/assistant-ui/title-bar";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@renderer/components/ui/resizable";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@renderer/components/ui/tooltip";
import {
  DEFAULT_SIDEBAR_SIZE,
  FALLBACK_RIGHT_PANEL_WIDTH,
  LEGACY_SIDEBAR_WIDTH_STORAGE_KEY,
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
  RIGHT_PANEL_GAP_PX,
  ROOT_UI_THEME_DATASET,
  SETTINGS_ROUTE_PREFIX,
  SIDEBAR_COLLAPSED_STORAGE_KEY,
  SIDEBAR_WIDTH_STORAGE_KEY,
  applyCustomThemeVariables,
  clampRightPanelWidth,
  clampSidebarSize,
  getDefaultRightPanelWidth,
  mergeSettingsState,
  migrateLegacySidebarWidth,
  readStoredNumber,
  resolveSettingsSectionFromPath,
  toSidebarPercentageSize,
  toSidebarPixelSize,
  type DeepPartialSettings,
} from "@renderer/lib/app-shell";
import { useAppBoot } from "@renderer/hooks/use-app-boot";
import { useAppGitState } from "@renderer/hooks/use-app-git-state";
import { useAppKeyboardShortcuts } from "@renderer/hooks/use-app-keyboard-shortcuts";
import { useRightPanelResize } from "@renderer/hooks/use-right-panel-resize";
import { useSessionAttachments } from "@renderer/hooks/use-session-attachments";
import { useSessionOperations } from "@renderer/hooks/use-session-operations";
import { useAppStore } from "@renderer/stores/app-store";
import { useSessionStore } from "@renderer/stores/session-store";
import type { PanelImperativeHandle, PanelSize } from "react-resizable-panels";
import { useLocation, useNavigate } from "react-router-dom";
import type { BrowserContextItem } from "@renderer/lib/browser-interview";

const DiffWorkbenchContent = lazy(() => import("@renderer/components/assistant-ui/diff-panel").then((module) => ({
    default: module.DiffWorkbenchContent,
  })),
);
const BrowserPreviewPanel = lazy(() => import("@renderer/components/browser-preview/BrowserPreviewPanel").then((module) => ({
    default: module.BrowserPreviewPanel,
  })),
);
const TracePanel = lazy(() => import("@renderer/components/assistant-ui/trace-panel").then((module) => ({
    default: module.TracePanel,
  })),
);

export default function App() {
  const desktopApi = window.desktopApi;
  const navigate = useNavigate();
  const location = useLocation();
  const {
    booting,
    bootError,
    terminalOpen,
    threadWorkspaceWidth,
    sidebarSize,
    sidebarCollapsed,
    currentModelId,
    thinkingLevel,
    sidebarAnimating,
    rightPanelAnimating,
    rightPanelDragging,
    browserInteractionResetSignal,
    rightPanelState,
    frameState,
    settings,
  } = useAppStore(useShallow((state) => ({
    booting: state.booting,
    bootError: state.bootError,
    terminalOpen: state.terminalOpen,
    threadWorkspaceWidth: state.threadWorkspaceWidth,
    sidebarSize: state.sidebarSize,
    sidebarCollapsed: state.sidebarCollapsed,
    currentModelId: state.currentModelId,
    thinkingLevel: state.thinkingLevel,
    sidebarAnimating: state.sidebarAnimating,
    rightPanelAnimating: state.rightPanelAnimating,
    rightPanelDragging: state.rightPanelDragging,
    browserInteractionResetSignal: state.browserInteractionResetSignal,
    rightPanelState: state.rightPanelState,
    frameState: state.frameState,
    settings: state.settings,
  })));
  const appActions = useAppStore(useShallow((state) => ({
    setBooting: state.setBooting,
    setBootError: state.setBootError,
    setTerminalOpen: state.setTerminalOpen,
    setThreadWorkspaceWidth: state.setThreadWorkspaceWidth,
    setSidebarSize: state.setSidebarSize,
    setSidebarCollapsed: state.setSidebarCollapsed,
    setCurrentModelId: state.setCurrentModelId,
    setThinkingLevel: state.setThinkingLevel,
    setSidebarAnimating: state.setSidebarAnimating,
    setRightPanelAnimating: state.setRightPanelAnimating,
    setRightPanelDragging: state.setRightPanelDragging,
    bumpBrowserInteractionResetSignal: state.bumpBrowserInteractionResetSignal,
    setRightPanelState: state.setRightPanelState,
    setFrameState: state.setFrameState,
    setSettings: state.setSettings,
  })));
  const {
    summaries,
    archivedSummaries,
    groups,
    activeSession,
    sessionCache,
    runningSessionIds,
    browserContextBySessionId,
    contextSummaryBySessionId,
    interruptedApprovalGroupsBySessionId,
  } = useSessionStore(useShallow((state) => ({
    summaries: state.summaries,
    archivedSummaries: state.archivedSummaries,
    groups: state.groups,
    activeSession: state.activeSession,
    sessionCache: state.sessionCache,
    runningSessionIds: state.runningSessionIds,
    browserContextBySessionId: state.browserContextBySessionId,
    contextSummaryBySessionId: state.contextSummaryBySessionId,
    interruptedApprovalGroupsBySessionId: state.interruptedApprovalGroupsBySessionId,
  })));
  const sessionActions = useSessionStore(useShallow((state) => ({
    setSummaries: state.setSummaries,
    setArchivedSummaries: state.setArchivedSummaries,
    setGroups: state.setGroups,
    cacheSession: state.cacheSession,
    removeCachedSession: state.removeCachedSession,
    hydrateSession: state.hydrateSession,
    clearActiveSession: state.clearActiveSession,
    persistSessionLocally: state.persistSessionLocally,
    removeSessionState: state.removeSessionState,
    setSessionRunning: state.setSessionRunning,
    setContextSummary: state.setContextSummary,
    setInterruptedApprovalGroups: state.setInterruptedApprovalGroups,
    upsertBrowserContextItem: state.upsertBrowserContextItem,
    removeBrowserContextItem: state.removeBrowserContextItem,
    clearBrowserContextItems: state.clearBrowserContextItems,
    removeAttachmentLinkedBrowserContext: state.removeAttachmentLinkedBrowserContext,
  })));

  const settingsSection = useMemo(
    () => resolveSettingsSectionFromPath(location.pathname) ?? "general",
    [location.pathname],
  );
  const mainView: "thread" | "settings" =
    resolveSettingsSectionFromPath(location.pathname) === null
      ? "thread"
      : "settings";

  const activeSessionId = activeSession?.id ?? null;
  const diffPanelOpen =
    rightPanelState.open && rightPanelState.activeView === "diff";
  const tracePanelOpen =
    rightPanelState.open && rightPanelState.activeView === "trace";
  const browserPanelOpen =
    rightPanelState.open && rightPanelState.activeView === "browser";
  const rightPanelVisibleOrAnimating =
    mainView === "thread" &&
    (diffPanelOpen || tracePanelOpen || browserPanelOpen || rightPanelAnimating);
  const threadTerminalOpen = terminalOpen && !rightPanelVisibleOrAnimating;
  const resolvedRightPanelWidth = useMemo(() => {
    const containerWidth =
      threadWorkspaceWidth > 0
        ? threadWorkspaceWidth
        : typeof window !== "undefined"
          ? window.innerWidth
          : FALLBACK_RIGHT_PANEL_WIDTH;
    const preferredWidth =
      typeof rightPanelState.width === "number"
        ? rightPanelState.width
        : getDefaultRightPanelWidth(containerWidth);

    return clampRightPanelWidth(preferredWidth, containerWidth);
  }, [rightPanelState.width, threadWorkspaceWidth]);

  const sidebarPanelRef = useRef<PanelImperativeHandle | null>(null);
  const threadWorkspaceRef = useRef<HTMLDivElement | null>(null);
  const rightPanelShellRef = useRef<HTMLDivElement | null>(null);
  const rightPanelStateRef = useRef(rightPanelState);
  const rightPanelToggleInFlightRef = useRef(false);
  const sessionSelectionSerialRef = useRef(0);
  const summariesRef = useRef<ChatSessionSummary[]>([]);
  const archivedSummariesRef = useRef<ChatSessionSummary[]>([]);
  const groupsRef = useRef<SessionGroup[]>([]);
  const settingsRef = useRef<Settings | null>(null);
  const activeSessionRef = useRef<ChatSession | null>(null);
  const activeSessionIdRef = useRef<string | null>(null);
  const sessionCacheRef = useRef<Record<string, ChatSession>>({});
  const appliedCustomThemeKeysRef = useRef<string[]>([]);
  const rightPanelAnimatingTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const lastExpandedSidebarSizeRef = useRef(sidebarSize);
  const sidebarCollapsedRef = useRef(sidebarCollapsed);
  const sidebarProgrammaticTargetRef = useRef<boolean | null>(null);

  useEffect(() => {
    summariesRef.current = summaries;
  }, [summaries]);

  useEffect(() => {
    sidebarCollapsedRef.current = sidebarCollapsed;
  }, [sidebarCollapsed]);

  useEffect(() => {
    archivedSummariesRef.current = archivedSummaries;
  }, [archivedSummaries]);

  useEffect(() => {
    groupsRef.current = groups;
  }, [groups]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    activeSessionRef.current = activeSession;
    activeSessionIdRef.current = activeSessionId;
  }, [activeSession, activeSessionId]);

  useEffect(() => {
    sessionCacheRef.current = sessionCache;
  }, [sessionCache]);

  useEffect(() => {
    rightPanelStateRef.current = rightPanelState;
  }, [rightPanelState]);

  useEffect(() => {
    const element = threadWorkspaceRef.current;
    if (!element) {
      return;
    }

    const updateWidth = () => {
      const nextWidth = Math.round(element.getBoundingClientRect().width);
      if (useAppStore.getState().threadWorkspaceWidth !== nextWidth) {
        appActions.setThreadWorkspaceWidth(nextWidth);
      }
    };

    updateWidth();

    const observer = new ResizeObserver(() => {
      updateWidth();
    });
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [mainView, rightPanelVisibleOrAnimating]);

  useEffect(() => {
    if (!sidebarCollapsed) {
      lastExpandedSidebarSizeRef.current = clampSidebarSize(sidebarSize);
    }
  }, [sidebarCollapsed, sidebarSize]);

  useEffect(() => () => clearTimeout(rightPanelAnimatingTimerRef.current), []);

  const armRightPanelAnimation = useCallback(() => {
    appActions.setRightPanelAnimating(true);
    clearTimeout(rightPanelAnimatingTimerRef.current);
    rightPanelAnimatingTimerRef.current = setTimeout(() => {
      appActions.setRightPanelAnimating(false);
    }, 520);
  }, [appActions]);

  useEffect(() => {
    localStorage.setItem(
      SIDEBAR_WIDTH_STORAGE_KEY,
      String(clampSidebarSize(sidebarSize)),
    );
  }, [sidebarSize]);

  useEffect(() => {
    localStorage.setItem(
      SIDEBAR_COLLAPSED_STORAGE_KEY,
      sidebarCollapsed ? "1" : "0",
    );
  }, [sidebarCollapsed]);

  const applySidebarPanelState = useCallback((collapsed: boolean) => {
    const panel = sidebarPanelRef.current;
    if (!panel) {
      return;
    }

    if (collapsed) {
      panel.collapse();
      panel.resize("0%");
      return;
    }

    panel.expand();
    panel.resize(toSidebarPixelSize(lastExpandedSidebarSizeRef.current));
  }, []);

  useEffect(() => {
    applySidebarPanelState(sidebarCollapsed);
  }, [applySidebarPanelState, sidebarCollapsed]);

  useEffect(() => {
    if (!settings) {
      return;
    }

    const root = document.documentElement;
    root.dataset[ROOT_UI_THEME_DATASET] = settings.theme;
    root.style.setProperty("--app-ui-font-family", settings.ui.fontFamily);
    root.style.setProperty("--app-ui-font-size", `${settings.ui.fontSize}px`);
    root.style.setProperty(
      "--app-code-font-family",
      settings.ui.codeFontFamily,
    );
    root.style.setProperty(
      "--app-code-font-size",
      `${settings.ui.codeFontSize}px`,
    );

    appliedCustomThemeKeysRef.current = applyCustomThemeVariables(
      root,
      appliedCustomThemeKeysRef.current,
      settings.theme === "custom" ? settings.customTheme : null,
    );
  }, [settings]);

  const {
    gitBranchSummary,
    gitOverview,
    gitOverviewLoading,
    refreshGitBranchSummary,
    refreshGitOverview,
  } = useAppGitState({
    desktopApi,
    settingsRef,
    mainView,
    diffPanelOpen,
  });

  const switchWorkspacePath = useCallback(
    async (nextWorkspace: string) => {
      const normalizedWorkspace = nextWorkspace.trim();
      if (!desktopApi || !normalizedWorkspace) {
        return;
      }

      if (settingsRef.current?.workspace === normalizedWorkspace) {
        return;
      }

      const nextSettings = settingsRef.current
        ? mergeSettingsState(settingsRef.current, { workspace: normalizedWorkspace })
        : null;

      if (nextSettings) {
        settingsRef.current = nextSettings;
        appActions.setSettings(nextSettings);
      }

      await desktopApi.settings.update({ workspace: normalizedWorkspace });
      await refreshGitOverview();
      await refreshGitBranchSummary();
    },
    [appActions, desktopApi, refreshGitBranchSummary, refreshGitOverview],
  );

  const {
    archiveSession,
    clearActiveSession,
    createNewSession,
    createSessionInGroup,
    deleteProject,
    deleteSessionPermanently,
    dismissInterruptedApproval,
    handleCreateProject,
    handleSelectProject,
    hydrateSession,
    persistSession,
    refreshContextSummary,
    refreshInterruptedApprovalGroups,
    reloadSession,
    renameProject,
    renameSession,
    resumeInterruptedApproval,
    selectSession,
    setSessionPinned,
    unarchiveSession,
  } = useSessionOperations({
    desktopApi,
    appActions,
    sessionActions,
    activeSessionIdRef,
    sessionSelectionSerialRef,
    summariesRef,
    archivedSummariesRef,
    groupsRef,
    sessionCacheRef,
    switchWorkspacePath,
  });

  useAppBoot({
    desktopApi,
    appActions,
    sessionActions,
    settingsRef,
    hydrateSession,
    clearActiveSession,
    refreshContextSummary,
    refreshInterruptedApprovalGroups,
    refreshGitBranchSummary,
    refreshGitOverview,
  });

  const {
    isPickingFiles,
    attachFiles,
    appendAttachmentsToSession,
    pasteFiles,
    removeAttachment,
  } = useSessionAttachments({
    activeSession,
    desktopApi,
    persistSession,
  });

  const removeAttachmentAndLinkedBrowserContext = useCallback(
    (attachmentId: string) => {
      const session = activeSessionRef.current;
      const linkedBrowserContextItemId = session?.attachments.find(
        (attachment) => attachment.id === attachmentId,
      )?.browserContextItemId;

      removeAttachment(attachmentId);

      if (!session || !linkedBrowserContextItemId) {
        return;
      }

      sessionActions.removeAttachmentLinkedBrowserContext(
        session.id,
        linkedBrowserContextItemId,
      );
    },
    [removeAttachment, sessionActions],
  );

  const handleSessionRunStateChange = useCallback(
    (sessionId: string, isRunning: boolean) => {
      sessionActions.setSessionRunning(sessionId, isRunning);
    },
    [sessionActions],
  );

  const updateRightPanelState = useCallback(
    (partial: Partial<RightPanelState>) => {
      appActions.setRightPanelState(partial);
      void desktopApi?.ui.setRightPanelState(partial);
    },
    [appActions, desktopApi],
  );

  const {
    cleanupRightPanelResize,
    handleRightPanelResizePointerDown,
  } = useRightPanelResize({
    active: diffPanelOpen || tracePanelOpen || browserPanelOpen,
    threadWorkspaceRef,
    rightPanelShellRef,
    threadWorkspaceWidth,
    resolvedRightPanelWidth,
    setRightPanelDragging: appActions.setRightPanelDragging,
    updateRightPanelState,
  });

  useEffect(() => {
    if (rightPanelVisibleOrAnimating) {
      return;
    }

    cleanupRightPanelResize();
  }, [cleanupRightPanelResize, rightPanelVisibleOrAnimating]);

  useEffect(
    () => () => {
      cleanupRightPanelResize();
    },
    [cleanupRightPanelResize],
  );

  const closeRightPanel = useCallback(() => {
    armRightPanelAnimation();
    updateRightPanelState({ open: false });
  }, [armRightPanelAnimation, updateRightPanelState]);

  const handleBrowserElementSelected = useCallback((item: BrowserContextItem) => {
    const sessionId = activeSessionIdRef.current;
    if (!sessionId) {
      return;
    }

    sessionActions.upsertBrowserContextItem(sessionId, item);
  }, [sessionActions]);

  const handleBrowserScreenshotCaptured = useCallback(
    async (files: SelectedFile[]) => {
      await appendAttachmentsToSession(files);
    },
    [appendAttachmentsToSession],
  );

  const handleRemoveBrowserContextItem = useCallback(
    (sessionId: string, itemId: string) => {
      sessionActions.removeBrowserContextItem(sessionId, itemId);
    },
    [sessionActions],
  );

  const handleClearBrowserContextItems = useCallback((sessionId: string) => {
    sessionActions.clearBrowserContextItems(sessionId);
  }, [sessionActions]);

  const toggleDiffPanel = useCallback(() => {
    if (rightPanelToggleInFlightRef.current) return;
    rightPanelToggleInFlightRef.current = true;

    try {
      const containerWidth = Math.round(
        threadWorkspaceRef.current?.getBoundingClientRect().width ?? threadWorkspaceWidth
      );

      const nextPanelWidth = containerWidth > 0
        ? clampRightPanelWidth(
          typeof rightPanelStateRef.current.width === "number"
            ? rightPanelStateRef.current.width
            : getDefaultRightPanelWidth(containerWidth),
          containerWidth
        )
        : resolvedRightPanelWidth;

      armRightPanelAnimation();

      if (diffPanelOpen) {
        updateRightPanelState({ open: false });
      } else {
        updateRightPanelState({
          open: true,
          activeView: "diff",
          width: nextPanelWidth,
        });
      }
    } finally {
      rightPanelToggleInFlightRef.current = false;
    }
  }, [
    armRightPanelAnimation,
    diffPanelOpen,
    resolvedRightPanelWidth,
    threadWorkspaceWidth,
    updateRightPanelState,
  ]);

  const toggleBrowserPanel = useCallback(() => {
    if (rightPanelToggleInFlightRef.current) return;
    rightPanelToggleInFlightRef.current = true;

    try {
      const containerWidth = Math.round(
        threadWorkspaceRef.current?.getBoundingClientRect().width ?? threadWorkspaceWidth
      );

      const nextPanelWidth = containerWidth > 0
        ? clampRightPanelWidth(
          typeof rightPanelStateRef.current.width === "number"
            ? rightPanelStateRef.current.width
            : getDefaultRightPanelWidth(containerWidth),
          containerWidth
        )
        : resolvedRightPanelWidth;

      armRightPanelAnimation();

      if (browserPanelOpen) {
        updateRightPanelState({ open: false });
      } else {
        updateRightPanelState({
          open: true,
          activeView: "browser",
          width: nextPanelWidth,
        });
      }
    } finally {
      rightPanelToggleInFlightRef.current = false;
    }
  }, [
    armRightPanelAnimation,
    browserPanelOpen,
    resolvedRightPanelWidth,
    threadWorkspaceWidth,
    updateRightPanelState,
  ]);

  const toggleTracePanel = useCallback(() => {
    if (rightPanelToggleInFlightRef.current) return;
    rightPanelToggleInFlightRef.current = true;

    try {
      const containerWidth = Math.round(
        threadWorkspaceRef.current?.getBoundingClientRect().width ?? threadWorkspaceWidth
      );

      const nextPanelWidth = containerWidth > 0
        ? clampRightPanelWidth(
          typeof rightPanelStateRef.current.width === "number"
            ? rightPanelStateRef.current.width
            : getDefaultRightPanelWidth(containerWidth),
          containerWidth
        )
        : resolvedRightPanelWidth;

      armRightPanelAnimation();

      if (tracePanelOpen) {
        updateRightPanelState({ open: false });
      } else {
        updateRightPanelState({
          open: true,
          activeView: "trace",
          width: nextPanelWidth,
        });
      }
    } finally {
      rightPanelToggleInFlightRef.current = false;
    }
  }, [
    armRightPanelAnimation,
    tracePanelOpen,
    resolvedRightPanelWidth,
    threadWorkspaceWidth,
    updateRightPanelState,
  ]);

  const handleSidebarResize = useCallback((panelSize: PanelSize) => {
    const isCollapsedByPanel =
      panelSize.inPixels <= 1 || panelSize.asPercentage <= 0.1;

    if (sidebarProgrammaticTargetRef.current !== null) {
      if (
        sidebarProgrammaticTargetRef.current === false &&
        panelSize.inPixels > MIN_SIDEBAR_WIDTH + 1
      ) {
        const resolvedSize = clampSidebarSize(panelSize.asPercentage);
        lastExpandedSidebarSizeRef.current = resolvedSize;
        appActions.setSidebarSize(resolvedSize);
      }
      return;
    }

    sidebarCollapsedRef.current = isCollapsedByPanel;
    if (useAppStore.getState().sidebarCollapsed !== isCollapsedByPanel) {
      appActions.setSidebarCollapsed(isCollapsedByPanel);
    }

    if (isCollapsedByPanel || panelSize.inPixels <= MIN_SIDEBAR_WIDTH + 1) {
      return;
    }

    const resolvedSize = clampSidebarSize(panelSize.asPercentage);
    lastExpandedSidebarSizeRef.current = resolvedSize;
    appActions.setSidebarSize(resolvedSize);
  }, [appActions]);

  const sidebarAnimatingTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  useEffect(() => () => clearTimeout(sidebarAnimatingTimerRef.current), []);

  const toggleSidebarCollapsed = useCallback(() => {
    appActions.setSidebarAnimating(true);
    clearTimeout(sidebarAnimatingTimerRef.current);
    const nextCollapsed = !sidebarCollapsedRef.current;
    sidebarProgrammaticTargetRef.current = nextCollapsed;
    sidebarAnimatingTimerRef.current = setTimeout(() => {
      sidebarProgrammaticTargetRef.current = null;
      appActions.setSidebarAnimating(false);
    }, 520);
    if (nextCollapsed) {
      lastExpandedSidebarSizeRef.current = clampSidebarSize(sidebarSize);
    }
    sidebarCollapsedRef.current = nextCollapsed;
    applySidebarPanelState(nextCollapsed);
    appActions.setSidebarCollapsed(nextCollapsed);
  }, [appActions, applySidebarPanelState, sidebarSize]);

  const handleToggleMaximize = useCallback(() => {
    if (!desktopApi) {
      return;
    }

    void desktopApi.window.toggleMaximize().then((nextState) => {
      appActions.setFrameState(nextState);
    });
  }, [appActions, desktopApi]);

  const handleMinimizeWindow = useCallback(() => {
    desktopApi?.window.minimize();
  }, [desktopApi]);

  const handleCloseWindow = useCallback(() => {
    desktopApi?.window.close();
  }, [desktopApi]);

  const openSettingsView = useCallback((section: SettingsSection = "general") => {
    navigate(`${SETTINGS_ROUTE_PREFIX}/${section}`);
  }, [navigate]);

  const openGeneralSettings = useCallback(() => {
    openSettingsView("general");
  }, [openSettingsView]);

  const closeSettingsView = useCallback(() => {
    navigate("/");
  }, [navigate]);

  const openArchivedSettings = useCallback(() => {
    openSettingsView("archived");
  }, [openSettingsView]);

  const handleComposerFocus = useCallback(() => {
    appActions.bumpBrowserInteractionResetSignal();
  }, [appActions]);

  useAppKeyboardShortcuts({
    desktopApi,
    appActions,
    shortcutState: {
      mainView,
      terminalOpen,
      createNewSession,
      closeSettingsView,
      openSettingsView,
      toggleSidebarCollapsed,
    },
  });

  const openArchivedSessionFromSettings = useCallback(
    async (sessionId: string) => {
      await selectSession(sessionId);
      closeSettingsView();
    },
    [closeSettingsView, selectSession],
  );

  const handleSettingsChange = useCallback(
    (partial: Partial<Settings>) => {
      if (partial.workspace && Object.keys(partial).length === 1) {
        void switchWorkspacePath(partial.workspace);
        return;
      }

      const currentSettings = useAppStore.getState().settings;
      appActions.setSettings(
        currentSettings ? mergeSettingsState(currentSettings, partial) : currentSettings,
      );

      void (async () => {
        await desktopApi?.settings.update(partial);

        if (partial.workspace) {
          await switchWorkspacePath(partial.workspace);
        }
      })();
    },
    [appActions, desktopApi, switchWorkspacePath],
  );

  const handleModelChange = useCallback(
    (modelEntryId: string) => {
      appActions.setCurrentModelId(modelEntryId);
      const currentSettings = useAppStore.getState().settings;
      appActions.setSettings(
        currentSettings
          ? mergeSettingsState(currentSettings, {
              modelRouting: {
                chat: {
                  modelId: modelEntryId,
                },
              },
            })
          : currentSettings,
      );
      void desktopApi?.settings.update({
        modelRouting: {
          chat: {
            modelId: modelEntryId,
          },
        },
      } as Partial<Settings>);
    },
    [appActions, desktopApi],
  );

  const handleRoleModelChange = useCallback(
    (role: Exclude<ModelRoutingRole, "chat">, modelEntryId: string | null) => {
      const partial: DeepPartialSettings = {
        modelRouting: {
          [role]: {
            modelId: modelEntryId,
          },
        },
      };

      const currentSettings = useAppStore.getState().settings;
      appActions.setSettings(
        currentSettings ? mergeSettingsState(currentSettings, partial) : currentSettings,
      );
      void desktopApi?.settings.update(partial as Partial<Settings>);
    },
    [appActions, desktopApi],
  );

  const handleThinkingLevelChange = useCallback(
    (level: ThinkingLevel) => {
      appActions.setThinkingLevel(level);
      const currentSettings = useAppStore.getState().settings;
      appActions.setSettings(
        currentSettings ? { ...currentSettings, thinkingLevel: level } : currentSettings,
      );
      void desktopApi?.settings.update({ thinkingLevel: level });
    },
    [appActions, desktopApi],
  );

  const handleGitStateChanged = useCallback(async () => {
    await refreshGitOverview();
    await refreshGitBranchSummary();
  }, [refreshGitBranchSummary, refreshGitOverview]);

  const handleRefreshGitOverview = useCallback(async () => {
    await refreshGitOverview();
  }, [refreshGitOverview]);

  const handleCreateProjectClick = useCallback(() => {
    void handleCreateProject();
  }, [handleCreateProject]);

  const handleCreateProjectSession = useCallback(
    (groupId: string) => {
      void createSessionInGroup(groupId);
    },
    [createSessionInGroup],
  );

  const handleSelectProjectClick = useCallback(
    (groupId: string) => {
      void handleSelectProject(groupId);
    },
    [handleSelectProject],
  );

  const handleRenameSession = useCallback(
    (sessionId: string) => {
      void renameSession(sessionId);
    },
    [renameSession],
  );

  const handleRenameProject = useCallback(
    (groupId: string) => {
      void renameProject(groupId);
    },
    [renameProject],
  );

  const handleUnarchiveSession = useCallback(
    (sessionId: string) => {
      void unarchiveSession(sessionId);
    },
    [unarchiveSession],
  );

  const handleDeleteSessionPermanently = useCallback(
    (sessionId: string) => {
      void deleteSessionPermanently(sessionId);
    },
    [deleteSessionPermanently],
  );

  const handleDeleteProject = useCallback(
    (groupId: string) => {
      void deleteProject(groupId);
    },
    [deleteProject],
  );

  const toggleThreadTerminal = useCallback(() => {
    appActions.setTerminalOpen(!useAppStore.getState().terminalOpen);
  }, [appActions]);

  const settingsContent = useMemo(
    () => (
      <SettingsView
        activeSection={settingsSection}
        settings={settings}
        currentModelId={currentModelId}
        thinkingLevel={thinkingLevel}
        onModelChange={handleModelChange}
        onRoleModelChange={handleRoleModelChange}
        onThinkingLevelChange={handleThinkingLevelChange}
        onSettingsChange={handleSettingsChange}
        groups={groups}
        liveSummaries={summaries}
        archivedSummaries={archivedSummaries}
        onCreateProject={handleCreateProjectClick}
        onOpenArchivedSession={openArchivedSessionFromSettings}
        onUnarchiveSession={handleUnarchiveSession}
        onDeleteSession={handleDeleteSessionPermanently}
      />
    ),
    [
      archivedSummaries,
      currentModelId,
      groups,
      handleCreateProjectClick,
      handleDeleteSessionPermanently,
      handleModelChange,
      handleRoleModelChange,
      handleSettingsChange,
      handleThinkingLevelChange,
      handleUnarchiveSession,
      openArchivedSessionFromSettings,
      summaries,
      settings,
      settingsSection,
      thinkingLevel,
    ],
  );

  if (booting) {
    return <AppBootingScreen />;
  }

  if (bootError) {
    return <AppBootErrorScreen message={bootError} />;
  }

  return (
    <main className="flex h-screen flex-col overflow-hidden rounded-[var(--radius-shell)] bg-[color:var(--chela-bg-primary)] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
      <TitleBar
        isMaximized={frameState.isMaximized}
        onMinimize={handleMinimizeWindow}
        onToggleMaximize={handleToggleMaximize}
        onClose={handleCloseWindow}
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={toggleSidebarCollapsed}
      />
      <div
        className="relative min-h-0 flex-1"
        data-sidebar-collapsed={sidebarCollapsed ? "true" : "false"}
        {...(sidebarAnimating ? { "data-sidebar-animating": "" } : {})}
        data-right-panel-open={diffPanelOpen || tracePanelOpen || browserPanelOpen ? "true" : "false"}
        {...(rightPanelAnimating ? { "data-right-panel-animating": "" } : {})}
      >
        <ResizablePanelGroup
          orientation="horizontal"
          className="min-h-0 h-full overflow-hidden bg-transparent"
          resizeTargetMinimumSize={{ fine: 6, coarse: 24 }}
        >
          <ResizablePanel
            id="shell-sidebar"
            panelRef={sidebarPanelRef}
            className="min-w-0 overflow-hidden"
            collapsible
            collapsedSize="0%"
            defaultSize={toSidebarPercentageSize(sidebarSize)}
            minSize={`${MIN_SIDEBAR_WIDTH}px`}
            maxSize={`${MAX_SIDEBAR_WIDTH}px`}
            onResize={handleSidebarResize}
          >
            <aside className="chela-sidebar-content relative h-full min-h-0 w-full min-w-0 overflow-hidden bg-transparent" data-collapsed={sidebarCollapsed ? "true" : undefined}>
              <Sidebar
                groups={groups}
                summaries={summaries}
                activeSessionId={activeSessionId}
                runningSessionIds={runningSessionIds}
                onCreateProject={handleCreateProjectClick}
                onCreateProjectSession={handleCreateProjectSession}
                onSelectProject={handleSelectProjectClick}
                onSelectSession={selectSession}
                onNewSession={createNewSession}
                onOpenSettings={openGeneralSettings}
                onRenameSession={handleRenameSession}
                onRenameProject={handleRenameProject}
                onArchiveSession={archiveSession}
                onDeleteSession={deleteSessionPermanently}
                onUnarchiveSession={handleUnarchiveSession}
                archivedSummaries={archivedSummaries}
                onDeleteProject={handleDeleteProject}
                onToggleSessionPinned={setSessionPinned}
                viewMode={mainView === "settings" ? "settings" : "threads"}
                activeSettingsSection={settingsSection}
                onSelectSettingsSection={openSettingsView}
                onExitSettings={closeSettingsView}
              />
            </aside>
          </ResizablePanel>
          <ResizableHandle className="w-1.5 shrink-0 bg-transparent" />
          <ResizablePanel id="shell-main">
            <section className="relative flex h-full min-h-0 flex-col overflow-hidden bg-transparent">
              <div
                ref={threadWorkspaceRef}
                className="flex h-full min-h-0 overflow-hidden bg-transparent"
              >
                <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
                  <div
                    className={`chela-main-content-surface flex min-h-0 flex-1 flex-col overflow-hidden bg-[color:var(--chela-bg-surface)] transition-[border-radius] duration-300 ease-out ${rightPanelVisibleOrAnimating
                      ? "rounded-[var(--radius-shell)]"
                      : "rounded-l-[var(--radius-shell)]"
                      }`}
                  >
                    <div
                      className={`flex items-center justify-end gap-2 px-5 transition-[min-height,padding,opacity] duration-200 ease-out ${mainView === "thread"
                        ? "min-h-[52px] pb-3 pt-4 opacity-100"
                        : "pointer-events-none min-h-0 overflow-hidden py-0 opacity-0"
                        }`}
                      aria-hidden={mainView !== "thread"}
                    >
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={toggleThreadTerminal}
                        className={`h-9 w-9 cursor-pointer rounded-[var(--radius-shell)] border-none bg-transparent shadow-none ring-0 hover:bg-shell-toolbar-hover ${terminalOpen ? "bg-shell-toolbar-hover text-foreground" : "text-muted-foreground"}`}
                        aria-label={terminalOpen ? "收起终端" : "展开终端"}
                      >
                        <CommandLineIcon className="h-4 w-4" />
                      </Button>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={toggleDiffPanel}
                            className={`relative h-9 w-9 cursor-pointer rounded-[var(--radius-shell)] border-none bg-transparent shadow-none ring-0 transition-[background-color,color,opacity,transform] duration-200 ease-out hover:bg-shell-toolbar-hover ${diffPanelOpen ? "bg-shell-toolbar-hover text-foreground scale-[0.98]" : "text-muted-foreground hover:scale-[1.02]"}`}
                            aria-label={diffPanelOpen ? "收起右侧边栏" : "展开变更面板"}
                          >
                            {diffPanelOpen ? (
                              <PanelRightClose className="h-4 w-4" strokeWidth={1.9} />
                            ) : (
                              <PanelRightOpen className="h-4 w-4" strokeWidth={1.9} />
                            )}
                            {gitBranchSummary?.hasChanges && !diffPanelOpen && (
                              <span className="absolute right-1 top-1 size-1.5 rounded-full bg-[color:var(--chela-status-error-text)]" />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                          {diffPanelOpen ? "收起变更面板" : "展开变更面板"}
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={toggleBrowserPanel}
                            className={`relative h-9 w-9 cursor-pointer rounded-[var(--radius-shell)] border-none bg-transparent shadow-none ring-0 transition-[background-color,color,opacity,transform] duration-200 ease-out hover:bg-shell-toolbar-hover ${browserPanelOpen ? "bg-shell-toolbar-hover text-foreground scale-[0.98]" : "text-muted-foreground hover:scale-[1.02]"}`}
                            aria-label={browserPanelOpen ? "收起浏览器选择" : "展开浏览器选择"}
                          >
                            <Globe2Icon className="h-4 w-4" strokeWidth={1.9} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                          {browserPanelOpen ? "收起浏览器选择" : "展开浏览器选择"}
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={toggleTracePanel}
                            className={`relative h-9 w-9 cursor-pointer rounded-[var(--radius-shell)] border-none bg-transparent shadow-none ring-0 transition-[background-color,color,opacity,transform] duration-200 ease-out hover:bg-shell-toolbar-hover ${tracePanelOpen ? "bg-shell-toolbar-hover text-foreground scale-[0.98]" : "text-muted-foreground hover:scale-[1.02]"}`}
                            aria-label={tracePanelOpen ? "收起运行追踪" : "展开运行追踪"}
                          >
                            <ActivityIcon className="h-4 w-4" strokeWidth={1.9} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                          {tracePanelOpen ? "收起运行追踪" : "展开运行追踪"}
                        </TooltipContent>
                      </Tooltip>
                    </div>

                    <div className="relative min-h-0 flex-1 bg-[color:var(--chela-bg-surface)]">
                      <div
                        className={mainView === "thread" ? "h-full min-h-0" : "hidden"}
                        aria-hidden={mainView !== "thread"}
                      >
                        <ThreadRuntimeLayer
                          desktopApi={desktopApi}
                          activeSessionId={activeSessionId}
                          archivedSummaries={archivedSummaries}
                          browserContextBySessionId={browserContextBySessionId}
                          contextSummaryBySessionId={contextSummaryBySessionId}
                          currentModelId={currentModelId}
                          gitBranchSummary={gitBranchSummary}
                          interruptedApprovalGroupsBySessionId={interruptedApprovalGroupsBySessionId}
                          isPickingFiles={isPickingFiles}
                          runningSessionIds={runningSessionIds}
                          sessionCache={sessionCache}
                          summaries={summaries}
                          thinkingLevel={thinkingLevel}
                          threadTerminalOpen={threadTerminalOpen}
                          onAttachFiles={attachFiles}
                          onBranchChanged={handleGitStateChanged}
                          onClearBrowserContextItems={handleClearBrowserContextItems}
                          onComposerFocus={handleComposerFocus}
                          onCreateNewSession={createNewSession}
                          onDismissInterruptedApproval={dismissInterruptedApproval}
                          onModelChange={handleModelChange}
                          onOpenArchived={openArchivedSettings}
                          onPasteFiles={pasteFiles}
                          onPersistSession={persistSession}
                          onReloadSession={reloadSession}
                          onRemoveAttachment={removeAttachmentAndLinkedBrowserContext}
                          onRemoveBrowserContextItem={handleRemoveBrowserContextItem}
                          onResumeInterruptedApproval={resumeInterruptedApproval}
                          onRunStateChange={handleSessionRunStateChange}
                          onThinkingLevelChange={handleThinkingLevelChange}
                        />
                      </div>
                      <div
                        className={mainView === "settings" ? "h-full min-h-0" : "hidden"}
                        aria-hidden={mainView !== "settings"}
                      >
                        {settingsContent}
                      </div>
                    </div>

                    <div className={mainView === "thread" && !rightPanelVisibleOrAnimating ? "" : "hidden"}>
                      <TerminalDrawer
                        open={threadTerminalOpen}
                        onToggle={toggleThreadTerminal}
                        settings={settings}
                      />
                    </div>
                  </div>
                </div>

                {mainView === "thread" ? (
                  <div
                    ref={rightPanelShellRef}
                    className={`chela-right-panel-shell relative flex min-h-0 shrink-0 flex-col overflow-hidden rounded-[var(--radius-shell)] bg-[color:var(--chela-bg-surface)] ${diffPanelOpen || tracePanelOpen || browserPanelOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"} ${diffPanelOpen || tracePanelOpen || browserPanelOpen || rightPanelAnimating ? "ring-1 ring-[color:var(--color-control-border)]" : "ring-1 ring-transparent"}`}
                    style={{
                      width: diffPanelOpen || tracePanelOpen || browserPanelOpen ? resolvedRightPanelWidth : 0,
                      marginLeft: diffPanelOpen || tracePanelOpen || browserPanelOpen ? RIGHT_PANEL_GAP_PX : 0,
                      willChange: "width",
                    }}
                  >
                    <div
                      className={`absolute left-0 top-0 bottom-0 z-20 flex w-3 -translate-x-1/2 cursor-col-resize touch-none select-none justify-center group ${(diffPanelOpen || tracePanelOpen || browserPanelOpen) ? "pointer-events-auto" : "pointer-events-none opacity-0"}`}
                      onPointerDown={handleRightPanelResizePointerDown}
                    >
                      <div className="h-full w-px bg-border/60 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-active:opacity-100" />
                    </div>

                    {rightPanelVisibleOrAnimating ? (
                      <Suspense fallback={null}>
                        {diffPanelOpen && (
                          <div className={`chela-right-panel-content min-h-0 flex-1 overflow-hidden ${diffPanelOpen ? "translate-x-0 opacity-100" : "translate-x-3 opacity-0"}`}>
                            <DiffWorkbenchContent
                              onClose={closeRightPanel}
                              overview={gitOverview}
                              isLoading={gitOverviewLoading}
                              onRefresh={handleRefreshGitOverview}
                              className="h-full"
                            />
                          </div>
                        )}
                        {browserPanelOpen && (
                          <div className="chela-right-panel-content min-h-0 flex-1 overflow-hidden translate-x-0 opacity-100">
                            <BrowserPreviewPanel
                              onClose={closeRightPanel}
                              onElementSelected={handleBrowserElementSelected}
                              onScreenshotCaptured={handleBrowserScreenshotCaptured}
                              browserContextItems={
                                activeSessionId
                                  ? browserContextBySessionId[activeSessionId] ?? []
                                  : []
                              }
                              resetInteractionSignal={browserInteractionResetSignal}
                              className="h-full"
                            />
                          </div>
                        )}
                        {tracePanelOpen && activeSession && (
                          <div className="chela-right-panel-content min-h-0 flex-1 overflow-hidden translate-x-0 opacity-100">
                            <TracePanel
                              sessionId={activeSession.id}
                              onClose={closeRightPanel}
                              className="h-full"
                            />
                          </div>
                        )}

                        <TerminalDrawer
                          open={terminalOpen}
                          onToggle={toggleThreadTerminal}
                          settings={settings}
                        />
                      </Suspense>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </section>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </main>
  );
}
