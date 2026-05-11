import { scheduler } from "../scheduler.js";
import { initBusAuditLog, stopBusAuditLog } from "../bus-audit.js";
import { initSelfDiagnosis, stopSelfDiagnosis } from "../self-diagnosis/service.js";
import { initMetrics, stopMetrics } from "../metrics.js";
import { initActiveLearning, stopActiveLearning } from "../learning/engine.js";
import {
  initEmotionalStateMachine,
  stopEmotionalStateMachine,
} from "../emotional/state-machine.js";
import { initReflectionService, stopReflectionService } from "../reflection/service.js";
import { initPersonalityDrift } from "../reflection/personality-drift.js";
import { startWebhookServer, stopWebhookServer } from "../webhook.js";
import { initTraceService, stopTraceService } from "../trace/service.js";
import {
  getReadinessTraceRecorderHealth,
  initReadinessTraceRecorder,
  stopReadinessTraceRecorder,
} from "../harness-readiness/service.js";
import { appLogger } from "../logger.js";
import { RuntimeServiceLifecycle } from "../runtime-services/lifecycle.js";
import type { RuntimeDiagnosticsReport } from "../../shared/contracts.js";
import type { RuntimeServiceDefinition } from "../runtime-services/types.js";
import { mapRuntimeDiagnosticsReport } from "../runtime-services/diagnostics.js";

const BACKGROUND_SERVICES: RuntimeServiceDefinition[] = [
  { name: "bus-audit", group: "observability", criticality: "optional", start: initBusAuditLog, stop: stopBusAuditLog },
  { name: "metrics", group: "observability", criticality: "optional", start: initMetrics, stop: stopMetrics },
  { name: "self-diagnosis", group: "observability", criticality: "optional", start: initSelfDiagnosis, stop: stopSelfDiagnosis },
  { name: "active-learning", group: "agent", criticality: "optional", start: initActiveLearning, stop: stopActiveLearning },
  { name: "personality-drift", group: "agent", criticality: "optional", start: initPersonalityDrift },
  {
    name: "emotional-state-machine",
    group: "agent",
    criticality: "optional",
    start: initEmotionalStateMachine,
    stop: stopEmotionalStateMachine,
  },
  {
    name: "reflection-service",
    group: "agent",
    criticality: "optional",
    start: initReflectionService,
    stop: stopReflectionService,
  },
  { name: "scheduler", group: "core", criticality: "critical", start: () => scheduler.start(), stop: () => scheduler.stop() },
  { name: "webhook", group: "integration", criticality: "optional", start: () => startWebhookServer(), stop: stopWebhookServer },
  { name: "trace-service", group: "observability", criticality: "critical", start: initTraceService, stop: stopTraceService },
  {
    name: "readiness-trace-recorder",
    group: "observability",
    criticality: "optional",
    dependsOn: ["trace-service"],
    start: initReadinessTraceRecorder,
    stop: stopReadinessTraceRecorder,
    health: getReadinessTraceRecorderHealth,
  },
];

const backgroundServiceLifecycle = new RuntimeServiceLifecycle(BACKGROUND_SERVICES, {
  onError: (service, error) => {
    appLogger.error({
      scope: "bootstrap.services",
      message: `后台服务启动失败: ${service.name}`,
      data: { service: service.name, group: service.group, criticality: service.criticality },
      error,
    });
  },
  onRollbackError: (service, error) => {
    appLogger.warn({
      scope: "bootstrap.services",
      message: `后台服务停止或回滚失败: ${service.name}`,
      error,
    });
  },
});

export async function startBackgroundServices(): Promise<void> {
  if (backgroundServiceLifecycle.isStarted()) {
    return;
  }

  await backgroundServiceLifecycle.start();
  const statusReport = await backgroundServiceLifecycle.getStatusReport();
  appLogger.info({
    scope: "bootstrap.services",
    message: "后台服务启动完成",
    data: {
      status: statusReport.status,
      totals: statusReport.totals,
      services: statusReport.services.map((service) => ({
        name: service.name,
        group: service.group,
        criticality: service.criticality,
        status: service.status,
        startDurationMs: service.startDurationMs,
        message: service.message,
        errorMessage: service.errorMessage,
      })),
    },
  });
}

export async function stopBackgroundServices(): Promise<void> {
  await backgroundServiceLifecycle.stop();
}


export async function getRuntimeDiagnosticsReport(): Promise<RuntimeDiagnosticsReport> {
  return mapRuntimeDiagnosticsReport(await backgroundServiceLifecycle.getStatusReport());
}
