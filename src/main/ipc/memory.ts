import { IPC_CHANNELS } from "../../shared/ipc.js";
import { getChelaMemoryService } from "../memory/rag-service.js";
import { handleIpc } from "./handle.js";

export function registerMemoryIpc(): void {
  const memoryService = getChelaMemoryService();

  handleIpc(IPC_CHANNELS.memoryAdd, async (_event, input) =>
    memoryService.add(input),
  );
  handleIpc(IPC_CHANNELS.memorySearch, async (_event, query: string, limit?: number) =>
    memoryService.search(query, limit),
  );
  handleIpc(IPC_CHANNELS.memoryGetStats, async () =>
    memoryService.getStats(),
  );
  handleIpc(IPC_CHANNELS.memoryRebuild, async () =>
    memoryService.rebuild(),
  );
}
