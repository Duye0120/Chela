import { orderRuntimeServices } from "./registry.js";
import type {
  RuntimeServiceDefinition,
  RuntimeServiceLifecycleOptions,
  RuntimeServiceState,
} from "./types.js";

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
      this.setState(definition, { status: "starting", started: false, updatedAt: startedAt });

      try {
        await definition.start();
        this.setState(definition, {
          status: "healthy",
          started: true,
          startDurationMs: Math.max(0, this.now() - startedAt),
          updatedAt: this.now(),
        });
        startedThisRound.push(definition);
      } catch (error) {
        this.setState(definition, {
          status: definition.criticality === "critical" ? "failed" : "degraded",
          started: false,
          startDurationMs: Math.max(0, this.now() - startedAt),
          error,
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
}
