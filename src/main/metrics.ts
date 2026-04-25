// ---------------------------------------------------------------------------
// Metrics — 性能指标采集
// ---------------------------------------------------------------------------
//
// 监听 bus 事件，为每次 run 记录耗时和 token 统计。
// 数据追加写入 userData/data/metrics.jsonl
// ---------------------------------------------------------------------------

import { app } from "electron";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { BUS_EVENTS, bus } from "./event-bus.js";
import { appLogger } from "./logger.js";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // M29: 10 MB 后轮转

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RunMetrics = {
  runId: string;
  sessionId: string;
  modelEntryId: string;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  toolCallCount: number;
  toolFailCount: number;
  finalState: string;
};

type ActiveRunTracker = {
  sessionId: string;
  modelEntryId: string;
  startedAt: number;
  toolCalls: number;
  toolFails: number;
};

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const activeRuns = new Map<string, ActiveRunTracker>();
let metricsPath = "";
let initialized = false;
let teardownMetrics: (() => void) | null = null;

function getMetricsPath(): string {
  if (!metricsPath) {
    metricsPath = join(app.getPath("userData"), "data", "metrics.jsonl");
  }
  return metricsPath;
}

function ensureDir(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function appendMetric(metric: RunMetrics): void {
  const filePath = getMetricsPath();
  ensureDir(filePath);
  try {
    if (existsSync(filePath) && statSync(filePath).size > MAX_FILE_SIZE) {
      try {
        renameSync(filePath, filePath.replace(/\.jsonl$/, `.${Date.now()}.jsonl`));
      } catch {
        // 轮转失败不阻塞写入
      }
    }
    appendFileSync(filePath, JSON.stringify(metric) + "\n", "utf-8");
  } catch (err) {
    appLogger.warn({
      scope: "metrics",
      message: "写入指标失败",
      error: err instanceof Error ? err : new Error(String(err)),
    });
  }
}

// ---------------------------------------------------------------------------
// 查询接口
// ---------------------------------------------------------------------------

export type MetricsSummary = {
  totalRuns: number;
  totalDurationMs: number;
  totalToolCalls: number;
  averageDurationMs: number;
};

export function getTodayMetrics(): MetricsSummary {
  const filePath = getMetricsPath();
  if (!existsSync(filePath)) {
    return { totalRuns: 0, totalDurationMs: 0, totalToolCalls: 0, averageDurationMs: 0 };
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayTs = todayStart.getTime();

  const summary: MetricsSummary = {
    totalRuns: 0,
    totalDurationMs: 0,
    totalToolCalls: 0,
    averageDurationMs: 0,
  };

  try {
    const lines = readFileSync(filePath, "utf-8").split("\n").filter(Boolean);
    for (const line of lines) {
      try {
        const m = JSON.parse(line) as RunMetrics;
        if (m.startedAt >= todayTs) {
          summary.totalRuns++;
          summary.totalDurationMs += m.durationMs;
          summary.totalToolCalls += m.toolCallCount;
        }
      } catch { /* skip malformed lines */ }
    }

    summary.averageDurationMs =
      summary.totalRuns > 0 ? Math.round(summary.totalDurationMs / summary.totalRuns) : 0;
  } catch { /* file read error */ }

  return summary;
}

// ---------------------------------------------------------------------------
// Bus 监听
// ---------------------------------------------------------------------------

export function initMetrics(): void {
  if (initialized) return;
  initialized = true;

  const disposers = [
    bus.on(BUS_EVENTS.RUN_STARTED, ({ runId, sessionId, modelEntryId }) => {
      activeRuns.set(runId, {
        sessionId,
        modelEntryId,
        startedAt: Date.now(),
        toolCalls: 0,
        toolFails: 0,
      });
    }),

    bus.on(BUS_EVENTS.TOOL_COMPLETED, ({ runId }) => {
      const tracker = activeRuns.get(runId);
      if (tracker) tracker.toolCalls++;
    }),

    bus.on(BUS_EVENTS.TOOL_FAILED, ({ runId }) => {
      const tracker = activeRuns.get(runId);
      if (tracker) {
        tracker.toolCalls++;
        tracker.toolFails++;
      }
    }),

    bus.on(BUS_EVENTS.RUN_COMPLETED, ({ runId, finalState }) => {
      const tracker = activeRuns.get(runId);
      if (!tracker) return;

      const endedAt = Date.now();
      const metric: RunMetrics = {
        runId,
        sessionId: tracker.sessionId,
        modelEntryId: tracker.modelEntryId,
        startedAt: tracker.startedAt,
        endedAt,
        durationMs: endedAt - tracker.startedAt,
        toolCallCount: tracker.toolCalls,
        toolFailCount: tracker.toolFails,
        finalState,
      };

      appendMetric(metric);
      activeRuns.delete(runId);
    }),
  ];

  teardownMetrics = () => {
    disposers.forEach((dispose) => dispose());
    disposers.length = 0;
    activeRuns.clear();
    teardownMetrics = null;
    initialized = false;
  };

  appLogger.info({
    scope: "metrics",
    message: "性能指标采集已启用",
    data: { path: getMetricsPath() },
  });
}

export function stopMetrics(): void {
  teardownMetrics?.();
}
