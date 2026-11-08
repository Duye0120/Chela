import { app, dialog, type BrowserWindow } from "electron";
import { hasActiveCodexTasks, stopAllCodexTasks } from "./codex-task.ts";
import { registerFilesIpc } from "./ipc/files.ts";
import { registerSessionsIpc } from "./ipc/sessions.ts";
import { registerChatIpc } from "./ipc/chat.ts";
import { registerHarnessIpc } from "./ipc/harness.ts";
import { registerSettingsIpc } from "./ipc/settings.ts";
import { registerRuntimeIpc } from "./ipc/runtime.ts";
import { registerMemoryIpc } from "./ipc/memory.ts";
import { registerMcpIpc } from "./ipc/mcp.ts";
import { registerPluginsIpc } from "./ipc/plugins.ts";
import { registerWorkspaceIpc } from "./ipc/workspace.ts";
import { registerProvidersIpc } from "./ipc/providers.ts";
import { registerWorkbenchIpc } from "./ipc/workbench.ts";
import { registerWindowIpc } from "./ipc/window.ts";
import { registerWorkerIpc } from "./ipc/worker.ts";
import { registerSkillsIpc } from "./ipc/skills.ts";
import {
  configureAppIdentity,
  createMainWindow,
  getMainWindow,
  migrateLegacyUserData,
} from "./window.ts";
import {
  destroyAllAgents,
} from "./agent.ts";
import {
  recoverInterruptedRuns,
} from "./session/service.ts";
import {
  setTerminalWindow,
  destroyAllTerminals,
  listTerminals,
} from "./terminal.ts";
import { harnessRuntime } from "./harness/singleton.ts";
import { startBackgroundServices, stopBackgroundServices } from "./bootstrap/services.ts";
import { registerQuickInvoke, unregisterQuickInvoke } from "./quick-invoke.ts";
import {
  appLogger,
  registerProcessLogging,
} from "./logger.ts";
import { applyGlobalNetworkSettings } from "./network/proxy.ts";
import { initTraceService } from "./trace/service.ts";
import { initializeProviderState } from "./providers.ts";
import { bindDesktopPanelOwner, registerDesktopPanels, stopDesktopPanels } from "./desktop-panels.ts";
import { createDesktopCompanion } from "./desktop-companion.ts";
import { checkPlannerReminders, createPlannerTodo, flushPendingPlannerExecutionUpdates, hasPendingPlannerExecutionUpdates, listPlannerItems, setPlannerChangedListener, setPlannerNoticeListener } from "./ipc/planner.ts";
import { configurePlannerTools } from "./tools/planner.ts";
import { IPC_CHANNELS } from "../shared/ipc.ts";

configureAppIdentity();
if (!app.requestSingleInstanceLock()) app.exit(0);

let companion: ReturnType<typeof createDesktopCompanion> | undefined;
let quitting = false;
let stoppingExecutions = false;
let closePromptOpen = false;

async function requestAppClose(parent: BrowserWindow): Promise<void> {
  if (quitting || stoppingExecutions || closePromptOpen || parent.isDestroyed()) return;
  closePromptOpen = true;
  try {
    const { response } = await dialog.showMessageBox(parent, {
      type: "question",
      title: "关闭 Chela",
      message: "关闭窗口后如何处理 Chela？",
      detail: "后台运行会保留聊天、任务执行、提醒和未保存草稿，可通过桌面助手或再次启动 Chela 返回。退出会停止运行中的执行，并检查未保存内容。",
      buttons: ["后台运行", "退出 Chela", "取消"],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
    });
    if (quitting || stoppingExecutions) return;
    if (response === 0) {
      const main = getMainWindow();
      if (main && !main.isDestroyed()) main.hide();
      companion?.background();
    } else if (response === 1) {
      app.quit();
    }
  } catch (error) {
    if (!quitting) {
      appLogger.warn({ scope: "app.lifecycle", message: "关闭选择未完成，保留应用", error });
      dialog.showErrorBox("暂未关闭 Chela", "无法完成关闭选择，请稍后重试。");
    }
  } finally {
    closePromptOpen = false;
  }
}

app.on("before-quit", (event) => {
  if (stoppingExecutions) {
    event.preventDefault();
    return;
  }
  const window = getMainWindow();
  if (!window || window.isDestroyed()) {
    quitting = true;
    if (hasActiveCodexTasks() || hasPendingPlannerExecutionUpdates() || listTerminals().length > 0) {
      event.preventDefault();
      stoppingExecutions = true;
      void stopAllCodexTasks().then(() => {
        destroyAllTerminals();
        if (listTerminals().length) throw new Error("仍有终端未能关闭。");
        flushPendingPlannerExecutionUpdates();
        stoppingExecutions = false;
        app.quit();
      }).catch((error: unknown) => {
        stoppingExecutions = false;
        quitting = false;
        appLogger.error({ scope: "app.lifecycle", message: "停止或保存任务执行失败，保留应用以便重试", error });
        ensureMainWindow().show();
        dialog.showErrorBox("暂未退出 Chela", "无法确认任务执行和终端已停止，或执行状态尚未保存。请核对终端和看板，并确认计划文件可写后重试退出。");
      });
      return;
    }
    const residentCompanion = companion;
    companion = undefined;
    residentCompanion?.stop();
    return;
  }
  // Ask the main renderer about drafts before removing the resident companion.
  event.preventDefault();
  if (quitting) return;
  quitting = true;
  window.close();
});

