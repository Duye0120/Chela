import type { ConfirmationResponse } from "../../shared/agent-events.js";
import type {
  PendingApprovalGroup,
  PendingApprovalNotice,
  InterruptedApprovalGroup,
  InterruptedApprovalNotice,
} from "../../shared/contracts.js";
import { buildInterruptedApprovalRecoveryPrompt } from "../../shared/interrupted-approval-recovery.js";
import { harnessRuntime } from "./singleton.js";
import { appendRunRecoveryRequestedEvent } from "../session/service.js";

export function listPendingApprovalGroups(
  sessionId?: string,
): PendingApprovalGroup[] {
  const pendingApprovals = harnessRuntime
    .getPendingApprovals(sessionId)
    .flatMap((run) => {
      if (!run.pendingApproval) {
        return [];
      }

      return [
        {
          sessionId: run.sessionId,
          runId: run.runId,
          ownerId: run.ownerId,
          modelEntryId: run.modelEntryId ?? null,
          runKind: run.runKind ?? null,
          runSource: run.runSource ?? null,
          lane: run.lane ?? null,
          state: run.state ?? null,
          startedAt: run.startedAt ?? null,
          currentStepId: run.currentStepId ?? null,
          approval: run.pendingApproval,
        } satisfies PendingApprovalNotice,
      ];
    })
    .sort((left, right) => right.approval.createdAt - left.approval.createdAt);

  const grouped = new Map<string, PendingApprovalGroup>();

  for (const approval of pendingApprovals) {
    const key = `${approval.sessionId}::${approval.ownerId}`;
    const existing = grouped.get(key);

    if (existing) {
      existing.count += 1;
      existing.latestCreatedAt = Math.max(
        existing.latestCreatedAt,
        approval.approval.createdAt,
      );
      existing.approvals.push(approval);
      existing.approvals.sort(
        (left, right) => right.approval.createdAt - left.approval.createdAt,
      );
      continue;
    }

    grouped.set(key, {
      sessionId: approval.sessionId,
      ownerId: approval.ownerId,
      count: 1,
      latestCreatedAt: approval.approval.createdAt,
      approvals: [approval],
    });
  }

  return [...grouped.values()].sort(
    (left, right) => right.latestCreatedAt - left.latestCreatedAt,
  );
}

export function listInterruptedApprovals(
  sessionId?: string,
): InterruptedApprovalNotice[] {
  return harnessRuntime
    .getInterruptedApprovals(sessionId)
    .map((record) => {
      const noticeWithoutPrompt = {
        sessionId: record.sessionId,
        runId: record.runId,
        ownerId: record.ownerId,
        modelEntryId: record.modelEntryId ?? null,
        runKind: record.runKind ?? null,
        runSource: record.runSource ?? null,
        lane: record.lane ?? null,
        state: record.state ?? null,
        startedAt: record.startedAt ?? null,
        currentStepId: record.currentStepId ?? null,
        canResume: record.canResume ?? true,
        recoveryStatus: record.recoveryStatus ?? "interrupted",
        interruptedAt: record.interruptedAt,
        approval: record.approval,
      } satisfies Omit<InterruptedApprovalNotice, "recoveryPrompt">;

      return {
        ...noticeWithoutPrompt,
        recoveryPrompt: buildInterruptedApprovalRecoveryPrompt(
          noticeWithoutPrompt,
        ),
      };
    })
    .sort((left, right) => right.interruptedAt - left.interruptedAt);
}

export function listInterruptedApprovalGroups(
  sessionId?: string,
): InterruptedApprovalGroup[] {
  const approvals = listInterruptedApprovals(sessionId);
  const grouped = new Map<string, InterruptedApprovalGroup>();

  for (const approval of approvals) {
    const key = `${approval.sessionId}::${approval.ownerId}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.count += 1;
      existing.latestInterruptedAt = Math.max(
        existing.latestInterruptedAt,
        approval.interruptedAt,
      );
      existing.approvals.push(approval);
      existing.approvals.sort(
        (left, right) => right.interruptedAt - left.interruptedAt,
      );
      continue;
    }

    grouped.set(key, {
      sessionId: approval.sessionId,
      ownerId: approval.ownerId,
      count: 1,
      latestInterruptedAt: approval.interruptedAt,
      approvals: [approval],
    });
  }

  return [...grouped.values()].sort(
    (left, right) => right.latestInterruptedAt - left.latestInterruptedAt,
  );
}

export function dismissInterruptedApproval(runId: string): boolean {
  return harnessRuntime.dismissInterruptedApproval(runId);
}

export function resumeInterruptedApproval(runId: string): string {
  const approval = harnessRuntime
    .getInterruptedApprovals()
    .find((record) => record.runId === runId);
  const resumedRunId = harnessRuntime.resumeInterruptedRun(runId);
  if (approval) {
    appendRunRecoveryRequestedEvent({
      sessionId: approval.sessionId,
      runId: approval.runId,
      resumedRunId,
      recoveryPrompt: buildInterruptedApprovalRecoveryPrompt(approval),
      source: "interrupted_approval",
    });
  }
  return resumedRunId;
}

export function resolveApprovalResponse(
  response: ConfirmationResponse,
): boolean {
  return harnessRuntime.resolvePendingApproval(response);
}
