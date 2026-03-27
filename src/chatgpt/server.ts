import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "../..");
const PORT = Number(process.env.PORT ?? "8787");
const MCP_PATH = "/mcp";
const TOOL_NAME = "show_time_card";
const WIDGET_URI = "ui://widget/time-card-v1.html";
const WIDGET_HTML = readFileSync(path.join(ROOT_DIR, "public", "widget.html"), "utf8");

function buildTimePayload(note?: string) {
  const now = new Date();
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai";
  const localTime = now.toLocaleString("zh-CN", {
    hour12: false,
    timeZone,
  });

  return {
    title: "时间卡片",
    subtitle: note?.trim() || "这是一个最小可跑的 ChatGPT App Demo。",
    localTime,
    isoTime: now.toISOString(),
    timeZone,
    refreshedAt: `${localTime} 刷新`,
  };
}

function createAppServer() {
  const server = new McpServer({
    name: "first-pi-chatgpt-app",
    version: "1.0.0",
  });

  registerAppResource(server, "time-widget", WIDGET_URI, {}, async () => ({
    contents: [
      {
        uri: WIDGET_URI,
        mimeType: RESOURCE_MIME_TYPE,
        text: WIDGET_HTML,
        _meta: {
          ui: {
            prefersBorder: true,
            csp: {
              connectDomains: [],
              resourceDomains: [],
            },
          },
          "openai/widgetDescription": "展示当前本地时间的卡片式 ChatGPT App 小组件。",
        },
      },
    ],
  }));

  registerAppTool(
    server,
    TOOL_NAME,
    {
      title: "查看当前时间",
      description: "Use this when the user wants the current local time rendered as a widget card.",
      inputSchema: {
        note: z.string().optional().describe("Optional subtitle shown inside the widget."),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: true,
      },
      _meta: {
        ui: {
          resourceUri: WIDGET_URI,
        },
        "openai/toolInvocation/invoking": "正在刷新时间卡片",
        "openai/toolInvocation/invoked": "时间卡片已更新",
      },
    },
    async ({ note }) => {
      const payload = buildTimePayload(note);

      return {
        content: [
          {
            type: "text" as const,
            text: `当前时间是 ${payload.localTime}（${payload.timeZone}）。`,
          },
        ],
        structuredContent: payload,
        _meta: {
          "openai/outputTemplate": WIDGET_URI,
        },
      };
    },
  );

  return server;
}

createServer(async (req, res) => {
  if (!req.url) {
    res.writeHead(400).end("Missing URL");
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);
  const isMcpRoute = url.pathname === MCP_PATH || url.pathname.startsWith(`${MCP_PATH}/`);

  if (req.method === "OPTIONS" && isMcpRoute) {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "content-type, mcp-session-id",
      "Access-Control-Expose-Headers": "Mcp-Session-Id",
    });
    res.end();
    return;
  }

  if (req.method === "GET" && url.pathname === "/") {
    res
      .writeHead(200, { "content-type": "text/plain; charset=utf-8" })
      .end("first-pi ChatGPT App MCP server");
    return;
  }

  if (isMcpRoute && req.method && new Set(["GET", "POST", "DELETE"]).has(req.method)) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");

    const server = createAppServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    res.on("close", () => {
      transport.close();
      server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } catch (error) {
      console.error("Failed to handle MCP request:", error);

      if (!res.headersSent) {
        res.writeHead(500).end("Internal server error");
      }
    }
    return;
  }

  res.writeHead(404).end("Not Found");
}).listen(PORT, () => {
  console.log(`ChatGPT App MCP server listening at http://localhost:${PORT}${MCP_PATH}`);
});
