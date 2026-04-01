import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { McpServerConfig } from "./config.js";

export type McpConnection = {
  name: string;
  client: Client;
  transport: StdioClientTransport;
  connected: boolean;
};

const connections = new Map<string, McpConnection>();

/**
 * Connect to an MCP server via stdio.
 */
export async function connectMcpServer(
  name: string,
  config: McpServerConfig,
): Promise<McpConnection> {
  // Disconnect existing connection if any
  await disconnectMcpServer(name);

  const transport = new StdioClientTransport({
    command: config.command,
    args: config.args,
    env: config.env ? { ...process.env, ...config.env } as Record<string, string> : undefined,
    cwd: config.cwd,
    stderr: "pipe",
  });

  const client = new Client(
    { name: "pi-desktop-agent", version: "1.0.0" },
    { capabilities: {} },
  );

  await client.connect(transport);

  const conn: McpConnection = { name, client, transport, connected: true };
  connections.set(name, conn);

  // Handle disconnection
  transport.onclose = () => {
    conn.connected = false;
  };

  transport.onerror = () => {
    conn.connected = false;
  };

  return conn;
}

/**
 * Disconnect a specific MCP server.
 */
export async function disconnectMcpServer(name: string): Promise<void> {
  const conn = connections.get(name);
  if (!conn) return;

  try {
    await conn.transport.close();
  } catch { /* ignore */ }

  conn.connected = false;
  connections.delete(name);
}

/**
 * Disconnect all MCP servers.
 */
export async function disconnectAllMcpServers(): Promise<void> {
  const names = [...connections.keys()];
  await Promise.allSettled(names.map((n) => disconnectMcpServer(n)));
}

/**
 * Get all active connections.
 */
export function getConnections(): McpConnection[] {
  return [...connections.values()].filter((c) => c.connected);
}

/**
 * Get a specific connection.
 */
export function getConnection(name: string): McpConnection | undefined {
  const conn = connections.get(name);
  return conn?.connected ? conn : undefined;
}
