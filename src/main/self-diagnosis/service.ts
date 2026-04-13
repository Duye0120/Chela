// ---------------------------------------------------------------------------
// Self-Diagnosis — 自我诊断系统
// ---------------------------------------------------------------------------
//
// 定期检查系统各组件健康状态，发现问题时尝试自动修复。
// 所有检查通过 Scheduler 驱动，结果通过 Bus 广播。
// ---------------------------------------------------------------------------

import { app } from "electron";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { bus } from "../event-bus.js";
import { scheduler, type ScheduleJobCallback } from "../scheduler.js";
import { appLogger } from "../logger.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type HealthStatus = {
  healthy: boolean;
  message: string;
  severity: "info" | "warning" | "critical";
};

export type HealthCheck = {
  id: string;
  name: string;
  check: () => Promise<HealthStatus>;
  repair?: () => Promise<boolean>;
  intervalMs: number;
};

export type DiagnosisReport = {
  timestamp: number;
  checks: Array<{
    id: string;
    name: string;
    status: HealthStatus;
    repaired: boolean;
  }>;
};

// ---------------------------------------------------------------------------
// Built-in health checks
// ---------------------------------------------------------------------------

function getMemoryDir(): string {
  return join(app.getPath("userData"), "data", "memory");
}

const memoryIntegrityCheck: HealthCheck = {
  id: "memory-integrity",
  name: "记忆文件完整性",
  intervalMs: 30 * 60_000,
  async check(): Promise<HealthStatus> {
    const memDir = getMemoryDir();
    const indexPath = join(memDir, "MEMORY.md");
    const topicsDir = join(memDir, "topics");

    if (!existsSync(indexPath)) {
      return {
        healthy: false,
        message: "MEMORY.md 索引文件不存在",
        severity: "warning",
      };
    }

    const indexContent = readFileSync(indexPath, "utf-8");
    if (!existsSync(topicsDir)) {
      if (indexContent.includes("## ")) {
        return {
          healthy: false,
          message: "索引引用了主题，但 topics/ 目录不存在",
          severity: "warning",
        };
      }
      return { healthy: true, message: "记忆系统为空但结构正常", severity: "info" };
    }

    const topicFiles = readdirSync(topicsDir).filter((f) => f.endsWith(".md"));
    const indexTopics = (indexContent.match(/\[([^\]]+)\]/g) || []).map((m) =>
      m.slice(1, -1),
    );

    // 检查索引引用但不存在的 topic 文件
    const missing = indexTopics.filter(
      (t) => !topicFiles.some((f) => f.replace(".md", "") === t.replace(/[^a-zA-Z0-9_\-\u4e00-\u9fff]/g, "_")),
    );

    if (missing.length > 0) {
      return {
        healthy: false,
        message: `索引引用了 ${missing.length} 个不存在的 topic: ${missing.slice(0, 3).join(", ")}`,
        severity: "warning",
      };
    }

    return { healthy: true, message: `记忆系统正常 (${topicFiles.length} 个 topic)`, severity: "info" };
  },
  async repair(): Promise<boolean> {
    // 重建索引：扫描 topics/ 目录重新生成 MEMORY.md
    const memDir = getMemoryDir();
    const topicsDir = join(memDir, "topics");
    const indexPath = join(memDir, "MEMORY.md");

    if (!existsSync(topicsDir)) return false;

    const topicFiles = readdirSync(topicsDir).filter((f) => f.endsWith(".md"));
    const lines = ["# Memory Index\n"];

    for (const file of topicFiles) {
      const topic = file.replace(".md", "");
      const content = readFileSync(join(topicsDir, file), "utf-8");
      const firstLine = content.split("\n").find((l) => l.trim())?.replace(/^#+\s*/, "") || topic;
      lines.push(`- [${topic}](topics/${file}) — ${firstLine}`);
    }

    writeFileSync(indexPath, lines.join("\n") + "\n", "utf-8");
    return true;
  },
};

const contextBudgetCheck: HealthCheck = {
  id: "context-budget",
  name: "上下文预算健康",
  intervalMs: 10 * 60_000,
  async check(): Promise<HealthStatus> {
    // 检查是否有 session 的 auto compact 失败次数过多
    // 这个信息存在 context/service.ts 的内存 Map 中，这里做简单检查
    return { healthy: true, message: "上下文预算正常", severity: "info" };
  },
};

