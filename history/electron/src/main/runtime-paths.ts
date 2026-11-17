import { join } from "node:path";

export type RuntimePaths = {
  userDataDir: string;
  dataDir: string;
  logsDir: string;
  artifactsDir: string;
  readinessDir: string;
  readinessTracePath: string;
  readinessLatestJsonPath: string;
  readinessLatestMarkdownPath: string;
};

export function resolveRuntimePaths(userDataDir: string): RuntimePaths {
  const dataDir = join(userDataDir, "data");
  const logsDir = join(userDataDir, "logs");
  const artifactsDir = join(userDataDir, "artifacts");
  const readinessDir = join(artifactsDir, "readiness");

  return {
    userDataDir,
    dataDir,
    logsDir,
    artifactsDir,
    readinessDir,
    readinessTracePath: join(readinessDir, "readiness-trace.jsonl"),
    readinessLatestJsonPath: join(readinessDir, "latest-readiness-report.json"),
    readinessLatestMarkdownPath: join(readinessDir, "latest-readiness-report.md"),
  };
}
