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
  health?: RuntimeServiceHealth;
  error?: unknown;
  errorMessage?: string;
  updatedAt: number;
};

export type RuntimeServiceLifecycleOptions = {
  now?: () => number;
  onError?: (service: RuntimeServiceDefinition, error: unknown) => void;
  onRollbackError?: (service: RuntimeServiceDefinition, error: unknown) => void;
};

export type RuntimeServiceStatus = {
  name: string;
  group: RuntimeServiceGroup;
  criticality: RuntimeServiceCriticality;
  status: RuntimeServiceHealthStatus;
  started: boolean;
  startDurationMs?: number;
  message?: string;
  errorMessage?: string;
  updatedAt: number;
};

export type RuntimeServiceStatusReport = {
  status: RuntimeServiceHealthStatus;
  updatedAt: number;
  totals: {
    total: number;
    healthy: number;
    degraded: number;
    failed: number;
    starting: number;
    stopped: number;
    unknown: number;
  };
  services: RuntimeServiceStatus[];
};
