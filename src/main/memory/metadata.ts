import type {
  MemoryMetadata,
  MemoryMetadataValue,
} from "../../shared/contracts.js";

const MAX_METADATA_ENTRIES = 16;
const MAX_METADATA_KEY_LENGTH = 48;
const MAX_METADATA_STRING_LENGTH = 512;
const MAX_METADATA_TAGS = 16;
const MAX_METADATA_TAG_LENGTH = 48;
const MEMORY_METADATA_KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9_.:-]*$/;

function normalizeString(
  value: unknown,
  maxLength = MAX_METADATA_STRING_LENGTH,
): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength || /[\0\r\n]/.test(trimmed)) {
    return undefined;
  }

  return trimmed;
}

function normalizeTags(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const tags: string[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    if (tags.length >= MAX_METADATA_TAGS) {
      break;
    }

    const tag = normalizeString(item, MAX_METADATA_TAG_LENGTH);
    if (!tag) {
      continue;
    }

    const normalizedTag = tag.toLowerCase();
    if (seen.has(normalizedTag)) {
      continue;
    }

    seen.add(normalizedTag);
    tags.push(tag);
  }

  return tags.length > 0 ? tags : undefined;
}

function normalizeGenericValue(value: unknown): MemoryMetadataValue | undefined {
  if (value === null) {
    return null;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value === "string") {
    return normalizeString(value);
  }

  if (Array.isArray(value)) {
    return normalizeTags(value);
  }

  return undefined;
}

export function normalizeMemoryMetadata(value: unknown): MemoryMetadata | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const nextMetadata: Record<string, MemoryMetadataValue> = {};
  let acceptedCount = 0;

  for (const [key, rawValue] of Object.entries(value)) {
    if (acceptedCount >= MAX_METADATA_ENTRIES) {
      break;
    }

    if (
      !key ||
      key.length > MAX_METADATA_KEY_LENGTH ||
      !MEMORY_METADATA_KEY_PATTERN.test(key)
    ) {
      continue;
    }

    let normalizedValue: MemoryMetadataValue | undefined;
    switch (key) {
      case "source":
        normalizedValue = normalizeString(rawValue, 64);
        break;
      case "sessionId":
      case "messageId":
        normalizedValue = normalizeString(rawValue, 128);
        break;
      case "tags":
        normalizedValue = normalizeTags(rawValue);
        break;
      default:
        normalizedValue = normalizeGenericValue(rawValue);
        break;
    }

    if (normalizedValue === undefined) {
      continue;
    }

    nextMetadata[key] = normalizedValue;
    acceptedCount += 1;
  }

  return Object.keys(nextMetadata).length > 0
    ? (nextMetadata as MemoryMetadata)
    : null;
}
