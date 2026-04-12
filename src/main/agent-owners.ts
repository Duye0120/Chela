export const PRIMARY_AGENT_OWNER = "primary";

export function buildSystemOwnerId(kind: string): string {
  return `system:${kind}`;
}
