import { orderRuntimeServices } from "./registry.ts";
import type {
  RuntimeServiceDefinition,
  RuntimeServiceHealthStatus,
  RuntimeServiceLifecycleOptions,
  RuntimeServiceState,
  RuntimeServiceStatus,
  RuntimeServiceStatusReport,
} from "./types.ts";

export class RuntimeServiceLifecycle {
  private readonly definitions: RuntimeServiceDefinition[];
  private readonly states = new Map<string, RuntimeServiceState>();
  private readonly now: () => number;
  private readonly onError?: (service: RuntimeServiceDefinition, error: unknown) => void;
  private readonly onRollbackError?: (service: RuntimeServiceDefinition, error: unknown) => void;
  private orderedDefinitions: RuntimeServiceDefinition[] = [];

  constructor(definitions: RuntimeServiceDefinition[], options: RuntimeServiceLifecycleOptions = {}) {
    this.definitions = definitions;
    this.now = options.now ?? Date.now;
    this.onError = options.onError;
    this.onRollbackError = options.onRollbackError;
  }

  async start(): Promise<void> {
    this.orderedDefinitions = orderRuntimeServices(this.definitions);
    const startedThisRound: RuntimeServiceDefinition[] = [];

    for (const definition of this.orderedDefinitions) {
      const state = this.getState(definition);
      if (state.started) {
        continue;
      }

      const startedAt = this.now();
      this.setState(definition, {
        status: "starting",
        started: false,
        error: undefined,
        errorMessage: undefined,
        updatedAt: startedAt,
      });

      try {
        await definition.start();
        this.setState(definition, {
          status: "healthy",
          started: true,
          startDurationMs: Math.max(0, this.now() - startedAt),
          error: undefined,
          errorMessage: undefined,
          updatedAt: this.now(),
        });
        startedThisRound.push(definition);
      } catch (error) {
        this.setState(definition, {
          status: definition.criticality === "critical" ? "failed" : "degraded",
          started: false,
          startDurationMs: Math.max(0, this.now() - startedAt),
          error,
          errorMessage: errorToMessage(error),
          updatedAt: this.now(),
        });
        this.onError?.(definition, error);

        if (definition.criticality === "critical") {
          await this.rollback(startedThisRound);
          throw error;
        }
      }
    }
  }

  async stop(): Promise<void> {
    const ordered = this.orderedDefinitions.length > 0 ? this.orderedDefinitions : orderRuntimeServices(this.definitions);
    for (const definition of ordered.slice().reverse()) {
      const state = this.states.get(definition.name);
      if (!state?.started) {
        continue;
      }
      try {
        await definition.stop?.();
      } catch (error) {
        this.onRollbackError?.(definition, error);
      } finally {
        this.setState(definition, { status: "stopped", started: false, updatedAt: this.now() });
      }
    }
  }

  getStates(): RuntimeServiceState[] {
    return Array.from(this.states.values());
  }

  async getStatusReport(): Promise<RuntimeServiceStatusReport> {
    const ordered = this.orderedDefinitions.length > 0 ? this.orderedDefinitions : orderRuntimeServices(this.definitions);
    const services: RuntimeServiceStatus[] = [];

    for (const definition of ordered) {
      const current = this.getState(definition);
      const health = await this.readHealth(definition);
      const state = this.states.get(definition.name) ?? current;
      services.push({
        name: definition.name,
        group: definition.group,
        criticality: definition.criticality,
        status: health?.status ?? state.status,
        started: state.started,
        startDurationMs: state.startDurationMs,
        message: health?.message,
        errorMessage: state.errorMessage,
        updatedAt: health?.updatedAt ?? state.updatedAt,
      });
    }

    const totals = {
      total: services.length,
      healthy: countStatus(services, "healthy"),
      degraded: countStatus(services, "degraded"),
      failed: countStatus(services, "failed"),
      starting: countStatus(services, "starting"),
      stopped: countStatus(services, "stopped"),
      unknown: countStatus(services, "unknown"),
    };

    return {
      status: summarizeStatus(services),
      updatedAt: this.now(),
      totals,
      services,
    };
  }

  isStarted(): boolean {
    const enabled = orderRuntimeServices(this.definitions);
    return enabled.length > 0 && enabled.every((definition) => this.states.get(definition.name)?.started === true || this.states.get(definition.name)?.status === "degraded");
  }

  private async rollback(startedThisRound: RuntimeServiceDefinition[]): Promise<void> {
    for (const definition of startedThisRound.slice().reverse()) {
      try {
        await definition.stop?.();
      } catch (error) {
        this.onRollbackError?.(definition, error);
      } finally {
        this.setState(definition, { status: "stopped", started: false, updatedAt: this.now() });
      }
    }
  }

  private getState(definition: RuntimeServiceDefinition): RuntimeServiceState {
    const existing = this.states.get(definition.name);
    if (existing) {
      return existing;
    }
    const state: RuntimeServiceState = {
      definition,
      status: "unknown",
      started: false,
      updatedAt: this.now(),
    };
    this.states.set(definition.name, state);
    return state;
  }

  private setState(definition: RuntimeServiceDefinition, patch: Partial<RuntimeServiceState>): void {
    const current = this.getState(definition);
    this.states.set(definition.name, { ...current, ...patch, definition });
  }

  private async readHealth(definition: RuntimeServiceDefinition): Promise<RuntimeServiceState["health"]> {
    if (!definition.health) {
      return this.states.get(definition.name)?.health;
    }

    try {
      const health = await definition.health();
      this.setState(definition, {
        health,
        status: health.status,
        error: health.status === "failed" || health.status === "degraded" ? this.states.get(definition.name)?.error : undefined,
        updatedAt: health.updatedAt,
        errorMessage: health.status === "failed" || health.status === "degraded" ? health.message : undefined,
      });
      return health;
    } catch (error) {
      const health = {
        status: "degraded" as const,
        message: `health check failed: ${errorToMessage(error)}`,
        updatedAt: this.now(),
      };
      this.setState(definition, {
        health,
        status: "degraded",
        error,
        errorMessage: health.message,
        updatedAt: health.updatedAt,
      });
      return health;
    }
  }
}

function countStatus(services: RuntimeServiceStatus[], status: RuntimeServiceHealthStatus): number {
  return services.filter((service) => service.status === status).length;
}

function summarizeStatus(services: RuntimeServiceStatus[]): RuntimeServiceHealthStatus {
  if (services.some((service) => service.status === "failed" && service.criticality === "critical")) {
    return "failed";
  }
  if (services.some((service) => service.status === "failed" || service.status === "degraded")) {
    return "degraded";
  }
  if (services.some((service) => service.status === "starting")) {
    return "starting";
  }
  if (services.length > 0 && services.every((service) => service.status === "healthy")) {
    return "healthy";
  }
  if (services.length > 0 && services.every((service) => service.status === "stopped")) {
    return "stopped";
  }
  return "unknown";
}

function errorToMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
