import { clipboard, dialog, nativeImage, powerMonitor, type BrowserWindow, type IpcMainInvokeEvent } from "electron";
import type { ClipboardShelfState } from "../shared/clipboard-shelf.ts";
import { IPC_CHANNELS, WORKSPACE_PAGES, type WorkspacePage } from "../shared/ipc.ts";
import { ClipboardHistory } from "./clipboard-history.ts";
import { handleIpc } from "./ipc/handle.ts";
import { registerPlannerIpc, stopPlannerReminders } from "./ipc/planner.ts";
import { appLogger } from "./logger.ts";
import { getMainWindow, isMainRendererUrl } from "./window.ts";

const privateClipboardFormats = [
  "ExcludeClipboardContentFromMonitorProcessing",
  "org.nspasteboard.ConcealedType",
  "org.nspasteboard.TransientType",
  "Clipboard Viewer Ignore",
];
const history = new ClipboardHistory();
let paused = true;
let clipboardTimer: ReturnType<typeof setInterval> | undefined;

function trustedMainWindow(): BrowserWindow | null {
  const window = getMainWindow();
  return window && !window.isDestroyed() && isMainRendererUrl(window.webContents.getURL()) ? window : null;
}

function assertTrustedMainSender(event: IpcMainInvokeEvent): void {
  const window = trustedMainWindow();
  if (!window || event.sender !== window.webContents
    || event.senderFrame !== window.webContents.mainFrame || !isMainRendererUrl(event.senderFrame.url)) {
    throw new Error("不允许的工作区调用来源。");
  }
}

function isShelfPage(url: string): boolean {
  return isMainRendererUrl(url) && url.slice(url.indexOf("#") + 1) === WORKSPACE_PAGES.shelf;
}

function canRecordClipboard(): boolean {
  const window = trustedMainWindow();
  return !!window && window.isVisible() && !window.isMinimized() && isShelfPage(window.webContents.getURL())
    && powerMonitor.getSystemIdleState(1) !== "locked";
}

function state(): ClipboardShelfState {
  return { items: history.list(), paused };
}

function publish(): ClipboardShelfState {
  const snapshot = state();
  const window = trustedMainWindow();
  if (window && isShelfPage(window.webContents.getURL())) {
    try {
      window.webContents.send(IPC_CHANNELS.clipboardShelfChanged, snapshot);
    } catch (error) {
      appLogger.warn({ scope: "clipboard-shelf", message: "随手页状态发送失败", error });
    }
  }
  return snapshot;
}