function ensureMainWindow() {
  const existing = getMainWindow();
  if (existing && !existing.isDestroyed()) return existing;

  const window = createMainWindow();
  bindDesktopPanelOwner(window);
  window.on("close", (event) => {
    if (quitting) return;
    event.preventDefault();
    void requestAppClose(window);
  });
  window.webContents.on("will-prevent-unload", (event) => {
    if (!event.defaultPrevented) quitting = false;
  });
  window.on("closed", () => {
    if (quitting) queueMicrotask(() => app.quit());
  });
  setTerminalWindow(window);
  return window;
}

function registerIpcHandlers() {
  registerFilesIpc();

  registerSessionsIpc();

  registerChatIpc();

  registerHarnessIpc();

  registerSettingsIpc();

  registerRuntimeIpc();

  registerMemoryIpc();

  registerMcpIpc();
  registerPluginsIpc();

  registerSkillsIpc();

  registerProvidersIpc();

  registerWorkspaceIpc();

  registerWorkbenchIpc();

  registerWorkerIpc();

  registerWindowIpc();
  registerDesktopPanels(ensureMainWindow, () => {
    if (!companion) throw new Error("桌面助手尚未就绪。");
    companion.open();
  }, (taskId, updatedAt) => {
    if (!companion) throw new Error("桌面助手尚未就绪。");
    companion.discussTask(taskId, updatedAt);
  });
}

registerProcessLogging();

const startup = app.whenReady()
  .then(async () => {
    migrateLegacyUserData();
    applyGlobalNetworkSettings();
    await initializeProviderState();
    appLogger.info({
      scope: "app.lifecycle",
      message: "应用启动完成",
    });

    harnessRuntime.hydrateFromDisk(recoverInterruptedRuns);
    initTraceService();
    await startBackgroundServices();
    registerIpcHandlers();
    ensureMainWindow();
    companion = createDesktopCompanion({
      listItems: listPlannerItems,
      requestClose: requestAppClose,
      onReady: checkPlannerReminders,
      openChat: async (sessionId) => {
        const window = ensureMainWindow();
        const focusSession = () => window.webContents.send(IPC_CHANNELS.windowFocusSession, sessionId);
        if (window.webContents.isLoadingMainFrame()) window.webContents.once("did-finish-load", focusSession);
        else focusSession();
        if (window.isMinimized()) window.restore();
        window.show();
        window.focus();
      },
      openPage: async (page, taskId) => {
        const window = ensureMainWindow();
        const navigate = () => {
          if (page === "assistant") window.webContents.send("quick-invoke:focus-composer");
          else window.webContents.send(IPC_CHANNELS.windowWorkspacePageRequested, page);
          if (taskId) window.webContents.send(IPC_CHANNELS.windowFocusTask, taskId);
        };
        if (window.webContents.isLoadingMainFrame()) window.webContents.once("did-finish-load", navigate);
        else navigate();
        if (window.isMinimized()) window.restore();
        window.show();
        window.focus();
      },
    });
    setPlannerChangedListener(() => companion?.refresh());
    setPlannerNoticeListener((item, reason) => companion?.notify(item, reason) ?? false);
    configurePlannerTools({
      getSessionId: () => companion?.getSessionId() ?? null,
      list: listPlannerItems,
      create: createPlannerTodo,
    });
    registerQuickInvoke(getMainWindow);

    app.on("activate", () => {
      if (quitting) return;
      const window = ensureMainWindow();
      if (window.isMinimized()) window.restore();
      window.show();
    });
  })
  .catch((error) => {
    appLogger.error({
      scope: "app.lifecycle",
      message: "应用启动失败",
      error,
    });
    throw error;
  });

app.on("second-instance", () => {
  void startup.then(() => {
    if (quitting) return;
    const window = ensureMainWindow();
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  }, () => {});
});

app.on("window-all-closed", () => {
  if (quitting) return;
  appLogger.info({
    scope: "app.lifecycle",
    message: "所有窗口已关闭",
  });
  void destroyAllAgents();
  destroyAllTerminals();
  unregisterQuickInvoke();
  stopBackgroundServices();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("will-quit", () => {
  configurePlannerTools(undefined);
  setPlannerChangedListener(undefined);
  setPlannerNoticeListener(undefined);
  companion?.stop();
  stopDesktopPanels();
  destroyAllTerminals();
  void destroyAllAgents();
  unregisterQuickInvoke();
  stopBackgroundServices();
});
