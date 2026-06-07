import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const threadSource = readFileSync(
  new URL("../src/renderer/src/components/assistant-ui/thread.tsx", import.meta.url),
  "utf8",
);
const appSource = readFileSync(
  new URL("../src/renderer/src/App.tsx", import.meta.url),
  "utf8",
);
const threadRuntimeLayerSource = readFileSync(
  new URL("../src/renderer/src/components/assistant-ui/thread-runtime-layer.tsx", import.meta.url),
  "utf8",
);
const browserPanelSource = readFileSync(
  new URL("../src/renderer/src/components/browser-preview/BrowserPreviewPanel.tsx", import.meta.url),
  "utf8",
);
const diffPanelSource = readFileSync(
  new URL("../src/renderer/src/components/assistant-ui/diff-panel.tsx", import.meta.url),
  "utf8",
);
const tracePanelSource = readFileSync(
  new URL("../src/renderer/src/components/assistant-ui/trace-panel.tsx", import.meta.url),
  "utf8",
);

assert.match(
  threadSource,
  /import\s*\{[\s\S]*\bmemo\b[\s\S]*\}\s*from "react";/,
  "Thread should import React memo for the high-frequency chat surface.",
);
assert.match(
  threadSource,
  /const ThreadImpl:\s*FC<ThreadProps>\s*=\s*\(/,
  "Thread implementation should stay separate from the memoized export.",
);
assert.match(
  threadSource,
  /export const Thread = memo\(ThreadImpl\);/,
  "Thread export should be memoized to avoid App-level rerenders rebuilding the chat tree.",
);

assert.match(appSource, /lazy\(\(\) => import\("@renderer\/components\/assistant-ui\/diff-panel"\)/);
assert.match(appSource, /lazy\(\(\) => import\("@renderer\/components\/browser-preview\/BrowserPreviewPanel"\)/);
assert.match(appSource, /lazy\(\(\) => import\("@renderer\/components\/assistant-ui\/trace-panel"\)/);
assert.match(
  appSource,
  /import\s*\{[\s\S]*\bResizableHandle\b[\s\S]*\}\s*from "@renderer\/components\/ui\/resizable";/,
  "Shell sidebar should import the resizable handle so the collapsed sidebar can be reopened by dragging.",
);
const shellSidebarIndex = appSource.indexOf('id="shell-sidebar"');
const shellSidebarHandleIndex = appSource.indexOf("<ResizableHandle", shellSidebarIndex);
const shellMainIndex = appSource.indexOf('id="shell-main"', shellSidebarIndex);
assert.ok(shellSidebarIndex >= 0, "App shell should render the sidebar panel.");
assert.ok(shellSidebarHandleIndex > shellSidebarIndex, "Shell sidebar should render a drag handle after the sidebar panel.");
assert.ok(shellMainIndex > shellSidebarHandleIndex, "Shell sidebar drag handle should sit before the main panel.");
assert.match(
  appSource,
  /panel\.resize\(toSidebarPixelSize\(lastExpandedSidebarSizeRef\.current\)\)/,
  "Programmatic sidebar expansion should restore a pixel-clamped width so stale small percentages cannot collapse again.",
);
assert.doesNotMatch(
  appSource,
  /panel\.resize\(toSidebarPercentageSize\(lastExpandedSidebarSizeRef\.current\)\)/,
  "Programmatic sidebar expansion should not reuse a stale percentage below the panel minimum width.",
);
assert.match(appSource, /<Suspense fallback=\{null\}>/);
assert.match(appSource, /ThreadRuntimeLayer/);
assert.match(appSource, /const handleCreateProjectClick = useCallback/);
assert.match(appSource, /const toggleThreadTerminal = useCallback/);
assert.doesNotMatch(appSource, /const threadRuntimeLayer = useMemo/);
assert.doesNotMatch(appSource, /const mountedSessionIds = useMemo/);
assert.doesNotMatch(appSource, /<AssistantThreadPanel/);
assert.doesNotMatch(appSource, /onCreateProject=\{\(\) =>/);
assert.doesNotMatch(appSource, /onCreateProjectSession=\{\(/);
assert.doesNotMatch(appSource, /onSelectProject=\{\(/);
assert.doesNotMatch(appSource, /onOpenSettings=\{\(\) =>/);
assert.doesNotMatch(appSource, /onRenameSession=\{\(/);
assert.doesNotMatch(appSource, /onRenameProject=\{\(/);
assert.doesNotMatch(appSource, /onUnarchiveSession=\{\(/);
assert.doesNotMatch(appSource, /onDeleteProject=\{\(/);
assert.doesNotMatch(appSource, /onMinimize=\{\(\) =>/);
assert.doesNotMatch(appSource, /onClose=\{\(\) =>/);
assert.doesNotMatch(appSource, /onToggle=\{\(\) =>/);
assert.doesNotMatch(appSource, /onClick=\{\(\) =>[\s\S]*setTerminalOpen/);
assert.doesNotMatch(
  appSource,
  /import\s*\{[\s\S]*DiffWorkbenchContent[\s\S]*\}\s*from "@renderer\/components\/assistant-ui\/diff-panel"/,
);
assert.doesNotMatch(
  appSource,
  /import\s*\{ BrowserPreviewPanel \}\s*from "@renderer\/components\/browser-preview\/BrowserPreviewPanel"/,
);
assert.doesNotMatch(
  appSource,
  /import\s*\{ TracePanel \}\s*from "@renderer\/components\/assistant-ui\/trace-panel"/,
);

assert.match(browserPanelSource, /const BrowserPreviewPanelImpl = \(/);
assert.match(browserPanelSource, /export const BrowserPreviewPanel = memo\(BrowserPreviewPanelImpl\);/);
assert.match(diffPanelSource, /const DiffWorkbenchContentImpl = \(/);
assert.match(diffPanelSource, /export const DiffWorkbenchContent = memo\(DiffWorkbenchContentImpl\);/);
assert.match(tracePanelSource, /const TracePanelImpl = \(/);
assert.match(tracePanelSource, /export const TracePanel = memo\(TracePanelImpl\);/);
assert.match(threadRuntimeLayerSource, /const mountedSessionIds = useMemo/);
assert.match(threadRuntimeLayerSource, /const MountedThreadSession = memo/);
assert.match(threadRuntimeLayerSource, /const handleDismissInterruptedApproval = useCallback/);
assert.match(threadRuntimeLayerSource, /export const ThreadRuntimeLayer = memo\(ThreadRuntimeLayerImpl\);/);
assert.match(threadRuntimeLayerSource, /<AssistantThreadPanel/);

console.log("renderer performance regression tests passed");
