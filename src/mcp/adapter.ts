import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@mariozechner/pi-ai";
import type { McpConnection } from "./client.js";

/**
 * Convert MCP server tools into AgentTool instances.
 * Tool names are prefixed with `mcp_{serverName}_` to avoid collisions.
 */
export async function mcpToolsFromConnection(
  conn: McpConnection,
): Promise<AgentTool<any, any>[]> {
  if (!conn.connected) return [];

  try {
    const result = await conn.client.listTools();
    return result.tools.map((tool) => mcpToolToAgentTool(conn, tool));
  } catch {
    return [];
  }
}

function mcpToolToAgentTool(
  conn: McpConnection,
  tool: { name: string; description?: string; inputSchema?: any },
): AgentTool<any, any> {
  const prefixedName = `mcp_${conn.name}_${tool.name}`;

  // Convert MCP JSON Schema to TypeBox-compatible schema
  // For simplicity, we accept any object — the MCP server validates
  const parameters = Type.Object({
    args: Type.Optional(Type.Any({ description: "工具参数（JSON 对象）" })),
  });

  return {
    name: prefixedName,
    label: `${conn.name}/${tool.name}`,
    description: tool.description ?? `MCP 工具: ${tool.name}（来自 ${conn.name}）`,
    parameters,
    async execute(_toolCallId, params) {
      if (!conn.connected) {
        return {
          content: [{ type: "text", text: `MCP 服务 ${conn.name} 已断开连接` }],
          details: { error: "disconnected" },
        };
      }

      try {
        const result = await conn.client.callTool({
          name: tool.name,
          arguments: params.args ?? {},
        });

        // Extract text from content blocks
        const textParts: string[] = [];
        if ("content" in result && Array.isArray(result.content)) {
          for (const block of result.content) {
            if (block.type === "text") {
              textParts.push(block.text);
            }
          }
        }

        const text = textParts.length > 0
          ? textParts.join("\n")
          : JSON.stringify(result, null, 2);

        return {
          content: [{ type: "text", text }],
          details: {
            server: conn.name,
            tool: tool.name,
            isError: "isError" in result ? result.isError : false,
          },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "MCP 调用失败";
        return {
          content: [{ type: "text", text: `MCP 工具调用失败: ${message}` }],
          details: { server: conn.name, tool: tool.name, error: message },
        };
      }
    },
  };
}

/**
 * Get all MCP tools from all active connections.
 */
export async function getAllMcpTools(
  connections: McpConnection[],
): Promise<AgentTool<any, any>[]> {
  const results = await Promise.allSettled(
    connections.map((conn) => mcpToolsFromConnection(conn)),
  );

  const tools: AgentTool<any, any>[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      tools.push(...result.value);
    }
  }

  return tools;
}
