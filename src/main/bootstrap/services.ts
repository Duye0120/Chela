import { scheduler } from "../scheduler.js";
import { initBusAuditLog, stopBusAuditLog } from "../bus-audit.js";
import { initSelfDiagnosis } from "../self-diagnosis/service.js";
import { initMetrics, stopMetrics } from "../metrics.js";
import { initActiveLearning, stopActiveLearning } from "../learning/engine.js";
import {
  initEmotionalStateMachine,
  stopEmotionalStateMachine,
} from "../emotional/state-machine.js";
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
  stopActiveLearning();
  stopEmotionalStateMachine();
  stopMetrics();
  stopBusAuditLog();
  scheduler.stop();
}
