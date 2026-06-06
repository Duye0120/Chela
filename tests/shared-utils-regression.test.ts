import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  getExtension,
  IMAGE_EXTENSIONS,
  TEXT_EXTENSIONS,
} from "../src/shared/file-extensions.ts";
import { escapeRegExp, getErrorMessage } from "../src/shared/text-utils.ts";

const diffPanelPartsSource = readFileSync(
  new URL("../src/renderer/src/components/assistant-ui/diff-panel-parts.tsx", import.meta.url),
  "utf8",
);
const branchSwitcherSource = readFileSync(
  new URL("../src/renderer/src/components/assistant-ui/branch-switcher.tsx", import.meta.url),
  "utf8",
);

assert.equal(getExtension("D:/workspace/App.TSX"), "tsx");
assert.equal(TEXT_EXTENSIONS.has("tsx"), true);
assert.equal(IMAGE_EXTENSIONS.has("png"), true);
assert.equal(escapeRegExp("a+b?(c)[d]"), "a\\+b\\?\\(c\\)\\[d\\]");
assert.equal(getErrorMessage(new Error(" failed "), "fallback"), "failed");
assert.equal(getErrorMessage("plain", "fallback"), "fallback");
assert.match(diffPanelPartsSource, /from "@shared\/text-utils"/);
assert.doesNotMatch(diffPanelPartsSource, /function getErrorMessage/);
assert.match(branchSwitcherSource, /from "@shared\/text-utils"/);
assert.doesNotMatch(branchSwitcherSource, /function getErrorMessage/);

console.log("shared utils regression tests passed");
