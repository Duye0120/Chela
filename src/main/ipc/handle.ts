import { ipcMain, type IpcMainInvokeEvent } from "electron";
import { appLogger, summarizeIpcArgs } from "../logger.js";

export function handleIpc(
  channel: string,
  handler: (event: IpcMainInvokeEvent, ...args: any[]) => Promise<unknown> | unknown,
): void {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return await handler(event, ...args);
    } catch (error) {
      appLogger.error({
        scope: "ipc",
        message: "IPC 调用失败",
        data: {
          channel,
          args: summarizeIpcArgs(args),
        },
        error,
      });
      throw error;
    }
  });
}
