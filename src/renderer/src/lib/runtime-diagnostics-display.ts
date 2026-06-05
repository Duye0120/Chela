import type {
  RuntimeDiagnosticsReport,
  RuntimeDiagnosticsServiceStatus,
  RuntimeDiagnosticsServiceStatusValue,
} from "../../../shared/contracts.js";

export type RuntimeDiagnosticsSummaryItem = {
  label: string;
  value: number;
};

export type RuntimeDiagnosticsServiceDetail = {
  full: string | undefined;
  preview: string;
};

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
const MAX_SERVICE_DETAIL_LENGTH = 96;

export function getRuntimeDiagnosticsStatusLabel(
  status: RuntimeDiagnosticsServiceStatusValue,
): string {
  return STATUS_LABELS[status] ?? status;
}

export function getRuntimeDiagnosticsStatusTone(
  status: RuntimeDiagnosticsServiceStatusValue,
): string {
  if (status === "healthy") {
    return "bg-[color:var(--chela-status-success-bg)] text-[color:var(--chela-status-success-text)]";
  }
  if (status === "degraded" || status === "starting") {
    return "bg-[color:var(--chela-status-warning-bg)] text-[color:var(--chela-status-warning-text)]";
  }
  if (status === "failed") {
    return "bg-[color:var(--chela-status-error-bg)] text-[color:var(--chela-status-error-text)]";
  }
  return "bg-[color:var(--color-control-bg)] text-muted-foreground";
}

export function buildRuntimeDiagnosticsSummaryItems(
  totals: RuntimeDiagnosticsReport["totals"],
): RuntimeDiagnosticsSummaryItem[] {
  return [
    { label: "健康", value: totals.healthy },
    { label: "降级", value: totals.degraded },
    { label: "失败", value: totals.failed },
    { label: "启动中", value: totals.starting },
    {
      label: "停止/未知/禁用",
      value: totals.stopped + totals.unknown + totals.disabled,
    },
  ];
}

export function getRuntimeDiagnosticsServiceDetail(
  service: RuntimeDiagnosticsServiceStatus,
): RuntimeDiagnosticsServiceDetail {
  const full = service.errorMessage ?? service.message;
  if (!full) {
    return { full: undefined, preview: "—" };
  }
  return {
    full,
    preview:
      full.length > MAX_SERVICE_DETAIL_LENGTH
        ? `${full.slice(0, MAX_SERVICE_DETAIL_LENGTH)}…`
        : full,
  };
}

export function sortRuntimeDiagnosticsServices(
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
