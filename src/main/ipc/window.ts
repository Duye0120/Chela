import { ipcMain } from "electron";
import { IPC_CHANNELS } from "../../shared/ipc.js";
import {
  computeWindowBounds,
  computeWindowFrameState,
  requireMainWindow,
  setMainWindowBounds,
} from "../window.js";
import { handleIpc } from "./handle.js";

export function registerWindowIpc(): void {
  handleIpc(IPC_CHANNELS.windowGetState, async () => {
    return computeWindowFrameState();
  });
  handleIpc(IPC_CHANNELS.windowGetBounds, async () => {
    return computeWindowBounds();
  });
  handleIpc(
    IPC_CHANNELS.windowSetBounds,
    async (_event, bounds: { x: number; y: number; width: number; height: number }) =>
      setMainWindowBounds(bounds),
  );
  ipcMain.on(IPC_CHANNELS.windowMinimize, () => requireMainWindow().minimize());
  ipcMain.handle(IPC_CHANNELS.windowToggleMaximize, async () => {
    const window = requireMainWindow();

    if (window.isMaximized()) {
      window.unmaximize();
    } else {
      window.maximize();
    }

    return computeWindowFrameState();
  });
  ipcMain.on(IPC_CHANNELS.windowClose, () => requireMainWindow().close());
}
