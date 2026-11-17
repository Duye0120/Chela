import * as assert from "node:assert/strict";

import { mapRuntimeDiagnosticsReport } from "../src/main/runtime-services/diagnostics.ts";
import type { RuntimeServiceStatusReport } from "../src/main/runtime-services/types.ts";

function main(): void {
  const sourceReport: RuntimeServiceStatusReport = {
    status: "degraded",
    updatedAt: 1710000000000,
    totals: {
      total: 2,
      healthy: 1,
      degraded: 1,
      failed: 0,
      starting: 0,
      stopped: 0,
      unknown: 0,
    },
    services: [
      {
        name: "core-runtime",
        group: "core",
        criticality: "critical",
        status: "healthy",
        started: true,
        startDurationMs: 12,
        message: "ready",
        updatedAt: 1710000000000,
      },
      {
        name: "readiness-recorder",
        group: "observability",
        criticality: "optional",
        status: "degraded",
        started: true,
        errorMessage: "trace sink unavailable",
        updatedAt: 1710000000100,
      },
    ],
  };

  const diagnostics = mapRuntimeDiagnosticsReport(sourceReport);

  assert.equal(diagnostics.status, "degraded");
  assert.equal(diagnostics.generatedAt, sourceReport.updatedAt);
  assert.equal(diagnostics.totals.total, 2);
  assert.equal(diagnostics.totals.healthy, 1);
  assert.equal(diagnostics.totals.degraded, 1);
  assert.equal(diagnostics.totals.disabled, 0);
  assert.deepEqual(
    diagnostics.services.map((service) => ({
      name: service.name,
      group: service.group,
      criticality: service.criticality,
      status: service.status,
      message: service.message,
      errorMessage: service.errorMessage,
    })),
    [
      {
        name: "core-runtime",
        group: "core",
        criticality: "critical",
        status: "healthy",
        message: "ready",
        errorMessage: undefined,
      },
      {
        name: "readiness-recorder",
        group: "observability",
        criticality: "optional",
        status: "degraded",
        message: undefined,
        errorMessage: "trace sink unavailable",
      },
    ],
  );

  console.log("runtime diagnostics regression tests passed");
}

main();
