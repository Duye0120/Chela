import { app } from "electron";

import { bus } from "../event-bus.js";
import { resolveRuntimePaths } from "../runtime-paths.js";
import { ReadinessTraceRecorder } from "./trace-recorder.js";

let readinessTraceRecorder: ReadinessTraceRecorder | undefined;

export function initReadinessTraceRecorder(): void {
  if (readinessTraceRecorder) {
    return;
  }
  const paths = resolveRuntimePaths(app.getPath("userData"));
  readinessTraceRecorder = new ReadinessTraceRecorder({ bus, filePath: paths.readinessTracePath });
  readinessTraceRecorder.init();
}

export function stopReadinessTraceRecorder(): void {
  readinessTraceRecorder?.stop();
  readinessTraceRecorder = undefined;
}
