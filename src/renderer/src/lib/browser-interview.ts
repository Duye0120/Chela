export type {
  BrowserContextItem,
  BrowserElementRect,
  BrowserElementStyles,
  BrowserInterviewElement,
  BrowserPagePin,
  BrowserPageSnapshot,
  BrowserReviewQueue,
} from "@shared/contracts";
export {
  compactBrowserContextItems,
  estimateBrowserContextChars,
  getBrowserContextItems,
  isBrowserContextItem,
  summarizeBrowserContextBudget,
} from "@shared/browser-context";

import type {
  BrowserContextItem,
  BrowserInterviewElement,
  BrowserPagePin,
  BrowserPageSnapshot,
  BrowserReviewQueue,
} from "@shared/contracts";

export const DEFAULT_BROWSER_PREVIEW_URL = "http://localhost:5173";
export const BROWSER_CONTEXT_FALLBACK_INSTRUCTION =
  "请根据选中的页面元素继续。";

const LOCAL_HOST_PATTERN =
  /^(localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|\[::1\])(?::\d+)?(?:[/?#].*)?$/iu;
const URL_SCHEME_PATTERN = /^[a-z][a-z\d+.-]*:\/\//iu;
const URL_PROTOCOL_LIKE_PATTERN = /^[a-z][a-z\d+.-]*:/iu;
const BROWSER_PREVIEW_ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

function cleanText(value: string | null | undefined, maxLength: number) {
  const normalized = value?.replace(/\s+/gu, " ").trim() ?? "";
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength).trimEnd()}...`;
}

function firstClassName(className: string | null | undefined) {
  return className
    ?.trim()
    .split(/\s+/u)
    .find(Boolean) ?? "";
}

function formatNullable(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "(空)";
  }

  return String(value);
}

function canonicalizeBrowserPinUrl(value: string | null | undefined) {
  const raw = value?.trim();
  if (!raw) {
    return "";
  }

  try {
    const url = new URL(raw);
    url.hash = "";
    return url.toString();
  } catch {
    return raw.replace(/#.*$/u, "");
  }
}

function getBrowserPinQueueKey(pin: Pick<BrowserPagePin, "sourceUrl" | "selector">) {
  return `${canonicalizeBrowserPinUrl(pin.sourceUrl)}|${pin.selector.trim()}`;
}

export function normalizeBrowserPreviewUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  if (LOCAL_HOST_PATTERN.test(trimmed)) {
    return `http://${trimmed}`;
  }

  if (URL_SCHEME_PATTERN.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      return BROWSER_PREVIEW_ALLOWED_PROTOCOLS.has(parsed.protocol)
        ? parsed.toString()
        : "";
    } catch {
      return "";
    }
  }

  if (URL_PROTOCOL_LIKE_PATTERN.test(trimmed)) {
    return "";
  }

  return `https://${trimmed}`;
}

export function formatBrowserElementLabel(element: BrowserInterviewElement) {
  const tagName = element.tagName?.trim().toLowerCase() || "element";
  const id = element.id?.trim();
  const className = firstClassName(element.className);

  if (id) {
    return `${tagName}#${id}${className ? `.${className}` : ""}`;
  }

  if (className) {
    return `${tagName}.${className}`;
  }

  const text = cleanText(element.textContent, 24);
  return text ? `${tagName} "${text}"` : tagName;
}

export function createBrowserContextItem(
  element: BrowserInterviewElement,
): BrowserContextItem {
  return {
    id: `browser-element-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    label: formatBrowserElementLabel(element),
    createdAt: new Date().toISOString(),
    kind: "element",
    element,
  };
}

export function createBrowserPageSnapshotContextItem(
  snapshot: BrowserPageSnapshot,
): BrowserContextItem {
  const title = cleanText(snapshot.title, 48);
  const url = cleanText(snapshot.sourceUrl, 64);
  return {
    id: `browser-page-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    label: title ? `页面: ${title}` : `页面快照${url ? `: ${url}` : ""}`,
    createdAt: new Date().toISOString(),
    kind: "page-snapshot",
    pageSnapshot: snapshot,
  };
}

export function createBrowserPinContextItem(pin: BrowserPagePin): BrowserContextItem {
  const comment = cleanText(pin.comment, 48);
  const tag = pin.tagName?.trim().toLowerCase() || "element";
  return {
    id: `browser-pin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    label: comment ? `批注: ${comment}` : `批注: ${tag}`,
    createdAt: new Date().toISOString(),
    kind: "pin",
    pin,
  };
}


export function createBrowserReviewQueueContextItem(
  reviewQueue: BrowserReviewQueue,
): BrowserContextItem {
  const title = cleanText(reviewQueue.title, 64) || "页面 Review 队列";
  const count = reviewQueue.pins.length;
  return {
    id: `browser-review-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    label: `${title} · ${count} 条批注`,
    createdAt: new Date().toISOString(),
    kind: "review-queue",
    reviewQueue,
  };
}

