import { cancelAgent, getHandle } from "../agent.js";
import { harnessRuntime } from "../harness/singleton.js";
import type { HarnessRunScope } from "../harness/types.js";

export async function cancelChatRun(scope: HarnessRunScope): Promise<void> {
  const activeRun = harnessRuntime.requestCancel(scope);
  const activeHandle = harnessRuntime.getHandle(scope);
  if (activeRun) {
    if (activeHandle) {
      cancelAgent(activeHandle);
    }
    return;
  }

  const handle = getHandle(scope.sessionId);
  if (handle && handle.activeRunId === scope.runId) {
    cancelAgent(handle);
  }
}
