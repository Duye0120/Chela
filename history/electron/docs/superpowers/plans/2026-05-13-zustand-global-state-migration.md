# Zustand Global State Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move renderer-wide shared state to Zustand while preserving current chat, Browser context, right panel, settings, Git, and provider directory behavior.

**Architecture:** Add focused stores under `src/renderer/src/stores/`, keep IPC orchestration in `App.tsx` and existing hooks, and use selectors for narrow subscriptions. Stores own renderer state transitions; main-process services continue to own persistence.

**Tech Stack:** React 19, Zustand 5, TypeScript, existing Electron preload `desktopApi`, existing `tsx` regression tests.

---

## File Structure

- Create `src/renderer/src/stores/app-store.ts`: shell, settings, model, right panel, sidebar, frame, boot, browser interaction signal.
- Create `src/renderer/src/stores/session-store.ts`: sessions, summaries, groups, context summaries, interrupted approvals, running ids, browser context.
- Create `src/renderer/src/stores/git-store.ts`: Git branch / diff snapshot state and request de-dupe.
- Create `src/renderer/src/stores/provider-directory-store.ts`: provider sources / entries / loading and refresh action.
- Create `tests/renderer-zustand-store-regression.test.ts`: store reducer and action regression coverage.
- Modify `src/renderer/src/App.tsx`: replace large `useState` groups with store selectors/actions.
- Modify `src/renderer/src/hooks/use-app-git-state.ts`: use `git-store`.
- Modify `src/renderer/src/hooks/use-session-attachments.ts`: accept active session / persist callback from store-backed App unchanged at API level.
- Modify `src/renderer/src/components/AssistantThreadPanel.tsx`: keep public props stable unless provider directory store removes local provider state from nested Thread.
- Modify `src/renderer/src/components/assistant-ui/thread.tsx`: consume provider directory store for model options.
- Modify `src/renderer/src/components/assistant-ui/settings/memory-section.tsx`: consume provider directory store for provider entries.
- Modify `tests/browser-interview-regression.test.ts`: update source assertions from local state to store selector/action paths.
- Modify `docs/changes/2026-05-13/changes.md`: append implementation record.

---

### Task 1: Add Store Regression Test Skeleton

**Files:**
- Create: `tests/renderer-zustand-store-regression.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import type { ChatSession } from "../src/shared/contracts.ts";
import { useAppStore } from "../src/renderer/src/stores/app-store.ts";
import { useSessionStore } from "../src/renderer/src/stores/session-store.ts";

function resetStores() {
  useAppStore.getState().resetAppStoreForTests();
  useSessionStore.getState().resetSessionStoreForTests();
}

function createSession(id: string): ChatSession {
  return {
    id,
    title: `Session ${id}`,
    messages: [],
    queuedMessages: [],
    draft: "",
    attachments: [],
    createdAt: "2026-05-13T00:00:00.000Z",
    updatedAt: "2026-05-13T00:00:00.000Z",
    archived: false,
  };
}

resetStores();

useAppStore.getState().setRightPanelState({ open: true, activeView: "browser", width: 520 });
useAppStore.getState().setRightPanelState({ open: false });
assert.deepEqual(useAppStore.getState().rightPanelState, {
  open: false,
  activeView: "browser",
  width: 520,
});

const session = createSession("s1");
useSessionStore.getState().hydrateSession(session);
assert.equal(useSessionStore.getState().activeSessionId, "s1");
assert.equal(useSessionStore.getState().activeSession?.id, "s1");
assert.equal(useSessionStore.getState().sessionCache.s1?.id, "s1");

useSessionStore.getState().setSessionRunning("s1", true);
useSessionStore.getState().setSessionRunning("s1", true);
assert.deepEqual(useSessionStore.getState().runningSessionIds, ["s1"]);
useSessionStore.getState().setSessionRunning("s1", false);
assert.deepEqual(useSessionStore.getState().runningSessionIds, []);

console.log("renderer zustand store regression tests passed");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec tsx tests/renderer-zustand-store-regression.test.ts`

Expected: FAIL because `src/renderer/src/stores/app-store.ts` does not exist.

- [ ] **Step 3: Commit after green**

Commit after Task 2 makes this test pass.

---

### Task 2: Implement App Store and Session Store

