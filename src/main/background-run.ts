import { randomUUID } from "node:crypto";
import type { RunKind } from "../shared/contracts.js";
import { buildSystemOwnerId } from "./agent-owners.js";
import { harnessRuntime } from "./harness/singleton.js";
import {
  appendRunFinishedEvent,
  appendRunStartedEvent,
} from "./session/service.js";

type ExecuteBackgroundRunInput<T> = {
  sessionId: string;
  runKind: Extract<RunKind, "compact" | "system">;
  modelEntryId: string;
  thinkingLevel: string;
  ownerId?: string;
  runIdPrefix?: string;
  execute: (runScope: { sessionId: string; runId: string }) => Promise<T>;
};

export async function executeBackgroundRun<T>(
  input: ExecuteBackgroundRunInput<T>,
): Promise<T> {
  const runId = `${input.runIdPrefix ?? input.runKind}-${randomUUID()}`;
  const runScope = {
    sessionId: input.sessionId,
    runId,
  };

  harnessRuntime.createRun({
    ...runScope,
    ownerId: input.ownerId ?? buildSystemOwnerId(input.runKind),
    modelEntryId: input.modelEntryId,
    runKind: input.runKind,
    lane: "background",
  });

  appendRunStartedEvent({
    sessionId: input.sessionId,
    runId,
    ownerId: input.ownerId ?? buildSystemOwnerId(input.runKind),
    runKind: input.runKind,
    modelEntryId: input.modelEntryId,
    thinkingLevel: input.thinkingLevel,
  });

  try {
    const result = await input.execute(runScope);
    appendRunFinishedEvent({
      sessionId: input.sessionId,
      runId,
      ownerId: input.ownerId ?? buildSystemOwnerId(input.runKind),
      finalState: "completed",
    });
    harnessRuntime.finishRun(runScope, "completed");
    return result;
  } catch (error) {
    const reason = error instanceof Error ? error.message : `${input.runKind} 失败`;
    appendRunFinishedEvent({
      sessionId: input.sessionId,
      runId,
      ownerId: input.ownerId ?? buildSystemOwnerId(input.runKind),
      finalState: "failed",
      reason,
    });
    harnessRuntime.finishRun(runScope, "failed", {
      reason,
    });
    throw error;
  }
}
