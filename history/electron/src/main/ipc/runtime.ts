import { IPC_CHANNELS } from "../../shared/ipc.ts";
import { getRuntimeDiagnosticsReport } from "../bootstrap/services.ts";
import { handleIpc } from "./handle.ts";

export function registerRuntimeIpc(): void {
  handleIpc(IPC_CHANNELS.runtimeGetDiagnostics, async () =>
    getRuntimeDiagnosticsReport(),
  );
}
