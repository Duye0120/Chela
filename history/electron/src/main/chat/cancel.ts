import { cancelAgent, getHandle } from "../agent.ts";
import { harnessRuntime } from "../harness/singleton.ts";
import type { HarnessRunScope } from "../harness/types.ts";

const cancellingRunIds = new Set<string>();

export async function cancelChatRun(scope: HarnessRunScope): Promise<void> {
  if (cancellingRunIds.has(scope.runId)) {
    return;
  }

  cancellingRunIds.add(scope.runId);
  setTimeout(() => {
    cancellingRunIds.delete(scope.runId);
  }, 30_000).unref?.();

  const activeHandle = harnessRuntime.getHandle(scope);
  try {
    const activeRun = harnessRuntime.requestCancel(scope);
    if (activeRun) {
      return;
    }

    const handle = getHandle(scope.sessionId);
    if (handle && handle.activeRunId === scope.runId) {
      cancelAgent(handle);
    }
  } finally {
    if (activeHandle) {
      cancelAgent(activeHandle);
    }
  }
}
