import type { BrowserContextItem } from "./contracts.js";

export function isBrowserContextItem(value: unknown): value is BrowserContextItem {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<BrowserContextItem>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.label === "string" &&
    Boolean(candidate.element) &&
    typeof candidate.element === "object" &&
    typeof candidate.element.selector === "string" &&
    typeof candidate.element.tagName === "string"
  );
}

export function getBrowserContextItems(value: unknown, limit = 8) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isBrowserContextItem).slice(0, limit);
}
