import { scheduler } from "../scheduler.js";
import { initBusAuditLog } from "../bus-audit.js";
import { initSelfDiagnosis } from "../self-diagnosis/service.js";
import { initMetrics } from "../metrics.js";
import { initActiveLearning } from "../learning/engine.js";
import { initEmotionalStateMachine } from "../emotional/state-machine.js";
import { initReflectionService } from "../reflection/service.js";
import { initPersonalityDrift } from "../reflection/personality-drift.js";
import { startWebhookServer, stopWebhookServer } from "../webhook.js";

export function startBackgroundServices(): void {
  initBusAuditLog();
  initMetrics();
  initSelfDiagnosis();
  initActiveLearning();
  initPersonalityDrift();
  initEmotionalStateMachine();
  initReflectionService();
  scheduler.start();
  startWebhookServer();
}

export function stopBackgroundServices(): void {
  stopWebhookServer();
  scheduler.stop();
}