export function createBrowserReviewQueue(
  pins: readonly BrowserPagePin[],
  options: { title?: string; sourceUrl?: string | null; summary?: string | null } = {},
): BrowserReviewQueue {
  const deduped = new Map<string, BrowserPagePin>();
  for (const pin of pins) {
    const key = getBrowserPinQueueKey(pin);
    deduped.set(key, pin);
  }
  const nextPins = [...deduped.values()].slice(0, 12);
  const title = options.title?.trim() || "页面 Review 队列";
  return {
    queueId: `browser-review-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    sourceUrl: options.sourceUrl ?? nextPins[0]?.sourceUrl ?? null,
    summary: options.summary ?? `${nextPins.length} 条页面批注需要处理`,
    pins: nextPins,
  };
}

export function buildBrowserDisplayText(
  text: string,
  items: readonly BrowserContextItem[],
) {
  const instruction = text.trim();
  if (items.length === 0) {
    return instruction;
  }

  const tags = items
    .map((item) => `[[dom-tag ${item.label}]]`)
    .join(" ");

  return instruction ? `${tags} ${instruction}` : tags;
}

export function describeBrowserContextItem(item: BrowserContextItem) {
  if (item.kind === "review-queue" && item.reviewQueue) {
    const queue = item.reviewQueue;
    const pinSummary = queue.pins
      .slice(0, 6)
      .map((pin, index) => `#${pin.markerNumber ?? index + 1}: ${cleanText(pin.comment, 120)}`)
      .join("; ");
    return [
      `Title: ${formatNullable(queue.title)}`,
      `Page: ${formatNullable(queue.sourceUrl)}`,
      `Summary: ${formatNullable(cleanText(queue.summary, 240))}`,
      `Pins: ${queue.pins.length}`,
      `Items: ${pinSummary || "(none)"}`,
    ].join("\n");
  }

  if (item.kind === "pin" && item.pin) {
    const pin = item.pin;
    const rect = pin.boundingRect;
    const size = rect
      ? `${Math.round(rect.width)}x${Math.round(rect.height)} @ ${Math.round(rect.x)},${Math.round(rect.y)}`
      : "(unknown)";

    return [
      `Comment: ${formatNullable(cleanText(pin.comment, 240))}`,
      `Page: ${formatNullable(pin.sourceUrl)}`,
      `Selector: ${formatNullable(pin.selector)}`,
      `Tag: <${formatNullable(pin.tagName)}>`,
      `Text: ${formatNullable(cleanText(pin.textContent, 160))}`,
      `Rect: ${size}`,
    ].join("\n");
  }

  if (item.kind === "page-snapshot" && item.pageSnapshot) {
    const snapshot = item.pageSnapshot;
    const viewport = snapshot.viewport
      ? `${Math.round(snapshot.viewport.width)}x${Math.round(snapshot.viewport.height)}`
      : "(unknown)";
    const headings = snapshot.headings?.slice(0, 8).join(" / ") || "(none)";
    const interactives = snapshot.interactiveElements
      ?.slice(0, 12)
      .map((element) => `${element.tagName}${element.role ? `[${element.role}]` : ""}: ${element.label}`)
      .join("; ") || "(none)";

    return [
      `Page: ${formatNullable(snapshot.sourceUrl)}`,
      `Title: ${formatNullable(snapshot.title)}`,
      `Viewport: ${viewport}`,
      `Headings: ${headings}`,
      `Interactive elements: ${interactives}`,
      `Visible text: ${formatNullable(cleanText(snapshot.visibleText, 600))}`,
    ].join("\n");
  }

  if (!item.element) {
    return `Context: ${item.label}`;
  }

  const element = item.element;
  const rect = element.boundingRect;
  const size = rect
    ? `${Math.round(rect.width)}x${Math.round(rect.height)}`
    : "(unknown)";

  return [
    `Selector: ${formatNullable(element.selector)}`,
    `Text: ${formatNullable(cleanText(element.textContent, 160))}`,
    `Size: ${size}`,
    `Page: ${formatNullable(element.sourceUrl)}`,
    `Display: ${formatNullable(element.styles?.display)}`,
    `Position: ${formatNullable(element.styles?.position)}`,
  ].join("\n");
}

