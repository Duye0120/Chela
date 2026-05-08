import * as assert from "node:assert/strict";

import { RuntimeServiceLifecycle } from "../src/main/runtime-services/lifecycle.js";
import { orderRuntimeServices, RuntimeServiceRegistryError } from "../src/main/runtime-services/registry.js";
import type { RuntimeServiceDefinition } from "../src/main/runtime-services/types.js";

async function main(): Promise<void> {
  const order: string[] = [];
  const stops: string[] = [];
  const services: RuntimeServiceDefinition[] = [
    {
      name: "metrics",
      group: "observability",
      criticality: "optional",
      dependsOn: ["core"],
      start: () => order.push("metrics"),
      stop: () => stops.push("metrics"),
    },
    {
      name: "disabled",
      group: "experimental",
      criticality: "optional",
      enabled: () => false,
      start: () => order.push("disabled"),
    },
    {
      name: "core",
      group: "core",
      criticality: "critical",
      start: () => order.push("core"),
      stop: () => stops.push("core"),
    },
  ];

  assert.deepEqual(orderRuntimeServices(services).map((service) => service.name), ["core", "metrics"]);

  const lifecycle = new RuntimeServiceLifecycle(services, { now: () => 1000 });
  await lifecycle.start();
  assert.deepEqual(order, ["core", "metrics"]);
  assert.equal(lifecycle.isStarted(), true);
  await lifecycle.stop();
  assert.deepEqual(stops, ["metrics", "core"]);

  assert.throws(
    () => orderRuntimeServices([{ name: "a", group: "core", criticality: "critical", dependsOn: ["missing"], start: () => undefined }]),
    RuntimeServiceRegistryError,
  );

  assert.throws(
    () =>
      orderRuntimeServices([
        { name: "a", group: "core", criticality: "critical", dependsOn: ["b"], start: () => undefined },
        { name: "b", group: "core", criticality: "critical", dependsOn: ["a"], start: () => undefined },
      ]),
    RuntimeServiceRegistryError,
  );

  const optionalErrors: string[] = [];
  const optionalLifecycle = new RuntimeServiceLifecycle(
    [
      { name: "optional-bad", group: "observability", criticality: "optional", start: () => { throw new Error("optional fail"); } },
      { name: "after", group: "core", criticality: "critical", start: () => order.push("after") },
    ],
    { onError: (service) => optionalErrors.push(service.name) },
  );
  await optionalLifecycle.start();
  assert.deepEqual(optionalErrors, ["optional-bad"]);
  assert.equal(optionalLifecycle.getStates().find((state) => state.definition.name === "optional-bad")?.status, "degraded");

  const rollback: string[] = [];
  const criticalLifecycle = new RuntimeServiceLifecycle([
    { name: "started", group: "core", criticality: "critical", start: () => rollback.push("start"), stop: () => rollback.push("stop") },
    { name: "bad", group: "core", criticality: "critical", dependsOn: ["started"], start: () => { throw new Error("critical fail"); } },
  ]);
  await assert.rejects(() => criticalLifecycle.start(), /critical fail/);
  assert.deepEqual(rollback, ["start", "stop"]);

  console.log("runtime services regression tests passed");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
