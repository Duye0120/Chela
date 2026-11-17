import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appSource = readFileSync(
  new URL("../src/renderer/src/App.tsx", import.meta.url),
  "utf8",
);
const appBootSource = readFileSync(
  new URL("../src/renderer/src/hooks/use-app-boot.ts", import.meta.url),
  "utf8",
);
const appKeyboardShortcutsSource = readFileSync(
  new URL("../src/renderer/src/hooks/use-app-keyboard-shortcuts.ts", import.meta.url),
  "utf8",
);
const sessionOperationsSource = readFileSync(
  new URL("../src/renderer/src/hooks/use-session-operations.ts", import.meta.url),
  "utf8",
);
const rightPanelResizeSource = readFileSync(
  new URL("../src/renderer/src/hooks/use-right-panel-resize.ts", import.meta.url),
  "utf8",
);
const providersSource = readFileSync(
  new URL("../src/main/providers.ts", import.meta.url),
  "utf8",
);
const providerCredentialsSource = readFileSync(
  new URL("../src/main/provider-credentials.ts", import.meta.url),
  "utf8",
);
const providerPersistenceSource = readFileSync(
  new URL("../src/main/provider-persistence.ts", import.meta.url),
  "utf8",
);
const providerModelBuilderSource = readFileSync(
  new URL("../src/main/provider-model-builder.ts", import.meta.url),
  "utf8",
);
const workerServiceSource = readFileSync(
  new URL("../src/main/worker-service.ts", import.meta.url),
  "utf8",
);
const workerRuntimeSource = readFileSync(
  new URL("../src/main/worker-runtime.ts", import.meta.url),
  "utf8",
);
const workerCommitSource = readFileSync(
  new URL("../src/main/worker-commit.ts", import.meta.url),
  "utf8",
);
const sessionIoSource = readFileSync(
  new URL("../src/main/session/io.ts", import.meta.url),
  "utf8",
);
const uiStateSource = readFileSync(
  new URL("../src/main/ui-state.ts", import.meta.url),
  "utf8",
);
const pluginRegistrySource = readFileSync(
  new URL("../src/main/plugins/registry.ts", import.meta.url),
  "utf8",
);

assert.match(appSource, /useRightPanelResize/);
assert.match(appSource, /useAppBoot/);
assert.match(appSource, /useAppKeyboardShortcuts/);
assert.match(appSource, /useSessionOperations/);
assert.doesNotMatch(appSource, /const bootApp = useCallback/);
assert.doesNotMatch(appSource, /window\.addEventListener\("keydown"/);
assert.doesNotMatch(appSource, /const createNewSession = useCallback/);
assert.doesNotMatch(appSource, /const selectSession = useCallback/);
assert.doesNotMatch(appSource, /const archiveSession = useCallback/);
assert.doesNotMatch(appSource, /const handleCreateProject = useCallback/);
assert.doesNotMatch(appSource, /const handleSelectProject = useCallback/);
assert.match(appBootSource, /loadProviderDirectory/);
assert.match(appBootSource, /readStoredString/);
assert.match(appKeyboardShortcutsSource, /window\.addEventListener\("keydown"/);
assert.match(appKeyboardShortcutsSource, /desktopApi\.window\.onStateChange/);
assert.match(sessionOperationsSource, /const createNewSession = useCallback/);
assert.match(sessionOperationsSource, /const selectSession = useCallback/);
assert.match(sessionOperationsSource, /const archiveSession = useCallback/);
assert.match(sessionOperationsSource, /const handleCreateProject = useCallback/);
assert.match(sessionOperationsSource, /const handleSelectProject = useCallback/);
assert.doesNotMatch(appSource, /rightPanelDragStateRef/);
assert.match(rightPanelResizeSource, /lostpointercapture/);
assert.match(rightPanelResizeSource, /setPointerCapture/);

assert.match(providersSource, /from "\.\/provider-persistence\.ts"/);
assert.match(providersSource, /from "\.\/provider-model-builder\.ts"/);
assert.doesNotMatch(providersSource, /from "\.\/provider-credentials\.ts"/);
assert.doesNotMatch(providersSource, /safeStorage/);
assert.doesNotMatch(providersSource, /getModel\(/);
assert.doesNotMatch(providersSource, /function buildCustomModel/);
assert.match(providerPersistenceSource, /from "\.\/provider-credentials\.ts"/);
assert.match(providerPersistenceSource, /flushProviderStateToDisk/);
assert.match(providerModelBuilderSource, /buildProviderModel/);
assert.match(providerModelBuilderSource, /getModel\(/);
assert.match(providerCredentialsSource, /safeStorage/);
assert.match(providerCredentialsSource, /LEGACY_BUILTIN_PROVIDERS/);

assert.match(workerServiceSource, /from "\.\/worker-runtime\.ts"/);
assert.match(workerServiceSource, /from "\.\/worker-commit\.ts"/);
assert.doesNotMatch(workerServiceSource, /completeSimple/);
assert.doesNotMatch(workerServiceSource, /buildCommitMessageSystemPrompt/);
assert.doesNotMatch(workerServiceSource, /COMMIT_SKILL_FALLBACK/);
assert.match(workerRuntimeSource, /completeSimple/);
assert.match(workerRuntimeSource, /generateTextWithFallback/);
assert.match(workerCommitSource, /buildCommitMessageSystemPrompt/);
assert.match(workerCommitSource, /generateCommitMessage/);
assert.match(workerCommitSource, /generateCommitPlan/);

for (const source of [sessionIoSource, uiStateSource, pluginRegistrySource]) {
  assert.match(source, /from "\.\.?\/.*json-file\.ts"/);
  assert.doesNotMatch(source, /function readJsonFile/);
}

console.log("module split regression tests passed");
