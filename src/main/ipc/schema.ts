import type { ProviderSourceDraft, Settings } from "../../shared/contracts.js";
import { IPC_CHANNELS, type IpcErrorPayload } from "../../shared/ipc.js";

type PlainRecord = Record<string, unknown>;

const SETTINGS_TOP_LEVEL_KEYS = new Set([
  "modelRouting",
  "defaultModelId",
  "workerModelId",
  "thinkingLevel",
  "timeZone",
  "theme",
  "customTheme",
  "terminal",
  "ui",
  "network",
  "memory",
  "workspace",
]);

const MODEL_ROUTING_KEYS = new Set(["chat", "utility", "subagent", "compact"]);
const MODEL_ROUTING_ROLE_KEYS = new Set(["modelId"]);
const TERMINAL_KEYS = new Set(["shell", "fontSize", "fontFamily", "scrollback"]);
const UI_KEYS = new Set(["fontFamily", "fontSize", "codeFontSize", "codeFontFamily"]);
const NETWORK_KEYS = new Set(["proxy", "timeoutMs"]);
const NETWORK_PROXY_KEYS = new Set(["enabled", "url", "noProxy"]);
const MEMORY_KEYS = new Set([
  "enabled",
  "autoRetrieve",
  "queryRewrite",
  "searchCandidateLimit",
  "similarityThreshold",
  "autoSummarize",
  "toolModelId",
  "embeddingModelId",
  "embeddingProviderId",
]);
const PROVIDER_SOURCE_DRAFT_KEYS = new Set([
  "id",
  "name",
  "providerType",
  "mode",
  "enabled",
  "baseUrl",
]);
const PROVIDER_TYPES = ["anthropic", "openai", "google", "openai-compatible"] as const;
const PROVIDER_MODES = ["native", "custom"] as const;

export function invalidIpcPayload(channel: string, path: string, expected: string): IpcErrorPayload {
  return {
    code: "INVALID_IPC_PAYLOAD",
    message: `${channel} 参数无效：${path} 必须是 ${expected}。`,
  };
}

export function validateSettingsUpdatePayload(value: unknown): Partial<Settings> {
  const input = expectPlainObject(value, IPC_CHANNELS.settingsUpdate, "payload");
  assertKnownKeys(input, SETTINGS_TOP_LEVEL_KEYS, IPC_CHANNELS.settingsUpdate, "payload");

  if ("workspace" in input) {
    expectNonEmptyString(input.workspace, IPC_CHANNELS.settingsUpdate, "workspace");
  }
  if ("defaultModelId" in input) {
    expectOptionalString(input.defaultModelId, IPC_CHANNELS.settingsUpdate, "defaultModelId");
  }
  if ("workerModelId" in input) {
    expectNullableString(input.workerModelId, IPC_CHANNELS.settingsUpdate, "workerModelId");
  }
  if ("thinkingLevel" in input) {
    expectEnum(input.thinkingLevel, ["off", "low", "medium", "high", "xhigh", "minimal"], IPC_CHANNELS.settingsUpdate, "thinkingLevel");
  }
  if ("timeZone" in input) {
    expectNonEmptyString(input.timeZone, IPC_CHANNELS.settingsUpdate, "timeZone");
  }
  if ("theme" in input) {
    expectEnum(input.theme, ["light", "dark", "custom"], IPC_CHANNELS.settingsUpdate, "theme");
  }
  if ("customTheme" in input) {
    validateCustomTheme(input.customTheme);
  }
  if ("modelRouting" in input) {
    validateModelRouting(input.modelRouting);
  }
  if ("terminal" in input) {
    validateTerminal(input.terminal);
  }
  if ("ui" in input) {
    validateUi(input.ui);
  }
  if ("network" in input) {
    validateNetwork(input.network);
  }
  if ("memory" in input) {
    validateMemory(input.memory);
  }

  return input as Partial<Settings>;
}

