import { ReadinessTraceRecorder } from "../../harness-readiness/trace-recorder.js";
import type { RuntimeServiceHealth } from "../../runtime-services/types.js";
import type { ObservabilitySink } from "../dispatcher.js";

export type ReadinessObservabilitySinkOptions = {
  recorder: ReadinessTraceRecorder;
};

export class ReadinessObservabilitySink implements ObservabilitySink {
  readonly name = "readiness";
  private readonly recorder: ReadinessTraceRecorder;
  private stopped = false;

  constructor(options: ReadinessObservabilitySinkOptions) {
    this.recorder = options.recorder;
  }

  start(): void {
    this.stopped = false;
  }

  stop(): void {
    this.stopped = true;
    this.recorder.stop();
  }

  handleEvent(event: string, data: unknown): void {
    if (this.stopped) {
      return;
    }
    this.recorder.recordBusEvent(event, data);
  }

  async flush(): Promise<void> {
    await this.recorder.flush();
  }

  health(): RuntimeServiceHealth {
    const recorderHealth = this.recorder.getHealth();
    if (recorderHealth.status === "degraded" || recorderHealth.status === "failed") {
      return recorderHealth;
    }

    return {
      status: this.stopped ? "stopped" : "healthy",
      message: recorderHealth.message,
      updatedAt: recorderHealth.updatedAt,
    };
  }
}
