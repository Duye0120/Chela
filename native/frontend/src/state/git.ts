import { createStore } from "zustand/vanilla";
import type { Repository } from "../data/preview";

export type RepositoryResource = { items: Repository[]; loading: boolean; error: string; revision: number };
export const emptyRepositories: RepositoryResource = { items: [], loading: false, error: "", revision: 0 };
export const gitState = createStore<{ repositories: Record<string, RepositoryResource> }>(() => ({ repositories: {} }));
