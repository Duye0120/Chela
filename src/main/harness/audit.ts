import { app } from "electron";
import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import type { HarnessAuditEvent } from "./types.js";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // M28: 10 MB 后轮转

function ensureDir(dirPath: string): void {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

function rotateIfNeeded(filePath: string): void {
  try {
    if (existsSync(filePath) && statSync(filePath).size > MAX_FILE_SIZE) {
      const rotated = filePath.replace(/\.log$/, `.${Date.now()}.log`);
      renameSync(filePath, rotated);
    }
  } catch {
    // 轮转失败不阻塞写入
  }
}

export function getHarnessAuditLogPath(): string {
  return join(app.getPath("userData"), "logs", "audit.log");
}

export function appendHarnessAuditEvent(event: HarnessAuditEvent): void {
  const filePath = getHarnessAuditLogPath();
  ensureDir(dirname(filePath));
  rotateIfNeeded(filePath);
  appendFileSync(filePath, JSON.stringify(event) + "\n", "utf-8");
}

