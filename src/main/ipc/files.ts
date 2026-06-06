import { IPC_CHANNELS } from "../../shared/ipc.ts";
import {
  pickFiles,
  readFilePreview,
  readImageDataUrl,
  saveClipboardFile,
} from "../files.ts";
import { requireMainWindow } from "../window.ts";
import { handleIpc } from "./handle.ts";

export function registerFilesIpc(): void {
  handleIpc(IPC_CHANNELS.filesPick, async () =>
    pickFiles(requireMainWindow()),
  );
  handleIpc(
    IPC_CHANNELS.filesReadPreview,
    async (_event, filePath: string) => readFilePreview(filePath),
  );
  handleIpc(
    IPC_CHANNELS.filesReadImageDataUrl,
    async (_event, filePath: string) => readImageDataUrl(filePath),
  );
  handleIpc(IPC_CHANNELS.filesSaveFromClipboard, async (_event, payload) =>
    saveClipboardFile(payload),
  );
}
