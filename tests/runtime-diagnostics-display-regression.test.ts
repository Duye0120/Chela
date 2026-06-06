import assert from "node:assert/strict";

import type {
  RuntimeDiagnosticsReport,
  RuntimeDiagnosticsServiceGroup,
  RuntimeDiagnosticsServiceStatus,
  RuntimeDiagnosticsServiceStatusValue,
} from "../src/shared/contracts.ts";
import {
  buildRuntimeDiagnosticsSummaryItems,
  getRuntimeDiagnosticsServiceDetail,
  getRuntimeDiagnosticsStatusLabel,
  sortRuntimeDiagnosticsServices,
} from "../src/renderer/src/lib/runtime-diagnostics-display.ts";

function service(
  name: string,
  group: RuntimeDiagnosticsServiceGroup,
  status: RuntimeDiagnosticsServiceStatusValue = "healthy",
  overrides: Partial<RuntimeDiagnosticsServiceStatus> = {},
): RuntimeDiagnosticsServiceStatus {
  return {
    name,
    group,
    criticality: "optional",
    status,
    started: true,
    updatedAt: 1710000000000,
    ...overrides,
  };
}

const unorderedServices = [
  service("zeta-agent", "agent"),
  service("readiness-recorder", "observability", "degraded", {
    errorMessage: "trace sink unavailable",
  }),
  service("core-runtime-b", "core"),
  service("core-runtime-a", "core"),
  service("mcp-runtime", "integration"),
];

const sortedServices = sortRuntimeDiagnosticsServices(unorderedServices);

assert.deepEqual(
  sortedServices.map((item) => item.name),
  [
    "core-runtime-a",
    "core-runtime-b",
    "readiness-recorder",
    "zeta-agent",
    "mcp-runtime",
  ],
);
assert.deepEqual(
  unorderedServices.map((item) => item.name),
  [
    "zeta-agent",
    "readiness-recorder",
    "core-runtime-b",
    "core-runtime-a",
    "mcp-runtime",
  ],
);

assert.equal(getRuntimeDiagnosticsStatusLabel("healthy"), "健康");
assert.equal(getRuntimeDiagnosticsStatusLabel("degraded"), "降级");
assert.equal(getRuntimeDiagnosticsStatusLabel("disabled"), "已禁用");

assert.deepEqual(
  getRuntimeDiagnosticsServiceDetail(
    service("readiness-recorder", "observability", "degraded", {
      message: "recording",
      errorMessage: "trace sink unavailable",
    }),
  ),
  {
    full: "trace sink unavailable",
    preview: "trace sink unavailable",
  },
);

const longMessage = "x".repeat(120);
assert.deepEqual(
  getRuntimeDiagnosticsServiceDetail(
    service("long-service", "observability", "degraded", {
      message: longMessage,
    }),
  ),
  {
    full: longMessage,
    preview: `${"x".repeat(96)}…`,
  },
);

assert.deepEqual(
  getRuntimeDiagnosticsServiceDetail(service("quiet-service", "observability")),
  {
    full: undefined,
    preview: "—",
  },
);

const report: RuntimeDiagnosticsReport = {
  status: "degraded",
  generatedAt: 1710000000000,
  totals: {
    total: 8,
    healthy: 2,
    degraded: 1,
    failed: 1,
    starting: 1,
    stopped: 1,
    unknown: 1,
    disabled: 1,
  },
  services: unorderedServices,
};

assert.deepEqual(buildRuntimeDiagnosticsSummaryItems(report.totals), [
  { label: "健康", value: 2 },
  { label: "降级", value: 1 },
  { label: "失败", value: 1 },
  { label: "启动中", value: 1 },
  { label: "停止/未知/禁用", value: 3 },
]);

console.log("runtime diagnostics display regression tests passed");
