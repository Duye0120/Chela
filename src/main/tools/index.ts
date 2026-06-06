import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { McpConnectionManager } from "../../mcp/client.ts";
import {
  getAllMcpTools,
  getMcpBrokerTool,
  getMcpResourceTools,
} from "../../mcp/adapter.ts";
import { createCommandHistoryTool } from "./command-history.ts";
import { createCodeDiagnosticsTool, createCodeInspectTool } from "./code-analysis.ts";
import { getTimeTool } from "./get-time.ts";
import { createFileEditTool } from "./file-edit.ts";
import { createFileReadTool } from "./file-read.ts";
import { createFileWriteTool } from "./file-write.ts";
import { createGlobSearchTool } from "./glob-search.ts";
import { createGrepSearchTool } from "./grep-search.ts";
import { createMemorySaveTool, createMemoryListTool } from "./memory.ts";
import { createShellExecTool } from "./shell-exec.ts";
import { createTodoReadTool, createTodoWriteTool } from "./todo.ts";
import { createWebFetchTool } from "./web-fetch.ts";
import { createWebSearchTool } from "./web-search.ts";
import { notifyUserTool } from "./notify.ts";

type ToolAssemblyOptions = {
  workspacePath: string;
  sessionId: string;
  mcpManager: McpConnectionManager;
};

const MAX_DIRECT_MCP_TOOLS = 12;

type BuiltinToolOptions = Pick<ToolAssemblyOptions, "workspacePath" | "sessionId">;

function dedupeTools(tools: AgentTool<any, any>[]): AgentTool<any, any>[] {
  const seen = new Set<string>();
  const deduped: AgentTool<any, any>[] = [];

  for (const tool of tools) {
    if (seen.has(tool.name)) {
      continue;
    }

    seen.add(tool.name);
    deduped.push(tool);
  }

  return deduped;
}

function aliasTool(
  tool: AgentTool<any, any>,
  aliasName: string,
  aliasLabel?: string,
): AgentTool<any, any> {
  return {
    ...tool,
    name: aliasName,
    label: aliasLabel ?? tool.label,
    async execute(toolCallId, params, signal, onUpdate) {
      return tool.execute(toolCallId, params, signal, onUpdate);
    },
  };
}

export function getBuiltinTools(options: BuiltinToolOptions): AgentTool<any, any>[] {
  const fileEdit = createFileEditTool(options.workspacePath);
  const globSearch = createGlobSearchTool(options.workspacePath);
  const grepSearch = createGrepSearchTool(options.workspacePath);
  const webSearch = createWebSearchTool();
  const todoRead = createTodoReadTool(options.sessionId);
  const todoWrite = createTodoWriteTool(options.sessionId);

  return [
    getTimeTool,
    createCodeInspectTool(options.workspacePath),
    createCodeDiagnosticsTool(options.workspacePath),
    createFileReadTool(options.workspacePath),
    fileEdit,
    aliasTool(fileEdit, "edit_file", "编辑文件"),
    createFileWriteTool(options.workspacePath),
    globSearch,
    grepSearch,
    createShellExecTool(options.workspacePath, options.sessionId),
    createCommandHistoryTool(options.sessionId),
    createWebFetchTool(),
    webSearch,
    aliasTool(webSearch, "WebSearch", "网页搜索"),
    todoRead,
    todoWrite,
    aliasTool(todoWrite, "TodoWrite", "写入待办"),
    createMemorySaveTool(options.sessionId),
    createMemoryListTool(),
    notifyUserTool,
  ];
}

export async function buildToolPool(
  options: ToolAssemblyOptions,
): Promise<AgentTool<any, any>[]> {
  const builtinTools = getBuiltinTools(options);
  const mcpResourceTools = getMcpResourceTools(options.mcpManager);
  const mcpBrokerTool = getMcpBrokerTool(options.mcpManager);
  const mcpTools = await getAllMcpTools(options.mcpManager.getConnections());
  const directMcpTools = mcpTools.length <= MAX_DIRECT_MCP_TOOLS ? mcpTools : [];

  return dedupeTools([
    ...builtinTools,
    ...mcpResourceTools,
    mcpBrokerTool,
    ...directMcpTools,
  ]);
}