export function buildBrowserContextPrompt(
  text: string,
  items: readonly BrowserContextItem[],
) {
  if (items.length === 0) {
    return text;
  }

  const instruction = text.trim() || BROWSER_CONTEXT_FALLBACK_INSTRUCTION;
  const context = items.map((item, index) => {
    if (item.kind === "review-queue" && item.reviewQueue) {
      const queue = item.reviewQueue;
      const pins = queue.pins
        .slice(0, 12)
        .map((pin, pinIndex) => {
          const rect = pin.boundingRect;
          const position = rect
            ? `${Math.round(rect.x)},${Math.round(rect.y)} / ${Math.round(rect.width)}x${Math.round(rect.height)}`
            : "(未知)";
          return [
            `${pinIndex + 1}. #${pin.markerNumber ?? pinIndex + 1} ${formatNullable(cleanText(pin.comment, 360))}`,
            `   - Selector: ${formatNullable(pin.selector)}`,
            `   - Tag: <${formatNullable(pin.tagName)}>`,
            `   - 位置/尺寸: ${position}`,
            `   - 文本内容: ${formatNullable(cleanText(pin.textContent, 320))}`,
          ].join("\n");
        })
        .join("\n");

      return [
        `【页面 Review 队列 ${index + 1}: ${item.label}】`,
        `- 标题: ${formatNullable(queue.title)}`,
        `- 当前页面: ${formatNullable(queue.sourceUrl)}`,
        `- 摘要: ${formatNullable(cleanText(queue.summary, 360))}`,
        `- 批注列表:\n${pins || "(无)"}`,
      ].join("\n");
    }

    if (item.kind === "pin" && item.pin) {
      const pin = item.pin;
      const rect = pin.boundingRect;
      const viewport = pin.viewport;
      const position = rect
        ? `${Math.round(rect.x)},${Math.round(rect.y)} / ${Math.round(rect.width)}x${Math.round(rect.height)}`
        : "(未知)";
      const viewportText = viewport
        ? `${Math.round(viewport.width)}x${Math.round(viewport.height)}`
        : "(未知)";

      return [
        `【页面批注 ${index + 1}: ${item.label}】`,
        `- 批注: ${formatNullable(cleanText(pin.comment, 500))}`,
        `- 当前页面: ${formatNullable(pin.sourceUrl)}`,
        `- Selector: ${formatNullable(pin.selector)}`,
        `- Tag: <${formatNullable(pin.tagName)}>`,
        `- 位置/尺寸: ${position}`,
        `- Viewport: ${viewportText}`,
        `- 文本内容: ${formatNullable(cleanText(pin.textContent, 500))}`,
        `- 样式: display=${formatNullable(pin.styles?.display)}, position=${formatNullable(pin.styles?.position)}, width=${formatNullable(pin.styles?.width)}, height=${formatNullable(pin.styles?.height)}, bg=${formatNullable(pin.styles?.backgroundColor)}, color=${formatNullable(pin.styles?.color)}, fontSize=${formatNullable(pin.styles?.fontSize)}`,
      ].join("\n");
    }

    if (item.kind === "page-snapshot" && item.pageSnapshot) {
      const snapshot = item.pageSnapshot;
      const viewport = snapshot.viewport
        ? `${Math.round(snapshot.viewport.width)}x${Math.round(snapshot.viewport.height)}`
        : "(未知)";
      const headings = snapshot.headings?.slice(0, 10).join(" / ") || "(无)";
      const interactives = snapshot.interactiveElements
        ?.slice(0, 20)
        .map((element, elementIndex) =>
          `${elementIndex + 1}. <${element.tagName}> ${formatNullable(cleanText(element.label, 80))}${element.role ? ` role=${element.role}` : ""}${element.href ? ` href=${element.href}` : ""}`,
        )
        .join("\n") || "(无)";

      return [
        `【页面快照 ${index + 1}: ${item.label}】`,
        `- 当前页面: ${formatNullable(snapshot.sourceUrl)}`,
        `- 标题: ${formatNullable(snapshot.title)}`,
        `- 描述: ${formatNullable(cleanText(snapshot.description, 240))}`,
        `- Viewport: ${viewport}`,
        `- Headings: ${headings}`,
        `- 关键可交互元素:\n${interactives}`,
        `- 可见文本摘要: ${formatNullable(cleanText(snapshot.visibleText, 1800))}`,
      ].join("\n");
    }

    if (!item.element) {
      return `【浏览器上下文 ${index + 1}: ${item.label}】`;
    }

    const element = item.element;
    const rect = element.boundingRect;
    const styles = element.styles;
    const dimensions = rect
      ? `${Math.round(rect.width)}x${Math.round(rect.height)}`
      : "(未知)";

    return [
      `【选中元素 ${index + 1}: ${item.label}】`,
      `- 当前页面: ${formatNullable(element.sourceUrl)}`,
      `- Selector: ${formatNullable(element.selector)}`,
      `- Tag: <${formatNullable(element.tagName)}>`,
      `- ID: ${formatNullable(element.id)}`,
      `- Class: ${formatNullable(element.className)}`,
      `- 尺寸: ${dimensions}`,
      `- 文本内容: ${formatNullable(cleanText(element.textContent, 500))}`,
      `- 样式: display=${formatNullable(styles?.display)}, position=${formatNullable(styles?.position)}, width=${formatNullable(styles?.width)}, height=${formatNullable(styles?.height)}, bg=${formatNullable(styles?.backgroundColor)}, color=${formatNullable(styles?.color)}, fontSize=${formatNullable(styles?.fontSize)}`,
      `- HTML 片段: ${formatNullable(cleanText(element.outerHTML, 1200))}`,
    ].join("\n");
  }).join("\n\n");

  return `[Browser Context]\n${context}\n\n[用户指令]\n${instruction}`;
}
