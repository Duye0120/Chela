import { createStore } from "zustand/vanilla";
import type { WorkTask } from "../data/work";

export const workTasks = createStore<{ tasks: WorkTask[]; loaded: boolean; error: string }>(() => ({
  tasks: [],
  loaded: false,
  error: "",
}));
