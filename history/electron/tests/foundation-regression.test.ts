import assert from "node:assert/strict";
import type { DesktopApi, ModelEntry, ProviderSource } from "../src/shared/contracts.ts";
import {
  invalidateProviderDirectoryCache,
  loadProviderDirectory,
} from "../src/renderer/src/lib/provider-directory.ts";

function createDesktopApi(input: {
  sources: ProviderSource[];
  entries: ModelEntry[];
  onListSources?: () => void;
  onListEntries?: () => void;
}): DesktopApi {
  return {
    providers: {
      listSources: async () => {
        input.onListSources?.();
        return input.sources;
      },
    },
    models: {
      listEntries: async () => {
        input.onListEntries?.();
        return input.entries;
      },
    },
  } as DesktopApi;
}

{
  invalidateProviderDirectoryCache();
  const desktopApi = {
    providers: {
      listSources: () => new Promise<ProviderSource[]>(() => undefined),
    },
    models: {
      listEntries: async () => [],
    },
  } as unknown as DesktopApi;

  await assert.rejects(
    () => loadProviderDirectory(desktopApi, { timeoutMs: 20 }),
    /加载模型目录超时/,
  );
}

{
  invalidateProviderDirectoryCache();
  let sourceCalls = 0;
  let entryCalls = 0;
  const source: ProviderSource = {
    id: "source-openai",
    name: "OpenAI",
    type: "openai",
    mode: "native",
    kind: "builtin",
    baseUrl: null,
    enabled: true,
  };
  const entry: ModelEntry = {
    id: "entry-gpt",
    sourceId: source.id,
    name: "gpt",
    modelId: "gpt",
    enabled: true,
    builtin: true,
  };
  const desktopApi = createDesktopApi({
    sources: [source],
    entries: [entry],
    onListSources: () => {
      sourceCalls += 1;
    },
    onListEntries: () => {
      entryCalls += 1;
    },
  });

  const first = await loadProviderDirectory(desktopApi);
  const second = await loadProviderDirectory(desktopApi);

  assert.equal(first, second);
  assert.equal(sourceCalls, 1);
  assert.equal(entryCalls, 1);
  assert.deepEqual(second.sources, [source]);
  assert.deepEqual(second.entries, [entry]);

  const stale = await loadProviderDirectory(
    createDesktopApi({
      sources: [],
      entries: [],
      onListSources: () => {
        throw new Error("provider directory offline");
      },
    }),
    { force: true, timeoutMs: 20 },
  );

  assert.deepEqual(stale.sources, [source]);
  assert.deepEqual(stale.entries, [entry]);
  assert.equal(stale.stale, true);
  assert.match(stale.error ?? "", /provider directory offline/);
}

console.log("foundation regression tests passed");
