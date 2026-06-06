import type { BrowserContextItem } from "./contracts.ts";

export function isBrowserContextItem(value: unknown): value is BrowserContextItem {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<BrowserContextItem>;
  const hasBaseShape =
    typeof candidate.id === "string" &&
    typeof candidate.label === "string";

  if (!hasBaseShape) {
    return false;
  }

  if (candidate.kind === "page-snapshot") {
    return Boolean(candidate.pageSnapshot) && typeof candidate.pageSnapshot === "object";
  }

  if (candidate.kind === "pin") {
    return (
      Boolean(candidate.pin) &&
      typeof candidate.pin === "object" &&
      typeof candidate.pin.comment === "string" &&
      typeof candidate.pin.selector === "string"
    );
  }

  if (candidate.kind === "review-queue") {
    return (
      Boolean(candidate.reviewQueue) &&
      typeof candidate.reviewQueue === "object" &&
      typeof candidate.reviewQueue.title === "string" &&
      Array.isArray(candidate.reviewQueue.pins)
    );
  }

  if (candidate.kind === "screenshot") {
    return (
      Boolean(candidate.screenshot) &&
      typeof candidate.screenshot === "object" &&
      typeof candidate.screenshot.comment === "string" &&
      typeof candidate.screenshot.imageName === "string" &&
      typeof candidate.screenshot.imagePath === "string"
    );
  }

  return (
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

  return compactBrowserContextItems(value.filter(isBrowserContextItem), limit);
}


export type BrowserContextBudgetLevel = "light" | "medium" | "heavy";

export type BrowserContextBudget = {
  itemCount: number;
  estimatedChars: number;
  level: BrowserContextBudgetLevel;
  label: string;
};

function canonicalizeUrl(value: string | null | undefined) {
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

function getItemPriority(item: BrowserContextItem) {
  if (item.kind === "review-queue") {
    return 4;
  }
  if (item.kind === "pin") {
    return 3;
  }
  if (item.kind === "screenshot") {
    return 3;
  }
  if (item.kind === "element" || item.element) {
    return 2;
  }
  if (item.kind === "page-snapshot") {
    return 1;
  }
  return 0;
}

function getItemTimestamp(item: BrowserContextItem) {
  const timestamp = Date.parse(item.createdAt);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function getBrowserContextDedupKey(item: BrowserContextItem) {
  if (item.kind === "review-queue" && item.reviewQueue) {
    const pinSignature = item.reviewQueue.pins
      .map((pin) => [
        canonicalizeUrl(pin.sourceUrl),
        pin.selector?.trim() ?? "",
      ].join(":"))
      .sort()
      .join(",");

    return [
      "review-queue",
      canonicalizeUrl(item.reviewQueue.sourceUrl),
      pinSignature,
    ].join("|");
  }

  if (item.kind === "pin" && item.pin) {
    return [
      "pin",
      canonicalizeUrl(item.pin.sourceUrl),
      item.pin.selector?.trim() ?? "",
      item.pin.comment?.trim() ?? "",
    ].join("|");
  }

  if (item.kind === "screenshot" && item.screenshot) {
    return [
      "screenshot",
      canonicalizeUrl(item.screenshot.sourceUrl),
      item.screenshot.imagePath?.trim() ?? "",
      item.screenshot.comment?.trim() ?? "",
    ].join("|");
  }

  if (item.kind === "page-snapshot" && item.pageSnapshot) {
    return [
      "page-snapshot",
      canonicalizeUrl(item.pageSnapshot.sourceUrl),
    ].join("|");
  }

  if (item.element) {
    return [
      "element",
      canonicalizeUrl(item.element.sourceUrl),
      item.element.selector?.trim() ?? "",
    ].join("|");
  }

  return `unknown|${item.id}`;
}

function compareBrowserContextItems(a: BrowserContextItem, b: BrowserContextItem) {
  const priorityDelta = getItemPriority(b) - getItemPriority(a);
  if (priorityDelta !== 0) {
    return priorityDelta;
  }
  return getItemTimestamp(b) - getItemTimestamp(a);
}

function selectPreferredBrowserContextItem(
  current: BrowserContextItem,
  candidate: BrowserContextItem,
) {
  return compareBrowserContextItems(current, candidate) <= 0 ? current : candidate;
}

export function estimateBrowserContextChars(items: readonly BrowserContextItem[]) {
  return items.reduce((total, item) => total + JSON.stringify(item).length, 0);
}

export function summarizeBrowserContextBudget(
  items: readonly BrowserContextItem[],
): BrowserContextBudget {
  const estimatedChars = estimateBrowserContextChars(items);
  const level: BrowserContextBudgetLevel =
    estimatedChars > 8000 ? "heavy" : estimatedChars > 3000 ? "medium" : "light";

  return {
    itemCount: items.length,
    estimatedChars,
    level,
    label: `${items.length} 项 · ~${estimatedChars.toLocaleString()} chars · ${level}`,
  };
}

export function compactBrowserContextItems(
  items: readonly BrowserContextItem[],
  limit = 8,
): BrowserContextItem[] {
  const deduped = new Map<string, BrowserContextItem>();

  for (const item of items.filter(isBrowserContextItem)) {
    const key = getBrowserContextDedupKey(item);
    const current = deduped.get(key);
    deduped.set(key, current ? selectPreferredBrowserContextItem(current, item) : item);
  }

  return [...deduped.values()]
    .sort(compareBrowserContextItems)
    .slice(0, limit);
}
