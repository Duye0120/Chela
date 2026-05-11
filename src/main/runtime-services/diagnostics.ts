import type { RuntimeDiagnosticsReport } from "../../shared/contracts.js";
import type { RuntimeServiceStatusReport } from "../runtime-services/types.js";

export function mapRuntimeDiagnosticsReport(
  report: RuntimeServiceStatusReport,
): RuntimeDiagnosticsReport {
  return {
    status: report.status,
    generatedAt: report.updatedAt,
    totals: {
      total: report.totals.total,
      healthy: report.totals.healthy,
      degraded: report.totals.degraded,
      failed: report.totals.failed,
      starting: report.totals.starting,
      stopped: report.totals.stopped,
      unknown: report.totals.unknown,
      disabled: 0,
    },
    services: report.services.map((service) => ({
      name: service.name,
      group: service.group,
      criticality: service.criticality,
      status: service.status,
      started: service.started,
      startDurationMs: service.startDurationMs,
      message: service.message,
      errorMessage: service.errorMessage,
      updatedAt: service.updatedAt,
    })),
  };
}
