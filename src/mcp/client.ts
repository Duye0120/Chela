import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { McpServerStatus } from "../shared/contracts.js";
import type { McpConfig, McpServerConfig } from "./config.js";

type McpTransport = StdioClientTransport | StreamableHTTPClientTransport;

export type McpConnection = {
  name: string;
  client: Client;
  transport: McpTransport;
  connected: boolean;
  type: "stdio" | "streamable-http";
  command: string;
  args: string[];
  url: string | null;
  cwd: string | null;
  headerCount: number | null;
  startedAt: number;
  updatedAt: number;
  lastError: string | null;
  toolCount: number | null;
  resourceCount: number | null;
};

export class McpConnectionManager {
  private readonly connections = new Map<string, McpConnection>();
  private readonly statuses = new Map<string, McpServerStatus>();

  private setStatus(name: string, patch: Partial<McpServerStatus>): void {
    const current = this.statuses.get(name);
    this.statuses.set(name, {
      name,
      configured: current?.configured ?? true,
      disabled: current?.disabled ?? false,
      connected: current?.connected ?? false,
      type: current?.type ?? "stdio",
      status: current?.status ?? "disconnected",
      command: current?.command ?? null,
      args: current?.args ?? [],
      url: current?.url ?? null,
      cwd: current?.cwd ?? null,
      headerCount: current?.headerCount ?? null,
      toolCount: current?.toolCount ?? null,
      resourceCount: current?.resourceCount ?? null,
      startedAt: current?.startedAt ?? null,
      updatedAt: Date.now(),
      lastError: current?.lastError ?? null,
      ...patch,
    });
  }

  async connectServer(
    name: string,
    config: McpServerConfig,
  ): Promise<McpConnection> {
    await this.disconnectServer(name);

    const startedAt = Date.now();
    const type = config.type === "streamable-http" ? "streamable-http" : "stdio";
    const headers = type === "streamable-http" ? resolveHttpHeaders(config) : null;
    this.setStatus(name, {
      configured: true,
      disabled: config.disabled === true,
      connected: false,
      type,
      status: config.disabled ? "disabled" : "connecting",
      command: type === "stdio" ? config.command ?? null : null,
      args: config.args ?? [],
      url: type === "streamable-http" ? config.url ?? null : null,
      cwd: config.cwd ?? null,
      headerCount: headers ? Object.keys(headers).length : null,
      startedAt,
      lastError: null,
      toolCount: null,
      resourceCount: null,
    });

    const transport =
      type === "streamable-http"
        ? new StreamableHTTPClientTransport(new URL(config.url ?? ""), {
            requestInit: headers ? { headers } : undefined,
          })
        : new StdioClientTransport({
            command: config.command ?? "",
            args: config.args,
            env: resolveStdioEnv(config),
            cwd: config.cwd,
            stderr: "pipe",
          });

    const client = new Client(
      { name: "chela-desktop-agent", version: "0.1.0" },
      { capabilities: {} },
    );

    try {
      await client.connect(transport);
    } catch (error) {
      const message = error instanceof Error ? error.message : "MCP 连接失败";
      this.setStatus(name, {
        connected: false,
        status: "failed",
        lastError: message,
      });
      throw error;
    }

    const conn: McpConnection = {
      name,
      client,
      transport,
      connected: true,
      type,
      command: config.command ?? "",
      args: config.args ?? [],
      url: config.url ?? null,
      cwd: config.cwd ?? null,
      headerCount: headers ? Object.keys(headers).length : null,
      startedAt,
      updatedAt: Date.now(),
      lastError: null,
      toolCount: null,
      resourceCount: null,
    };
    this.connections.set(name, conn);
    this.setStatus(name, {
      connected: true,
      status: "connected",
      lastError: null,
    });

    transport.onclose = () => {
      conn.connected = false;
      conn.updatedAt = Date.now();
      this.setStatus(name, {
        connected: false,
        status: "disconnected",
      });
    };

    transport.onerror = (error) => {
      conn.connected = false;
      conn.updatedAt = Date.now();
      conn.lastError = error instanceof Error ? error.message : "MCP transport error";
      this.setStatus(name, {
        connected: false,
        status: "failed",
        lastError: conn.lastError,
      });
    };

    return conn;
  }

