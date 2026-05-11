import { join } from "node:path";

import type { RuntimePaths } from "../runtime-paths.js";

export type AnalysisSidecarArtifacts = {
  readinessTracePath: string;
  readinessLatestJsonPath: string;
  readinessLatestMarkdownPath: string;
};

export function resolveReadinessAnalysisArtifacts(paths: RuntimePaths): AnalysisSidecarArtifacts {
  return {
    readinessTracePath: paths.readinessTracePath,
    readinessLatestJsonPath: paths.readinessLatestJsonPath,
    readinessLatestMarkdownPath: paths.readinessLatestMarkdownPath,
  };
}

export function resolveAnalysisSidecarArtifactsDir(userDataDir: string): string {
  return join(userDataDir, "artifacts");
}
