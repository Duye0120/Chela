import { IPC_CHANNELS } from "../../shared/ipc.js";
import { getRuntimeDiagnosticsReport } from "../bootstrap/services.js";
import { handleIpc } from "./handle.js";

export function registerRuntimeIpc(): void {
  handleIpc(IPC_CHANNELS.runtimeGetDiagnostics, async () =>
    getRuntimeDiagnosticsReport(),
  );
}
