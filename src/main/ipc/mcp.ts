import { shell } from "electron";
import fs from "node:fs";
import { IPC_CHANNELS } from "../../shared/ipc.js";
import {
  disconnectMcpServerForActiveHandles,
  listMcpServerStatuses,
  reloadMcpConfigForActiveHandles,
  restartMcpServerForActiveHandles,
} from "../agent.js";
import { getSettings } from "../settings.js";
import { deleteMcpServerConfig, getMcpConfigPath, saveMcpServerConfig } from "../../mcp/config.js";
import { handleIpc } from "./handle.js";
import { validateMcpServerConfigDraftPayload, validateServerNamePayload } from "./schema.js";

async function openMcpConfig(): Promise<void> {
  const configPath = getMcpConfigPath(getSettings().workspace);
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, JSON.stringify({ mcpServers: {} }, null, 2), "utf-8");
  }
  const result = await shell.openPath(configPath);
  if (result) {
    throw new Error(result);
  }
}

export function registerMcpIpc(): void {
  handleIpc(IPC_CHANNELS.mcpListStatus, async () => listMcpServerStatuses());
  handleIpc(IPC_CHANNELS.mcpReloadConfig, async () =>
    reloadMcpConfigForActiveHandles(),
  );
  handleIpc(IPC_CHANNELS.mcpRestartServer, async (_event, serverName: string) =>
    restartMcpServerForActiveHandles(
      validateServerNamePayload(IPC_CHANNELS.mcpRestartServer, serverName),
    ),
  );
  handleIpc(IPC_CHANNELS.mcpDisconnectServer, async (_event, serverName: string) =>
    disconnectMcpServerForActiveHandles(
      validateServerNamePayload(IPC_CHANNELS.mcpDisconnectServer, serverName),
    ),
  );
  handleIpc(IPC_CHANNELS.mcpOpenConfig, async () => openMcpConfig());
  handleIpc(IPC_CHANNELS.mcpSaveServer, async (_event, draft: unknown) => {
    saveMcpServerConfig(getSettings().workspace, validateMcpServerConfigDraftPayload(draft));
    return reloadMcpConfigForActiveHandles();
  });
  handleIpc(IPC_CHANNELS.mcpDeleteServer, async (_event, serverName: string) => {
    deleteMcpServerConfig(
      getSettings().workspace,
      validateServerNamePayload(IPC_CHANNELS.mcpDeleteServer, serverName),
    );
    return reloadMcpConfigForActiveHandles();
  });
}
