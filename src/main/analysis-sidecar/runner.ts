import { spawn } from "node:child_process";

export type AnalysisSidecarEnv = NodeJS.ProcessEnv;

export type AnalysisSidecarRunOptions = {
  command: string;
  args: string[];
  cwd?: string;
  env?: AnalysisSidecarEnv;
  timeoutMs?: number;
  stdoutLimitBytes?: number;
  stderrLimitBytes?: number;
};

export type AnalysisSidecarRunResult = {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
  command: string;
  args: string[];
};

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_OUTPUT_LIMIT_BYTES = 1024 * 1024;

export async function runAnalysisSidecar(options: AnalysisSidecarRunOptions): Promise<AnalysisSidecarRunResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const stdoutLimitBytes = options.stdoutLimitBytes ?? DEFAULT_OUTPUT_LIMIT_BYTES;
  const stderrLimitBytes = options.stderrLimitBytes ?? DEFAULT_OUTPUT_LIMIT_BYTES;

  return await new Promise<AnalysisSidecarRunResult>((resolve, reject) => {
    const child = spawn(options.command, options.args, {
      cwd: options.cwd,
      env: options.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let stdoutTruncated = false;
    let stderrTruncated = false;
    let settled = false;
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    child.stdout.on("data", (chunk: string) => {
      const result = appendLimited(stdout, stdoutBytes, chunk, stdoutLimitBytes);
      stdout = result.value;
      stdoutBytes = result.bytes;
      stdoutTruncated ||= result.truncated;
    });

    child.stderr.on("data", (chunk: string) => {
      const result = appendLimited(stderr, stderrBytes, chunk, stderrLimitBytes);
      stderr = result.value;
      stderrBytes = result.bytes;
      stderrTruncated ||= result.truncated;
    });

    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      reject(error);
    });

    child.on("close", (code, signal) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve({
        code,
        signal,
        stdout,
        stderr,
        timedOut,
        stdoutTruncated,
        stderrTruncated,
        command: options.command,
        args: options.args,
      });
    });
  });
}

function appendLimited(
  current: string,
  currentBytes: number,
  chunk: string,
  limitBytes: number,
): { value: string; bytes: number; truncated: boolean } {
  if (limitBytes <= 0 || currentBytes >= limitBytes) {
    return { value: current, bytes: currentBytes, truncated: chunk.length > 0 };
  }

  const chunkBytes = Buffer.byteLength(chunk, "utf8");
  if (currentBytes + chunkBytes <= limitBytes) {
    return { value: current + chunk, bytes: currentBytes + chunkBytes, truncated: false };
  }

  const remainingBytes = limitBytes - currentBytes;
  let output = "";
  let usedBytes = 0;
  for (const char of chunk) {
    const charBytes = Buffer.byteLength(char, "utf8");
    if (usedBytes + charBytes > remainingBytes) {
      break;
    }
    output += char;
    usedBytes += charBytes;
  }

  return { value: current + output, bytes: currentBytes + usedBytes, truncated: true };
}
