import { existsSync, readFileSync, statSync } from "node:fs";

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

export type MetricsSummary = {
  totalRuns: number;
  totalDurationMs: number;
  totalToolCalls: number;
  averageDurationMs: number;
};

export type MetricsSummaryCache = {
  filePath: string;
  dayTs: number;
  size: number;
  mtimeMs: number;
  summary: MetricsSummary;
} | null;

export function createEmptyMetricsSummary(): MetricsSummary {
  return {
    totalRuns: 0,
    totalDurationMs: 0,
    totalToolCalls: 0,
    averageDurationMs: 0,
  };
}

function finalizeSummary(summary: MetricsSummary): MetricsSummary {
  return {
    ...summary,
    averageDurationMs:
      summary.totalRuns > 0 ? Math.round(summary.totalDurationMs / summary.totalRuns) : 0,
  };
}

export function readTodayMetricsSummary(
  filePath: string,
  todayTs: number,
  cache: MetricsSummaryCache,
): { summary: MetricsSummary; cache: MetricsSummaryCache } {
  if (!existsSync(filePath)) {
    const summary = createEmptyMetricsSummary();
    return {
      summary,
      cache: {
        filePath,
        dayTs: todayTs,
        size: 0,
        mtimeMs: 0,
        summary,
      },
    };
  }

  const stat = statSync(filePath);
  if (
    cache &&
    cache.filePath === filePath &&
    cache.dayTs === todayTs &&
    cache.size === stat.size &&
    cache.mtimeMs === stat.mtimeMs
  ) {
    return { summary: cache.summary, cache };
  }

  const summary = createEmptyMetricsSummary();
  const lines = readFileSync(filePath, "utf-8").split("\n").filter(Boolean);

  for (const line of lines) {
    try {
      const metric = JSON.parse(line) as RunMetrics;
      if (metric.startedAt >= todayTs) {
        summary.totalRuns += 1;
        summary.totalDurationMs += metric.durationMs;
        summary.totalToolCalls += metric.toolCallCount;
      }
    } catch {
      // skip malformed lines
    }
  }

  const finalized = finalizeSummary(summary);
  return {
    summary: finalized,
    cache: {
      filePath,
      dayTs: todayTs,
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      summary: finalized,
    },
  };
}