**Files:**
- Create: `src/renderer/src/stores/app-store.ts`
- Create: `src/renderer/src/stores/session-store.ts`
- Modify: `tests/renderer-zustand-store-regression.test.ts`

- [ ] **Step 1: Implement `app-store.ts`**

```ts
import { create } from "zustand";
import type {
  RightPanelState,
  Settings,
  ThinkingLevel,
  WindowFrameState,
} from "@shared/contracts";

type AppStoreState = {
  booting: boolean;
  bootError: string | null;
  terminalOpen: boolean;
  threadWorkspaceWidth: number;
  sidebarSize: number;
  sidebarCollapsed: boolean;
  currentModelId: string;
  thinkingLevel: ThinkingLevel;
  sidebarAnimating: boolean;
  rightPanelAnimating: boolean;
  rightPanelDragging: boolean;
  browserInteractionResetSignal: number;
  rightPanelState: RightPanelState;
  frameState: WindowFrameState;
  settings: Settings | null;
  setBooting: (booting: boolean) => void;
  setBootError: (bootError: string | null) => void;
  setTerminalOpen: (terminalOpen: boolean) => void;
  setThreadWorkspaceWidth: (threadWorkspaceWidth: number) => void;
  setSidebarSize: (sidebarSize: number) => void;
  setSidebarCollapsed: (sidebarCollapsed: boolean) => void;
  setCurrentModelId: (currentModelId: string) => void;
  setThinkingLevel: (thinkingLevel: ThinkingLevel) => void;
  setSidebarAnimating: (sidebarAnimating: boolean) => void;
  setRightPanelAnimating: (rightPanelAnimating: boolean) => void;
  setRightPanelDragging: (rightPanelDragging: boolean) => void;
  bumpBrowserInteractionResetSignal: () => void;
  setRightPanelState: (partial: Partial<RightPanelState>) => void;
  setFrameState: (frameState: WindowFrameState) => void;
  setSettings: (settings: Settings | null) => void;
  resetAppStoreForTests: () => void;
};

const DEFAULT_MODEL_ID = "builtin:anthropic:claude-sonnet-4-20250514";

const initialAppState = {
  booting: true,
  bootError: null,
  terminalOpen: false,
  threadWorkspaceWidth: 0,
  sidebarSize: 18,
  sidebarCollapsed: false,
  currentModelId: DEFAULT_MODEL_ID,
  thinkingLevel: "off" as ThinkingLevel,
  sidebarAnimating: false,
  rightPanelAnimating: false,
  rightPanelDragging: false,
  browserInteractionResetSignal: 0,
  rightPanelState: {
    open: false,
    activeView: "diff",
    width: null,
  } satisfies RightPanelState,
  frameState: {
    isMaximized: false,
  } satisfies WindowFrameState,
  settings: null,
};

export const useAppStore = create<AppStoreState>((set) => ({
  ...initialAppState,
  setBooting: (booting) => set({ booting }),
  setBootError: (bootError) => set({ bootError }),
  setTerminalOpen: (terminalOpen) => set({ terminalOpen }),
  setThreadWorkspaceWidth: (threadWorkspaceWidth) => set({ threadWorkspaceWidth }),
  setSidebarSize: (sidebarSize) => set({ sidebarSize }),
  setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
  setCurrentModelId: (currentModelId) => set({ currentModelId }),
  setThinkingLevel: (thinkingLevel) => set({ thinkingLevel }),
  setSidebarAnimating: (sidebarAnimating) => set({ sidebarAnimating }),
  setRightPanelAnimating: (rightPanelAnimating) => set({ rightPanelAnimating }),
  setRightPanelDragging: (rightPanelDragging) => set({ rightPanelDragging }),
  bumpBrowserInteractionResetSignal: () =>
    set((state) => ({
      browserInteractionResetSignal: state.browserInteractionResetSignal + 1,
    })),
  setRightPanelState: (partial) =>
    set((state) => ({
      rightPanelState: {
        ...state.rightPanelState,
        ...partial,
        activeView: partial.activeView ?? state.rightPanelState.activeView ?? "diff",
      },
    })),
  setFrameState: (frameState) => set({ frameState }),
  setSettings: (settings) => set({ settings }),
  resetAppStoreForTests: () => set({ ...initialAppState }),
}));
```

- [ ] **Step 2: Implement `session-store.ts`**

