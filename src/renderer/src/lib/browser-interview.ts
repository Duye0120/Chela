export type {
  BrowserContextItem,
  BrowserElementRect,
  BrowserElementStyles,
  BrowserInterviewElement,
} from "@shared/contracts";
export {
  getBrowserContextItems,
  isBrowserContextItem,
} from "@shared/browser-context";

import type {
  BrowserContextItem,
  BrowserInterviewElement,
} from "@shared/contracts";

export const DEFAULT_BROWSER_PREVIEW_URL = "http://localhost:5173";
export const BROWSER_CONTEXT_FALLBACK_INSTRUCTION =
  "请根据选中的页面元素继续。";

const LOCAL_HOST_PATTERN =
  /^(localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|\[::1\])(?::\d+)?(?:[/?#].*)?$/iu;
const URL_SCHEME_PATTERN = /^[a-z][a-z\d+.-]*:\/\//iu;

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

export function normalizeBrowserPreviewUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  if (URL_SCHEME_PATTERN.test(trimmed)) {
    return trimmed;
  }

  if (LOCAL_HOST_PATTERN.test(trimmed)) {
    return `http://${trimmed}`;
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
    element,
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
    .slice(0, 8)
    .map((item) => `[[dom-tag ${item.label}]]`)
    .join(" ");

  return instruction ? `${tags} ${instruction}` : tags;
}

export function describeBrowserContextItem(item: BrowserContextItem) {
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
  const context = items.slice(0, 8).map((item, index) => {
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
