import { ipcMain, type IpcMainInvokeEvent } from "electron";
import { appLogger, summarizeIpcArgs } from "../logger.js";

function normalizeIpcError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  if (typeof error === "string" && error.trim()) {
    return new Error(error.trim());
  }

  return new Error("操作失败，请稍后重试。");
}

// M21: sender frame 校验 — 只接受主 frame（顶层文档）发出的 IPC，
// 避免被嵌套 iframe / 子 frame 通过 contextBridge 重放调用。
function isTrustedSender(event: IpcMainInvokeEvent): boolean {
  try {
    const frame = event.senderFrame;
    if (!frame) return false;
    // 顶层 frame 的 parent 为 null
    return frame.parent === null;
  } catch {
    return false;
  }
}

export function handleIpc(
  channel: string,
  handler: (event: IpcMainInvokeEvent, ...args: any[]) => Promise<unknown> | unknown,
): void {
  ipcMain.handle(channel, async (event, ...args) => {
    if (!isTrustedSender(event)) {
      appLogger.warn({
        scope: "ipc",
        message: "拒绝来自非主 frame 的 IPC 调用",
        data: { channel },
      });
      throw new Error("不允许的 IPC 调用来源。");
    }

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
      throw normalizeIpcError(error);
    }
  });
}
