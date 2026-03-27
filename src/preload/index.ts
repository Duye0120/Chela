import { contextBridge, ipcRenderer } from "electron";
import type { DesktopApi, WindowFrameState, ChatSession, SendMessageInput } from "../shared/contracts.js";
import { IPC_CHANNELS } from "../shared/ipc.js";

const desktopApi: DesktopApi = {
  files: {
    pick: () => ipcRenderer.invoke(IPC_CHANNELS.filesPick),
    readPreview: (filePath: string) => ipcRenderer.invoke(IPC_CHANNELS.filesReadPreview, filePath),
  },
  sessions: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.sessionsList),
    load: (sessionId: string) => ipcRenderer.invoke(IPC_CHANNELS.sessionsLoad, sessionId),
    save: (session: ChatSession) => ipcRenderer.invoke(IPC_CHANNELS.sessionsSave, session),
    create: () => ipcRenderer.invoke(IPC_CHANNELS.sessionsCreate),
  },
  chat: {
    send: (input: SendMessageInput) => ipcRenderer.invoke(IPC_CHANNELS.chatSend, input),
  },
  ui: {
    getState: () => ipcRenderer.invoke(IPC_CHANNELS.uiGetState),
    setRightPanelOpen: (open: boolean) => ipcRenderer.invoke(IPC_CHANNELS.uiSetRightPanelOpen, open),
  },
  window: {
    getState: () => ipcRenderer.invoke(IPC_CHANNELS.windowGetState),
    minimize: () => ipcRenderer.send(IPC_CHANNELS.windowMinimize),
    toggleMaximize: () => ipcRenderer.send(IPC_CHANNELS.windowToggleMaximize),
    close: () => ipcRenderer.send(IPC_CHANNELS.windowClose),
    onStateChange: (listener: (state: WindowFrameState) => void) => {
      const wrappedListener = (_event: Electron.IpcRendererEvent, state: WindowFrameState) => {
        listener(state);
      };

      ipcRenderer.on(IPC_CHANNELS.windowStateChanged, wrappedListener);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.windowStateChanged, wrappedListener);
      };
    },
  },
};

contextBridge.exposeInMainWorld("desktopApi", desktopApi);
