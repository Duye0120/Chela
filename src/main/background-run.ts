import { randomUUID } from "node:crypto";
import type { RunKind, RunSource } from "../shared/contracts.ts";
import { buildSystemOwnerId } from "./agent-owners.ts";
import { harnessRuntime } from "./harness/singleton.ts";
import {
  appendRunFinishedEvent,
  appendRunStartedEvent,
} from "./session/service.ts";

type ScheduledRunScope = {
  sessionId: string;
  runId: string;
};

type ExecuteScheduledRunInput<T> = {
  sessionId: string;
  lane: "foreground" | "background";
  runKind: RunKind;
  runSource: RunSource;
  modelEntryId: string;
  thinkingLevel: string;
  ownerId?: string;
  runIdPrefix?: string;
  metadata?: Record<string, unknown>;
  execute: (context: {
    runScope: ScheduledRunScope;
    lane: "foreground" | "background";
    runKind: RunKind;
    runSource: RunSource;
    ownerId: string;
  }) => Promise<T>;
};

type ExecuteBackgroundRunInput<T> = {
  sessionId: string;
  runKind: Extract<RunKind, "compact" | "system" | "memory_refresh" | "subagent">;
  modelEntryId: string;
  thinkingLevel: string;
  ownerId?: string;
  runIdPrefix?: string;
  metadata?: Record<string, unknown>;
  execute: (runScope: ScheduledRunScope) => Promise<T>;
};

export async function executeScheduledRun<T>(
  input: ExecuteScheduledRunInput<T>,
): Promise<T> {
  const ownerId = input.ownerId ?? buildSystemOwnerId(input.runKind);
  const runId = `${input.runIdPrefix ?? input.runKind}-${randomUUID()}`;
  const runScope = {
    sessionId: input.sessionId,
    runId,
  };

  harnessRuntime.createRun({
    ...runScope,
    ownerId,
    modelEntryId: input.modelEntryId,
    runKind: input.runKind,
    runSource: input.runSource,
    lane: input.lane,
    metadata: input.metadata,
  });

  let finalState: "completed" | "failed" = "failed";
  let failure: unknown;
  let failureReason: string | undefined;
  try {
    appendRunStartedEvent({
      sessionId: input.sessionId,
      runId,
      ownerId,
      runKind: input.runKind,
      modelEntryId: input.modelEntryId,
      thinkingLevel: input.thinkingLevel,
      metadata: input.metadata,
    });
    const result = await input.execute({
      runScope,
      lane: input.lane,
      runKind: input.runKind,
      runSource: input.runSource,
      ownerId,
    });
    appendRunFinishedEvent({
      sessionId: input.sessionId,
      runId,
      ownerId,
      finalState: "completed",
    });
    finalState = "completed";
    return result;
  } catch (error) {
    failure = error;
    const reason = error instanceof Error ? error.message : `${input.runKind} 失败`;
    failureReason = reason;
    try {
      appendRunFinishedEvent({
        sessionId: input.sessionId,
        runId,
        ownerId,
        finalState: "failed",
        reason,
      });
    } catch (persistenceError) {
      failure = new AggregateError([error, persistenceError], reason, { cause: error });
    }
    throw failure;
  } finally {
    try {
      harnessRuntime.finishRun(runScope, finalState, {
        reason: failureReason,
      });
    } catch (finishError) {
      if (finalState === "failed") {
        throw new AggregateError(
          [failure, finishError],
          `${input.runKind} 失败且运行清理失败`,
          { cause: failure },
        );
      }
      throw finishError;
    }
  }
}

export async function executeBackgroundRun<T>(
  input: ExecuteBackgroundRunInput<T>,
): Promise<T> {
  return executeScheduledRun({
    ...input,
    lane: "background",
    runSource: "system",
    execute: async ({ runScope }) => input.execute(runScope),
  });
}
