export const TERMINAL_AGENTS = {
  codex: "Codex",
  claude: "Claude Code",
  pi: "Pi",
} as const;

export type TerminalAgentId = keyof typeof TERMINAL_AGENTS;

export function isTerminalAgentId(value: unknown): value is TerminalAgentId {
  return typeof value === "string" && Object.hasOwn(TERMINAL_AGENTS, value);
}

export function findTerminalAgent(value: string): TerminalAgentId | undefined {
  const executor = value.trim().toLowerCase();
  return (Object.keys(TERMINAL_AGENTS) as TerminalAgentId[]).find(
    (id) => id === executor || TERMINAL_AGENTS[id].toLowerCase() === executor,
  );
}