```ts
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
} from "@renderer/lib/app-session-state";
import {
  compactBrowserContextItems,
  type BrowserContextItem,
} from "@renderer/lib/browser-interview";
import { EMPTY_CONTEXT_USAGE_SUMMARY } from "@renderer/lib/context-usage";

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
  hydrateSession: (session: ChatSession) => void;
  clearActiveSession: () => void;
  persistSessionLocally: (session: ChatSession) => void;
  removeSessionState: (sessionId: string) => void;
  setSessionRunning: (sessionId: string, isRunning: boolean) => void;
  setContextSummary: (sessionId: string, summary: ContextSummary) => void;
  setInterruptedApprovalGroups: (sessionId: string, groups: InterruptedApprovalGroup[]) => void;
  upsertBrowserContextItem: (sessionId: string, item: BrowserContextItem) => void;
  removeBrowserContextItem: (sessionId: string, itemId: string) => void;
  clearBrowserContextItems: (sessionId: string) => void;
  removeAttachmentLinkedBrowserContext: (sessionId: string, browserContextItemId: string) => void;
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
  interruptedApprovalGroupsBySessionId: {} as Record<string, InterruptedApprovalGroup[]>,
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
      contextSummaryBySessionId: removeRecordKey(state.contextSummaryBySessionId, sessionId),
      interruptedApprovalGroupsBySessionId: removeRecordKey(
        state.interruptedApprovalGroupsBySessionId,
        sessionId,
      ),
      browserContextBySessionId: removeRecordKey(state.browserContextBySessionId, sessionId),
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
      if (nextItems === existing || nextItems.length === existing.length) return state;
      return {
        browserContextBySessionId: {
          ...state.browserContextBySessionId,
          [sessionId]: nextItems,
        },
      };
    }),
  clearBrowserContextItems: (sessionId) =>
    set((state) => {
      if ((state.browserContextBySessionId[sessionId] ?? []).length === 0) return state;
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
```

- [ ] **Step 3: Run test to verify it passes**

Run: `pnpm exec tsx tests/renderer-zustand-store-regression.test.ts`

Expected: PASS with `renderer zustand store regression tests passed`.

- [ ] **Step 4: Run renderer typecheck**

Run: `pnpm exec tsc --noEmit -p src/renderer/tsconfig.json`

Expected: PASS.

---

### Task 3: Expand Store Tests for Browser Context and Context Summaries

**Files:**
- Modify: `tests/renderer-zustand-store-regression.test.ts`

- [ ] **Step 1: Add failing browser context assertions**

Append before the final `console.log`:

```ts
const screenshotContext = {
  id: "ctx-screenshot-1",
  kind: "screenshot" as const,
  label: "截图 · 调整这一块",
  createdAt: "2026-05-13T00:00:01.000Z",
  screenshot: {
    screenshotId: "shot-1",
    comment: "调整这一块",
    sourceUrl: "http://localhost:5173/",
    title: "Chela",
    imageName: "shot.png",
    imagePath: "C:/tmp/shot.png",
    boundingRect: { x: 1, y: 2, width: 300, height: 200 },
    viewport: { x: 0, y: 0, width: 1280, height: 720 },
  },
};

useSessionStore.getState().upsertBrowserContextItem("s1", screenshotContext);
assert.equal(useSessionStore.getState().browserContextBySessionId.s1?.length, 1);
useSessionStore.getState().removeAttachmentLinkedBrowserContext("s1", "ctx-screenshot-1");
assert.deepEqual(useSessionStore.getState().browserContextBySessionId.s1, []);

useSessionStore.getState().setContextSummary("s1", {
  usedTokens: 10,
  maxTokens: 100,
  percentUsed: 10,
  remainingTokens: 90,
});
assert.equal(useSessionStore.getState().contextSummaryBySessionId.s1?.usedTokens, 10);

useSessionStore.getState().setInterruptedApprovalGroups("s1", []);
assert.deepEqual(useSessionStore.getState().interruptedApprovalGroupsBySessionId.s1, []);
```

- [ ] **Step 2: Run test**

Run: `pnpm exec tsx tests/renderer-zustand-store-regression.test.ts`

Expected: PASS after Task 2; if contract fields differ, adjust test object to match `BrowserContextItem` and `ContextSummary`.

---

### Task 4: Wire App.tsx to App Store and Session Store

