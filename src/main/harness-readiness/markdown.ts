import type { ReadinessReport } from "./types.ts";

export function renderReadinessReportMarkdown(report: ReadinessReport): string {
  const lines = [
    "# Chela Readiness Report",
    "",
    "## Verdict",
    "",
    report.verdict,
    "",
    "## Key Metrics",
    "",
    `- Workflow success rate: ${formatMetric(report.metrics.workflowSuccessRate)}`,
    `- Tool fail rate: ${formatMetric(report.metrics.toolFailRate)}`,
    `- Policy violation count: ${report.metrics.policyViolationCount}`,
    `- Secret leakage count: ${report.metrics.secretLeakageCount}`,
    `- p95 latency: ${formatMetric(report.metrics.p95LatencyMs, " ms")}`,
    `- Hard section preserved rate: ${formatMetric(report.metrics.hardSectionPreservedRate)}`,
    "",
    "## Scenario Summary",
    "",
  ];

  if (report.scenarioResults.length === 0) {
    lines.push("- no scenario events");
  } else {
    for (const item of report.scenarioResults) {
      lines.push(`- ${item.scenarioId}: ${item.status} - ${item.reason} (${item.eventCount} events)`);
    }
  }

  lines.push("", "## Warnings", "");
  if (report.warnings.length === 0) {
    lines.push("- none");
  } else {
    for (const warning of report.warnings) {
      lines.push(`- ${warning}`);
    }
  }

  lines.push(
    "",
    "## Data Quality",
    "",
    `- Invalid JSON lines: ${report.dataQuality.invalidJsonLines}`,
    `- Invalid schema events: ${report.dataQuality.invalidSchemaEvents}`,
    "",
    "## Recommended Next Tasks",
    "",
  );

  const recommendations: string[] = [];
  if (report.metrics.approvalRecoveryRate === null) {
    recommendations.push("- Add approval fixture");
  }
  if (report.metrics.hardSectionPreservedRate === null) {
    recommendations.push("- Add context hard-section fixture");
  }
  if (report.scenarioResults.length === 0) {
    recommendations.push("- Add Mini Eval scenario fixtures");
  }
  lines.push(...(recommendations.length === 0 ? ["- none"] : recommendations));

  return `${lines.join("\n")}\n`;
}

function formatMetric(value: number | null, suffix = ""): string {
  if (value === null) {
    return "n/a";
  }
  return `${value}${suffix}`;
}
