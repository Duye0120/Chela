import { useEffect, useRef } from "react";
import type { DesktopApi, WindowFrameState } from "@shared/contracts";
import type { SettingsSection } from "@renderer/components/assistant-ui/settings-view";

type MainView = "thread" | "settings";

type KeyboardShortcutActions = {
  setFrameState: (frameState: WindowFrameState) => void;
  setTerminalOpen: (terminalOpen: boolean) => void;
};

type KeyboardShortcutState = {
  mainView: MainView;
  terminalOpen: boolean;
  createNewSession: () => unknown;
  closeSettingsView: () => void;
  openSettingsView: (section?: SettingsSection) => void;
  toggleSidebarCollapsed: () => void;
};

export type UseAppKeyboardShortcutsInput = {
  desktopApi: DesktopApi | undefined;
  appActions: KeyboardShortcutActions;
  shortcutState: KeyboardShortcutState;
};

export function useAppKeyboardShortcuts({
  desktopApi,
  appActions,
  shortcutState,
}: UseAppKeyboardShortcutsInput): void {
  const shortcutStateRef = useRef(shortcutState);
  shortcutStateRef.current = shortcutState;

  useEffect(() => {
    if (!desktopApi) {
      return;
    }

    const cleanup = desktopApi.window.onStateChange((state) => {
      appActions.setFrameState(state);
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      const shortcuts = shortcutStateRef.current;
      if (mod && event.key === "j") {
        if (!shortcuts.terminalOpen) {
          event.preventDefault();
          appActions.setTerminalOpen(true);
        }
      } else if (mod && event.key === "b") {
        event.preventDefault();
        shortcuts.toggleSidebarCollapsed();
      } else if (mod && event.key === "n") {
        event.preventDefault();
        void shortcuts.createNewSession();
      } else if (mod && event.key === ",") {
        event.preventDefault();
        if (shortcuts.mainView === "settings") {
          shortcuts.closeSettingsView();
        } else {
          shortcuts.openSettingsView();
        }
      } else if (event.key === "Escape" && shortcuts.mainView === "settings") {
        shortcuts.closeSettingsView();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      cleanup();
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [appActions, desktopApi]);
}
