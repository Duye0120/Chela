import { IPC_CHANNELS } from "../../shared/ipc.ts";
import { handleIpc } from "./handle.ts";
import { getSettings, updateSettings } from "../settings.ts";
import { getDiagnosticLogSnapshot, openDiagnosticLogFolder } from "../logger.ts";
import { validateSettingsUpdatePayload } from "./schema.ts";

export function registerSettingsIpc(): void {
  handleIpc(IPC_CHANNELS.settingsGet, async () => getSettings());
  handleIpc(IPC_CHANNELS.settingsUpdate, async (_event, partial) =>
    updateSettings(validateSettingsUpdatePayload(partial)),
  );
  handleIpc(IPC_CHANNELS.settingsGetLogSnapshot, async () =>
    getDiagnosticLogSnapshot(),
  );
  handleIpc(IPC_CHANNELS.settingsOpenLogFolder, async (_event, logId) =>
    openDiagnosticLogFolder(logId),
  );
}