**Files:**
- Modify: `src/renderer/src/App.tsx`
- Modify: `tests/browser-interview-regression.test.ts`

- [ ] **Step 1: Replace top-level `useState` imports and declarations**

In `src/renderer/src/App.tsx`, import:

```ts
import { useShallow } from "zustand/shallow";
import { useAppStore } from "@renderer/stores/app-store";
import { useSessionStore } from "@renderer/stores/session-store";
```

Replace the large `useState` block with selectors:

```ts
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
```

Add action selectors:

```ts
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
```

Add session selectors:

```ts
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
```

Add session actions:

```ts
const sessionActions = useSessionStore(useShallow((state) => ({
  setSummaries: state.setSummaries,
  setArchivedSummaries: state.setArchivedSummaries,
  setGroups: state.setGroups,
  cacheSession: state.cacheSession,
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
```

- [ ] **Step 2: Replace setters**

Replace local setter calls:

- `setBooting` → `appActions.setBooting`
- `setBootError` → `appActions.setBootError`
- `setTerminalOpen` → `appActions.setTerminalOpen`
- `setThreadWorkspaceWidth` → `appActions.setThreadWorkspaceWidth`
- `setSidebarSize` → `appActions.setSidebarSize`
- `setSidebarCollapsed` → `appActions.setSidebarCollapsed`
- `setCurrentModelId` → `appActions.setCurrentModelId`
- `setThinkingLevel` → `appActions.setThinkingLevel`
- `setSidebarAnimating` → `appActions.setSidebarAnimating`
- `setRightPanelAnimating` → `appActions.setRightPanelAnimating`
- `setRightPanelDragging` → `appActions.setRightPanelDragging`
- `setFrameState` → `appActions.setFrameState`
- `setSettings` functional updates become `useAppStore.setState((state) => ({ settings: state.settings ? mergeSettingsState(state.settings, partial) : state.settings }))`
- `setSummaries` → `sessionActions.setSummaries` for direct assignment; functional updates become purpose-built session actions or `useSessionStore.setState`.
- `setBrowserContextBySessionId` usages become browser context actions.

- [ ] **Step 3: Preserve ref synchronization**

Keep existing refs and effects:

```ts
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
```

Inside `hydrateSession`, call both ref update and store action:

```ts
activeSessionIdRef.current = session.id;
sessionActions.hydrateSession(session);
localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, session.id);
```

- [ ] **Step 4: Update Browser context callbacks**

Use:

```ts
const handleBrowserElementSelected = useCallback((item: BrowserContextItem) => {
  const sessionId = activeSessionIdRef.current;
  if (!sessionId) return;
  sessionActions.upsertBrowserContextItem(sessionId, item);
}, [sessionActions]);
```

Use:

```ts
const handleRemoveBrowserContextItem = useCallback(
  (sessionId: string, itemId: string) => {
    sessionActions.removeBrowserContextItem(sessionId, itemId);
  },
  [sessionActions],
);
```

Use:

```ts
const handleClearBrowserContextItems = useCallback((sessionId: string) => {
  sessionActions.clearBrowserContextItems(sessionId);
}, [sessionActions]);
```

For attachment linked context deletion:

```ts
sessionActions.removeAttachmentLinkedBrowserContext(
  session.id,
  linkedBrowserContextItemId,
);
```

- [ ] **Step 5: Update test source assertions**

In `tests/browser-interview-regression.test.ts`, replace the old assertion:

```ts
assert.match(appSource, /activeSessionId\s*\?\s*browserContextBySessionId\[activeSessionId\] \?\? \[\]/u);
```

with:

```ts
assert.match(appSource, /useSessionStore/u);
assert.match(appSource, /browserContextBySessionId/u);
assert.match(appSource, /removeAttachmentLinkedBrowserContext/u);
assert.match(appSource, /upsertBrowserContextItem/u);
```

- [ ] **Step 6: Run focused tests**

Run:

```bash
pnpm exec tsx tests/renderer-zustand-store-regression.test.ts
pnpm exec tsx tests/browser-interview-regression.test.ts
pnpm exec tsc --noEmit -p src/renderer/tsconfig.json
```

Expected: all pass.

---

### Task 5: Implement Git Store and Update Hook

**Files:**
- Create: `src/renderer/src/stores/git-store.ts`
- Modify: `src/renderer/src/hooks/use-app-git-state.ts`
- Modify: `tests/renderer-zustand-store-regression.test.ts`

