import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createBrowserInspectorScript } from "../src/renderer/src/lib/browser-inspector-script.ts";
import {
  selectedFileToCreateAttachment,
  toPersistedMessageAttachment,
} from "../src/renderer/src/lib/assistant-ui-attachments.ts";
import {
  buildBrowserDisplayText,
  buildBrowserContextPrompt,
  compactBrowserContextItems,
  createBrowserContextItem,
  createBrowserPageSnapshotContextItem,
  createBrowserPinContextItem,
  createBrowserReviewQueue,
  createBrowserReviewQueueContextItem,
  createBrowserScreenshotContextItem,
  describeBrowserContextItem,
  formatBrowserContextChipLabel,
  formatBrowserElementLabel,
  getBrowserReviewQueueSignature,
  getBrowserContextItems,
  isBrowserContextItem,
  normalizeBrowserPreviewUrl,
  summarizeBrowserContextBudget,
  type BrowserInterviewElement,
} from "../src/renderer/src/lib/browser-interview.ts";

const selectedButton: BrowserInterviewElement = {
  sourceUrl: "http://localhost:5173/settings",
  selector: "main > button#save.primary",
  tagName: "button",
  id: "save",
  className: "primary rounded",
  textContent: "保存设置",
  outerHTML: "<button id=\"save\" class=\"primary rounded\">保存设置</button>",
  boundingRect: { x: 18, y: 24, width: 120, height: 36 },
  styles: {
    display: "inline-flex",
    position: "relative",
    width: "120px",
    height: "36px",
    backgroundColor: "rgb(249, 115, 22)",
    color: "rgb(255, 255, 255)",
    fontSize: "14px",
    padding: "8px 12px",
    margin: "0px",
  },
};

assert.equal(normalizeBrowserPreviewUrl("localhost:5173"), "http://localhost:5173");
assert.equal(normalizeBrowserPreviewUrl("127.0.0.1:3000/app"), "http://127.0.0.1:3000/app");
assert.equal(normalizeBrowserPreviewUrl("https://example.com/path"), "https://example.com/path");
assert.equal(normalizeBrowserPreviewUrl("file:///C:/Users/Administrator/.ssh/id_rsa"), "");
assert.equal(normalizeBrowserPreviewUrl("javascript:alert(1)"), "");
assert.equal(normalizeBrowserPreviewUrl(""), "");

assert.equal(formatBrowserElementLabel(selectedButton), "button#save.primary");

const contextItem = createBrowserContextItem(selectedButton);
assert.equal(contextItem.label, "button#save.primary");
assert.equal(contextItem.kind, "element");
assert.ok(contextItem.id.startsWith("browser-element-"));
assert.deepEqual(contextItem.element?.boundingRect, selectedButton.boundingRect);
assert.equal(isBrowserContextItem(contextItem), true);
assert.equal(isBrowserContextItem({ id: contextItem.id }), false);
assert.deepEqual(
  getBrowserContextItems([contextItem, { id: "broken" }]),
  [contextItem],
);
assert.deepEqual(getBrowserContextItems(null), []);

