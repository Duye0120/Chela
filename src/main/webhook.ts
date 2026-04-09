// ---------------------------------------------------------------------------
// Webhook Receiver — 本机 HTTP 服务，接收外部推送并路由到 Event Bus
// ---------------------------------------------------------------------------

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createHmac } from "node:crypto";
import { app } from "electron";
import { bus } from "./event-bus.js";
import { appLogger } from "./logger.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WebhookConfig {
  /** 监听端口，默认 17433 */
  port: number;
  /** HMAC-SHA256 密钥，为空则跳过验签 */
  secret: string;
  /** 是否启用，默认 false */
  enabled: boolean;
}

const DEFAULT_CONFIG: WebhookConfig = {
  port: 17433,
  enabled: false,
  secret: "",
};

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let server: ReturnType<typeof createServer> | null = null;
let currentConfig: WebhookConfig = { ...DEFAULT_CONFIG };

// ---------------------------------------------------------------------------
// Signature Verification
// ---------------------------------------------------------------------------

function verifySignature(body: string, signature: string, secret: string): boolean {
  if (!secret) return true;
  const expected = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
  return expected === signature;
}

// ---------------------------------------------------------------------------
// Request Handler
// ---------------------------------------------------------------------------

function handleRequest(req: IncomingMessage, res: ServerResponse): void {
  // 只接受 POST
  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Method Not Allowed" }));
    return;
  }

  const chunks: Buffer[] = [];
  req.on("data", (chunk: Buffer) => chunks.push(chunk));

  req.on("end", () => {
    const body = Buffer.concat(chunks).toString("utf-8");

    // 验签
    if (currentConfig.secret) {
      const sig = (req.headers["x-webhook-signature"] as string) || "";
      if (!verifySignature(body, sig, currentConfig.secret)) {
        appLogger.warn({
          scope: "webhook",
          message: "签名验证失败",
          data: { ip: req.socket.remoteAddress },
        });
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized" }));
        return;
      }
    }

    // 解析 JSON
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(body) as Record<string, unknown>;
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON" }));
      return;
    }

    // 提取来源和事件类型
    const source = (req.headers["x-webhook-source"] as string) || "unknown";
    const event = (req.headers["x-webhook-event"] as string) || "generic";

    // 路由到 Event Bus
    bus.emit("webhook:received", { source, event, payload });

    appLogger.info({
      scope: "webhook",
      message: `收到 webhook: ${source}/${event}`,
    });

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });

  req.on("error", (err) => {
    appLogger.error({
      scope: "webhook",
      message: "请求读取失败",
      error: err,
    });
    res.writeHead(500);
    res.end();
  });
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export function startWebhookServer(config?: Partial<WebhookConfig>): void {
  if (server) return;

  currentConfig = { ...DEFAULT_CONFIG, ...config };
  if (!currentConfig.enabled) return;

  server = createServer(handleRequest);

  server.listen(currentConfig.port, "127.0.0.1", () => {
    appLogger.info({
      scope: "webhook",
      message: `Webhook 服务已启动 → 127.0.0.1:${currentConfig.port}`,
    });
  });

  server.on("error", (err) => {
    appLogger.error({
      scope: "webhook",
      message: "Webhook 服务启动失败",
      error: err,
    });
    server = null;
  });
}

export function stopWebhookServer(): void {
  if (!server) return;
  server.close(() => {
    appLogger.info({ scope: "webhook", message: "Webhook 服务已停止" });
  });
  server = null;
}

export function getWebhookPort(): number | null {
  return server ? currentConfig.port : null;
}
