import { app } from "electron";
import { join } from "node:path";

import { bus } from "../event-bus.js";
import { appLogger } from "../logger.js";
import { resolveRuntimePaths } from "../runtime-paths.js";
import type { RuntimeServiceHealth } from "../runtime-services/types.js";
import { ReadinessTraceRecorder } from "./trace-recorder.js";

let readinessTraceRecorder: ReadinessTraceRecorder | undefined;

export function initReadinessTraceRecorder(): void {
  if (readinessTraceRecorder) {
    return;
  }
  const paths = resolveRuntimePaths(resolveRuntimeUserDataDir());
  readinessTraceRecorder = new ReadinessTraceRecorder({
    bus,
    filePath: paths.readinessTracePath,
    onWriteError: (error) => {
      appLogger.warn({
        scope: "harness-readiness.trace-recorder",
        message: "Readiness trace 写入失败，recorder 已降级",
        error,
      });
    },
  });
  readinessTraceRecorder.init();
}

export function stopReadinessTraceRecorder(): void {
  readinessTraceRecorder?.stop();
  readinessTraceRecorder = undefined;
}

export function getReadinessTraceRecorderHealth(): RuntimeServiceHealth {
  if (!readinessTraceRecorder) {
    return { status: "stopped", updatedAt: Date.now() };
  }
  return readinessTraceRecorder.getHealth();
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
