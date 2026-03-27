import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { app, BrowserWindow, ipcMain } from "electron";
import { buildMockAssistantReply } from "./mockChat.js";
import { pickFiles, readFilePreview } from "./files.js";
import { createSession, getUiState, listSessions, loadSession, saveSession, setRightPanelOpen } from "./store.js";
import { IPC_CHANNELS } from "../shared/ipc.js";
import type { ChatSession, SelectedFile, SendMessageInput } from "../shared/contracts.js";

let mainWindow: BrowserWindow | null = null;
const __dirname = dirname(fileURLToPath(import.meta.url));

function getPreloadPath() {
  return join(__dirname, "../preload/index.mjs");
}

function getRendererPath() {
  return join(__dirname, "../renderer/index.html");
}

function notifyWindowState() {
  if (!mainWindow) {
    return;
  }

  mainWindow.webContents.send(IPC_CHANNELS.windowStateChanged, {
    isMaximized: mainWindow.isMaximized(),
  });
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1120,
    minHeight: 720,
    frame: false,
    backgroundColor: "#0b0d12",
    title: "first_pi_agent",
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.on("maximize", notifyWindowState);
  mainWindow.on("unmaximize", notifyWindowState);

  if (process.env.VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    void mainWindow.loadFile(getRendererPath());
  }
}

function requireMainWindow() {
  if (!mainWindow) {
    throw new Error("Main window is not ready yet.");
  }

  return mainWindow;
}

function registerIpcHandlers() {
  ipcMain.handle(IPC_CHANNELS.filesPick, async () => pickFiles(requireMainWindow()));
  ipcMain.handle(IPC_CHANNELS.filesReadPreview, async (_event, filePath: string) => readFilePreview(filePath));

  ipcMain.handle(IPC_CHANNELS.sessionsList, async () => listSessions());
  ipcMain.handle(IPC_CHANNELS.sessionsLoad, async (_event, sessionId: string) => loadSession(sessionId));
  ipcMain.handle(IPC_CHANNELS.sessionsSave, async (_event, session: ChatSession) => saveSession(session));
  ipcMain.handle(IPC_CHANNELS.sessionsCreate, async () => createSession());

  ipcMain.handle(IPC_CHANNELS.chatSend, async (_event, input: SendMessageInput) => {
    const session = await loadSession(input.sessionId);
    const attachments = (session?.attachments ?? []).filter((file: SelectedFile) => input.attachmentIds.includes(file.id));

    return buildMockAssistantReply({
      input,
      attachments,
    });
  });

  ipcMain.handle(IPC_CHANNELS.uiGetState, async () => getUiState());
  ipcMain.handle(IPC_CHANNELS.uiSetRightPanelOpen, async (_event, open: boolean) => setRightPanelOpen(open));

  ipcMain.handle(IPC_CHANNELS.windowGetState, async () => ({
    isMaximized: requireMainWindow().isMaximized(),
  }));
  ipcMain.on(IPC_CHANNELS.windowMinimize, () => requireMainWindow().minimize());
  ipcMain.on(IPC_CHANNELS.windowToggleMaximize, () => {
    const window = requireMainWindow();

    if (window.isMaximized()) {
      window.unmaximize();
    } else {
      window.maximize();
    }
  });
  ipcMain.on(IPC_CHANNELS.windowClose, () => requireMainWindow().close());
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
