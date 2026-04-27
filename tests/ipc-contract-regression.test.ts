import assert from "node:assert/strict";
import { IPC_CHANNELS } from "../src/shared/ipc.ts";
import {
  validateProviderApiKeyPayload,
  validateProviderSourceDraftPayload,
  validateSourceIdPayload,
  validateSettingsUpdatePayload,
} from "../src/main/ipc/schema.ts";

assert.throws(
  () => validateSettingsUpdatePayload(null),
  (error) =>
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "INVALID_IPC_PAYLOAD" &&
    String((error as { message?: unknown }).message).includes(IPC_CHANNELS.settingsUpdate),
);

assert.throws(
  () => validateSettingsUpdatePayload({ unknown: true }),
  (error) =>
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "INVALID_IPC_PAYLOAD" &&
    String((error as { message?: unknown }).message).includes("unknown"),
);

assert.throws(
  () => validateSettingsUpdatePayload({ workspace: "" }),
  (error) =>
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "INVALID_IPC_PAYLOAD" &&
    String((error as { message?: unknown }).message).includes("workspace"),
);

assert.throws(
  () => validateSettingsUpdatePayload({ terminal: { fontSize: "large" } }),
  (error) =>
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "INVALID_IPC_PAYLOAD" &&
    String((error as { message?: unknown }).message).includes("terminal.fontSize"),
);

assert.throws(
  () => validateSettingsUpdatePayload({ network: { proxy: { enabled: "yes" } } }),
  (error) =>
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "INVALID_IPC_PAYLOAD" &&
    String((error as { message?: unknown }).message).includes("network.proxy.enabled"),
);

assert.deepEqual(validateSettingsUpdatePayload({ memory: { enabled: false } }), {
  memory: { enabled: false },
});

assert.deepEqual(validateSettingsUpdatePayload({ network: { timeoutMs: 120_000 } }), {
  network: { timeoutMs: 120_000 },
});

assert.throws(
  () => validateProviderSourceDraftPayload(IPC_CHANNELS.providersSaveSource, null),
  (error) =>
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "INVALID_IPC_PAYLOAD" &&
    String((error as { message?: unknown }).message).includes(IPC_CHANNELS.providersSaveSource),
);

assert.throws(
  () =>
    validateProviderSourceDraftPayload(IPC_CHANNELS.providersTestSource, {
      name: "DashScope",
      providerType: "dashscope",
      mode: "custom",
      enabled: true,
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    }),
  (error) =>
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "INVALID_IPC_PAYLOAD" &&
    String((error as { message?: unknown }).message).includes("providerType"),
);

assert.throws(
  () =>
    validateProviderSourceDraftPayload(IPC_CHANNELS.providersFetchModels, {
      name: "OpenAI Compatible",
      providerType: "openai-compatible",
      mode: "custom",
      enabled: "yes",
      baseUrl: "https://api.example.com/v1",
    }),
  (error) =>
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "INVALID_IPC_PAYLOAD" &&
    String((error as { message?: unknown }).message).includes("enabled"),
);

assert.throws(
  () => validateSourceIdPayload(IPC_CHANNELS.providersSetCredentials, ""),
  (error) =>
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "INVALID_IPC_PAYLOAD" &&
    String((error as { message?: unknown }).message).includes("sourceId"),
);

assert.throws(
  () => validateProviderApiKeyPayload(IPC_CHANNELS.providersSetCredentials, 123),
  (error) =>
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "INVALID_IPC_PAYLOAD" &&
    String((error as { message?: unknown }).message).includes("apiKey"),
);

assert.deepEqual(
  validateProviderSourceDraftPayload(IPC_CHANNELS.providersSaveSource, {
    id: "custom:source",
    name: "OpenAI Compatible",
    providerType: "openai-compatible",
    mode: "custom",
    enabled: true,
    baseUrl: "https://api.example.com/v1",
  }),
  {
    id: "custom:source",
    name: "OpenAI Compatible",
    providerType: "openai-compatible",
    mode: "custom",
    enabled: true,
    baseUrl: "https://api.example.com/v1",
  },
);

assert.equal(validateProviderApiKeyPayload(IPC_CHANNELS.providersSetCredentials, ""), "");

console.log("ipc contract regression tests passed");
