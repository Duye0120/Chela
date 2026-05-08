export type RuntimeServiceGroup = "core" | "observability" | "agent" | "integration" | "experimental";

export type RuntimeServiceCriticality = "critical" | "optional";

export type RuntimeServiceHealthStatus = "unknown" | "starting" | "healthy" | "degraded" | "failed" | "stopped";

export type RuntimeServiceHealth = {
  status: RuntimeServiceHealthStatus;
  message?: string;
  updatedAt: number;
};

export type RuntimeServiceDefinition = {
  name: string;
  group: RuntimeServiceGroup;
  criticality: RuntimeServiceCriticality;
  dependsOn?: string[];
  enabled?: () => boolean;
  start: () => void | Promise<void>;
  stop?: () => void | Promise<void>;
  health?: () => RuntimeServiceHealth | Promise<RuntimeServiceHealth>;
};

export type RuntimeServiceState = {
  definition: RuntimeServiceDefinition;
  status: RuntimeServiceHealthStatus;
  started: boolean;
  startDurationMs?: number;
  error?: unknown;
  updatedAt: number;
};

export type RuntimeServiceLifecycleOptions = {
  now?: () => number;
  onError?: (service: RuntimeServiceDefinition, error: unknown) => void;
  onRollbackError?: (service: RuntimeServiceDefinition, error: unknown) => void;
};