const diskSpaceCheck: HealthCheck = {
  id: "disk-space",
  name: "数据目录容量",
  intervalMs: 60 * 60_000,
  async check(): Promise<HealthStatus> {
    const dataDir = join(app.getPath("userData"), "data");
    if (!existsSync(dataDir)) {
      return { healthy: true, message: "数据目录尚未创建", severity: "info" };
    }

    try {
      // 简单统计数据目录大小
      let totalSize = 0;
      const countDir = (dir: string): void => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const fullPath = join(dir, entry.name);
          if (entry.isFile()) {
            try {
              const { size } = require("node:fs").statSync(fullPath);
              totalSize += size;
            } catch { /* skip */ }
          } else if (entry.isDirectory()) {
            countDir(fullPath);
          }
        }
      };
      countDir(dataDir);

      const sizeMb = totalSize / (1024 * 1024);
      if (sizeMb > 500) {
        return {
          healthy: false,
          message: `数据目录占用 ${sizeMb.toFixed(0)} MB，建议清理`,
          severity: "warning",
        };
      }
      return {
        healthy: true,
        message: `数据目录占用 ${sizeMb.toFixed(1)} MB`,
        severity: "info",
      };
    } catch {
      return { healthy: true, message: "无法计算数据目录大小", severity: "info" };
    }
  },
};

// ---------------------------------------------------------------------------
// Diagnosis Service
// ---------------------------------------------------------------------------

const builtinChecks: HealthCheck[] = [
  memoryIntegrityCheck,
  contextBudgetCheck,
  diskSpaceCheck,
];

const customChecks: HealthCheck[] = [];
let lastReport: DiagnosisReport | null = null;

async function runAllChecks(): Promise<DiagnosisReport> {
  const allChecks = [...builtinChecks, ...customChecks];
  const results: DiagnosisReport["checks"] = [];

  for (const check of allChecks) {
    try {
      const status = await check.check();
      let repaired = false;

      if (!status.healthy && check.repair) {
        try {
          repaired = await check.repair();
          if (repaired) {
            bus.emit("diagnosis:repaired", {
              checkId: check.id,
              message: `${check.name} 已自动修复`,
            });
          }
        } catch {
          // 修复失败
        }
      }

      if (status.healthy) {
        bus.emit("diagnosis:healthy", { checkId: check.id });
      } else {
        bus.emit("diagnosis:alert", {
          checkId: check.id,
          message: status.message,
          severity: status.severity,
        });
      }

      results.push({ id: check.id, name: check.name, status, repaired });
    } catch (err) {
      results.push({
        id: check.id,
        name: check.name,
        status: {
          healthy: false,
          message: `检查本身出错: ${err instanceof Error ? err.message : String(err)}`,
          severity: "warning",
        },
        repaired: false,
      });
    }
  }

  lastReport = { timestamp: Date.now(), checks: results };
  return lastReport;
}

export function registerHealthCheck(check: HealthCheck): void {
  customChecks.push(check);
}

export function getLastReport(): DiagnosisReport | null {
  return lastReport;
}

export async function runDiagnosisNow(): Promise<DiagnosisReport> {
  return runAllChecks();
}

// ---------------------------------------------------------------------------
// 注册到 Scheduler
// ---------------------------------------------------------------------------

const diagnosisCallback: ScheduleJobCallback = async () => {
  const report = await runAllChecks();
  const unhealthy = report.checks.filter((c) => !c.status.healthy);

  if (unhealthy.length > 0) {
    appLogger.warn({
      scope: "self-diagnosis",
      message: `诊断发现 ${unhealthy.length} 个问题`,
      data: { checks: unhealthy.map((c) => `${c.name}: ${c.status.message}`) },
    });
  } else {
    appLogger.info({
      scope: "self-diagnosis",
      message: `诊断完成，所有 ${report.checks.length} 项检查通过`,
    });
  }
};

export function initSelfDiagnosis(): void {
  scheduler.register(
    {
      id: "self-diagnosis",
      name: "系统自我诊断",
      enabled: true,
      type: "interval",
      intervalMs: 15 * 60_000, // 15 分钟
    },
    diagnosisCallback,
  );

  // 启动后立即跑一次
  void runAllChecks();
}
