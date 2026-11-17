export function createMemoryWorkerExitError(
  code: number,
  bootstrapError: string | null,
): Error {
  const detail = bootstrapError?.trim();
  if (detail) {
    return new Error(detail);
  }

  return new Error(`Chela memory worker exited with code ${code}.`);
}

