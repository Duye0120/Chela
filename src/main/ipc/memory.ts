import { IPC_CHANNELS } from "../../shared/ipc.ts";
import { getChelaMemoryService } from "../memory/rag-service.ts";
import { getMemorySyncStats } from "../memory/service.ts";
import { handleIpc } from "./handle.ts";
import {
  validateMemoryAddPayload,
  validateMemoryFeedbackDeltaPayload,
  validateMemoryIdPayload,
  validateMemoryListPayload,
  validateMemorySearchLimitPayload,
  validateMemorySearchQueryPayload,
} from "./schema.ts";

export function registerMemoryIpc(): void {
  const memoryService = getChelaMemoryService();

  handleIpc(IPC_CHANNELS.memoryAdd, async (_event, input) =>
    memoryService.add(validateMemoryAddPayload(input)),
  );
  handleIpc(IPC_CHANNELS.memorySearch, async (_event, query: string, limit?: number) =>
    memoryService.search(
      validateMemorySearchQueryPayload(query),
      validateMemorySearchLimitPayload(limit),
    ),
  );
  handleIpc(IPC_CHANNELS.memoryList, async (_event, input) =>
    memoryService.list(validateMemoryListPayload(input)),
  );
  handleIpc(IPC_CHANNELS.memoryGetStats, async () => {
    const stats = await memoryService.getStats();
    return {
      ...stats,
      vectorMemoryCount: stats.totalMemories,
      ...getMemorySyncStats(stats),
    };
  });
  handleIpc(IPC_CHANNELS.memoryRebuild, async () =>
    memoryService.rebuild(),
  );
  handleIpc(IPC_CHANNELS.memoryDelete, async (_event, memoryId: number) =>
    memoryService.delete(
      validateMemoryIdPayload(IPC_CHANNELS.memoryDelete, memoryId),
    ),
  );
  handleIpc(IPC_CHANNELS.memoryFeedback, async (_event, memoryId: number, delta: number) =>
    memoryService.feedback(
      validateMemoryIdPayload(IPC_CHANNELS.memoryFeedback, memoryId),
      validateMemoryFeedbackDeltaPayload(delta),
    ),
  );
}
