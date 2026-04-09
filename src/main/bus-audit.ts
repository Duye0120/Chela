// ---------------------------------------------------------------------------
// Event Bus 审计日志 — 所有 bus 事件追加写入 JSONL 文件
// ---------------------------------------------------------------------------

import { app } from "electron";
import { appendFileSync, existsSync, mkdirSync, statSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import { bus } from "./event-bus.js";
import { appLogger } from "./logger.js";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB 后轮转
let auditPath = "";
let initialized = false;

function getAuditPath(): string {
  if (!auditPath) {
    auditPath = join(app.getPath("userData"), "logs", "bus-audit.jsonl");
  }
  return auditPath;
}

function ensureDir(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function rotateIfNeeded(filePath: string): void {
  try {
    if (existsSync(filePath) && statSync(filePath).size > MAX_FILE_SIZE) {
      const rotated = filePath.replace(/\.jsonl$/, `.${Date.now()}.jsonl`);
      renameSync(filePath, rotated);
    }
  } catch {
    // 轮转失败不阻塞写入
  }
}

function writeAuditLine(event: string, data: unknown): void {
  const filePath = getAuditPath();
  ensureDir(filePath);
  rotateIfNeeded(filePath);

  const line = JSON.stringify({
    ts: Date.now(),
    event,
    data,
  });

  try {
    appendFileSync(filePath, line + "\n", "utf-8");
  } catch (err) {
    appLogger.warn({
      scope: "bus-audit",
      message: "写入审计日志失败",
      error: err instanceof Error ? err : new Error(String(err)),
    });
  }
}

export function initBusAuditLog(): void {
  if (initialized) return;
  initialized = true;

  bus.onAny((event, data) => {
    writeAuditLine(event, data);
  });

  appLogger.info({
    scope: "bus-audit",
    message: "Event Bus 审计日志已启用",
    data: { path: getAuditPath() },
  });
}
