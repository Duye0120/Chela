import { existsSync, readFileSync, renameSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { McpServerConfigDraft } from "../shared/contracts.js";

export type McpServerConfig = {
  type?: "stdio" | "streamable-http";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  envPassthrough?: string[];
  cwd?: string;
  url?: string;
  bearerTokenEnvVar?: string;
  headers?: Record<string, string>;
  headersFromEnv?: Record<string, string>;
  disabled?: boolean;
};

export type McpConfig = {
  mcpServers: Record<string, McpServerConfig>;
};

const MCP_CONFIG_FILE = "mcp.json";

export function getMcpConfigPath(workspacePath: string): string {
  return join(workspacePath, MCP_CONFIG_FILE);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function warnMcpConfig(configPath: string, message: string, data?: unknown): void {
  console.warn("[mcp.config]", message, {
    configPath,
    ...(data && typeof data === "object" ? (data as Record<string, unknown>) : {}),
  });
}

export function normalizeMcpIdentifier(value: string, fallback: string): string {
  const normalized = value
    .trim()
    .replace(/[^A-Za-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  return normalized || fallback;
}

function normalizeStringArray(
  value: unknown,
): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const result = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);

  return result.length > 0 ? result : undefined;
}

function normalizeStringRecord(
  value: unknown,
): Record<string, string> | undefined {
  if (!isPlainObject(value)) {
    return undefined;
  }

  const result: Record<string, string> = {};

  for (const [key, nested] of Object.entries(value)) {
    if (typeof nested !== "string") {
      continue;
    }

    const trimmed = nested.trim();
    if (!trimmed) {
      continue;
    }
    result[key] = trimmed;
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

function normalizeServerConfig(
  configPath: string,
  serverName: string,
  value: unknown,
): McpServerConfig | null {
  if (!isPlainObject(value)) {
    warnMcpConfig(configPath, "MCP server 配置格式无效，已忽略。", {
      serverName,
    });
    return null;
  }

  const type =
    value.type === "streamable-http" || value.transport === "streamable-http" || value.url
      ? "streamable-http"
      : "stdio";
  const command = typeof value.command === "string" ? value.command.trim() : "";
  const url = typeof value.url === "string" ? value.url.trim() : "";
  if (type === "stdio" && !command) {
    warnMcpConfig(configPath, "MCP server 缺少有效 command，已忽略。", {
      serverName,
    });
    return null;
  }
  if (type === "streamable-http" && !url) {
    warnMcpConfig(configPath, "MCP HTTP server 缺少有效 url，已忽略。", {
      serverName,
    });
    return null;
  }

  const args = normalizeStringArray(value.args);
  const env = normalizeStringRecord(value.env);
  const envPassthrough = normalizeStringArray(value.envPassthrough);
  const headers = normalizeStringRecord(value.headers);
  const headersFromEnv = normalizeStringRecord(value.headersFromEnv);
  const bearerTokenEnvVar =
    typeof value.bearerTokenEnvVar === "string" && value.bearerTokenEnvVar.trim()
      ? value.bearerTokenEnvVar.trim()
      : undefined;
  const cwd =
    typeof value.cwd === "string" && value.cwd.trim()
      ? value.cwd.trim()
      : undefined;

  return {
    type,
    command,
    args,
    env,
    envPassthrough,
    cwd,
    url,
    bearerTokenEnvVar,
    headers,
    headersFromEnv,
    disabled: value.disabled === true,
  };
}

/**
 * Read and parse the mcp.json config from workspace.
 */
export function loadMcpConfig(workspacePath: string): McpConfig {
  const configPath = getMcpConfigPath(workspacePath);
  if (!existsSync(configPath)) {
    return { mcpServers: {} };
  }

  try {
    const raw = readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<McpConfig>;
    if (!isPlainObject(parsed)) {
      warnMcpConfig(configPath, "MCP 配置根对象无效，已回退为空配置。");
      return { mcpServers: {} };
    }

    const rawServers = isPlainObject(parsed.mcpServers)
      ? parsed.mcpServers
      : isPlainObject((parsed as { servers?: unknown }).servers)
        ? (parsed as { servers: Record<string, unknown> }).servers
        : parsed.mcpServers;
    if (!isPlainObject(rawServers)) {
      if (rawServers != null) {
        warnMcpConfig(configPath, "mcpServers 字段无效，已回退为空配置。");
      }
      return { mcpServers: {} };
    }

    const normalizedServers: Record<string, McpServerConfig> = {};
    const seenIdentifiers = new Map<string, string>();

    for (const [serverName, serverConfig] of Object.entries(rawServers)) {
      const normalized = normalizeServerConfig(configPath, serverName, serverConfig);
      if (!normalized) {
        continue;
      }

      const normalizedIdentifier = normalizeMcpIdentifier(serverName, "server");
      const existingOwner = seenIdentifiers.get(normalizedIdentifier);
      if (existingOwner && existingOwner !== serverName) {
        warnMcpConfig(
          configPath,
          "MCP server 名称归一化后发生冲突，后续冲突项已忽略。",
          {
            serverName,
            conflictingWith: existingOwner,
            normalizedIdentifier,
          },
        );
        continue;
      }

      seenIdentifiers.set(normalizedIdentifier, serverName);
      normalizedServers[serverName] = normalized;
    }

    return {
      mcpServers: normalizedServers,
    };
  } catch (err) {
    console.warn("[mcp.config] 解析 MCP 配置失败，已回退为空配置。", {
      configPath,
      error: err instanceof Error ? err.message : String(err),
    });
    return { mcpServers: {} };
  }
}

function readEditableMcpConfig(workspacePath: string): Record<string, unknown> {
  const configPath = getMcpConfigPath(workspacePath);
  if (!existsSync(configPath)) {
    return { mcpServers: {} };
  }
  const parsed = JSON.parse(readFileSync(configPath, "utf-8")) as unknown;
  if (!isPlainObject(parsed)) {
    throw new Error("mcp.json 必须是对象。");
  }
  const servers = (parsed.mcpServers ?? (parsed as { servers?: unknown }).servers) as unknown;
  if (servers !== undefined && !isPlainObject(servers)) {
    throw new Error("mcp.json 的 mcpServers 必须是对象。");
  }
  return {
    ...parsed,
    mcpServers: servers && isPlainObject(servers) ? { ...servers } : {},
  };
}

function writeEditableMcpConfig(workspacePath: string, config: Record<string, unknown>): void {
  const configPath = getMcpConfigPath(workspacePath);
  mkdirSync(workspacePath, { recursive: true });
  const tempPath = `${configPath}.tmp`;
  writeFileSync(tempPath, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
  renameSync(tempPath, configPath);
}

export function saveMcpServerConfig(
  workspacePath: string,
  draft: McpServerConfigDraft,
): McpConfig {
  const config = readEditableMcpConfig(workspacePath);
  const servers = isPlainObject(config.mcpServers) ? { ...config.mcpServers } : {};
  const originalName = draft.originalName?.trim();
  const nextName = draft.name.trim();
  const existingServer =
    originalName && isPlainObject(servers[originalName])
      ? (servers[originalName] as Record<string, unknown>)
      : null;

  if (originalName && originalName !== nextName) {
    delete servers[originalName];
  }

  const nextConfig: McpServerConfig = {
    type: draft.type,
  };
  if (draft.type === "stdio") {
    nextConfig.command = draft.command.trim();
  } else {
    nextConfig.url = draft.url?.trim() ?? "";
  }
  const args = draft.args.map((item) => item.trim()).filter(Boolean);
  if (draft.type === "stdio" && args.length > 0) {
    nextConfig.args = args;
  }
  const env = draft.env === null ? normalizeStringRecord(existingServer?.env) : normalizeStringRecord(draft.env);
  if (draft.type === "stdio" && env) {
    nextConfig.env = env;
  }
  const envPassthrough = draft.envPassthrough.map((item) => item.trim()).filter(Boolean);
  if (draft.type === "stdio" && envPassthrough.length > 0) {
    nextConfig.envPassthrough = envPassthrough;
  }
  const cwd = draft.cwd?.trim();
  if (draft.type === "stdio" && cwd) {
    nextConfig.cwd = cwd;
  }
  if (draft.type === "streamable-http") {
    const headers =
      draft.headers === null
        ? normalizeStringRecord(existingServer?.headers)
        : normalizeStringRecord(draft.headers);
    if (headers) {
      nextConfig.headers = headers;
    }
    const headersFromEnv =
      draft.headersFromEnv === null
        ? normalizeStringRecord(existingServer?.headersFromEnv)
        : normalizeStringRecord(draft.headersFromEnv);
    if (headersFromEnv) {
      nextConfig.headersFromEnv = headersFromEnv;
    }
    const bearerTokenEnvVar = draft.bearerTokenEnvVar?.trim();
    if (bearerTokenEnvVar) {
      nextConfig.bearerTokenEnvVar = bearerTokenEnvVar;
    }
  }
  if (draft.disabled) {
    nextConfig.disabled = true;
  }

  servers[nextName] = nextConfig as unknown as Record<string, unknown>;
  writeEditableMcpConfig(workspacePath, {
    ...config,
    mcpServers: servers,
  });
  return loadMcpConfig(workspacePath);
}

export function deleteMcpServerConfig(workspacePath: string, serverName: string): McpConfig {
  const config = readEditableMcpConfig(workspacePath);
  const servers = isPlainObject(config.mcpServers) ? { ...config.mcpServers } : {};
  delete servers[serverName];
  writeEditableMcpConfig(workspacePath, {
    ...config,
    mcpServers: servers,
  });
  return loadMcpConfig(workspacePath);
}

/**
 * Get active (non-disabled) server entries.
 */
export function getActiveServers(config: McpConfig): [string, McpServerConfig][] {
  return Object.entries(config.mcpServers).filter(
    ([, cfg]) => !cfg.disabled
  );
}
