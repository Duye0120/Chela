import { ipcMain, type IpcMainInvokeEvent } from "electron";
import { IPC_ERROR_MESSAGE_PREFIX, type IpcErrorPayload } from "../../shared/ipc.js";
import { appLogger, summarizeIpcArgs } from "../logger.js";

function isIpcErrorPayload(value: unknown): value is IpcErrorPayload {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).code === "string" &&
    typeof (value as Record<string, unknown>).message === "string"
  );
}

function normalizeIpcError(error: unknown): IpcErrorPayload {
  if (isIpcErrorPayload(error)) {
    return error;
  }

  if (error instanceof Error) {
    return { code: "INTERNAL_ERROR", message: error.message };
  }

  if (typeof error === "string" && error.trim()) {
    return { code: "INTERNAL_ERROR", message: error.trim() };
  }

  return { code: "INTERNAL_ERROR", message: "操作失败，请稍后重试。" };
}

function createEncodedIpcError(payload: IpcErrorPayload): Error {
  return new Error(`${IPC_ERROR_MESSAGE_PREFIX}${JSON.stringify(payload)}`);
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
      throw createEncodedIpcError({
        code: "FORBIDDEN_IPC_SENDER",
        message: "不允许的 IPC 调用来源。",
      });
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
      throw createEncodedIpcError(normalizeIpcError(error));
    }
  });
}
