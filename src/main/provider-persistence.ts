import { app } from "electron";
import { chmod } from "node:fs/promises";
import path from "node:path";
import type { ModelEntry, ProviderSource } from "../shared/contracts.ts";
import { writeJsonFile } from "./json-file.ts";
import {
  readCredentialsStore,
  serializeCredentialsStore,
  type CredentialsStore,
} from "./provider-credentials.ts";

const SOURCES_FILE = "provider-sources.json";
const ENTRIES_FILE = "model-entries.json";
const CREDENTIALS_FILE = "credentials.json";

export type ProviderState = {
  sources: ProviderSource[];
  entries: ModelEntry[];
  credentials: CredentialsStore;
};

export function getProviderDataPath(fileName: string): string {
  return path.join(app.getPath("userData"), fileName);
}

export async function readRawCredentials(
  normalizeBaseUrl: (value: string | null | undefined) => string | null,
) {
  return readCredentialsStore(getProviderDataPath(CREDENTIALS_FILE), normalizeBaseUrl);
}

export function getProviderSourcesPath(): string {
  return getProviderDataPath(SOURCES_FILE);
}

export function getProviderEntriesPath(): string {
  return getProviderDataPath(ENTRIES_FILE);
}

export async function flushProviderStateToDisk(state: ProviderState): Promise<void> {
  const credentialsPath = getProviderDataPath(CREDENTIALS_FILE);
  await Promise.all([
    writeJsonFile(getProviderSourcesPath(), state.sources),
    writeJsonFile(getProviderEntriesPath(), state.entries),
    writeJsonFile(credentialsPath, serializeCredentialsStore(state.credentials)),
  ]);

  try {
    await chmod(credentialsPath, 0o600);
  } catch {
    // Windows may ignore chmod.
  }
}
