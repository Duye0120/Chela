import { create } from "zustand";
import type {
  ChatSession,
  ChatSessionSummary,
  ContextSummary,
  InterruptedApprovalGroup,
  SessionGroup,
} from "@shared/contracts";
import {
  applySessionToArchivedSummaries,
  applySessionToLiveSummaries,
  removeRecordKey,
  updateRunningSessionIds,
} from "../lib/app-session-state";
import {
  compactBrowserContextItems,
  type BrowserContextItem,
} from "../lib/browser-interview";
import { EMPTY_CONTEXT_USAGE_SUMMARY } from "../lib/context-usage";

type SessionStoreState = {
  summaries: ChatSessionSummary[];
  archivedSummaries: ChatSessionSummary[];
  groups: SessionGroup[];
  activeSessionId: string | null;
  activeSession: ChatSession | null;
  sessionCache: Record<string, ChatSession>;
  runningSessionIds: string[];
  browserContextBySessionId: Record<string, BrowserContextItem[]>;
  contextSummaryBySessionId: Record<string, ContextSummary>;
  interruptedApprovalGroupsBySessionId: Record<string, InterruptedApprovalGroup[]>;
  setSummaries: (summaries: ChatSessionSummary[]) => void;
  setArchivedSummaries: (archivedSummaries: ChatSessionSummary[]) => void;
  setGroups: (groups: SessionGroup[]) => void;
  cacheSession: (session: ChatSession) => void;
  removeCachedSession: (sessionId: string) => void;
  hydrateSession: (session: ChatSession) => void;
  clearActiveSession: () => void;
  persistSessionLocally: (session: ChatSession) => void;
  removeSessionState: (sessionId: string) => void;
  setSessionRunning: (sessionId: string, isRunning: boolean) => void;
  setContextSummary: (sessionId: string, summary: ContextSummary) => void;
  setInterruptedApprovalGroups: (
    sessionId: string,
    groups: InterruptedApprovalGroup[],
  ) => void;
  upsertBrowserContextItem: (sessionId: string, item: BrowserContextItem) => void;
  removeBrowserContextItem: (sessionId: string, itemId: string) => void;
  clearBrowserContextItems: (sessionId: string) => void;
  removeAttachmentLinkedBrowserContext: (
    sessionId: string,
    browserContextItemId: string,
  ) => void;
  resetSessionStoreForTests: () => void;
};

const initialSessionState = {
  summaries: [] as ChatSessionSummary[],
  archivedSummaries: [] as ChatSessionSummary[],
  groups: [] as SessionGroup[],
  activeSessionId: null,
  activeSession: null as ChatSession | null,
  sessionCache: {} as Record<string, ChatSession>,
  runningSessionIds: [] as string[],
  browserContextBySessionId: {} as Record<string, BrowserContextItem[]>,
  contextSummaryBySessionId: {} as Record<string, ContextSummary>,
  interruptedApprovalGroupsBySessionId: {} as Record<
    string,
    InterruptedApprovalGroup[]
  >,
};

