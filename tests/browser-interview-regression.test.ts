import assert from "node:assert/strict";
import {
  buildBrowserDisplayText,
  buildBrowserContextPrompt,
  compactBrowserContextItems,
  createBrowserContextItem,
  createBrowserPageSnapshotContextItem,
  createBrowserPinContextItem,
  createBrowserReviewQueue,
  createBrowserReviewQueueContextItem,
  describeBrowserContextItem,
  formatBrowserElementLabel,
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
const pinPrompt = buildBrowserContextPrompt("按批注处理", [pinItem]);
assert.match(pinPrompt, /页面批注 1: 批注: 这里 CTA 不够明显/);
assert.match(pinPrompt, /Selector: main > button#browser/);
assert.match(pinPrompt, /位置\/尺寸: 320,180 \/ 180x40/);
assert.match(pinPrompt, /Viewport: 1280x720/);


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
  [pageSnapshot, contextItem, secondSnapshot, pinItem, reviewQueueItem, olderDuplicateElement, newerDuplicateElement],
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
