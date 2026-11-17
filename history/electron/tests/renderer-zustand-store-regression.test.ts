import assert from "node:assert/strict";
import type { ChatSession } from "../src/shared/contracts.ts";
import { useAppStore } from "../src/renderer/src/stores/app-store.ts";
import { useGitStore } from "../src/renderer/src/stores/git-store.ts";
import { useProviderDirectoryStore } from "../src/renderer/src/stores/provider-directory-store.ts";
import { useSessionStore } from "../src/renderer/src/stores/session-store.ts";
import { createBrowserScreenshotContextItem } from "../src/renderer/src/lib/browser-interview.ts";

function resetStores() {
  useAppStore.getState().resetAppStoreForTests();
  useGitStore.getState().resetGitStoreForTests();
  useProviderDirectoryStore.getState().resetProviderDirectoryStoreForTests();
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

useSessionStore.getState().removeCachedSession("s1");
assert.equal(useSessionStore.getState().activeSessionId, "s1");
assert.equal(useSessionStore.getState().sessionCache.s1, undefined);
useSessionStore.getState().hydrateSession(session);

const screenshotContext = createBrowserScreenshotContextItem({
  screenshotId: "shot-1",
  comment: "调整这一块",
  sourceUrl: "http://localhost:5173/",
  title: "Chela",
  imageName: "shot.png",
  imagePath: "C:/tmp/shot.png",
  boundingRect: { x: 1, y: 2, width: 300, height: 200 },
  viewport: { x: 0, y: 0, width: 1280, height: 720 },
});

useSessionStore.getState().upsertBrowserContextItem("s1", screenshotContext);
assert.equal(useSessionStore.getState().browserContextBySessionId.s1?.length, 1);
useSessionStore.getState().removeAttachmentLinkedBrowserContext(
  "s1",
  screenshotContext.id,
);
assert.deepEqual(useSessionStore.getState().browserContextBySessionId.s1, []);

useSessionStore.getState().setContextSummary("s1", {
  state: "usage",
  contextWindow: 100,
  latestInputTokens: 10,
  latestOutputTokens: 5,
  usageMessageCount: 1,
  usageTotalInputTokens: 10,
  usageTotalOutputTokens: 5,
  estimatedUsedTokens: 15,
  estimatedRemainingTokens: 85,
  usedRatio: 0.15,
  remainingRatio: 0.85,
  snapshotRevision: 1,
  snapshotUpdatedAt: null,
  compactedUntilSeq: null,
  compactedMessageCount: 0,
  snapshotSummary: null,
  currentTask: null,
  currentState: null,
  branchName: null,
  importantFiles: [],
  openLoops: [],
  nextActions: [],
  risks: [],
  todos: [],
  lastToolFailure: null,
  recoverableRun: null,
  autoCompactFailureCount: 0,
  autoCompactBlocked: false,
  autoCompactBlockedAt: null,
  canCompact: false,
  isCompacting: false,
});
assert.equal(
  useSessionStore.getState().contextSummaryBySessionId.s1?.estimatedUsedTokens,
  15,
);

useSessionStore.getState().setInterruptedApprovalGroups("s1", []);
assert.deepEqual(
  useSessionStore.getState().interruptedApprovalGroupsBySessionId.s1,
  [],
);

useGitStore.getState().setGitOverviewLoading(true);
assert.equal(useGitStore.getState().gitOverviewLoading, true);
useGitStore.getState().setGitOverviewLoading(false);
assert.equal(useGitStore.getState().gitOverviewLoading, false);

assert.deepEqual(useProviderDirectoryStore.getState().sources, []);
assert.deepEqual(useProviderDirectoryStore.getState().entries, []);

console.log("renderer zustand store regression tests passed");
