import { create } from "zustand";
import type {
  RightPanelState,
  Settings,
  ThinkingLevel,
  WindowFrameState,
} from "@shared/contracts";

type AppStoreState = {
  booting: boolean;
  bootError: string | null;
  terminalOpen: boolean;
  threadWorkspaceWidth: number;
  sidebarSize: number;
  sidebarCollapsed: boolean;
  currentModelId: string;
  thinkingLevel: ThinkingLevel;
  sidebarAnimating: boolean;
  rightPanelAnimating: boolean;
  rightPanelDragging: boolean;
  browserInteractionResetSignal: number;
  rightPanelState: RightPanelState;
  frameState: WindowFrameState;
  settings: Settings | null;
  setBooting: (booting: boolean) => void;
  setBootError: (bootError: string | null) => void;
  setTerminalOpen: (terminalOpen: boolean) => void;
  setThreadWorkspaceWidth: (threadWorkspaceWidth: number) => void;
  setSidebarSize: (sidebarSize: number) => void;
  setSidebarCollapsed: (sidebarCollapsed: boolean) => void;
  setCurrentModelId: (currentModelId: string) => void;
  setThinkingLevel: (thinkingLevel: ThinkingLevel) => void;
  setSidebarAnimating: (sidebarAnimating: boolean) => void;
  setRightPanelAnimating: (rightPanelAnimating: boolean) => void;
  setRightPanelDragging: (rightPanelDragging: boolean) => void;
  bumpBrowserInteractionResetSignal: () => void;
  setRightPanelState: (partial: Partial<RightPanelState>) => void;
  setFrameState: (frameState: WindowFrameState) => void;
  setSettings: (settings: Settings | null) => void;
  resetAppStoreForTests: () => void;
};

const DEFAULT_MODEL_ID = "builtin:anthropic:claude-sonnet-4-20250514";
const DEFAULT_SIDEBAR_SIZE = 18;
const SIDEBAR_WIDTH_STORAGE_KEY = "chela.sidebar-width";
const LEGACY_SIDEBAR_WIDTH_STORAGE_KEY = "first-pi-agent.sidebar-width";
const SIDEBAR_COLLAPSED_STORAGE_KEY = "chela.sidebar-collapsed";

function clampSidebarSize(size: number) {
  return Math.min(85, Math.max(4, size));
}

function readStoredNumber(keys: string[]) {
  if (typeof window === "undefined") {
    return null;
  }

  for (const key of keys) {
    const value = Number(localStorage.getItem(key));
    if (Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}

function migrateLegacySidebarWidth(storedWidth: number) {
  if (storedWidth <= 100) {
    return clampSidebarSize(storedWidth);
  }

  if (typeof window === "undefined" || window.innerWidth <= 0) {
    return DEFAULT_SIDEBAR_SIZE;
  }

  return clampSidebarSize((Math.min(350, storedWidth) / window.innerWidth) * 100);
}

function readInitialSidebarSize() {
  const storedWidth = readStoredNumber([
    SIDEBAR_WIDTH_STORAGE_KEY,
    LEGACY_SIDEBAR_WIDTH_STORAGE_KEY,
  ]);
  return storedWidth === null
    ? DEFAULT_SIDEBAR_SIZE
    : migrateLegacySidebarWidth(storedWidth);
}

function readInitialSidebarCollapsed() {
  if (typeof window === "undefined") {
    return false;
  }

  return localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "1";
}

const initialAppState = {
  booting: true,
  bootError: null,
  terminalOpen: false,
  threadWorkspaceWidth: 0,
  sidebarSize: readInitialSidebarSize(),
  sidebarCollapsed: readInitialSidebarCollapsed(),
  currentModelId: DEFAULT_MODEL_ID,
  thinkingLevel: "off" as ThinkingLevel,
  sidebarAnimating: false,
  rightPanelAnimating: false,
  rightPanelDragging: false,
  browserInteractionResetSignal: 0,
  rightPanelState: {
    open: false,
    activeView: "diff",
    width: null,
  } satisfies RightPanelState,
  frameState: {
    isMaximized: false,
  } satisfies WindowFrameState,
  settings: null,
};

export const useAppStore = create<AppStoreState>((set) => ({
  ...initialAppState,
  setBooting: (booting) => set({ booting }),
  setBootError: (bootError) => set({ bootError }),
  setTerminalOpen: (terminalOpen) => set({ terminalOpen }),
  setThreadWorkspaceWidth: (threadWorkspaceWidth) => set({ threadWorkspaceWidth }),
  setSidebarSize: (sidebarSize) => set({ sidebarSize }),
  setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
  setCurrentModelId: (currentModelId) => set({ currentModelId }),
  setThinkingLevel: (thinkingLevel) => set({ thinkingLevel }),
  setSidebarAnimating: (sidebarAnimating) => set({ sidebarAnimating }),
  setRightPanelAnimating: (rightPanelAnimating) => set({ rightPanelAnimating }),
  setRightPanelDragging: (rightPanelDragging) => set({ rightPanelDragging }),
  bumpBrowserInteractionResetSignal: () =>
    set((state) => ({
      browserInteractionResetSignal: state.browserInteractionResetSignal + 1,
    })),
  setRightPanelState: (partial) =>
    set((state) => ({
      rightPanelState: {
        ...state.rightPanelState,
        ...partial,
        activeView: partial.activeView ?? state.rightPanelState.activeView ?? "diff",
      },
    })),
  setFrameState: (frameState) => set({ frameState }),
  setSettings: (settings) => set({ settings }),
  resetAppStoreForTests: () => set({ ...initialAppState }),
}));