export function validateProviderSourceDraftPayload(
  channel: string,
  value: unknown,
): ProviderSourceDraft {
  const input = expectPlainObject(value, channel, "draft");
  assertKnownKeys(input, PROVIDER_SOURCE_DRAFT_KEYS, channel, "draft");

  if ("id" in input) {
    expectNonEmptyString(input.id, channel, "draft.id");
  }
  expectNonEmptyString(input.name, channel, "draft.name");
  expectEnum(input.providerType, PROVIDER_TYPES, channel, "draft.providerType");
  expectEnum(input.mode, PROVIDER_MODES, channel, "draft.mode");
  expectBoolean(input.enabled, channel, "draft.enabled");
  if ("baseUrl" in input) {
    expectNullableString(input.baseUrl, channel, "draft.baseUrl");
  }

  return input as unknown as ProviderSourceDraft;
}

export function validateSourceIdPayload(channel: string, value: unknown): string {
  expectNonEmptyString(value, channel, "sourceId");
  return value;
}

export function validateProviderApiKeyPayload(channel: string, value: unknown): string {
  expectString(value, channel, "apiKey");
  return value;
}

function validateModelRouting(value: unknown): void {
  const input = expectPlainObject(value, IPC_CHANNELS.settingsUpdate, "modelRouting");
  assertKnownKeys(input, MODEL_ROUTING_KEYS, IPC_CHANNELS.settingsUpdate, "modelRouting");
  for (const role of MODEL_ROUTING_KEYS) {
    if (!(role in input)) {
      continue;
    }
    const roleValue = expectPlainObject(input[role], IPC_CHANNELS.settingsUpdate, `modelRouting.${role}`);
    assertKnownKeys(roleValue, MODEL_ROUTING_ROLE_KEYS, IPC_CHANNELS.settingsUpdate, `modelRouting.${role}`);
    if ("modelId" in roleValue) {
      const path = `modelRouting.${role}.modelId`;
      if (role === "chat") {
        expectNonEmptyString(roleValue.modelId, IPC_CHANNELS.settingsUpdate, path);
      } else {
        expectNullableString(roleValue.modelId, IPC_CHANNELS.settingsUpdate, path);
      }
    }
  }
}

function validateTerminal(value: unknown): void {
  const input = expectPlainObject(value, IPC_CHANNELS.settingsUpdate, "terminal");
  assertKnownKeys(input, TERMINAL_KEYS, IPC_CHANNELS.settingsUpdate, "terminal");
  if ("shell" in input) expectNonEmptyString(input.shell, IPC_CHANNELS.settingsUpdate, "terminal.shell");
  if ("fontFamily" in input) expectNonEmptyString(input.fontFamily, IPC_CHANNELS.settingsUpdate, "terminal.fontFamily");
  if ("fontSize" in input) expectNumber(input.fontSize, IPC_CHANNELS.settingsUpdate, "terminal.fontSize");
  if ("scrollback" in input) expectNumber(input.scrollback, IPC_CHANNELS.settingsUpdate, "terminal.scrollback");
}

function validateUi(value: unknown): void {
  const input = expectPlainObject(value, IPC_CHANNELS.settingsUpdate, "ui");
  assertKnownKeys(input, UI_KEYS, IPC_CHANNELS.settingsUpdate, "ui");
  if ("fontFamily" in input) expectNonEmptyString(input.fontFamily, IPC_CHANNELS.settingsUpdate, "ui.fontFamily");
  if ("codeFontFamily" in input) expectNonEmptyString(input.codeFontFamily, IPC_CHANNELS.settingsUpdate, "ui.codeFontFamily");
  if ("fontSize" in input) expectNumber(input.fontSize, IPC_CHANNELS.settingsUpdate, "ui.fontSize");
  if ("codeFontSize" in input) expectNumber(input.codeFontSize, IPC_CHANNELS.settingsUpdate, "ui.codeFontSize");
}

