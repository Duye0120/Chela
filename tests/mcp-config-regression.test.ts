import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  deleteMcpServerConfig,
  loadMcpConfig,
  saveMcpServerConfig,
} from "../src/mcp/config.ts";

function withTempDir(test: (dir: string) => void): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "chela-mcp-config-"));
  try {
    test(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

await withTempDir((dir) => {
  saveMcpServerConfig(dir, {
    originalName: null,
    name: "filesystem",
    type: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", dir],
    env: { MCP_TOKEN: "secret" },
    envPassthrough: ["PATH"],
    cwd: null,
    url: null,
    bearerTokenEnvVar: null,
    headers: {},
    headersFromEnv: {},
    disabled: false,
  });

  let config = loadMcpConfig(dir);
  assert.equal(config.mcpServers.filesystem.command, "npx");
  assert.equal(config.mcpServers.filesystem.type, "stdio");
  assert.deepEqual(config.mcpServers.filesystem.args, [
    "-y",
    "@modelcontextprotocol/server-filesystem",
    dir,
  ]);
  assert.equal(config.mcpServers.filesystem.env?.MCP_TOKEN, "secret");
  assert.deepEqual(config.mcpServers.filesystem.envPassthrough, ["PATH"]);

  saveMcpServerConfig(dir, {
    originalName: "filesystem",
    name: "fs",
    type: "stdio",
    command: "node",
    args: ["server.js"],
    env: null,
    envPassthrough: [],
    cwd: dir,
    url: null,
    bearerTokenEnvVar: null,
    headers: {},
    headersFromEnv: {},
    disabled: true,
  });

  config = loadMcpConfig(dir);
  assert.equal(config.mcpServers.filesystem, undefined);
  assert.equal(config.mcpServers.fs.command, "node");
  assert.equal(config.mcpServers.fs.cwd, dir);
  assert.equal(config.mcpServers.fs.disabled, true);
  assert.equal(config.mcpServers.fs.env?.MCP_TOKEN, "secret");

  saveMcpServerConfig(dir, {
    originalName: null,
    name: "remote",
    type: "streamable-http",
    command: "",
    args: [],
    env: null,
    envPassthrough: [],
    cwd: null,
    url: "https://mcp.example.com/mcp",
    bearerTokenEnvVar: "MCP_BEARER_TOKEN",
    headers: { "X-Chela": "1" },
    headersFromEnv: { "X-Api-Key": "MCP_API_KEY" },
    disabled: false,
  });
  config = loadMcpConfig(dir);
  assert.equal(config.mcpServers.remote.type, "streamable-http");
  assert.equal(config.mcpServers.remote.url, "https://mcp.example.com/mcp");
  assert.equal(config.mcpServers.remote.bearerTokenEnvVar, "MCP_BEARER_TOKEN");
  assert.equal(config.mcpServers.remote.headers?.["X-Chela"], "1");
  assert.equal(config.mcpServers.remote.headersFromEnv?.["X-Api-Key"], "MCP_API_KEY");

  deleteMcpServerConfig(dir, "fs");
  config = loadMcpConfig(dir);
  assert.equal(config.mcpServers.fs, undefined);
});

console.log("mcp config regression tests passed");
