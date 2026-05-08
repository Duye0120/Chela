import { app } from "electron";
import { join } from "node:path";

import { bus } from "../event-bus.js";
import { appLogger } from "../logger.js";
import { ObservabilityDispatcher } from "../observability/dispatcher.js";
import { ReadinessObservabilitySink } from "../observability/sinks/readiness-sink.js";
import { resolveRuntimePaths } from "../runtime-paths.js";
import type { RuntimeServiceHealth } from "../runtime-services/types.js";
import { ReadinessTraceRecorder } from "./trace-recorder.js";

let readinessTraceRecorder: ReadinessTraceRecorder | undefined;
let readinessDispatcher: ObservabilityDispatcher | undefined;

export function initReadinessTraceRecorder(): void {
  if (readinessTraceRecorder) {
    return;
  }
  const paths = resolveRuntimePaths(resolveRuntimeUserDataDir());
  readinessTraceRecorder = new ReadinessTraceRecorder({
    filePath: paths.readinessTracePath,
    onWriteError: (error) => {
      appLogger.warn({
        scope: "harness-readiness.trace-recorder",
        message: "Readiness trace 写入失败，recorder 已降级",
        error,
      });
    },
  });
  readinessDispatcher = new ObservabilityDispatcher({
    bus,
    sinks: [new ReadinessObservabilitySink({ recorder: readinessTraceRecorder })],
    onSinkError: (sink, error) => {
      appLogger.warn({
        scope: "observability.dispatcher",
        message: `Observability sink 降级: ${sink.name}`,
        error,
      });
    },
  });
  readinessDispatcher.start();
}

export function stopReadinessTraceRecorder(): void {
  readinessDispatcher?.stop();
  readinessDispatcher = undefined;
  readinessTraceRecorder?.stop();
  readinessTraceRecorder = undefined;
}

export function getReadinessTraceRecorderHealth(): RuntimeServiceHealth {
  if (!readinessDispatcher) {
    return { status: "stopped", updatedAt: Date.now() };
  }
  return readinessDispatcher.getHealth();
}

function resolveRuntimeUserDataDir(): string {
  try {
    return app.getPath("userData");
  } catch (error) {
    const fallbackDir = process.env.CHELA_RUNTIME_USER_DATA_DIR ?? process.cwd();
    appLogger.warn({
      scope: "harness-readiness.service",
      message: "Electron userData 不可用，使用 dev/test runtime path fallback",
      data: { fallbackDir: join(fallbackDir, "artifacts", "readiness") },
      error,
    });
    return fallbackDir;
  }
}
