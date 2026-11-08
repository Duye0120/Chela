import { contextBridge, ipcRenderer } from "electron";
import { COMPANION_COMMAND, COMPANION_STATE_CHANGED, type CompanionApi, type CompanionState } from "../shared/companion.ts";

const api: CompanionApi = {
  command: (action, taskId) => ipcRenderer.invoke(COMPANION_COMMAND, action, taskId),
  onChange: (listener) => {
    const relay = (_event: Electron.IpcRendererEvent, state: CompanionState) => listener(state);
    ipcRenderer.on(COMPANION_STATE_CHANGED, relay);
    return () => ipcRenderer.removeListener(COMPANION_STATE_CHANGED, relay);
  },
};

contextBridge.exposeInMainWorld("chelaCompanion", api);
