import { create } from "zustand";
import type {
  DesktopApi,
  ModelEntry,
  ProviderSource,
} from "@shared/contracts";
import { loadProviderDirectory } from "../lib/provider-directory";

type ProviderDirectoryStoreState = {
  sources: ProviderSource[];
  entries: ModelEntry[];
  loading: boolean;
  lastLoadedAt: number | null;
  refreshProviderDirectory: (
    desktopApi: DesktopApi | undefined,
    options?: { force?: boolean; signal?: AbortSignal },
  ) => Promise<{ sources: ProviderSource[]; entries: ModelEntry[] } | null>;
  replaceProviderDirectory: (snapshot: {
    sources: ProviderSource[];
    entries: ModelEntry[];
  }) => void;
  clearProviderDirectory: () => void;
  resetProviderDirectoryStoreForTests: () => void;
};

const initialProviderDirectoryState = {
  sources: [] as ProviderSource[],
  entries: [] as ModelEntry[],
  loading: false,
  lastLoadedAt: null as number | null,
};

export const useProviderDirectoryStore = create<ProviderDirectoryStoreState>((set) => ({
  ...initialProviderDirectoryState,
  refreshProviderDirectory: async (desktopApi, options) => {
    if (!desktopApi) return null;

    set({ loading: true });
    try {
      const snapshot = await loadProviderDirectory(desktopApi, options);
      if (options?.signal?.aborted) return null;

      set({
        sources: snapshot.sources,
        entries: snapshot.entries,
        lastLoadedAt: Date.now(),
      });
      return snapshot;
    } finally {
      if (!options?.signal?.aborted) {
        set({ loading: false });
      }
    }
  },
  replaceProviderDirectory: (snapshot) =>
    set({
      sources: snapshot.sources,
      entries: snapshot.entries,
      lastLoadedAt: Date.now(),
    }),
  clearProviderDirectory: () =>
    set({ sources: [], entries: [], lastLoadedAt: null }),
  resetProviderDirectoryStoreForTests: () =>
    set({ ...initialProviderDirectoryState }),
}));
