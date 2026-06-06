import { useCallback, useEffect } from "react";
import type {
  ChatSession,
  ChatSessionSummary,
  DesktopApi,
  RightPanelState,
  Settings,
  SessionGroup,
  ThinkingLevel,
  WindowFrameState,
} from "@shared/contracts";
import {
  ACTIVE_SESSION_STORAGE_KEY,
  LEGACY_ACTIVE_SESSION_STORAGE_KEY,
  readStoredString,
} from "@renderer/lib/app-shell";
import { loadProviderDirectory } from "@renderer/lib/provider-directory";

type AppBootActions = {
  setBootError: (bootError: string | null) => void;
  setBooting: (booting: boolean) => void;
  setRightPanelState: (partial: Partial<RightPanelState>) => void;
  setFrameState: (frameState: WindowFrameState) => void;
  setSettings: (settings: Settings | null) => void;
  setCurrentModelId: (currentModelId: string) => void;
  setThinkingLevel: (thinkingLevel: ThinkingLevel) => void;
};

type SessionBootActions = {
  setSummaries: (summaries: ChatSessionSummary[]) => void;
  setArchivedSummaries: (summaries: ChatSessionSummary[]) => void;
  setGroups: (groups: SessionGroup[]) => void;
};

type MutableSettingsRef = {
  current: Settings | null;
};

export type UseAppBootInput = {
  desktopApi: DesktopApi | undefined;
  appActions: AppBootActions;
  sessionActions: SessionBootActions;
  settingsRef: MutableSettingsRef;
  hydrateSession: (session: ChatSession) => void;
  clearActiveSession: () => void;
  refreshContextSummary: (sessionId: string) => Promise<unknown>;
  refreshInterruptedApprovalGroups: (sessionId: string) => Promise<unknown>;
  refreshGitBranchSummary: () => Promise<unknown>;
  refreshGitOverview: () => Promise<unknown>;
};

export function useAppBoot({
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
}: UseAppBootInput): void {
  const bootApp = useCallback(async () => {
    if (!desktopApi) {
      appActions.setBootError(
        "桌面桥接没有注入成功，renderer 无法访问 Electron API。现在不会再整窗黑掉，而是直接把问题暴露出来。",
      );
      appActions.setBooting(false);
      return;
    }

    try {
      const [
        uiState,
        frame,
        sessionSummaries,
        archivedList,
        groupList,
        settings,
      ] = await Promise.all([
        desktopApi.ui.getState(),
        desktopApi.window.getState(),
        desktopApi.sessions.list(),
        desktopApi.sessions.listArchived(),
        desktopApi.groups.list(),
        desktopApi.settings.get(),
        loadProviderDirectory(desktopApi).catch(() => null),
      ]);

      appActions.setRightPanelState(uiState.rightPanel);
      appActions.setFrameState(frame);
      sessionActions.setSummaries(sessionSummaries);
      sessionActions.setArchivedSummaries(archivedList);
      sessionActions.setGroups(groupList);
      if (settings) {
        settingsRef.current = settings;
        appActions.setSettings(settings);
        appActions.setCurrentModelId(settings.modelRouting.chat.modelId);
        appActions.setThinkingLevel(settings.thinkingLevel);
        void refreshGitBranchSummary();
        void refreshGitOverview();
      }

      const storedSessionId = readStoredString([
        ACTIVE_SESSION_STORAGE_KEY,
        LEGACY_ACTIVE_SESSION_STORAGE_KEY,
      ]);
      let nextSession = storedSessionId
        ? await desktopApi.sessions.load(storedSessionId)
        : null;

      if (!nextSession && sessionSummaries[0]) {
        nextSession = await desktopApi.sessions.load(sessionSummaries[0].id);
      }

      if (nextSession) {
        hydrateSession(nextSession);
      } else {
        clearActiveSession();
      }

      if (!nextSession) {
        return;
      }

      void refreshContextSummary(nextSession.id);
      void refreshInterruptedApprovalGroups(nextSession.id);
    } catch (error) {
      appActions.setBootError(
        error instanceof Error ? error.message : "桌面壳初始化失败。",
      );
    } finally {
      appActions.setBooting(false);
    }
  }, [
    appActions,
    clearActiveSession,
    desktopApi,
    hydrateSession,
    refreshContextSummary,
    refreshGitBranchSummary,
    refreshGitOverview,
    refreshInterruptedApprovalGroups,
    sessionActions,
    settingsRef,
  ]);

  useEffect(() => {
    void bootApp();
  }, [bootApp]);
}
