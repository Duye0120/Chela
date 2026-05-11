import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  RuntimeDiagnosticsReport,
  RuntimeDiagnosticsServiceStatus,
  RuntimeDiagnosticsServiceStatusValue,
} from "@shared/contracts";
import { formatDateTimeInTimeZone } from "@shared/timezone";
import { Button } from "@renderer/components/assistant-ui/button";
import { cn } from "@renderer/lib/utils";

const STATUS_LABELS: Record<RuntimeDiagnosticsServiceStatusValue, string> = {
  unknown: "未知",
  starting: "启动中",
  healthy: "健康",
  degraded: "降级",
  failed: "失败",
  stopped: "已停止",
  disabled: "已禁用",
};

const GROUP_ORDER = ["core", "observability", "agent", "integration", "experimental"];

function statusTone(status: RuntimeDiagnosticsServiceStatusValue): string {
  if (status === "healthy") {
    return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  }
  if (status === "degraded" || status === "starting") {
    return "bg-amber-500/10 text-amber-700 dark:text-amber-300";
  }
  if (status === "failed") {
    return "bg-red-500/10 text-red-700 dark:text-red-300";
  }
  return "bg-[color:var(--color-control-bg)] text-muted-foreground";
}

function formatTimestamp(value: number, timeZone: string): string {
  try {
    return formatDateTimeInTimeZone(new Date(value), timeZone);
  } catch {
    return "—";
  }
}

function truncateMessage(value?: string): string {
  if (!value) {
    return "—";
  }
  return value.length > 96 ? `${value.slice(0, 96)}…` : value;
}

function sortServices(
  services: RuntimeDiagnosticsServiceStatus[],
): RuntimeDiagnosticsServiceStatus[] {
  return [...services].sort((a, b) => {
    const groupDiff = GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group);
    if (groupDiff !== 0) {
      return groupDiff;
    }
    return a.name.localeCompare(b.name);
  });
}

function RuntimeDiagnosticsSummary({
  report,
  timeZone,
}: {
  report: RuntimeDiagnosticsReport;
  timeZone: string;
}) {
  const totals = report.totals;
  const items = [
    ["健康", totals.healthy],
    ["降级", totals.degraded],
    ["失败", totals.failed],
    ["启动中", totals.starting],
    ["停止/未知", totals.stopped + totals.unknown],
  ];

  return (
    <div className="grid gap-3 md:grid-cols-[1.2fr_2fr]">
      <div className="rounded-[var(--radius-shell)] bg-[color:var(--color-control-bg)] px-4 py-3 shadow-[var(--color-control-shadow)]">
        <p className="text-[11px] text-muted-foreground">总体状态</p>
        <div className="mt-2 flex items-center gap-2">
          <span
            className={cn(
              "rounded-[var(--radius-shell)] px-2.5 py-1 text-[12px] font-medium",
              statusTone(report.status),
            )}
          >
            {STATUS_LABELS[report.status] ?? report.status}
          </span>
          <span className="text-[12px] text-muted-foreground">
            {totals.total} 个后台服务
          </span>
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          更新时间：{formatTimestamp(report.generatedAt, timeZone)}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        {items.map(([label, value]) => (
          <div
            key={label}
            className="rounded-[var(--radius-shell)] bg-[color:var(--color-control-bg)] px-3 py-3 shadow-[var(--color-control-shadow)]"
          >
            <p className="text-[11px] text-muted-foreground">{label}</p>
            <p className="mt-1 text-[18px] font-semibold tracking-[-0.02em] text-foreground">
              {value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function RuntimeServiceRow({ service }: { service: RuntimeDiagnosticsServiceStatus }) {
  const detail = service.errorMessage ?? service.message;
  return (
    <div className="grid gap-2 rounded-[var(--radius-shell)] bg-[color:var(--color-control-bg)] px-3 py-3 text-[12px] shadow-[var(--color-control-shadow)] md:grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr_2fr] md:items-center">
      <div className="min-w-0">
        <p className="truncate font-medium text-foreground">{service.name}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{service.group}</p>
      </div>
      <span className="text-muted-foreground">{service.criticality}</span>
      <span
        className={cn(
          "w-fit rounded-[var(--radius-shell)] px-2 py-1 text-[11px] font-medium",
          statusTone(service.status),
        )}
      >
        {STATUS_LABELS[service.status] ?? service.status}
      </span>
      <span className="text-muted-foreground">
        {typeof service.startDurationMs === "number"
          ? `${service.startDurationMs}ms`
          : "—"}
      </span>
      <span className="min-w-0 truncate text-muted-foreground" title={detail ?? undefined}>
        {truncateMessage(detail)}
      </span>
    </div>
  );
}

export function RuntimeDiagnosticsSection({ timeZone }: { timeZone: string }) {
  const desktopApi = window.desktopApi;
  const [report, setReport] = useState<RuntimeDiagnosticsReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDiagnostics = useCallback(async () => {
    if (!desktopApi?.runtime) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      setReport(await desktopApi.runtime.getDiagnostics());
    } catch {
      setError("读取 Runtime Diagnostics 失败，请稍后重试。");
    } finally {
      setLoading(false);
    }
  }, [desktopApi]);

  useEffect(() => {
    void loadDiagnostics();
  }, [loadDiagnostics]);

  const services = useMemo(
    () => sortServices(report?.services ?? []),
    [report?.services],
  );

  return (
    <div className="flex flex-col gap-4 pt-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">
            Runtime Diagnostics
          </h2>
          <p className="mt-1 text-[12px] text-muted-foreground">
            后台服务、观测链路和离线分析能力的只读健康状态。
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={() => void loadDiagnostics()}
          disabled={loading}
        >
          {loading ? "刷新中…" : "刷新"}
        </Button>
      </div>

      {error ? (
        <div className="rounded-[var(--radius-shell)] bg-red-500/10 px-4 py-3 text-[12px] text-red-700 dark:text-red-300">
          {error}
        </div>
      ) : null}

      {report ? (
        <>
          <RuntimeDiagnosticsSummary report={report} timeZone={timeZone} />
          <div className="flex flex-col gap-2">
            {services.map((service) => (
              <RuntimeServiceRow key={service.name} service={service} />
            ))}
          </div>
        </>
      ) : !loading ? (
        <div className="rounded-[var(--radius-shell)] bg-[color:var(--color-control-bg)] px-4 py-3 text-[12px] text-muted-foreground shadow-[var(--color-control-shadow)]">
          暂无 Runtime Diagnostics 数据。
        </div>
      ) : null}
    </div>
  );
}
