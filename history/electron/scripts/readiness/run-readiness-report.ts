import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  computeReadinessReport,
  parseReadinessJsonl,
  renderReadinessReportMarkdown,
} from "../../src/main/harness-readiness/report.ts";
import type { ReadinessReport } from "../../src/main/harness-readiness/types.ts";

export const DEFAULT_READINESS_FIXTURE_PATH = "tests/fixtures/readiness/all-scenarios-readiness.jsonl";
export const DEFAULT_READINESS_JSON_OUT_PATH = "artifacts/readiness/eval-latest.json";
export const DEFAULT_READINESS_MARKDOWN_OUT_PATH = "artifacts/readiness/eval-latest.md";

export type ReadinessReportRunnerOptions = {
  input?: string;
  jsonOut?: string;
  mdOut?: string;
  failOnSecretLeak?: boolean;
};

export type ReadinessReportRunnerResult = {
  code: number;
  stdout: string;
  stderr: string;
  args: string[];
  report: ReadinessReport;
};

type EffectiveReadinessReportOptions = Required<ReadinessReportRunnerOptions>;

export function buildReadinessReportArgs(options: ReadinessReportRunnerOptions): string[] {
  const effective = withDefaults(options);
  const args = ["--input", effective.input];
  if (options.jsonOut !== undefined || isDefaultInvocation(options)) {
    args.push("--json-out", effective.jsonOut);
  }
  if (options.mdOut !== undefined || isDefaultInvocation(options)) {
    args.push("--md-out", effective.mdOut);
  }
  if (effective.failOnSecretLeak) {
    args.push("--fail-on-secret-leak");
  }
  return args;
}

export async function runReadinessReport(
  options: ReadinessReportRunnerOptions = {},
): Promise<ReadinessReportRunnerResult> {
  const effective = withDefaults(options);
  const inputPath = resolve(process.cwd(), effective.input);
  const content = await readFile(inputPath, "utf8");
  const parsed = parseReadinessJsonl(content);
  const report = computeReadinessReport(parsed.events, parsed.dataQuality, effective.input);

  if (options.jsonOut !== undefined || isDefaultInvocation(options)) {
    await writeTextFile(effective.jsonOut, `${JSON.stringify(report, null, 2)}\n`);
  }
  if (options.mdOut !== undefined || isDefaultInvocation(options)) {
    await writeTextFile(effective.mdOut, renderReadinessReportMarkdown(report));
  }

  const stdout = options.jsonOut === undefined && !isDefaultInvocation(options)
    ? `${JSON.stringify(report, null, 2)}\n`
    : "";
  const code = exitCodeForReport(report, effective.failOnSecretLeak);
  return {
    code,
    stdout,
    stderr: "",
    args: buildReadinessReportArgs(options),
    report,
  };
}

function parseCliArgs(argv: string[]): ReadinessReportRunnerOptions {
  const options: ReadinessReportRunnerOptions = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--input" && next) {
      options.input = next;
      index += 1;
    } else if (arg === "--json-out" && next) {
      options.jsonOut = next;
      index += 1;
    } else if (arg === "--md-out" && next) {
      options.mdOut = next;
      index += 1;
    } else if (arg === "--fail-on-secret-leak") {
      options.failOnSecretLeak = true;
    }
  }
  return options;
}

function withDefaults(options: ReadinessReportRunnerOptions): EffectiveReadinessReportOptions {
  const defaultInvocation = isDefaultInvocation(options);
  return {
    input: options.input ?? DEFAULT_READINESS_FIXTURE_PATH,
    jsonOut: options.jsonOut ?? DEFAULT_READINESS_JSON_OUT_PATH,
    mdOut: options.mdOut ?? DEFAULT_READINESS_MARKDOWN_OUT_PATH,
    failOnSecretLeak: options.failOnSecretLeak ?? defaultInvocation,
  };
}

function isDefaultInvocation(options: ReadinessReportRunnerOptions): boolean {
  return (
    options.input === undefined &&
    options.jsonOut === undefined &&
    options.mdOut === undefined &&
    options.failOnSecretLeak === undefined
  );
}

function exitCodeForReport(report: ReadinessReport, failOnSecretLeak: boolean): number {
  if (failOnSecretLeak && report.metrics.secretLeakageCount > 0) {
    return 2;
  }
  return report.verdict === "fail" ? 1 : 0;
}

async function writeTextFile(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}

if (process.argv[1]?.endsWith("run-readiness-report.ts")) {
  runReadinessReport(parseCliArgs(process.argv.slice(2)))
    .then((result) => {
      if (result.stdout) {
        process.stdout.write(result.stdout);
      }
      if (result.stderr) {
        process.stderr.write(result.stderr);
      }
      process.exitCode = result.code;
    })
    .catch((error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
