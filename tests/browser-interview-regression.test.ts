import assert from "node:assert/strict";
import {
  buildBrowserDisplayText,
  buildBrowserContextPrompt,
  createBrowserContextItem,
  describeBrowserContextItem,
  formatBrowserElementLabel,
  getBrowserContextItems,
  isBrowserContextItem,
  normalizeBrowserPreviewUrl,
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
assert.ok(contextItem.id.startsWith("browser-element-"));
assert.deepEqual(contextItem.element.boundingRect, selectedButton.boundingRect);
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

assert.equal(
  buildBrowserContextPrompt("普通消息", []),
  "普通消息",
);

console.log("browser interview regression tests passed");
