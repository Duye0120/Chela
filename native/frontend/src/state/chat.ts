import { createStore } from "zustand/vanilla";
import type { ChatProgress, ChatSnapshot, RuntimeSettings, chatApi } from "../data/chat";

export type Branches = Awaited<ReturnType<typeof chatApi.branches>>;
export type BranchResource = { branch: string; items: Branches; loading: boolean; error: string };
export type RuntimeResource = { value: RuntimeSettings | null; error: string };
export const emptyBranches: BranchResource = { branch: "", items: [], loading: false, error: "" };
export const emptyRuntime: RuntimeResource = { value: null, error: "" };

export const chatState = createStore<{
  snapshot: ChatSnapshot;
  progress: ChatProgress;
  loading: boolean;
  error: string;
  modelRevision: number;
  branches: Record<string, BranchResource>;
  runtime: Record<string, RuntimeResource>;
}>(() => ({ snapshot: { sessions: [], model: "" }, progress: {}, loading: true,
  error: "", modelRevision: 0, branches: {}, runtime: {} }));

export function setSnapshot(update: ChatSnapshot | ((value: ChatSnapshot) => ChatSnapshot)) {
  chatState.setState(state => {
    const snapshot = typeof update === "function" ? update(state.snapshot) : update;
    return BigInt(snapshot.snapshot_cursor || "0") >= BigInt(state.snapshot.snapshot_cursor || "0") ? { snapshot } : state;
  });
}
export const setLoading = (loading: boolean) => chatState.setState({ loading });
export const setError = (error: string) => chatState.setState({ error });
