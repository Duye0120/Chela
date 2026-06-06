import {
  app,
  BrowserWindow,
} from "electron";
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

configureAppIdentity();

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
}

registerProcessLogging();

app.whenReady()
  .then(async () => {
    migrateLegacyUserData();
    applyGlobalNetworkSettings();
    await initializeProviderState();
    appLogger.info({
      scope: "app.lifecycle",
      message: "应用启动完成",
    });

    const recoveredRuns = harnessRuntime.hydrateFromDisk();
    recoverInterruptedRuns(recoveredRuns);
    initTraceService();
    await startBackgroundServices();
    registerIpcHandlers();
    const window = createMainWindow();
    setTerminalWindow(window);
    registerQuickInvoke(getMainWindow);

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        const window = createMainWindow();
        setTerminalWindow(window);
      }
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

app.on("window-all-closed", () => {
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
