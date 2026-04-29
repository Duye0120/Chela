import { app, shell } from "electron";
import fs from "node:fs";
import path from "node:path";
import { IPC_CHANNELS } from "../../shared/ipc.js";
import {
  findPluginStatus,
  listPluginStatuses,
  setPluginEnabled,
} from "../plugins/service.js";
import { getSettings } from "../settings.js";
import { handleIpc } from "./handle.js";
import { validatePluginEnabledPayload, validatePluginIdPayload } from "./schema.js";

function resolvePluginStatusPaths() {
  const settings = getSettings();
  return {
    rootDir: path.join(settings.workspace, ".agents", "plugins"),
    statePath: path.join(app.getPath("userData"), "data", "plugin-state.json"),
  };
}

async function openPath(targetPath: string): Promise<void> {
  const result = await shell.openPath(targetPath);
  if (result) {
    throw new Error(result);
  }
}

export function registerPluginsIpc(): void {
  handleIpc(IPC_CHANNELS.pluginsListStatus, async () =>
    listPluginStatuses(resolvePluginStatusPaths()),
  );
  handleIpc(
    IPC_CHANNELS.pluginsSetEnabled,
    async (_event, pluginId: string, enabled: boolean) =>
      setPluginEnabled({
        ...resolvePluginStatusPaths(),
        pluginId: validatePluginIdPayload(IPC_CHANNELS.pluginsSetEnabled, pluginId),
        enabled: validatePluginEnabledPayload(enabled),
      }),
  );
  handleIpc(IPC_CHANNELS.pluginsOpenRootDirectory, async () => {
    const { rootDir } = resolvePluginStatusPaths();
    fs.mkdirSync(rootDir, { recursive: true });
    await openPath(rootDir);
  });
  handleIpc(
    IPC_CHANNELS.pluginsOpenDirectory,
    async (_event, pluginId: string) => {
      const input = resolvePluginStatusPaths();
      const plugin = findPluginStatus(
        input,
        validatePluginIdPayload(IPC_CHANNELS.pluginsOpenDirectory, pluginId),
      );
      if (!fs.existsSync(plugin.directory)) {
        throw new Error(`插件目录不存在：${plugin.directory}`);
      }
      await openPath(plugin.directory);
    },
  );
  handleIpc(
    IPC_CHANNELS.pluginsOpenManifest,
    async (_event, pluginId: string) => {
      const input = resolvePluginStatusPaths();
      const plugin = findPluginStatus(
        input,
        validatePluginIdPayload(IPC_CHANNELS.pluginsOpenManifest, pluginId),
      );
      if (!fs.existsSync(plugin.manifestPath)) {
        throw new Error(`插件 manifest 不存在：${plugin.manifestPath}`);
      }
      await openPath(plugin.manifestPath);
    },
  );
}

