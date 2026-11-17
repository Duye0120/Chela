import type { SendMessageInput } from "@shared/contracts";

export type InterruptedApprovalInternalRun = {
  kind: "resume_interrupted_approval";
  prompt: string;
  requestedRunId?: string;
};

export type InterruptedApprovalReloadConfig = Omit<
  InterruptedApprovalInternalRun,
  "requestedRunId"
>;

export function buildInterruptedApprovalRunConfig(
  prompt: string,
  requestedRunId?: string,
): { custom: { internalRun: InterruptedApprovalInternalRun } } {
  return {
    custom: {
      internalRun: {
        kind: "resume_interrupted_approval",
        prompt,
        ...(requestedRunId ? { requestedRunId } : {}),
      },
    },
  };
}

export function readInterruptedApprovalInternalRun(
  value: unknown,
): InterruptedApprovalInternalRun | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const internalRun = (value as { internalRun?: unknown }).internalRun;
  if (!internalRun || typeof internalRun !== "object") {
    return null;
  }

  const candidate = internalRun as Record<string, unknown>;
  if (candidate.kind !== "resume_interrupted_approval") {
    return null;
  }

  if (typeof candidate.prompt !== "string" || !candidate.prompt.trim()) {
    return null;
  }

  return {
    kind: "resume_interrupted_approval",
    prompt: candidate.prompt,
    ...(typeof candidate.requestedRunId === "string" && candidate.requestedRunId.trim()
      ? { requestedRunId: candidate.requestedRunId }
      : {}),
  };
}

export function toInterruptedApprovalReloadConfig(
  internalRun: InterruptedApprovalInternalRun | null,
): InterruptedApprovalReloadConfig | null {
  if (!internalRun) {
    return null;
  }

  return {
    kind: internalRun.kind,
    prompt: internalRun.prompt,
  };
}

export function resolveSendMessageOrigin(
  internalRun: InterruptedApprovalInternalRun | null,
): SendMessageInput["origin"] {
  return internalRun ? "resume_interrupted_approval" : "user";
}
