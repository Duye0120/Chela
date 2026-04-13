import { IPC_CHANNELS } from "../../shared/ipc.js";
import { handleIpc } from "./handle.js";
import { getSettings, updateSettings } from "../settings.js";
import { getDiagnosticLogSnapshot, openDiagnosticLogFolder } from "../logger.js";

export function registerSettingsIpc(): void {
  handleIpc(IPC_CHANNELS.settingsGet, async () => getSettings());
  handleIpc(IPC_CHANNELS.settingsUpdate, async (_event, partial) =>
    updateSettings(partial),
  );
  handleIpc(IPC_CHANNELS.settingsGetLogSnapshot, async () =>
    getDiagnosticLogSnapshot(),
  );
  handleIpc(IPC_CHANNELS.settingsOpenLogFolder, async (_event, logId) =>
    openDiagnosticLogFolder(logId),
  );
}
