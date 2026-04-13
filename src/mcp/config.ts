import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type McpServerConfig = {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  disabled?: boolean;
};

export type McpConfig = {
  mcpServers: Record<string, McpServerConfig>;
};

const MCP_CONFIG_FILE = "mcp.json";

/**
 * Read and parse the mcp.json config from workspace.
 */
export function loadMcpConfig(workspacePath: string): McpConfig {
  const configPath = join(workspacePath, MCP_CONFIG_FILE);
  if (!existsSync(configPath)) {
    return { mcpServers: {} };
  }

  try {
    const raw = readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<McpConfig>;
    return {
      mcpServers: parsed.mcpServers ?? {},
    };
  } catch {
    return { mcpServers: {} };
  }
}

/**
 * Get active (non-disabled) server entries.
 */
export function getActiveServers(config: McpConfig): [string, McpServerConfig][] {
  return Object.entries(config.mcpServers).filter(
    ([, cfg]) => !cfg.disabled
  );
}
