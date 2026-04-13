import { ipcMain } from "electron";
import { IPC_CHANNELS } from "../../shared/ipc.js";
import {
  computeWindowFrameState,
  requireMainWindow,
} from "../window.js";
import { handleIpc } from "./handle.js";

export function registerWindowIpc(): void {
  handleIpc(IPC_CHANNELS.windowGetState, async () => {
    return computeWindowFrameState();
  });
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
