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
  renameSync,
  statSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { BUS_EVENTS, bus } from "./event-bus.ts";
import { appLogger } from "./logger.ts";
import {
  createEmptyMetricsSummary,
  readTodayMetricsSummary,
  type MetricsSummary,
  type MetricsSummaryCache,
  type RunMetrics,
} from "./metrics-summary.ts";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // M29: 10 MB 后轮转

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
let todayMetricsCache: MetricsSummaryCache = null;

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
    todayMetricsCache = null;
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

export function getTodayMetrics(): MetricsSummary {
  const filePath = getMetricsPath();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayTs = todayStart.getTime();

  try {
    const result = readTodayMetricsSummary(filePath, todayTs, todayMetricsCache);
    todayMetricsCache = result.cache;
    return result.summary;
  } catch {
    return createEmptyMetricsSummary();
  }
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