- [ ] **Step 1: Add failing git store test**

Append before final log:

```ts
import { useGitStore } from "../src/renderer/src/stores/git-store.ts";

useGitStore.getState().resetGitStoreForTests();
useGitStore.getState().setGitOverviewLoading(true);
assert.equal(useGitStore.getState().gitOverviewLoading, true);
useGitStore.getState().setGitOverviewLoading(false);
assert.equal(useGitStore.getState().gitOverviewLoading, false);
```

Expected first run: FAIL because `git-store.ts` does not exist.

- [ ] **Step 2: Implement `git-store.ts`**

```ts
import { create } from "zustand";
import type { DesktopApi, GitBranchSummary, GitDiffOverview } from "@shared/contracts";

type GitStoreState = {
  gitBranchSummary: GitBranchSummary | null;
  gitOverview: GitDiffOverview | null;
  gitOverviewLoading: boolean;
  branchRequest: Promise<GitBranchSummary | null> | null;
  branchRequestWorkspace: string | null;
  branchRequestSerial: number;
  overviewRequest: Promise<GitDiffOverview | null> | null;
  overviewRequestWorkspace: string | null;
  overviewRequestSerial: number;
  lastGitBranchRefreshAt: number;
  setGitOverviewLoading: (loading: boolean) => void;
  refreshGitBranchSummary: (desktopApi: DesktopApi | undefined, workspace: string | null) => Promise<GitBranchSummary | null>;
  refreshGitOverview: (desktopApi: DesktopApi | undefined, workspace: string | null) => Promise<GitDiffOverview | null>;
  resetGitStoreForTests: () => void;
};

const initialGitState = {
  gitBranchSummary: null as GitBranchSummary | null,
  gitOverview: null as GitDiffOverview | null,
  gitOverviewLoading: false,
  branchRequest: null as Promise<GitBranchSummary | null> | null,
  branchRequestWorkspace: null as string | null,
  branchRequestSerial: 0,
  overviewRequest: null as Promise<GitDiffOverview | null> | null,
  overviewRequestWorkspace: null as string | null,
  overviewRequestSerial: 0,
  lastGitBranchRefreshAt: 0,
};

export const useGitStore = create<GitStoreState>((set, get) => ({
  ...initialGitState,
  setGitOverviewLoading: (gitOverviewLoading) => set({ gitOverviewLoading }),
  refreshGitBranchSummary: async (desktopApi, workspace) => {
    if (!desktopApi?.git) {
      set({ gitBranchSummary: null });
      return null;
    }
    const state = get();
    if (state.branchRequest && state.branchRequestWorkspace === workspace) {
      return state.branchRequest;
    }
    const requestSerial = state.branchRequestSerial + 1;
    const request = desktopApi.git.getSummary()
      .then((summary) => {
        const latest = get();
        if (
          latest.branchRequestSerial === requestSerial &&
          latest.branchRequestWorkspace === workspace
        ) {
          set({ gitBranchSummary: summary });
        }
        return summary;
      })
      .finally(() => {
        if (get().branchRequest === request) {
          set({ branchRequest: null, branchRequestWorkspace: null });
        }
      });
    set({
      branchRequest: request,
      branchRequestWorkspace: workspace,
      branchRequestSerial: requestSerial,
      lastGitBranchRefreshAt: Date.now(),
    });
    return request;
  },
  refreshGitOverview: async (desktopApi, workspace) => {
    if (!desktopApi?.git) {
      set({ gitBranchSummary: null, gitOverview: null });
      return null;
    }
    const state = get();
    if (state.overviewRequest && state.overviewRequestWorkspace === workspace) {
      return state.overviewRequest;
    }
    const requestSerial = state.overviewRequestSerial + 1;
    set({ gitOverviewLoading: true });
    const request = desktopApi.git.getSnapshot()
      .then((overview) => {
        const latest = get();
        if (
          latest.overviewRequestSerial === requestSerial &&
          latest.overviewRequestWorkspace === workspace
        ) {
          set({ gitOverview: overview, gitBranchSummary: overview.branch });
        }
        return overview;
      })
      .finally(() => {
        if (get().overviewRequest === request) {
          set({
            overviewRequest: null,
            overviewRequestWorkspace: null,
            gitOverviewLoading: false,
          });
        }
      });
    set({
      overviewRequest: request,
      overviewRequestWorkspace: workspace,
      overviewRequestSerial: requestSerial,
    });
    return request;
  },
  resetGitStoreForTests: () => set({ ...initialGitState }),
}));
```