const prompt = buildBrowserContextPrompt("帮我把这个按钮做得更像主操作", [
  contextItem,
]);
assert.match(prompt, /\[Browser Context\]/);
assert.match(prompt, /当前页面: http:\/\/localhost:5173\/settings/);
assert.match(prompt, /Selector: main > button#save\.primary/);
assert.match(prompt, /尺寸: 120x36/);
assert.match(prompt, /用户指令/);
assert.match(prompt, /帮我把这个按钮做得更像主操作/);

assert.equal(
  buildBrowserDisplayText("帮我把这个按钮做得更像主操作", [contextItem]),
  "[[dom-tag button#save.primary]] 帮我把这个按钮做得更像主操作",
);

const summary = describeBrowserContextItem(contextItem);
assert.match(summary, /Selector: main > button#save\.primary/);
assert.match(summary, /Text: 保存设置/);
assert.match(summary, /Size: 120x36/);


const pageSnapshot = createBrowserPageSnapshotContextItem({
  sourceUrl: "http://localhost:5173/dashboard",
  title: "Chela Dashboard",
  description: "Agent workspace",
  viewport: { x: 0, y: 0, width: 1280, height: 720 },
  headings: ["Dashboard", "Recent runs"],
  visibleText: "Dashboard Recent runs Open Browser Workspace",
  interactiveElements: [
    {
      label: "Open Browser Workspace",
      selector: "button#browser",
      tagName: "button",
      role: "button",
    },
  ],
});
assert.equal(pageSnapshot.kind, "page-snapshot");
assert.equal(isBrowserContextItem(pageSnapshot), true);
assert.match(describeBrowserContextItem(pageSnapshot), /Chela Dashboard/);
assert.match(
  buildBrowserContextPrompt("总结这个页面", [pageSnapshot]),
  /页面快照 1: 页面: Chela Dashboard/,
);
assert.match(
  buildBrowserContextPrompt("总结这个页面", [pageSnapshot]),
  /关键可交互元素:/,
);

const pinItem = createBrowserPinContextItem({
  pinId: "chela-pin-test",
  markerNumber: 1,
  sourceUrl: "http://localhost:5173/dashboard",
  comment: "这里 CTA 不够明显，帮我改成主操作",
  selector: "main > button#browser",
  tagName: "button",
  textContent: "Open Browser Workspace",
  boundingRect: { x: 320, y: 180, width: 180, height: 40 },
  viewport: { x: 0, y: 0, width: 1280, height: 720 },
  styles: {
    display: "inline-flex",
    position: "relative",
    width: "180px",
    height: "40px",
    backgroundColor: "rgb(255, 255, 255)",
    color: "rgb(17, 24, 39)",
    fontSize: "14px",
  },
});
assert.equal(pinItem.kind, "pin");
assert.equal(pinItem.pin?.pinId, "chela-pin-test");
assert.equal(pinItem.pin?.markerNumber, 1);
assert.equal(isBrowserContextItem(pinItem), true);
assert.match(describeBrowserContextItem(pinItem), /Comment: 这里 CTA 不够明显/);
assert.equal(
  formatBrowserContextChipLabel(pinItem),
  "批注 · 这里 CTA 不够明显，帮我改成主操作",
);
assert.equal(formatBrowserContextChipLabel(contextItem), "元素 · button#save.primary");
const pinPrompt = buildBrowserContextPrompt("按批注处理", [pinItem]);
assert.match(pinPrompt, /页面批注 1: 批注: 这里 CTA 不够明显/);
assert.match(pinPrompt, /Selector: main > button#browser/);
assert.match(pinPrompt, /位置\/尺寸: 320,180 \/ 180x40/);
assert.match(pinPrompt, /Viewport: 1280x720/);

const inspectorScript = createBrowserInspectorScript();
assert.match(inspectorScript, /removeUnsavedPins/u);
assert.match(inspectorScript, /getNextMarkerNumber/u);
assert.match(inspectorScript, /--color-browser-pin-bg/u);
assert.match(inspectorScript, /--color-browser-select-fg/u);
assert.match(inspectorScript, /pendingCaptures/u);
assert.match(inspectorScript, /consumeCaptureRegion/u);
assert.match(inspectorScript, /consumeCancelRequest/u);
assert.match(inspectorScript, /clearInteractionVisuals/u);
assert.match(inspectorScript, /prepareCapture/u);
assert.match(inspectorScript, /restoreCaptureVisuals/u);
assert.match(inspectorScript, /captureHiddenElements/u);
assert.match(inspectorScript, /chela-browser-screenshot-marker/u);
assert.match(inspectorScript, /upsertScreenshotMarker/u);
assert.match(inspectorScript, /removeScreenshotMarker/u);
assert.match(inspectorScript, /syncScreenshotMarkers/u);
assert.match(inspectorScript, /pendingTarget = null/u);
assert.match(inspectorScript, /contextmenu/u);
assert.match(inspectorScript, /keydown/u);
assert.match(inspectorScript, /Escape/u);
assert.doesNotMatch(inspectorScript, /let pinCounter/u);

const browserPreviewPanelSource = readFileSync(
  new URL("../src/renderer/src/components/browser-preview/BrowserPreviewPanel.tsx", import.meta.url),
  "utf8",
);
const attachmentSource = readFileSync(
  new URL("../src/renderer/src/components/assistant-ui/attachment.tsx", import.meta.url),
  "utf8",
);
const dialogSource = readFileSync(
  new URL("../src/renderer/src/components/ui/dialog.tsx", import.meta.url),
  "utf8",
);
assert.match(dialogSource, /sm:rounded-\[calc\(var\(--radius-shell\)\+4px\)\]/u);
assert.match(dialogSource, /rounded-\[var\(--radius-shell\)\]/u);
assert.doesNotMatch(dialogSource, /sm:rounded-\[20px\]|rounded-\[10px\]/u);
assert.match(attachmentSource, /rounded-\[calc\(var\(--radius-shell\)\+4px\)\]/u);
assert.ok(attachmentSource.includes("[&>button]:rounded-[var(--radius-shell)]"));
assert.equal(attachmentSource.includes("[&>button]:rounded-full"), false);
assert.match(browserPreviewPanelSource, /capturePage/u);
assert.match(browserPreviewPanelSource, /onScreenshotCaptured/u);
assert.match(browserPreviewPanelSource, /browserContextItems/u);
assert.match(browserPreviewPanelSource, /pendingScreenshot/u);
assert.match(browserPreviewPanelSource, /submitPendingScreenshot/u);
assert.match(browserPreviewPanelSource, /cancelPendingScreenshot/u);
assert.match(browserPreviewPanelSource, /URL\.createObjectURL/u);
assert.match(browserPreviewPanelSource, /const stopBrowserInteraction = useCallback/u);
assert.match(browserPreviewPanelSource, /window\.__chelaInspector\?\.disable\?\.\(\)/u);
assert.match(browserPreviewPanelSource, /const hasPendingComposer = Boolean\(pendingPin \|\| pendingScreenshot\)/u);
assert.match(browserPreviewPanelSource, /disabled=\{hasPendingComposer\}/u);
const captureRegionSource = browserPreviewPanelSource.slice(
  browserPreviewPanelSource.indexOf("const captureBrowserRegion"),
  browserPreviewPanelSource.indexOf("const submitPendingScreenshot"),
);
assert.match(captureRegionSource, /setPendingScreenshot/u);
assert.match(captureRegionSource, /stopBrowserInteraction\(\)/u);
assert.match(captureRegionSource, /window\.__chelaInspector\?\.prepareCapture\?\.\(\)/u);
assert.match(captureRegionSource, /waitForBrowserPaint/u);
assert.match(captureRegionSource, /window\.__chelaInspector\?\.restoreCaptureVisuals\?\.\(\)/u);
assert.match(captureRegionSource, /upsertScreenshotMarker/u);
assert.doesNotMatch(captureRegionSource, /screenshotMarkerCounterRef\.current = markerNumber/u);
assert.doesNotMatch(captureRegionSource, /saveFromClipboard/u);
assert.doesNotMatch(captureRegionSource, /onScreenshotCaptured/u);
const submitScreenshotSource = browserPreviewPanelSource.slice(
  browserPreviewPanelSource.indexOf("const submitPendingScreenshot"),
  browserPreviewPanelSource.indexOf("useEffect(() => {", browserPreviewPanelSource.indexOf("const submitPendingScreenshot")),
);
assert.match(submitScreenshotSource, /screenshotMarkerCounterRef\.current = Math\.max/u);
assert.match(browserPreviewPanelSource, /removeScreenshotMarker/u);
assert.match(browserPreviewPanelSource, /syncScreenshotMarkers/u);
assert.match(browserPreviewPanelSource, /createScreenshotMarkerPayloads/u);
assert.match(browserPreviewPanelSource, /window\.__chelaInspector\?\.syncScreenshotMarkers\?\./u);
const injectInspectorSource = browserPreviewPanelSource.slice(
  browserPreviewPanelSource.indexOf("const injectInspector"),
  browserPreviewPanelSource.indexOf("useEffect(() => {", browserPreviewPanelSource.indexOf("const injectInspector")),
);
assert.match(injectInspectorSource, /createBrowserInspectorScript/u);
assert.match(injectInspectorSource, /syncScreenshotMarkers/u);
const pinPollingSource = browserPreviewPanelSource.slice(
  browserPreviewPanelSource.indexOf("void runInBrowser(\"window.__chelaInspector?.consumePin?.() ?? null\")"),
  browserPreviewPanelSource.indexOf("void runInBrowser(\"window.__chelaInspector?.consumeCaptureRegion?.() ?? null\")"),
);
assert.match(pinPollingSource, /stopBrowserInteraction\(\)/u);
const pollingGateStart = browserPreviewPanelSource.indexOf("if (!webviewElement || !pinModeEnabled");
const pollingGateSource = browserPreviewPanelSource.slice(
  pollingGateStart,
  browserPreviewPanelSource.indexOf("void injectInspector();", pollingGateStart),
);
assert.match(pollingGateSource, /hasPendingComposer/u);
assert.doesNotMatch(browserPreviewPanelSource, /选元素/u);

const appSource = readFileSync(
  new URL("../src/renderer/src/App.tsx", import.meta.url),
  "utf8",
);
assert.match(appSource, /browserContextItems=\{/u);
assert.match(appSource, /useSessionStore/u);
assert.match(appSource, /browserContextBySessionId/u);
assert.match(appSource, /removeAttachmentLinkedBrowserContext/u);
assert.match(appSource, /upsertBrowserContextItem/u);

const screenshotItem = createBrowserScreenshotContextItem({
  screenshotId: "browser-screenshot-linked",
  comment: "这一块视觉层级太抢眼，压低一点",
  sourceUrl: "http://localhost:5173/dashboard",
  title: "Chela Dashboard",
  imageName: "browser-region-dashboard.png",
  imagePath: "C:/Users/Administrator/AppData/Roaming/Chela/attachments/browser-region-dashboard.png",
  boundingRect: { x: 40, y: 50, width: 320, height: 180 },
  viewport: { x: 0, y: 0, width: 1280, height: 720 },
});
assert.equal(screenshotItem.kind, "screenshot");
assert.equal(
  formatBrowserContextChipLabel(screenshotItem),
  "截图 · 这一块视觉层级太抢眼，压低一点",
);
assert.match(describeBrowserContextItem(screenshotItem), /Image: browser-region-dashboard\.png/);
assert.match(
  buildBrowserContextPrompt("按截图批注修复", [screenshotItem]),
  /页面截图批注 1: 截图: 这一块视觉层级太抢眼/,
);
assert.match(
  buildBrowserContextPrompt("按截图批注修复", [screenshotItem]),
  /图片附件: browser-region-dashboard\.png/,
);
const browserScreenshotAttachment = {
  id: "browser-screenshot-linked",
  name: "browser-region-dashboard.png",
  displayName: "截图 · 这一块视觉层级太抢眼，压低一点",
  description: "这一块视觉层级太抢眼，压低一点",
  browserContextItemId: screenshotItem.id,
  path: "C:/Users/Administrator/AppData/Roaming/Chela/attachments/browser-region-dashboard.png",
  size: 1200,
  extension: ".png",
  kind: "image" as const,
  mimeType: "image/png",
};
assert.equal(
  toPersistedMessageAttachment(browserScreenshotAttachment).displayName,
  "截图 · 这一块视觉层级太抢眼，压低一点",
);
assert.equal(
  toPersistedMessageAttachment(browserScreenshotAttachment).browserContextItemId,
  screenshotItem.id,
);
assert.equal(
  selectedFileToCreateAttachment(toPersistedMessageAttachment(browserScreenshotAttachment)).name,
  "截图 · 这一块视觉层级太抢眼，压低一点",
);
const chatMessageAdapterSource = readFileSync(
  new URL("../src/main/chat-message-adapter.ts", import.meta.url),
  "utf8",
);
assert.match(
  chatMessageAdapterSource,
  /图片说明：/,
);

const reviewQueue = createBrowserReviewQueue([pinItem.pin!], {
  title: "Dashboard Review",
  sourceUrl: "http://localhost:5173/dashboard",
  summary: "按页面批注修复 dashboard",
});
assert.equal(reviewQueue.pins.length, 1);
assert.equal(reviewQueue.title, "Dashboard Review");
const reviewQueueItem = createBrowserReviewQueueContextItem(reviewQueue);
assert.equal(reviewQueueItem.kind, "review-queue");
assert.equal(isBrowserContextItem(reviewQueueItem), true);
assert.match(describeBrowserContextItem(reviewQueueItem), /Pins: 1/);
const reviewQueuePrompt = buildBrowserContextPrompt("按队列处理", [reviewQueueItem]);
assert.match(reviewQueuePrompt, /页面 Review 队列 1/);
assert.match(reviewQueuePrompt, /按页面批注修复 dashboard/);
assert.match(reviewQueuePrompt, /Selector: main > button#browser/);

const updatedSameElementPin = {
  ...pinItem.pin!,
  pinId: "chela-pin-updated",
  markerNumber: 1,
  comment: "同一个元素更新后的批注",
};
const duplicateQueue = createBrowserReviewQueue([pinItem.pin!, updatedSameElementPin], {
  title: "Deduped Review",
  sourceUrl: "http://localhost:5173/dashboard",
});
assert.equal(duplicateQueue.pins.length, 1);
assert.equal(duplicateQueue.pins[0]?.comment, "同一个元素更新后的批注");
assert.equal(
  getBrowserReviewQueueSignature(reviewQueue.pins, reviewQueue.sourceUrl),
  getBrowserReviewQueueSignature(duplicateQueue.pins, duplicateQueue.sourceUrl),
);

const olderReviewQueueItem = {
  ...reviewQueueItem,
  id: "older-review-queue",
  createdAt: "2026-05-10T00:00:00.000Z",
};
const newerReviewQueueItem = {
  ...createBrowserReviewQueueContextItem(duplicateQueue),
  id: "newer-review-queue",
  createdAt: "2026-05-10T01:00:00.000Z",
};
const dedupedReviewQueueItems = compactBrowserContextItems(
  [newerReviewQueueItem, olderReviewQueueItem],
  8,
).filter((item) => item.kind === "review-queue");
assert.equal(dedupedReviewQueueItems.length, 1);
assert.equal(dedupedReviewQueueItems[0]?.id, "newer-review-queue");
assert.equal(
  dedupedReviewQueueItems[0]?.reviewQueue?.pins[0]?.comment,
  "同一个元素更新后的批注",
);

const secondSnapshot = createBrowserPageSnapshotContextItem({
  sourceUrl: "http://localhost:5173/dashboard#details",
  title: "Chela Dashboard Updated",
  viewport: { x: 0, y: 0, width: 1440, height: 900 },
  headings: ["Dashboard updated"],
  visibleText: "Updated dashboard text",
});
const olderDuplicateElement = {
  ...contextItem,
  id: "older-duplicate-element",
  createdAt: "2026-05-10T00:00:00.000Z",
};
const newerDuplicateElement = {
  ...createBrowserContextItem(selectedButton),
  id: "newer-duplicate-element",
  createdAt: "2026-05-10T01:00:00.000Z",
};
const governedItems = compactBrowserContextItems(
  [
    pageSnapshot,
    { ...contextItem, id: "initial-element", createdAt: "2026-05-09T00:00:00.000Z" },
    secondSnapshot,
    pinItem,
    reviewQueueItem,
    olderDuplicateElement,
    newerDuplicateElement,
  ],
  8,
);
assert.equal(governedItems[0].kind, "review-queue");
assert.equal(governedItems[1].kind, "pin");
assert.equal(governedItems.filter((item) => item.kind === "page-snapshot").length, 1);
assert.equal(
  governedItems.find((item) => item.kind === "page-snapshot")?.pageSnapshot?.title,
  "Chela Dashboard Updated",
);
assert.equal(
  governedItems.find((item) => item.kind === "element")?.id,
  "newer-duplicate-element",
);
const governedBudget = summarizeBrowserContextBudget(governedItems);
assert.equal(governedBudget.itemCount, governedItems.length);
assert.match(governedBudget.label, /chars/);
assert.deepEqual(getBrowserContextItems([pageSnapshot, secondSnapshot, pinItem, reviewQueueItem]).map((item) => item.kind), [
  "review-queue",
  "pin",
  "page-snapshot",
]);

assert.equal(
  buildBrowserContextPrompt("普通消息", []),
  "普通消息",
);

console.log("browser interview regression tests passed");
