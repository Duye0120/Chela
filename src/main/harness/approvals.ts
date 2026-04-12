import type { ConfirmationResponse } from "../../shared/agent-events.js";
import type { InterruptedApprovalNotice } from "../../shared/contracts.js";
import { harnessRuntime } from "./singleton.js";

export function listInterruptedApprovals(
  sessionId?: string,
): InterruptedApprovalNotice[] {
  return harnessRuntime.getInterruptedApprovals(sessionId).map((record) => ({
    sessionId: record.sessionId,
    runId: record.runId,
    ownerId: record.ownerId,
    interruptedAt: record.interruptedAt,
    approval: record.approval,
  }));
}

export function dismissInterruptedApproval(runId: string): boolean {
  return harnessRuntime.dismissInterruptedApproval(runId);
}

export function resolveApprovalResponse(
  response: ConfirmationResponse,
): boolean {
  return harnessRuntime.resolvePendingApproval(response);
}