- [ ] **Step 3: Update `use-app-git-state.ts`**

Use store selectors for state and action calls. Keep existing effects and `diffPanelAutoRefreshArmedRef`.

- [ ] **Step 4: Run focused tests**

Run:

```bash
pnpm exec tsx tests/renderer-zustand-store-regression.test.ts
pnpm exec tsc --noEmit -p src/renderer/tsconfig.json
```

Expected: all pass.

---

### Task 6: Implement Provider Directory Store

**Files:**
- Create: `src/renderer/src/stores/provider-directory-store.ts`
- Modify: `src/renderer/src/components/assistant-ui/thread.tsx`
- Modify: `src/renderer/src/components/assistant-ui/settings/memory-section.tsx`
- Modify: `tests/renderer-zustand-store-regression.test.ts`

- [ ] **Step 1: Add failing provider store import test**

Append before final log:

```ts
import { useProviderDirectoryStore } from "../src/renderer/src/stores/provider-directory-store.ts";

useProviderDirectoryStore.getState().resetProviderDirectoryStoreForTests();
assert.deepEqual(useProviderDirectoryStore.getState().sources, []);
assert.deepEqual(useProviderDirectoryStore.getState().entries, []);
```

Expected first run: FAIL because file does not exist.

- [ ] **Step 2: Implement provider store**

```ts
import { create } from "zustand";
import type { DesktopApi, ModelEntry, ProviderSource } from "@shared/contracts";
import { loadProviderDirectory } from "@renderer/lib/provider-directory";

type ProviderDirectoryStoreState = {
  sources: ProviderSource[];
  entries: ModelEntry[];
  loading: boolean;
  lastLoadedAt: number | null;
  refreshProviderDirectory: (
    desktopApi: DesktopApi | undefined,
    options?: { force?: boolean; signal?: AbortSignal },
  ) => Promise<{ sources: ProviderSource[]; entries: ModelEntry[] } | null>;
  replaceProviderDirectory: (snapshot: { sources: ProviderSource[]; entries: ModelEntry[] }) => void;
  clearProviderDirectory: () => void;
  resetProviderDirectoryStoreForTests: () => void;
};

const initialProviderDirectoryState = {
  sources: [] as ProviderSource[],
  entries: [] as ModelEntry[],
  loading: false,
  lastLoadedAt: null as number | null,
};

export const useProviderDirectoryStore = create<ProviderDirectoryStoreState>((set) => ({
  ...initialProviderDirectoryState,
  refreshProviderDirectory: async (desktopApi, options) => {
    if (!desktopApi) return null;
    set({ loading: true });
    try {
      const snapshot = await loadProviderDirectory(desktopApi, options);
      if (options?.signal?.aborted) return null;
      set({
        sources: snapshot.sources,
        entries: snapshot.entries,
        lastLoadedAt: Date.now(),
      });
      return snapshot;
    } finally {
      if (!options?.signal?.aborted) {
        set({ loading: false });
      }
    }
  },
  replaceProviderDirectory: (snapshot) =>
    set({
      sources: snapshot.sources,
      entries: snapshot.entries,
      lastLoadedAt: Date.now(),
    }),
  clearProviderDirectory: () => set({ sources: [], entries: [], lastLoadedAt: null }),
  resetProviderDirectoryStoreForTests: () => set({ ...initialProviderDirectoryState }),
}));
```

- [ ] **Step 3: Update `thread.tsx`**

Replace local provider directory `useState` with:

```ts
const { sources, entries, refreshProviderDirectory } = useProviderDirectoryStore(
  useShallow((state) => ({
    sources: state.sources,
    entries: state.entries,
    refreshProviderDirectory: state.refreshProviderDirectory,
  })),
);
```

Keep the existing effect and call `refreshProviderDirectory(window.desktopApi, { force, signal })`.

- [ ] **Step 4: Update `memory-section.tsx`**

Use provider directory store selectors for sources / entries and refresh action. Keep section-local filters and loading flags local.

- [ ] **Step 5: Run focused tests**

Run:

```bash
pnpm exec tsx tests/renderer-zustand-store-regression.test.ts
pnpm exec tsc --noEmit -p src/renderer/tsconfig.json
```

Expected: all pass.

---

### Task 7: Clean Up Context and Prop Drilling Where Safe

**Files:**
- Modify: `src/renderer/src/components/assistant-ui/thread.tsx`
- Modify: `src/renderer/src/components/AssistantThreadPanel.tsx`

- [ ] **Step 1: Evaluate `ThreadRunStatusContext`**

If the context only passes `runStage`, `runStatusLabel`, and `isCancelling` inside one Thread subtree, keep it for now. Add a code comment:

```ts
// Local subtree context: run status is scoped to a single assistant-ui thread runtime.
// Renderer-wide run/session state lives in Zustand stores.
```

- [ ] **Step 2: Keep `ModelSelectorContext`**

Do not change `ModelSelectorContext`; it is compound-component internal state.

- [ ] **Step 3: Run typecheck**

Run: `pnpm exec tsc --noEmit -p src/renderer/tsconfig.json`

Expected: PASS.

---

### Task 8: Documentation and Final Verification

**Files:**
- Modify: `AGENTS.md`
- Modify: `docs/changes/2026-05-13/changes.md`

- [ ] **Step 1: Add AGENTS.md store rule**

Append under cross-panel state section:

```md
- Renderer 大范围共享状态默认使用 Zustand store；新增跨 session、跨 panel、跨聊天 / Browser / settings 的状态时，先进入 `src/renderer/src/stores/`，组件内只保留局部交互 state。
- Zustand store 只负责 renderer 同步和派生 selector；IPC 持久化、主进程服务和磁盘写入继续由对应 service/action 编排。
```

- [ ] **Step 2: Append change log**

Append to `docs/changes/2026-05-13/changes.md`:

```md
## Zustand global state migration

时间：2026-05-13 16:42:04

改了什么：
- 新增 renderer Zustand store 分层：app、session、git、provider directory。
- 将 App 内大范围共享状态迁移到 store selector/action。
- Browser context、聊天附件、Browser marker 继续以 session browser context 为事实源同步。
- Provider directory 改为共享 store，减少 Thread 与设置页重复加载。
- 补充 Zustand store 回归测试和 Browser 回归断言。

为什么改：
- 用户要求大范围状态统一迁移到 Zustand，降低后续功能开发和跨面板同步成本。
- 当前 `App.tsx` 聚合过多共享状态，继续增加 Browser / memory / context 功能会放大 prop drilling 和同步竞态。

涉及文件：
- `AGENTS.md`
- `src/renderer/src/stores/app-store.ts`
- `src/renderer/src/stores/session-store.ts`
- `src/renderer/src/stores/git-store.ts`
- `src/renderer/src/stores/provider-directory-store.ts`
- `src/renderer/src/App.tsx`
- `src/renderer/src/hooks/use-app-git-state.ts`
- `src/renderer/src/components/assistant-ui/thread.tsx`
- `src/renderer/src/components/assistant-ui/settings/memory-section.tsx`
- `tests/renderer-zustand-store-regression.test.ts`
- `tests/browser-interview-regression.test.ts`
- `docs/superpowers/specs/2026-05-13-zustand-global-state-design.md`
- `docs/superpowers/plans/2026-05-13-zustand-global-state-migration.md`
- `docs/changes/2026-05-13/changes.md`

结果：
- `pnpm exec tsx tests/renderer-zustand-store-regression.test.ts` 通过。
- `pnpm exec tsx tests/browser-interview-regression.test.ts` 通过。
- `pnpm exec tsc --noEmit -p src/renderer/tsconfig.json` 通过。
- `git diff --check` 通过。
- 按项目约束未运行 build。
```

- [ ] **Step 3: Run final verification**

Run:

```bash
pnpm exec tsx tests/renderer-zustand-store-regression.test.ts
pnpm exec tsx tests/browser-interview-regression.test.ts
pnpm exec tsc --noEmit -p src/renderer/tsconfig.json
git diff --check
```

Expected:

- Store regression prints `renderer zustand store regression tests passed`.
- Browser regression prints `browser interview regression tests passed`.
- Renderer typecheck exits 0.
- `git diff --check` exits 0, with only existing CRLF warnings if Git reports them.

Do not run `pnpm build` unless explicitly requested.

