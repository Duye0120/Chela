import type { RuntimeServiceDefinition } from "./types.js";

export class RuntimeServiceRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuntimeServiceRegistryError";
  }
}

export function getEnabledRuntimeServices(services: RuntimeServiceDefinition[]): RuntimeServiceDefinition[] {
  return services.filter((service) => service.enabled?.() ?? true);
}

export function orderRuntimeServices(services: RuntimeServiceDefinition[]): RuntimeServiceDefinition[] {
  const enabledServices = getEnabledRuntimeServices(services);
  const byName = new Map(enabledServices.map((service) => [service.name, service]));
  const ordered: RuntimeServiceDefinition[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();

  for (const service of enabledServices) {
    visit(service);
  }

  return ordered;

  function visit(service: RuntimeServiceDefinition): void {
    if (visited.has(service.name)) {
      return;
    }
    if (visiting.has(service.name)) {
      throw new RuntimeServiceRegistryError(`Runtime service dependency cycle detected at ${service.name}`);
    }

    visiting.add(service.name);
    for (const dependencyName of service.dependsOn ?? []) {
      const dependency = byName.get(dependencyName);
      if (!dependency) {
        throw new RuntimeServiceRegistryError(
          `Runtime service ${service.name} depends on missing or disabled service ${dependencyName}`,
        );
      }
      visit(dependency);
    }
    visiting.delete(service.name);
    visited.add(service.name);
    ordered.push(service);
  }
}
