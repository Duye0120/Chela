import type { RuntimeServiceHealth } from "../runtime-services/types.ts";

export type ObservabilityBus = {
  onAny(handler: (event: string, data: unknown) => void): () => void;
};

export type ObservabilitySink = {
  name: string;
  start?: () => void;
  stop?: () => void;
  handleEvent: (event: string, data: unknown) => void | Promise<void>;
  flush?: () => Promise<void>;
  health?: () => RuntimeServiceHealth;
};

export type ObservabilityDispatcherOptions = {
  bus: ObservabilityBus;
  sinks: ObservabilitySink[];
  now?: () => number;
  onSinkError?: (sink: ObservabilitySink, error: unknown) => void;
};

export class ObservabilityDispatcher {
  private readonly bus: ObservabilityBus;
  private readonly sinks: ObservabilitySink[];
  private readonly now: () => number;
  private readonly onSinkError?: (sink: ObservabilitySink, error: unknown) => void;
  private readonly pendingHandlers = new Set<Promise<void>>();
  private readonly sinkHealth = new Map<string, RuntimeServiceHealth>();
  private unsubscribe?: () => void;

  constructor(options: ObservabilityDispatcherOptions) {
    this.bus = options.bus;
    this.sinks = options.sinks;
    this.now = options.now ?? Date.now;
    this.onSinkError = options.onSinkError;
  }

  start(): void {
    if (this.unsubscribe) {
      return;
    }

    for (const sink of this.sinks) {
      try {
        sink.start?.();
      } catch (error) {
        this.recordSinkError(sink, error);
      }
    }

    this.unsubscribe = this.bus.onAny((event, data) => {
      this.dispatch(event, data);
    });
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;

    for (const sink of this.sinks) {
      try {
        sink.stop?.();
      } catch (error) {
        this.recordSinkError(sink, error);
      }
    }
  }

  async flush(): Promise<void> {
    await Promise.all(Array.from(this.pendingHandlers));

    for (const sink of this.sinks) {
      try {
        await sink.flush?.();
      } catch (error) {
        this.recordSinkError(sink, error);
      }
    }
  }

  getHealth(): RuntimeServiceHealth {
    const healths = this.sinks.map((sink) => this.readSinkHealth(sink));
    const degraded = healths.filter((health) => health.status === "degraded" || health.status === "failed");

    if (degraded.length > 0) {
      return {
        status: "degraded",
        message: degraded.map((health) => health.message).filter(Boolean).join("; "),
        updatedAt: this.now(),
      };
    }

    if (!this.unsubscribe) {
      return { status: "stopped", updatedAt: this.now() };
    }

    return { status: "healthy", updatedAt: this.now() };
  }

  getSinkHealth(name: string): RuntimeServiceHealth | undefined {
    const sink = this.sinks.find((candidate) => candidate.name === name);
    if (!sink) {
      return undefined;
    }
    return this.readSinkHealth(sink);
  }

  private dispatch(event: string, data: unknown): void {
    for (const sink of this.sinks) {
      try {
        const result = sink.handleEvent(event, data);
        if (isPromiseLike(result)) {
          const pending = Promise.resolve(result)
            .catch((error: unknown) => {
              this.recordSinkError(sink, error);
            })
            .finally(() => {
              this.pendingHandlers.delete(pending);
            });
          this.pendingHandlers.add(pending);
        }
      } catch (error) {
        this.recordSinkError(sink, error);
      }
    }
  }

  private readSinkHealth(sink: ObservabilitySink): RuntimeServiceHealth {
    const recordedHealth = this.sinkHealth.get(sink.name);
    try {
      const sinkHealth = sink.health?.();
      if (recordedHealth?.status === "degraded" || recordedHealth?.status === "failed") {
        return recordedHealth;
      }
      return sinkHealth ?? recordedHealth ?? {
        status: this.unsubscribe ? "healthy" : "stopped",
        updatedAt: this.now(),
      };
    } catch (error) {
      this.recordSinkError(sink, error);
      return this.sinkHealth.get(sink.name)!;
    }
  }

  private recordSinkError(sink: ObservabilitySink, error: unknown): void {
    const health: RuntimeServiceHealth = {
      status: "degraded",
      message: `${sink.name} sink failed: ${errorToMessage(error)}`,
      updatedAt: this.now(),
    };
    this.sinkHealth.set(sink.name, health);

    try {
      this.onSinkError?.(sink, error);
    } catch {
      // Observability errors must stay isolated from event emitters.
    }
  }
}

function isPromiseLike(value: unknown): value is PromiseLike<void> {
  return typeof value === "object" && value !== null && "then" in value;
}

function errorToMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
