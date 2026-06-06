import { useCallback } from "react";
import type {
  ChatSession,
  ChatSessionSummary,
  InterruptedApprovalGroup,
  SessionGroup,
} from "@shared/contracts";
import {
  ACTIVE_SESSION_STORAGE_KEY,
  LEGACY_ACTIVE_SESSION_STORAGE_KEY,
  clearStoredStrings,
  getProjectNameFromPath,
} from "@renderer/lib/app-shell";
import {
  applySessionToArchivedSummaries,
  applySessionToLiveSummaries,
  findGroupByPath,
  resolveGroupName,
  resolveGroupPath,
  resolveSessionProjectPath,
} from "@renderer/lib/app-session-state";
import { upsertSummary } from "@renderer/lib/session";
import { EMPTY_CONTEXT_USAGE_SUMMARY } from "@renderer/lib/context-usage";
import type { AppStoreActions } from "@renderer/stores/app-store";
import type { SessionStoreActions } from "@renderer/stores/session-store";

type Ref<T> = {
  current: T;
};

type DesktopApi = typeof window.desktopApi;

type UseSessionOperationsInput = {
  desktopApi: DesktopApi;
  appActions: AppStoreActions;
  sessionActions: SessionStoreActions;
  activeSessionIdRef: Ref<string | null>;
  sessionSelectionSerialRef: Ref<number>;
  summariesRef: Ref<ChatSessionSummary[]>;
  archivedSummariesRef: Ref<ChatSessionSummary[]>;
  groupsRef: Ref<SessionGroup[]>;
  sessionCacheRef: Ref<Record<string, ChatSession>>;
  switchWorkspacePath: (nextWorkspace: string) => Promise<void>;
};

