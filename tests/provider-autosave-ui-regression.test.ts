import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const keysSectionSource = readFileSync(
  new URL(
    "../src/renderer/src/components/assistant-ui/settings/keys-section.tsx",
    import.meta.url,
  ),
  "utf8",
);
const keysSectionModelSource = readFileSync(
  new URL(
    "../src/renderer/src/components/assistant-ui/settings/keys-section-model.ts",
    import.meta.url,
  ),
  "utf8",
);

assert.match(keysSectionSource, /const AUTO_SAVE_DELAY_MS = 3_000;/u);
assert.match(keysSectionSource, /window\.setTimeout\(\(\) => \{/u);
assert.match(keysSectionSource, /persistWorkspace\(currentWorkspace\)/u);
assert.match(keysSectionSource, /AUTO_SAVE_DELAY_MS/u);
assert.match(keysSectionSource, /autoSaveBlocked/u);
assert.match(keysSectionSource, /hasIncompleteModelDraft\(currentWorkspace\)/u);
assert.match(keysSectionSource, /dirty\s*&&\s*!autoSaveBlocked/u);
assert.match(keysSectionSource, /!currentWorkspace \|\| autoSaveBlocked/u);
assert.match(keysSectionSource, /testing \|\| saving \|\| autoSaveBlocked/u);
assert.match(keysSectionSource, /saving \|\| !dirty \|\| autoSaveBlocked/u);
assert.match(keysSectionSource, /fetchingModels \|\|\s*saving \|\|\s*autoSaveBlocked/u);
assert.match(keysSectionSource, /await persistWorkspace\(currentWorkspace\)/u);
assert.match(keysSectionSource, /desktopApi\.providers\.testSource/u);
assert.match(keysSectionSource, /desktopApi\.providers\.fetchModels/u);
assert.match(keysSectionSource, /当前修改将在 3 秒后自动保存。/u);
assert.match(keysSectionSource, /请先填写模型 ID，完成后会自动保存。/u);
assert.match(keysSectionSource, /立即保存/u);
assert.doesNotMatch(keysSectionSource, /当前提供商有未保存修改。/u);
assert.doesNotMatch(keysSectionSource, /保存后生效。/u);
assert.match(keysSectionModelSource, /export function hasIncompleteModelDraft/u);
assert.match(keysSectionModelSource, /new-model-id/u);
assert.match(keysSectionModelSource, /!entry\.modelId\.trim\(\)/u);

console.log("provider autosave ui regression tests passed");
