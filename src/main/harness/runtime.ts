import type { AgentHandle } from "../agent.ts";
import type { ConfirmationResponse } from "../../shared/agent-events.ts";
import type { RunKind, RunSource } from "../../shared/contracts.ts";
import { PRIMARY_AGENT_OWNER, buildSystemOwnerId } from "../agent-owners.ts";
import {
  loadInterruptedApprovals,
  saveInterruptedApprovals,
} from "./approvals-store.ts";
import { appendHarnessAuditEvent } from "./audit.ts";
import { loadPersistedHarnessRuns, savePersistedHarnessRuns } from "./store.ts";
import { BUS_EVENTS, bus } from "../event-bus.ts";
import type {
  HarnessApprovalResolution,
  HarnessApprovalSource,
  HarnessAuditEvent,
  HarnessRunLane,
  HarnessPendingApproval,
  HarnessPolicyEvaluation,
  HarnessRunScope,
  HarnessRunSnapshot,
  HarnessRunState,
  InterruptedApprovalRecord,
} from "./types.ts";

type ActiveHarnessRun = HarnessRunSnapshot & {
  handle: AgentHandle | null;
};

type CreateRunInput = HarnessRunScope & {
  ownerId?: string;
  modelEntryId: string;
  runKind: RunKind;
  runSource?: RunSource;
  lane?: HarnessRunLane;
  metadata?: Record<string, unknown>;
};

type PendingApprovalWaiter = {
  scope: HarnessRunScope;
  promise: Promise<HarnessApprovalResolution>;
  resolve: (resolution: HarnessApprovalResolution) => void;
  settled: boolean;
};

type FinishRunOptions = {
  reason?: string;
  metadata?: Record<string, unknown>;
};

type PendingResumedRun = {
  sessionId: string;
  metadata: Record<string, unknown>;
};

export class HarnessRunCancelledError extends Error {
  constructor() {
    super("Harness run cancelled.");
    this.name = "HarnessRunCancelledError";
  }
}

export class HarnessRuntime {
  private readonly activeForegroundRunsBySession = new Map<string, ActiveHarnessRun>();
  private readonly activeRunsById = new Map<string, ActiveHarnessRun>();
  private readonly approvalWaitersByRequestId = new Map<string, PendingApprovalWaiter>();
  private readonly interruptedApprovals: InterruptedApprovalRecord[] = [];
  private readonly pendingResumedRunsById = new Map<string, PendingResumedRun>();
  private hydrated = false;

  /** 返回因应用重启而中断的待确认记录。 */
  getInterruptedApprovals(sessionId?: string): InterruptedApprovalRecord[] {
    if (sessionId) {
      return this.interruptedApprovals.filter((r) => r.sessionId === sessionId);
    }
    return [...this.interruptedApprovals];
  }

  getPendingApprovals(sessionId?: string): HarnessRunSnapshot[] {
    const pendingRuns = [...this.activeRunsById.values()]
      .filter((run) => run.pendingApproval)
      .map((run) => this.toSnapshot(run));

    if (sessionId) {
      return pendingRuns.filter((run) => run.sessionId === sessionId);
    }

    return pendingRuns;
  }

  /** 确认已知晓某条中断记录（从列表中移除）。 */
  dismissInterruptedApproval(runId: string): boolean {
    const idx = this.interruptedApprovals.findIndex((r) => r.runId === runId);
    if (idx >= 0) {
      this.interruptedApprovals.splice(idx, 1);
      this.persistInterruptedApprovals();
      return true;
    }
    return false;
  }