  async disconnectServer(name: string): Promise<void> {
    const conn = this.connections.get(name);
    if (!conn) return;

    try {
      await conn.transport.close();
    } catch {
      /* ignore */
    }

    conn.connected = false;
    conn.updatedAt = Date.now();
    this.setStatus(name, {
      connected: false,
      status: "disconnected",
    });
    this.connections.delete(name);
  }

  async disconnectAll(): Promise<void> {
    const names = [...this.connections.keys()];
    await Promise.allSettled(names.map((name) => this.disconnectServer(name)));
  }

  getConnections(): McpConnection[] {
    return [...this.connections.values()].filter((conn) => conn.connected);
  }

  getConnection(name: string): McpConnection | undefined {
    const conn = this.connections.get(name);
    return conn?.connected ? conn : undefined;
  }

  recordToolCount(name: string, count: number): void {
    const conn = this.connections.get(name);
    if (conn) {
      conn.toolCount = count;
      conn.updatedAt = Date.now();
    }
    this.setStatus(name, { toolCount: count });
  }

  recordResourceCount(name: string, count: number): void {
    const conn = this.connections.get(name);
    if (conn) {
      conn.resourceCount = count;
      conn.updatedAt = Date.now();
    }
    this.setStatus(name, { resourceCount: count });
  }

  getStatuses(config?: McpConfig): McpServerStatus[] {
    const statuses = new Map(this.statuses);

    if (config) {
      for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
        const connected = this.connections.get(name)?.connected === true;
        const conn = this.connections.get(name);
        const current = statuses.get(name);
        statuses.set(name, {
          name,
          configured: true,
          disabled: serverConfig.disabled === true,
          connected,
          type: serverConfig.type === "streamable-http" ? "streamable-http" : "stdio",
          status: serverConfig.disabled
            ? "disabled"
            : connected
              ? "connected"
              : current?.status ?? "disconnected",
          command: serverConfig.type === "streamable-http" ? null : serverConfig.command ?? null,
          args: serverConfig.args ?? [],
          url: serverConfig.type === "streamable-http" ? serverConfig.url ?? null : null,
          cwd: serverConfig.cwd ?? null,
          headerCount:
            serverConfig.type === "streamable-http"
              ? Object.keys(resolveHttpHeaders(serverConfig)).length
              : null,
          toolCount: conn?.toolCount ?? current?.toolCount ?? null,
          resourceCount: conn?.resourceCount ?? current?.resourceCount ?? null,
          startedAt: conn?.startedAt ?? current?.startedAt ?? null,
          updatedAt: conn?.updatedAt ?? current?.updatedAt ?? null,
          lastError: conn?.lastError ?? current?.lastError ?? null,
        });
      }
    }

    return [...statuses.values()].sort((a, b) => a.name.localeCompare(b.name));
  }
}

function resolveStdioEnv(config: McpServerConfig): Record<string, string> | undefined {
  const env: Record<string, string> = {};
  if (config.envPassthrough && config.envPassthrough.length > 0) {
    for (const name of config.envPassthrough) {
      const value = process.env[name];
      if (typeof value === "string") {
        env[name] = value;
      }
    }
  } else if (config.env) {
    Object.assign(env, process.env);
  }
  if (config.env) {
    Object.assign(env, config.env);
  }
  return Object.keys(env).length > 0 ? env : undefined;
}

function resolveHttpHeaders(config: McpServerConfig): Record<string, string> {
  const headers: Record<string, string> = { ...(config.headers ?? {}) };
  if (config.bearerTokenEnvVar) {
    const token = process.env[config.bearerTokenEnvVar];
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }
  for (const [headerName, envName] of Object.entries(config.headersFromEnv ?? {})) {
    const value = process.env[envName];
    if (value) {
      headers[headerName] = value;
    }
  }
  return headers;
}
