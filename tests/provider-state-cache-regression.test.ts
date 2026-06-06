import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const providersSource = readFileSync(
  new URL("../src/main/providers.ts", import.meta.url),
  "utf8",
);
const mainSource = readFileSync(
  new URL("../src/main/index.ts", import.meta.url),
  "utf8",
);

assert.match(
  providersSource,
  /let cachedProviderState: ProviderState \| null = null;/,
  "providers should keep a process-local state cache.",
);
assert.match(
  providersSource,
  /async function hydrateProviderState\(\): Promise<ProviderState>/,
  "providers should isolate initial disk hydration from cached reads.",
);
assert.match(
  providersSource,
  /function readProviderState\(\): ProviderState \{\s*if \(cachedProviderState\)/s,
  "readProviderState should return cached state after first hydration.",
);
assert.match(
  providersSource,
  /pendingProviderStateFlush = pendingProviderStateFlush[\s\S]*\.then\(\(\) => flushProviderStateAsync\(stateToFlush\)\)/,
  "writeProviderState should schedule async persistence instead of synchronously writing every mutation.",
);
assert.doesNotMatch(
  providersSource,
  /fs\.writeFileSync/,
  "providers should not synchronously write provider state files.",
);
assert.doesNotMatch(
  providersSource,
  /fs\.readFileSync/,
  "providers cached read path should avoid synchronous JSON reads.",
);
assert.match(
  mainSource,
  /await initializeProviderState\(\);/,
  "main startup should hydrate provider state before registering IPC handlers.",
);

console.log("provider state cache regression tests passed");