  resumeInterruptedRun(interruptedRunId: string): string {
    const interruptedApproval = this.interruptedApprovals.find(
      (record) => record.runId === interruptedRunId,
    );
    if (!interruptedApproval) {
      throw new Error("找不到对应的中断审批记录。");
    }
    if (!interruptedApproval.canResume) {
      throw new Error("当前中断审批不支持恢复执行。");
    }

    const resumedRunId = crypto.randomUUID();
    this.pendingResumedRunsById.set(resumedRunId, {
      sessionId: interruptedApproval.sessionId,
      metadata: {
        resumedFromRunId: interruptedApproval.runId,
        resumedFromOwnerId: interruptedApproval.ownerId,
        resumedFromModelEntryId: interruptedApproval.modelEntryId ?? null,
        resumedFromRunKind: interruptedApproval.runKind ?? null,
        resumedFromRunSource: interruptedApproval.runSource ?? null,
        resumedFromLane: interruptedApproval.lane ?? null,
        resumedFromState: interruptedApproval.state ?? null,
        resumedFromStartedAt: interruptedApproval.startedAt ?? null,
        resumedFromCurrentStepId: interruptedApproval.currentStepId ?? null,
        resumedFromApprovalRequestId: interruptedApproval.approval.requestId,
        resumedFromApprovalKind: interruptedApproval.approval.kind,
        resumedFromApprovalPayloadHash: interruptedApproval.approval.payloadHash,
        resumedFromApprovalTitle: interruptedApproval.approval.title,
        resumedFromApprovalDescription: interruptedApproval.approval.description,
        resumedFromApprovalReason: interruptedApproval.approval.reason,
        resumedFromApprovalDetail: interruptedApproval.approval.detail ?? null,
        resumedFromApprovalCreatedAt: interruptedApproval.approval.createdAt,
        resumedFromInterruptedAt: interruptedApproval.interruptedAt,
        resumedFromRecoveryStatus:
          interruptedApproval.recoveryStatus ?? "interrupted",
      },
    });

    return resumedRunId;
  }

  discardPendingResume(resumedRunId: string): void {
    this.pendingResumedRunsById.delete(resumedRunId);
  }

  hydrateFromDisk(recoverRuns: (runs: HarnessRunSnapshot[]) => HarnessRunSnapshot[]): HarnessRunSnapshot[] {
    if (this.hydrated) {
      return [];
    }

    const persistedRuns = loadPersistedHarnessRuns();
    if (persistedRuns.length === 0) {
      this.restoreInterruptedApprovalsFromStore();
      this.hydrated = true;
      return [];
    }

    this.restoreInterruptedApprovalsFromStore();
    const recoveredRuns = recoverRuns(persistedRuns);
    const now = Date.now();

    for (const run of recoveredRuns) {
      const wasAwaitingConfirmation = run.state === "awaiting_confirmation";
      const finalState = wasAwaitingConfirmation ? "aborted" : "failed";
      const action: HarnessAuditEvent["action"] = wasAwaitingConfirmation
        ? "run_aborted"
        : "run_failed";
      const reason = wasAwaitingConfirmation
        ? "应用重启中断了待确认操作。"
        : "应用启动时发现未完成 run，已标记为失败。";

      if (wasAwaitingConfirmation && run.pendingApproval) {
        const record = {
          sessionId: run.sessionId,
          runId: run.runId,
          ownerId: run.ownerId,
          modelEntryId: run.modelEntryId,
          runKind: run.runKind,
          runSource: run.runSource,
          lane: run.lane,
          state: run.state,
          startedAt: run.startedAt,
          currentStepId: run.currentStepId,
          canResume: true,
          recoveryStatus: "interrupted",
          approval: run.pendingApproval,
          interruptedAt: now,
        } satisfies InterruptedApprovalRecord;
        this.upsertInterruptedApproval(record);
      }

      this.audit({
        runId: run.runId,
        sessionId: run.sessionId,
        action,
        timestamp: now,
        state: finalState,
        reason,
        metadata: {
          recoveredFromDisk: true,
          previousState: run.state,
          startedAt: run.startedAt,
          endedAt: run.endedAt,
          pendingApproval: run.pendingApproval,
        },
      });
    }

    savePersistedHarnessRuns([]);
    this.hydrated = true;
    return recoveredRuns;
  }

  getActiveRunBySession(sessionId: string): HarnessRunSnapshot | null {
    const run = this.activeForegroundRunsBySession.get(sessionId);
    return run ? this.toSnapshot(run) : null;
  }