export function useSessionOperations({
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
}: UseSessionOperationsInput) {
  const cacheSession = useCallback((session: ChatSession) => {
    sessionActions.cacheSession(session);
  }, [sessionActions]);

  const refreshContextSummary = useCallback(
    async (sessionId: string) => {
      if (!desktopApi?.context) {
        return EMPTY_CONTEXT_USAGE_SUMMARY;
      }

      try {
        const nextSummary = await desktopApi.context.getSummary(sessionId);
        sessionActions.setContextSummary(sessionId, nextSummary);
        return nextSummary;
      } catch {
        sessionActions.setContextSummary(sessionId, EMPTY_CONTEXT_USAGE_SUMMARY);
        return EMPTY_CONTEXT_USAGE_SUMMARY;
      }
    },
    [desktopApi, sessionActions],
  );

  const refreshInterruptedApprovalGroups = useCallback(
    async (sessionId: string) => {
      if (!desktopApi?.agent?.listInterruptedApprovalGroups) {
        sessionActions.setInterruptedApprovalGroups(sessionId, []);
        return [] as InterruptedApprovalGroup[];
      }

      try {
        const groups = await desktopApi.agent.listInterruptedApprovalGroups(sessionId);
        sessionActions.setInterruptedApprovalGroups(sessionId, groups);
        return groups;
      } catch {
        sessionActions.setInterruptedApprovalGroups(sessionId, []);
        return [] as InterruptedApprovalGroup[];
      }
    },
    [desktopApi, sessionActions],
  );

  const removeCachedSession = useCallback((sessionId: string) => {
    sessionActions.removeCachedSession(sessionId);
  }, [sessionActions]);

  const hydrateSession = useCallback((session: ChatSession) => {
    cacheSession(session);
    activeSessionIdRef.current = session.id;
    sessionActions.hydrateSession(session);
    localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, session.id);
  }, [activeSessionIdRef, cacheSession, sessionActions]);

  const clearActiveSession = useCallback(() => {
    activeSessionIdRef.current = null;
    sessionActions.clearActiveSession();
    clearStoredStrings([
      ACTIVE_SESSION_STORAGE_KEY,
      LEGACY_ACTIVE_SESSION_STORAGE_KEY,
    ]);
  }, [activeSessionIdRef, sessionActions]);

  const reloadSession = useCallback(
    async (sessionId: string) => {
      if (!desktopApi) {
        return;
      }

      const session = await desktopApi.sessions.load(sessionId);
      if (!session) {
        return;
      }

      cacheSession(session);
      if (activeSessionIdRef.current === sessionId) {
        sessionActions.hydrateSession(session);
      }
      sessionActions.persistSessionLocally(session);
      await refreshContextSummary(sessionId);
      await refreshInterruptedApprovalGroups(sessionId);
    },
    [
      activeSessionIdRef,
      cacheSession,
      desktopApi,
      refreshContextSummary,
      refreshInterruptedApprovalGroups,
      sessionActions,
    ],
  );

  const persistSession = useCallback(
    (session: ChatSession) => {
      sessionActions.persistSessionLocally(session);
      void desktopApi?.sessions.save(session);
    },
    [desktopApi, sessionActions],
  );

  const refreshSessionLists = useCallback(async () => {
    if (!desktopApi) {
      return { sessionSummaries: [], archivedList: [] };
    }

    const [sessionSummaries, archivedList] = await Promise.all([
      desktopApi.sessions.list(),
      desktopApi.sessions.listArchived(),
    ]);

    sessionActions.setSummaries(sessionSummaries);
    sessionActions.setArchivedSummaries(archivedList);

    return { sessionSummaries, archivedList };
  }, [desktopApi, sessionActions]);

  const refreshGroups = useCallback(async () => {
    if (!desktopApi) {
      return [] as SessionGroup[];
    }

    const nextGroups = await desktopApi.groups.list();
    sessionActions.setGroups(nextGroups);
    return nextGroups;
  }, [desktopApi, sessionActions]);

  const createNewSession = useCallback(async () => {
    if (!desktopApi) {
      return;
    }

    const nextSession = await desktopApi.sessions.create();
    sessionActions.setSummaries(upsertSummary(summariesRef.current, nextSession));
    hydrateSession(nextSession);
    void refreshContextSummary(nextSession.id);
    void refreshInterruptedApprovalGroups(nextSession.id);
  }, [
    desktopApi,
    hydrateSession,
    refreshContextSummary,
    refreshInterruptedApprovalGroups,
    sessionActions,
    summariesRef,
  ]);

  const createSessionInGroup = useCallback(
    async (groupId: string) => {
      if (!desktopApi) {
        return;
      }

      const targetGroupPath = resolveGroupPath(groupsRef.current, groupId);
      if (targetGroupPath) {
        await switchWorkspacePath(targetGroupPath);
      }

      const nextSession = await desktopApi.sessions.create();
      await desktopApi.sessions.setGroup(nextSession.id, groupId);
      const groupedSession =
        (await desktopApi.sessions.load(nextSession.id)) ?? {
          ...nextSession,
          groupId,
        };

      await refreshSessionLists();
      hydrateSession(groupedSession);
      void refreshContextSummary(groupedSession.id);
      void refreshInterruptedApprovalGroups(groupedSession.id);
    },
    [
      desktopApi,
      groupsRef,
      hydrateSession,
      refreshContextSummary,
      refreshInterruptedApprovalGroups,
      refreshSessionLists,
      switchWorkspacePath,
    ],
  );

  const selectSession = useCallback(
    async (sessionId: string) => {
      if (!desktopApi) {
        return;
      }

      const selectionSerial = ++sessionSelectionSerialRef.current;

      const projectPath = resolveSessionProjectPath(
        sessionId,
        summariesRef.current,
        archivedSummariesRef.current,
        groupsRef.current,
      );
      if (projectPath) {
        await switchWorkspacePath(projectPath);
        if (sessionSelectionSerialRef.current !== selectionSerial) {
          return;
        }
      }

      const cachedSession = sessionCacheRef.current[sessionId];
      if (cachedSession) {
        if (sessionSelectionSerialRef.current !== selectionSerial) {
          return;
        }
        hydrateSession(cachedSession);
        void refreshContextSummary(sessionId);
        return;
      }

      const session = await desktopApi.sessions.load(sessionId);
      if (session && sessionSelectionSerialRef.current === selectionSerial) {
        hydrateSession(session);
        void refreshContextSummary(sessionId);
      }
    },
    [
      archivedSummariesRef,
      desktopApi,
      groupsRef,
      hydrateSession,
      refreshContextSummary,
      sessionCacheRef,
      sessionSelectionSerialRef,
      summariesRef,
      switchWorkspacePath,
    ],
  );

  const archiveSession = useCallback(
    async (sessionId: string) => {
      if (!desktopApi) {
        return;
      }

      const remaining = summariesRef.current.filter(
        (summary) => summary.id !== sessionId,
      );

      await desktopApi.sessions.archive(sessionId);
      removeCachedSession(sessionId);
      await refreshSessionLists();

      if (activeSessionIdRef.current !== sessionId) {
        return;
      }

      if (remaining.length > 0) {
        void selectSession(remaining[0].id);
        return;
      }

      clearActiveSession();
    },
    [
      activeSessionIdRef,
      clearActiveSession,
      desktopApi,
      refreshSessionLists,
      removeCachedSession,
      selectSession,
      summariesRef,
    ],
  );

  const unarchiveSession = useCallback(
    async (sessionId: string) => {
      if (!desktopApi) {
        return;
      }

      await desktopApi.sessions.unarchive(sessionId);
      removeCachedSession(sessionId);
      await refreshSessionLists();

      if (activeSessionIdRef.current !== sessionId) {
        return;
      }

      const session = await desktopApi.sessions.load(sessionId);
      if (session) {
        hydrateSession(session);
        void refreshContextSummary(sessionId);
      }
    },
    [
      activeSessionIdRef,
      desktopApi,
      hydrateSession,
      refreshContextSummary,
      refreshSessionLists,
      removeCachedSession,
    ],
  );

  const deleteSessionPermanently = useCallback(
    async (sessionId: string) => {
      if (!desktopApi) {
        return;
      }

      const wasActive = activeSessionIdRef.current === sessionId;
      await desktopApi.sessions.delete(sessionId);
      sessionActions.removeSessionState(sessionId);
      const { sessionSummaries } = await refreshSessionLists();

      if (!wasActive) {
        return;
      }

      clearActiveSession();

      if (sessionSummaries[0]) {
        void selectSession(sessionSummaries[0].id);
      }
    },
    [
      activeSessionIdRef,
      clearActiveSession,
      desktopApi,
      refreshSessionLists,
      selectSession,
      sessionActions,
    ],
  );

  const setSessionPinned = useCallback(
    async (sessionId: string, pinned: boolean) => {
      if (!desktopApi) {
        return;
      }

      await desktopApi.sessions.setPinned(sessionId, pinned);
      await refreshSessionLists();
    },
    [desktopApi, refreshSessionLists],
  );

  const renameSession = useCallback(
    async (sessionId: string) => {
      if (!desktopApi) {
        return;
      }

      const currentTitle =
        summariesRef.current.find((summary) => summary.id === sessionId)?.title ??
        archivedSummariesRef.current.find((summary) => summary.id === sessionId)?.title ??
        "";
      const nextTitle = window.prompt("重命名聊天", currentTitle);
      if (nextTitle === null) {
        return;
      }

      const trimmedTitle = nextTitle.trim();
      if (!trimmedTitle || trimmedTitle === currentTitle.trim()) {
        return;
      }

      await desktopApi.sessions.rename(sessionId, trimmedTitle);
      await refreshSessionLists();

      if (activeSessionIdRef.current === sessionId) {
        await reloadSession(sessionId);
      }
    },
    [
      activeSessionIdRef,
      archivedSummariesRef,
      desktopApi,
      refreshSessionLists,
      reloadSession,
      summariesRef,
    ],
  );

  const renameProject = useCallback(
    async (groupId: string) => {
      if (!desktopApi) {
        return;
      }

      const currentName = resolveGroupName(groupsRef.current, groupId);
      const nextName = window.prompt("重命名项目", currentName);
      if (nextName === null) {
        return;
      }

      const trimmedName = nextName.trim();
      if (!trimmedName || trimmedName === currentName.trim()) {
        return;
      }

      await desktopApi.groups.rename(groupId, trimmedName);
      await refreshGroups();
    },
    [desktopApi, groupsRef, refreshGroups],
  );

  const deleteProject = useCallback(
    async (groupId: string) => {
      if (!desktopApi) {
        return;
      }

      const projectName = resolveGroupName(groupsRef.current, groupId) || "当前项目";
      const confirmed = window.confirm(
        `删除项目“${projectName}”？项目下聊天会保留，并移动到“聊天”区。`,
      );
      if (!confirmed) {
        return;
      }

      await desktopApi.groups.delete(groupId);
      await refreshGroups();
      await refreshSessionLists();

      const activeId = activeSessionIdRef.current;
      if (activeId) {
        await reloadSession(activeId);
      }
    },
    [
      activeSessionIdRef,
      desktopApi,
      groupsRef,
      refreshGroups,
      refreshSessionLists,
      reloadSession,
    ],
  );

  const handleCreateProject = useCallback(async () => {
    if (!desktopApi) {
      return;
    }

    const nextWorkspace = await desktopApi.workspace.pickFolder();
    if (!nextWorkspace) {
      return;
    }

    const existingGroup = findGroupByPath(groupsRef.current, nextWorkspace);
    if (existingGroup) {
      await createSessionInGroup(existingGroup.id);
      return;
    }

    const group = await desktopApi.groups.create({
      name: getProjectNameFromPath(nextWorkspace),
      path: nextWorkspace,
    });
    sessionActions.setGroups([...groupsRef.current, group]);
    await switchWorkspacePath(nextWorkspace);
    await createSessionInGroup(group.id);
  }, [
    createSessionInGroup,
    desktopApi,
    groupsRef,
    sessionActions,
    switchWorkspacePath,
  ]);

  const handleSelectProject = useCallback(
    async (groupId: string) => {
      const targetGroupPath = resolveGroupPath(groupsRef.current, groupId);
      if (!targetGroupPath) {
        return;
      }

      await switchWorkspacePath(targetGroupPath);
    },
    [groupsRef, switchWorkspacePath],
  );

  const dismissInterruptedApproval = useCallback(
    async (sessionId: string, runId: string) => {
      if (!desktopApi?.agent?.dismissInterruptedApproval) {
        return;
      }

      await desktopApi.agent.dismissInterruptedApproval(runId);
      await refreshInterruptedApprovalGroups(sessionId);
    },
    [desktopApi, refreshInterruptedApprovalGroups],
  );

  const resumeInterruptedApproval = useCallback(
    async (runId: string) => {
      if (!desktopApi?.agent?.resumeInterruptedApproval) {
        throw new Error("恢复执行当前不可用。");
      }

      return desktopApi.agent.resumeInterruptedApproval(runId);
    },
    [desktopApi],
  );

  const handleGitStateChanged = useCallback(async () => {
    await refreshSessionLists();
  }, [refreshSessionLists]);

  const applySessionStateUpdate = useCallback((session: ChatSession) => {
    const activeId = activeSessionIdRef.current;
    const isArchived = archivedSummariesRef.current.some(
      (summary) => summary.id === session.id,
    );

    if (isArchived) {
      sessionActions.setArchivedSummaries(
        applySessionToArchivedSummaries(
          archivedSummariesRef.current,
          session,
        ),
      );
    } else {
      sessionActions.setSummaries(
        applySessionToLiveSummaries(
          summariesRef.current,
          session,
        ),
      );
    }

    cacheSession(session);
    if (activeId === session.id) {
      sessionActions.hydrateSession(session);
      appActions.bumpBrowserInteractionResetSignal();
    }
  }, [
    activeSessionIdRef,
    appActions,
    archivedSummariesRef,
    cacheSession,
    groupsRef,
    sessionActions,
    summariesRef,
  ]);

  return {
    applySessionStateUpdate,
    archiveSession,
    cacheSession,
    clearActiveSession,
    createNewSession,
    createSessionInGroup,
    deleteProject,
    deleteSessionPermanently,
    dismissInterruptedApproval,
    handleCreateProject,
    handleGitStateChanged,
    handleSelectProject,
    hydrateSession,
    persistSession,
    refreshContextSummary,
    refreshGroups,
    refreshInterruptedApprovalGroups,
    refreshSessionLists,
    reloadSession,
    renameProject,
    renameSession,
    resumeInterruptedApproval,
    selectSession,
    setSessionPinned,
    unarchiveSession,
  };
}
