import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { getPersistedSnapshot } from "../session/service.ts";
import {
  ensureContextSnapshotCoverage,
  getRequiredCompactedUntilSeq,
} from "./snapshot.ts";
import { createBudgetedMessageTransform } from "./budget-transform.ts";

export function createTransformContext(
  sessionId: string,
  contextWindow: number | null,
): (messages: AgentMessage[], signal?: AbortSignal) => Promise<AgentMessage[]> {
  return createBudgetedMessageTransform(contextWindow, async () => {
    const requiredCompactedUntilSeq = getRequiredCompactedUntilSeq(sessionId);
    const snapshot = getPersistedSnapshot(sessionId);
    if (requiredCompactedUntilSeq > snapshot.compactedUntilSeq) {
      await ensureContextSnapshotCoverage(sessionId);
    }
  });
}