  createRun(input: CreateRunInput): HarnessRunSnapshot {
    if (this.activeRunsById.has(input.runId)) {
      throw new Error("运行 ID 已被占用。");
    }
    const pendingResumedRun = this.pendingResumedRunsById.get(input.runId);
    if (
      pendingResumedRun &&
      pendingResumedRun.sessionId !== input.sessionId
    ) {
      this.pendingResumedRunsById.delete(input.runId);
      throw new Error("恢复 run 的 session 不匹配。");
    }

    const lane = input.lane ?? "foreground";
    const previousRun = lane === "foreground"
      ? this.activeForegroundRunsBySession.get(input.sessionId)
      : undefined;
    const ownerId =
      input.ownerId ??
      (lane === "foreground" ? PRIMARY_AGENT_OWNER : buildSystemOwnerId(input.runKind));
    if (lane === "foreground") {
      const existing = this.activeForegroundRunsBySession.get(input.sessionId);
      if (existing && !existing.cancelled) {
        throw new Error("当前线程仍在生成中，请先停止当前回复。");
      }
      if (existing?.cancelled) {
        this.activeRunsById.delete(existing.runId);
      }
    }

    const run: ActiveHarnessRun = {
      requestId: crypto.randomUUID(),
      runId: input.runId,
      sessionId: input.sessionId,
      ownerId,
      modelEntryId: input.modelEntryId,
      runKind: input.runKind,
      runSource: input.runSource ?? (lane === "foreground" ? "user" : "system"),
      lane,
      state: "running",
      startedAt: Date.now(),
      cancelled: false,
      metadata: pendingResumedRun
        ? {
            ...pendingResumedRun.metadata,
            ...(input.metadata ?? {}),
          }
        : input.metadata,
      handle: null,
    };
    if (run.lane === "foreground") {
      this.activeForegroundRunsBySession.set(run.sessionId, run);
    }
    this.activeRunsById.set(run.runId, run);
    try {
      this.persistActiveRuns();
      this.audit({
        runId: run.runId,
        sessionId: run.sessionId,
        action: "run_created",
        timestamp: run.startedAt,
        state: run.state,
        metadata: {
          modelEntryId: run.modelEntryId,
          requestId: run.requestId,
          ownerId: run.ownerId,
          runKind: run.runKind,
          runSource: run.runSource,
          lane: run.lane,
          ...run.metadata,
        },
      });
    } catch (error) {
      this.activeRunsById.delete(run.runId);
      if (run.lane === "foreground") {
        if (previousRun) {
          this.activeRunsById.set(previousRun.runId, previousRun);
          this.activeForegroundRunsBySession.set(run.sessionId, previousRun);
        } else {
          this.activeForegroundRunsBySession.delete(run.sessionId);
        }
      }
      try {
        this.persistActiveRuns();
      } catch (rollbackError) {
        throw new AggregateError([error, rollbackError], "运行创建失败且快照回滚失败。", { cause: error });
      }
      throw error;
    }
    if (pendingResumedRun) {
      this.pendingResumedRunsById.delete(input.runId);
    }

    bus.emit(BUS_EVENTS.RUN_CREATED, {
      sessionId: run.sessionId,
      runId: run.runId,
      modelEntryId: run.modelEntryId,
      runKind: run.runKind,
      lane: run.lane,
    });

    bus.emit(BUS_EVENTS.RUN_STARTED, {
      sessionId: run.sessionId,
      runId: run.runId,
      modelEntryId: run.modelEntryId,
    });

    return this.toSnapshot(run);
  }

  attachHandle(scope: HarnessRunScope, handle: AgentHandle): void {
    const run = this.getActiveRun(scope);
    if (!run) {
      return;
    }

    run.handle = handle;
  }

  getHandle(scope: HarnessRunScope): AgentHandle | null {
    return this.getActiveRun(scope)?.handle ?? null;
  }

  assertRunActive(scope: HarnessRunScope): HarnessRunSnapshot {
    const run = this.getActiveRun(scope);
    if (!run || run.cancelled) {
      throw new HarnessRunCancelledError();
    }

    return this.toSnapshot(run);
  }

  isCancelRequested(scope: HarnessRunScope): boolean {
    const run = this.getActiveRun(scope);
    return !!run?.cancelled;
  }

  requestCancel(scope: HarnessRunScope): HarnessRunSnapshot | null {
    const run = this.getActiveRun(scope);
    if (!run) {
      return null;
    }

    if (!run.cancelled) {
      run.cancelled = true;
      const errors: unknown[] = [];
      for (const cancel of [
        () => this.rejectPendingApprovals(scope),
        () => this.persistActiveRuns(),
        () => this.audit({
          runId: run.runId,
          sessionId: run.sessionId,
          action: "run_cancel_requested",
          timestamp: Date.now(),
          state: run.state,
        }),
      ]) {
        try {
          cancel();
        } catch (error) {
          errors.push(error);
        }
      }

      bus.emit(BUS_EVENTS.RUN_CANCEL_REQUESTED, {
        sessionId: run.sessionId,
        runId: run.runId,
      });

      if (errors.length > 0) {
        throw new AggregateError(errors, "运行已请求取消，但持久化或审批清理失败。", { cause: errors[0] });
      }
    }

    return this.toSnapshot(run);
  }

