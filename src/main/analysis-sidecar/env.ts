const DEFAULT_ALLOWED_ENV_KEYS = ["PATH", "HOME", "USERPROFILE", "SystemRoot", "TEMP", "TMP", "CHELA_PYTHON"] as const;

export function buildAnalysisSidecarEnv(
  source: NodeJS.ProcessEnv = process.env,
  allowedKeys: readonly string[] = DEFAULT_ALLOWED_ENV_KEYS,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of allowedKeys) {
    const value = source[key];
    if (typeof value === "string") {
      env[key] = value;
    }
  }
  return env;
}

export { DEFAULT_ALLOWED_ENV_KEYS as ANALYSIS_SIDECAR_DEFAULT_ALLOWED_ENV_KEYS };
