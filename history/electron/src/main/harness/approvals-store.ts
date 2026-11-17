import { app } from "electron";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { PRIMARY_AGENT_OWNER } from "../agent-owners.ts";
import type { InterruptedApprovalRecord } from "./types.ts";

type PersistedInterruptedApprovals = {
  approvals: InterruptedApprovalRecord[];
};

function ensureDir(dirPath: string): void {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

function getInterruptedApprovalsPath(): string {
  return join(app.getPath("userData"), "data", "interrupted-approvals.json");
}

function atomicWrite(filePath: string, data: string): void {
  ensureDir(dirname(filePath));
  const tempPath = filePath + ".tmp";
  writeFileSync(tempPath, data, "utf-8");
  renameSync(tempPath, filePath);
}

export function loadInterruptedApprovals(): InterruptedApprovalRecord[] {
  const filePath = getInterruptedApprovalsPath();
  try {
    const raw = readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<PersistedInterruptedApprovals>;
    if (!parsed || !Array.isArray(parsed.approvals)) throw new Error("中断审批记录格式无效。");
    return parsed.approvals.map((approval) => ({
          ...approval,
          canResume: approval?.canResume ?? true,
          recoveryStatus: approval?.recoveryStatus ?? "interrupted",
          ownerId:
            typeof approval?.ownerId === "string" && approval.ownerId.trim()
              ? approval.ownerId
              : PRIMARY_AGENT_OWNER,
        }));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw new Error("无法读取中断审批记录，已保留原文件。", { cause: error });
  }
}

export function saveInterruptedApprovals(
  approvals: InterruptedApprovalRecord[],
): void {
  const filePath = getInterruptedApprovalsPath();
  atomicWrite(
    filePath,
    JSON.stringify({ approvals } satisfies PersistedInterruptedApprovals, null, 2),
  );
}