  waitForApprovalResponse(
    scope: HarnessRunScope,
    approval: HarnessPendingApproval,
  ): Promise<HarnessApprovalResolution> {
    this.assertRunActive(scope);
    const existing = this.approvalWaitersByRequestId.get(approval.requestId);
    if (existing) {
      return existing.promise;
    }

    let resolveWaiter!: (resolution: HarnessApprovalResolution) => void;
    const promise = new Promise<HarnessApprovalResolution>((resolve) => {
      resolveWaiter = resolve;
    });

    this.approvalWaitersByRequestId.set(approval.requestId, {
      scope,
      promise,
      resolve: resolveWaiter,
      settled: false,
    });

    return promise;
  }

  resolvePendingApproval(
    response: ConfirmationResponse,
    source: HarnessApprovalSource = "renderer",
  ): boolean {
    const waiter = this.approvalWaitersByRequestId.get(response.requestId);
    if (!waiter || waiter.settled) {
      return false;
    }

    waiter.settled = true;
    this.approvalWaitersByRequestId.delete(response.requestId);
    let dismissed = false;
    try {
      this.dismissInterruptedApproval(waiter.scope.runId);
      dismissed = true;
    } finally {
      waiter.resolve({
        requestId: response.requestId,
        allowed: dismissed && response.allowed,
        respondedAt: Date.now(),
        source: dismissed ? source : "system",
        remember: dismissed ? response.remember : undefined,
      });
    }
    return true;
  }

  transitionState(
    scope: HarnessRunScope,
    nextState: Exclude<HarnessRunState, "completed" | "aborted" | "failed">,
    options?: {
      currentStepId?: string;
      pendingApproval?: HarnessPendingApproval | null;
      reason?: string;
      metadata?: Record<string, unknown>;
    },
  ): HarnessRunSnapshot | null {
    const run = this.getActiveRun(scope);
    if (!run) {
      return null;
    }

    run.state = nextState;
    run.currentStepId = options?.currentStepId ?? run.currentStepId;
    if (options?.pendingApproval === null) {
      delete run.pendingApproval;
    } else if (options?.pendingApproval) {
      run.pendingApproval = options.pendingApproval;
    }

    this.audit({
      runId: run.runId,
      sessionId: run.sessionId,
      action: "run_state_changed",
      timestamp: Date.now(),
      state: run.state,
      reason: options?.reason,
      metadata: options?.metadata,
    });
    this.persistActiveRuns();

    bus.emit(BUS_EVENTS.RUN_STATE_CHANGED, {
      sessionId: run.sessionId,
      runId: run.runId,
      state: run.state,
      reason: options?.reason,
      currentStepId: options?.currentStepId,
    });

    return this.toSnapshot(run);
  }

  finishRun(
    scope: HarnessRunScope,
    finalState: Extract<HarnessRunState, "completed" | "aborted" | "failed">,
    options?: FinishRunOptions,
  ): HarnessRunSnapshot | null {
    const run = this.getActiveRun(scope);
    if (!run) {
      return null;
    }

    run.state = finalState;
    const endedAt = Date.now();
    run.endedAt = endedAt;
    if (finalState === "aborted") {
      run.cancelled = true;
    }

    const action: HarnessAuditEvent["action"] =
      finalState === "completed"
        ? "run_completed"
        : finalState === "aborted"
          ? "run_aborted"
          : "run_failed";

    this.activeRunsById.delete(run.runId);
    if (this.activeForegroundRunsBySession.get(run.sessionId)?.requestId === run.requestId) {
      this.activeForegroundRunsBySession.delete(run.sessionId);
    }
    const errors: unknown[] = [];
    for (const finalize of [
      () => this.rejectPendingApprovals(scope),
      () => this.dismissInterruptedApproval(run.runId),
      () => this.persistActiveRuns(),
      () => this.audit({
        runId: run.runId,
        sessionId: run.sessionId,
        action,
        timestamp: endedAt,
        state: run.state,
        reason: options?.reason,
        metadata: options?.metadata,
      }),
    ]) {
      try {
        finalize();
      } catch (error) {
        errors.push(error);
      }
    }

    bus.emit(BUS_EVENTS.RUN_COMPLETED, {
      sessionId: run.sessionId,
      runId: run.runId,
      finalState,
      reason: options?.reason,
    });

    if (finalState === "aborted") {
      bus.emit(BUS_EVENTS.RUN_ABORTED, {
        sessionId: run.sessionId,
        runId: run.runId,
        reason: options?.reason,
      });
    } else if (finalState === "failed") {
      bus.emit(BUS_EVENTS.RUN_FAILED, {
        sessionId: run.sessionId,
        runId: run.runId,
        reason: options?.reason,
      });
    }

    if (errors.length > 0) {
      throw new AggregateError(errors, "运行已结束，但持久化或审批清理失败。", { cause: errors[0] });
    }
    return this.toSnapshot(run);
  }

