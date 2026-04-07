import { app } from "electron";
import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { HarnessAuditEvent } from "./types.js";

function ensureDir(dirPath: string): void {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

export function getHarnessAuditLogPath(): string {
  return join(app.getPath("userData"), "logs", "audit.log");
}

export function appendHarnessAuditEvent(event: HarnessAuditEvent): void {
  const filePath = getHarnessAuditLogPath();
  ensureDir(dirname(filePath));
  appendFileSync(filePath, JSON.stringify(event) + "\n", "utf-8");
}