export const useSessionStore = create<SessionStoreState>((set) => ({
  ...initialSessionState,
  setSummaries: (summaries) => set({ summaries }),
  setArchivedSummaries: (archivedSummaries) => set({ archivedSummaries }),
  setGroups: (groups) => set({ groups }),
  cacheSession: (session) =>
    set((state) => {
      if (state.sessionCache[session.id] === session) return state;
      return {
        sessionCache: {
          ...state.sessionCache,
          [session.id]: session,
        },
      };
    }),
  removeCachedSession: (sessionId) =>
    set((state) => ({
      sessionCache: removeRecordKey(state.sessionCache, sessionId),
      contextSummaryBySessionId: removeRecordKey(
        state.contextSummaryBySessionId,
        sessionId,
      ),
    })),
  hydrateSession: (session) =>
    set((state) => ({
      activeSessionId: session.id,
      activeSession: session,
      sessionCache:
        state.sessionCache[session.id] === session
          ? state.sessionCache
          : {
            ...state.sessionCache,
            [session.id]: session,
          },
    })),
  clearActiveSession: () =>
    set({
      activeSessionId: null,
      activeSession: null,
    }),
  persistSessionLocally: (session) =>
    set((state) => ({
      activeSession:
        state.activeSessionId === session.id ? session : state.activeSession,
      sessionCache:
        state.sessionCache[session.id] === session
          ? state.sessionCache
          : {
            ...state.sessionCache,
            [session.id]: session,
          },
      summaries: applySessionToLiveSummaries(state.summaries, session),
      archivedSummaries: applySessionToArchivedSummaries(
        state.archivedSummaries,
        session,
      ),
    })),
  removeSessionState: (sessionId) =>
    set((state) => ({
      activeSessionId:
        state.activeSessionId === sessionId ? null : state.activeSessionId,
      activeSession:
        state.activeSessionId === sessionId ? null : state.activeSession,
      sessionCache: removeRecordKey(state.sessionCache, sessionId),
      contextSummaryBySessionId: removeRecordKey(
        state.contextSummaryBySessionId,
        sessionId,
      ),
      interruptedApprovalGroupsBySessionId: removeRecordKey(
        state.interruptedApprovalGroupsBySessionId,
        sessionId,
      ),
      browserContextBySessionId: removeRecordKey(
        state.browserContextBySessionId,
        sessionId,
      ),
      runningSessionIds: updateRunningSessionIds(
        state.runningSessionIds,
        sessionId,
        false,
      ),
    })),
  setSessionRunning: (sessionId, isRunning) =>
    set((state) => ({
      runningSessionIds: updateRunningSessionIds(
        state.runningSessionIds,
        sessionId,
        isRunning,
      ),
    })),
  setContextSummary: (sessionId, summary) =>
    set((state) => ({
      contextSummaryBySessionId: {
        ...state.contextSummaryBySessionId,
        [sessionId]: summary ?? EMPTY_CONTEXT_USAGE_SUMMARY,
      },
    })),
  setInterruptedApprovalGroups: (sessionId, groups) =>
    set((state) => ({
      interruptedApprovalGroupsBySessionId: {
        ...state.interruptedApprovalGroupsBySessionId,
        [sessionId]: groups,
      },
    })),
  upsertBrowserContextItem: (sessionId, item) =>
    set((state) => {
      const existing = state.browserContextBySessionId[sessionId] ?? [];
      return {
        browserContextBySessionId: {
          ...state.browserContextBySessionId,
          [sessionId]: compactBrowserContextItems([item, ...existing], 8),
        },
      };
    }),
  removeBrowserContextItem: (sessionId, itemId) =>
    set((state) => {
      const existing = state.browserContextBySessionId[sessionId] ?? [];
      const nextItems = existing.filter((item) => item.id !== itemId);
      if (nextItems.length === existing.length) return state;
      return {
        browserContextBySessionId: {
          ...state.browserContextBySessionId,
          [sessionId]: nextItems,
        },
      };
    }),
  clearBrowserContextItems: (sessionId) =>
    set((state) => {
      if ((state.browserContextBySessionId[sessionId] ?? []).length === 0) {
        return state;
      }
      return {
        browserContextBySessionId: {
          ...state.browserContextBySessionId,
          [sessionId]: [],
        },
      };
    }),
  removeAttachmentLinkedBrowserContext: (sessionId, browserContextItemId) =>
    set((state) => {
      const existing = state.browserContextBySessionId[sessionId] ?? [];
      const nextItems = existing.filter((item) => item.id !== browserContextItemId);
      if (nextItems.length === existing.length) return state;
      return {
        browserContextBySessionId: {
          ...state.browserContextBySessionId,
          [sessionId]: nextItems,
        },
      };
    }),
  resetSessionStoreForTests: () => set({ ...initialSessionState }),
}));