function captureClipboard(): void {
  if (paused) return;
  if (!canRecordClipboard()) {
    setPaused(true);
    return;
  }
  try {
    const formats = clipboard.availableFormats();
    // Respect the exclusion hints used by password managers and Windows history.
    const historyFormat = "CanIncludeInClipboardHistory";
    const historyFlag = process.platform === "win32" && clipboard.has(historyFormat)
      ? clipboard.readBuffer(historyFormat)
      : null;
    if (privateClipboardFormats.some((format) => clipboard.has(format))
      || formats.some((format) => /concealed|transient|password/i.test(format))
      || (historyFlag && (historyFlag.length !== 4 || historyFlag.readUInt32LE() !== 1))) {
      history.ignoreCurrent();
      return;
    }
    let changed = false;
    if (formats.some((format) => /^image\//i.test(format))) {
      const image = clipboard.readImage();
      if (paused) return;
      const size = image.getSize();
      if (image.isEmpty() || size.width * size.height > 16_000_000) {
        history.ignoreCurrent();
        return;
      }
      changed = history.captureImage(image.toBitmap(), size, () => image.toPNG());
    } else {
      changed = history.captureText(clipboard.readText());
    }
    if (changed) publish();
  } catch (error) {
    setPaused(true);
    appLogger.warn({ scope: "clipboard-shelf", message: "剪贴板读取失败，已暂停记录", error });
  }
}

function setPaused(value: boolean): ClipboardShelfState {
  paused = value;
  if (clipboardTimer) clearInterval(clipboardTimer);
  clipboardTimer = undefined;
  if (!paused) {
    captureClipboard();
    if (!paused) clipboardTimer = setInterval(captureClipboard, 1000);
  }
  return publish();
}

export function registerDesktopPanels(
  ensureMainWindow: () => BrowserWindow,
  showCompanion: () => void,
  discussTask: (taskId: unknown, updatedAt: unknown) => void,
): void {
  async function showPage(page: WorkspacePage, taskId?: string): Promise<void> {
    const window = ensureMainWindow();
    const contents = window.webContents;
    const requestPage = () => {
      if (!contents.isDestroyed() && isMainRendererUrl(contents.getURL())) {
        contents.send(IPC_CHANNELS.windowWorkspacePageRequested, page);
        if (taskId) contents.send(IPC_CHANNELS.windowFocusTask, taskId);
      }
    };
    if (!contents.isLoadingMainFrame() && isMainRendererUrl(contents.getURL())) requestPage();
    else contents.once("did-finish-load", requestPage);
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  }

  const handle = (channel: string, action: (value?: unknown) => unknown) => {
    handleIpc(channel, (event, value) => {
      assertTrustedMainSender(event);
      return action(value);
    });
  };
  handle(IPC_CHANNELS.clipboardShelfShow, () => showPage("shelf"));
  handle(IPC_CHANNELS.windowShowCompanion, showCompanion);
  handleIpc(IPC_CHANNELS.plannerDiscuss, (event, taskId, updatedAt) => {
    assertTrustedMainSender(event);
    discussTask(taskId, updatedAt);
  });
  handle(IPC_CHANNELS.clipboardShelfGetState, state);
  handle(IPC_CHANNELS.clipboardShelfSetPaused, (value) => {
    if (typeof value !== "boolean") throw new Error("面板状态必须是布尔值。");
    if (!value && !canRecordClipboard()) throw new Error("请先打开随手页。");
    return setPaused(value);
  });
  handle(IPC_CHANNELS.clipboardShelfCopy, (id) => {
    const item = history.get(id);
    if (item.kind === "image") {
      const image = nativeImage.createFromDataURL(item.imageDataUrl!);
      if (image.isEmpty()) throw new Error("图片内容无效。");
      clipboard.writeImage(image);
    } else {
      clipboard.writeText(item.text);
    }
    history.markCopied(item.id);
  });
  handle(IPC_CHANNELS.clipboardShelfRemove, (id) => { history.remove(id); return publish(); });
  handle(IPC_CHANNELS.clipboardShelfClear, () => { history.clear(); return publish(); });
  registerPlannerIpc((taskId) => showPage(taskId ? "board" : "calendar", taskId), trustedMainWindow, assertTrustedMainSender);
}

export function bindDesktopPanelOwner(window: BrowserWindow): void {
  const pauseRecording = () => {
    if (!paused) setPaused(true);
  };

  window.webContents.on("did-navigate-in-page", (_event, url, isMainFrame) => {
    if (isMainFrame && !isShelfPage(url)) pauseRecording();
  });
  window.webContents.on("did-start-navigation", (details) => {
    if (details.isMainFrame && !details.isSameDocument) pauseRecording();
  });
  window.webContents.on("render-process-gone", pauseRecording);
  window.on("hide", pauseRecording);
  window.on("minimize", pauseRecording);
  powerMonitor.on("lock-screen", pauseRecording);
  powerMonitor.on("suspend", pauseRecording);
  window.on("closed", () => {
    powerMonitor.off("lock-screen", pauseRecording);
    powerMonitor.off("suspend", pauseRecording);
    pauseRecording();
    history.clear();
  });
  window.webContents.on("will-prevent-unload", (event) => {
    if (window.isMinimized()) window.restore();
    if (!window.isVisible()) window.show();
    const choice = dialog.showMessageBoxSync(window, {
      type: "warning",
      title: "未保存的更改",
      message: "放弃尚未保存的计划更改？",
      buttons: ["继续编辑", "放弃更改"],
      defaultId: 0,
      cancelId: 0,
    });
    if (choice === 1) event.preventDefault();
  });
}

export function stopDesktopPanels(): void {
  setPaused(true);
  history.clear();
  stopPlannerReminders();
}
