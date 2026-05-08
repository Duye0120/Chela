import { spawn } from "node:child_process";
import { resolve } from "node:path";

export type ReadinessReportRunnerOptions = {
  input: string;
  jsonOut?: string;
  mdOut?: string;
  failOnSecretLeak?: boolean;
  timeoutMs?: number;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  python?: string;
};

export type ReadinessReportRunnerResult = {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  args: string[];
  python: string;
};

const DEFAULT_TIMEOUT_MS = 30_000;
const ALLOWED_ENV_KEYS = ["PATH", "HOME", "USERPROFILE", "SystemRoot", "TEMP", "TMP", "CHELA_PYTHON"] as const;

function projectRoot(): string {
  return process.cwd();
}

export function buildReadinessReportArgs(options: ReadinessReportRunnerOptions): string[] {
  const args = [resolve(projectRoot(), "scripts", "readiness", "readiness_report.py"), "--input", options.input];
  if (options.jsonOut) {
    args.push("--json-out", options.jsonOut);
  }
  if (options.mdOut) {
    args.push("--md-out", options.mdOut);
  }
  if (options.failOnSecretLeak) {
    args.push("--fail-on-secret-leak");
  }
  return args;
}

export function buildReadinessReportEnv(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of ALLOWED_ENV_KEYS) {
    const value = source[key];
    if (typeof value === "string") {
      env[key] = value;
    }
  }
  return env;
}

export async function runReadinessReport(options: ReadinessReportRunnerOptions): Promise<ReadinessReportRunnerResult> {
  const envSource = options.env ?? process.env;
  const python = options.python ?? envSource.CHELA_PYTHON ?? "python3";
  const args = buildReadinessReportArgs(options);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return await new Promise<ReadinessReportRunnerResult>((resolvePromise, reject) => {
    const child = spawn(python, args, {
      cwd: options.cwd ?? projectRoot(),
      env: buildReadinessReportEnv(envSource),
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolvePromise({ code, signal, stdout, stderr, timedOut, args, python });
    });
  });
}

function parseCliArgs(argv: string[]): ReadinessReportRunnerOptions {
  const options: ReadinessReportRunnerOptions = { input: "" };
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
    } else if (arg === "--timeout-ms" && next) {
      options.timeoutMs = Number(next);
      index += 1;
    } else if (arg === "--fail-on-secret-leak") {
      options.failOnSecretLeak = true;
    }
  }
  if (!options.input) {
    throw new Error("--input is required");
  }
  return options;
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
      if (result.timedOut) {
        process.stderr.write("readiness report timed out\n");
      }
      process.exitCode = result.timedOut ? 124 : (result.code ?? 1);
    })
    .catch((error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