function validateNetwork(value: unknown): void {
  const input = expectPlainObject(value, IPC_CHANNELS.settingsUpdate, "network");
  assertKnownKeys(input, NETWORK_KEYS, IPC_CHANNELS.settingsUpdate, "network");
  if ("timeoutMs" in input) expectNumber(input.timeoutMs, IPC_CHANNELS.settingsUpdate, "network.timeoutMs");
  if ("proxy" in input) {
    const proxy = expectPlainObject(input.proxy, IPC_CHANNELS.settingsUpdate, "network.proxy");
    assertKnownKeys(proxy, NETWORK_PROXY_KEYS, IPC_CHANNELS.settingsUpdate, "network.proxy");
    if ("enabled" in proxy) expectBoolean(proxy.enabled, IPC_CHANNELS.settingsUpdate, "network.proxy.enabled");
    if ("url" in proxy) expectString(proxy.url, IPC_CHANNELS.settingsUpdate, "network.proxy.url");
    if ("noProxy" in proxy) expectString(proxy.noProxy, IPC_CHANNELS.settingsUpdate, "network.proxy.noProxy");
  }
}

function validateMemory(value: unknown): void {
  const input = expectPlainObject(value, IPC_CHANNELS.settingsUpdate, "memory");
  assertKnownKeys(input, MEMORY_KEYS, IPC_CHANNELS.settingsUpdate, "memory");
  for (const key of ["enabled", "autoRetrieve", "queryRewrite", "autoSummarize"]) {
    if (key in input) expectBoolean(input[key], IPC_CHANNELS.settingsUpdate, `memory.${key}`);
  }
  for (const key of ["searchCandidateLimit", "similarityThreshold"]) {
    if (key in input) expectNumber(input[key], IPC_CHANNELS.settingsUpdate, `memory.${key}`);
  }
  if ("toolModelId" in input) expectNullableString(input.toolModelId, IPC_CHANNELS.settingsUpdate, "memory.toolModelId");
  if ("embeddingModelId" in input) expectNonEmptyString(input.embeddingModelId, IPC_CHANNELS.settingsUpdate, "memory.embeddingModelId");
  if ("embeddingProviderId" in input) expectNullableString(input.embeddingProviderId, IPC_CHANNELS.settingsUpdate, "memory.embeddingProviderId");
}

function validateCustomTheme(value: unknown): void {
  if (value === null) {
    return;
  }
  const input = expectPlainObject(value, IPC_CHANNELS.settingsUpdate, "customTheme");
  for (const [key, entry] of Object.entries(input)) {
    if (!key.trim()) {
      throw invalidIpcPayload(IPC_CHANNELS.settingsUpdate, "customTheme", "非空键值对象");
    }
    expectString(entry, IPC_CHANNELS.settingsUpdate, `customTheme.${key}`);
  }
}

function expectPlainObject(value: unknown, channel: string, path: string): PlainRecord {
  if (!isPlainObject(value)) {
    throw invalidIpcPayload(channel, path, "对象");
  }
  return value;
}

function assertKnownKeys(input: PlainRecord, allowedKeys: Set<string>, channel: string, path: string): void {
  for (const key of Object.keys(input)) {
    if (!allowedKeys.has(key)) {
      throw invalidIpcPayload(channel, `${path}.${key}`, "受支持字段");
    }
  }
}

function expectString(value: unknown, channel: string, path: string): void {
  if (typeof value !== "string") {
    throw invalidIpcPayload(channel, path, "字符串");
  }
}

function expectNonEmptyString(value: unknown, channel: string, path: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw invalidIpcPayload(channel, path, "非空字符串");
  }
}

function expectOptionalString(value: unknown, channel: string, path: string): void {
  if (value !== undefined && typeof value !== "string") {
    throw invalidIpcPayload(channel, path, "字符串");
  }
}

function expectNullableString(value: unknown, channel: string, path: string): void {
  if (value !== null && typeof value !== "string") {
    throw invalidIpcPayload(channel, path, "字符串或 null");
  }
}

function expectNumber(value: unknown, channel: string, path: string): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw invalidIpcPayload(channel, path, "有限数字");
  }
}

function expectBoolean(value: unknown, channel: string, path: string): void {
  if (typeof value !== "boolean") {
    throw invalidIpcPayload(channel, path, "布尔值");
  }
}

function expectEnum(value: unknown, allowedValues: readonly string[], channel: string, path: string): void {
  if (typeof value !== "string" || !allowedValues.includes(value)) {
    throw invalidIpcPayload(channel, path, allowedValues.join(" / "));
  }
}

function isPlainObject(value: unknown): value is PlainRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
