import { safeStorage } from "electron";
import { appLogger } from "./logger.ts";
import { readJsonFile } from "./json-file.ts";

const LEGACY_BUILTIN_PROVIDERS = new Set(["anthropic", "openai", "google"]);

export type CredentialsStore = Record<string, { apiKey?: string }>;

type PersistedCredentialRecord = {
  apiKey?: string;
  encryptedApiKey?: string;
  storage?: "plain" | "safeStorage";
  baseUrl?: string;
};

type RawCredentialsStore = Record<string, PersistedCredentialRecord>;

export type ReadCredentialsResult = {
  credentials: CredentialsStore;
  legacyBaseUrls: Map<string, string>;
  needsRewrite: boolean;
};

type NormalizeBaseUrl = (value: string | null | undefined) => string | null;

function canEncryptCredentials(): boolean {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

function decryptStoredApiKey(
  sourceKey: string,
  record: PersistedCredentialRecord,
): { apiKey: string; needsRewrite: boolean } | null {
  if (typeof record.encryptedApiKey === "string" && record.encryptedApiKey.trim()) {
    try {
      const decrypted = safeStorage.decryptString(
        Buffer.from(record.encryptedApiKey, "base64"),
      ).trim();
      if (!decrypted) {
        return null;
      }
      return {
        apiKey: decrypted,
        needsRewrite:
          record.storage !== "safeStorage" ||
          typeof record.apiKey === "string",
      };
    } catch (error) {
      appLogger.warn({
        scope: "providers",
        message: "读取加密 API Key 失败，当前 source 将被视为未配置。",
        data: { sourceKey },
        error,
      });
      return null;
    }
  }

  const apiKey = typeof record.apiKey === "string" ? record.apiKey.trim() : "";
  if (!apiKey) {
    return null;
  }

  return {
    apiKey,
    needsRewrite: canEncryptCredentials() || record.storage === "safeStorage",
  };
}

export async function readCredentialsStore(
  filePath: string,
  normalizeBaseUrl: NormalizeBaseUrl,
): Promise<ReadCredentialsResult> {
  const rawCredentials = await readJsonFile<RawCredentialsStore>(filePath, {});
  const credentials: CredentialsStore = {};
  const legacyBaseUrls = new Map<string, string>();
  let needsRewrite = false;

  for (const [key, value] of Object.entries(rawCredentials)) {
    if (!value || typeof value !== "object") {
      needsRewrite = true;
      continue;
    }

    const decrypted = decryptStoredApiKey(key, value);
    const baseUrl = normalizeBaseUrl(value.baseUrl);
    const targetKey = LEGACY_BUILTIN_PROVIDERS.has(key) ? `builtin:${key}` : key;

    if (targetKey !== key) {
      needsRewrite = true;
    }

    if (decrypted?.apiKey) {
      credentials[targetKey] = { apiKey: decrypted.apiKey };
    }

    if (decrypted?.needsRewrite) {
      needsRewrite = true;
    }

    if (baseUrl) {
      if (LEGACY_BUILTIN_PROVIDERS.has(key)) {
        legacyBaseUrls.set(targetKey, baseUrl);
        needsRewrite = true;
      } else {
        needsRewrite = true;
      }
    }
  }

  return { credentials, legacyBaseUrls, needsRewrite };
}

export function serializeCredentialsStore(credentials: CredentialsStore): RawCredentialsStore {
  const canEncrypt = canEncryptCredentials();
  const persisted: RawCredentialsStore = {};

  for (const [sourceId, value] of Object.entries(credentials)) {
    const apiKey = value.apiKey?.trim();
    if (!apiKey) {
      continue;
    }

    if (canEncrypt) {
      persisted[sourceId] = {
        storage: "safeStorage",
        encryptedApiKey: safeStorage.encryptString(apiKey).toString("base64"),
      };
      continue;
    }

    persisted[sourceId] = {
      storage: "plain",
      apiKey,
    };
  }

  return persisted;
}