  recordToolPolicyEvaluation(
    scope: HarnessRunScope,
    evaluation: HarnessPolicyEvaluation,
    metadata?: Record<string, unknown>,
  ): void {
    const run = this.getActiveRun(scope);
    if (!run) {
      return;
    }

    this.audit({
      runId: run.runId,
      sessionId: run.sessionId,
      action: "tool_policy_evaluated",
      timestamp: Date.now(),
      state: run.state,
      toolName: evaluation.toolName,
      decision: evaluation.decision.type,
      reason: evaluation.decision.reason,
      metadata: {
        riskLevel: evaluation.riskLevel,
        ...(evaluation.metadata ?? {}),
        ...(metadata ?? {}),
      },
    });

    bus.emit(BUS_EVENTS.TOOL_POLICY_EVALUATED, {
      sessionId: run.sessionId,
      runId: run.runId,
      toolName: evaluation.toolName,
      decision: evaluation.decision.type,
      riskLevel: evaluation.riskLevel,
    });
  }

  private rejectPendingApprovals(scope: HarnessRunScope): void {
    const errors: unknown[] = [];
    for (const [requestId, waiter] of this.approvalWaitersByRequestId) {
      if (waiter.scope.runId === scope.runId && waiter.scope.sessionId === scope.sessionId) {
        try {
          this.resolvePendingApproval({ requestId, allowed: false }, "system");
        } catch (error) {
          errors.push(error);
        }
      }
    }
    if (errors.length > 0) {
      throw new AggregateError(errors, "审批已拒绝，但中断记录清理失败。", { cause: errors[0] });
    }
  }

  private restoreInterruptedApprovalsFromStore(): void {
    const persisted = loadInterruptedApprovals();
    this.interruptedApprovals.splice(0, this.interruptedApprovals.length, ...persisted);
  }

  private persistInterruptedApprovals(): void {
    saveInterruptedApprovals(this.interruptedApprovals);
  }

  private upsertInterruptedApproval(record: InterruptedApprovalRecord): void {
    const existingIndex = this.interruptedApprovals.findIndex(
      (item) => item.runId === record.runId,
    );
    if (existingIndex >= 0) {
      this.interruptedApprovals[existingIndex] = record;
    } else {
      this.interruptedApprovals.push(record);
    }
    this.persistInterruptedApprovals();
  }

  private getActiveRun(scope: HarnessRunScope): ActiveHarnessRun | null {
    const run = this.activeRunsById.get(scope.runId);
    if (!run || run.sessionId !== scope.sessionId) {
      return null;
    }

    if (
      run.lane === "foreground" &&
      this.activeForegroundRunsBySession.get(scope.sessionId)?.requestId !== run.requestId
    ) {
      return null;
    }

    return run;
  }

  private toSnapshot(run: ActiveHarnessRun): HarnessRunSnapshot {
    return {
      requestId: run.requestId,
      runId: run.runId,
      sessionId: run.sessionId,
      ownerId: run.ownerId,
      modelEntryId: run.modelEntryId,
      runKind: run.runKind,
      runSource: run.runSource,
      lane: run.lane,
      state: run.state,
      startedAt: run.startedAt,
      endedAt: run.endedAt,
      currentStepId: run.currentStepId,
      pendingApproval: run.pendingApproval,
      cancelled: run.cancelled,
      metadata: run.metadata,
    };
  }

  private audit(event: HarnessAuditEvent): void {
    appendHarnessAuditEvent(event);
  }

  private persistActiveRuns(): void {
    const snapshots = [...this.activeRunsById.values()].map((run) =>
      this.toSnapshot(run),
    );
    savePersistedHarnessRuns(snapshots);
  }
}
