// ---------------------------------------------------------------------------
// Webhook Receiver — 本机 HTTP 服务，接收外部推送并路由到 Event Bus
// ---------------------------------------------------------------------------

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";
import { BUS_EVENTS, bus } from "./event-bus.js";
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
const MAX_WEBHOOK_BODY_BYTES = 256 * 1024;

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
  const normalizedSignature = signature.trim();
  if (!normalizedSignature) {
    return false;
  }

  const expected = Buffer.from(
    "sha256=" + createHmac("sha256", secret).update(body).digest("hex"),
    "utf-8",
  );
  const received = Buffer.from(normalizedSignature, "utf-8");

  return expected.length === received.length && timingSafeEqual(expected, received);
}

function readHeaderValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0]?.trim() ?? "";
  }
  return typeof value === "string" ? value.trim() : "";
}

function respondJson(
  res: ServerResponse,
  statusCode: number,
  body: Record<string, unknown>,
): void {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

// ---------------------------------------------------------------------------
// Request Handler
// ---------------------------------------------------------------------------

function handleRequest(req: IncomingMessage, res: ServerResponse): void {
  // 只接受 POST
  if (req.method !== "POST") {
    respondJson(res, 405, { error: "Method Not Allowed" });
    return;
  }

  const contentType = readHeaderValue(req.headers["content-type"]);
  if (contentType && !contentType.toLowerCase().startsWith("application/json")) {
    respondJson(res, 415, { error: "Unsupported Media Type" });
    return;
  }

  const declaredContentLength = Number.parseInt(
    readHeaderValue(req.headers["content-length"]),
    10,
  );
  if (
    Number.isFinite(declaredContentLength) &&
    declaredContentLength > MAX_WEBHOOK_BODY_BYTES
  ) {
    appLogger.warn({
      scope: "webhook",
      message: "Webhook 请求体超过限制",
      data: {
        contentLength: declaredContentLength,
        maxBytes: MAX_WEBHOOK_BODY_BYTES,
        ip: req.socket.remoteAddress,
      },
    });
    respondJson(res, 413, { error: "Payload Too Large" });
    return;
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;
  let exceededLimit = false;
  req.on("data", (chunk: Buffer) => {
    totalBytes += chunk.length;
    if (exceededLimit) {
      return;
    }
    if (totalBytes > MAX_WEBHOOK_BODY_BYTES) {
      exceededLimit = true;
      chunks.length = 0;
    } else {
      chunks.push(chunk);
    }
  });

  req.on("end", () => {
    if (exceededLimit) {
      appLogger.warn({
        scope: "webhook",
        message: "Webhook 请求体读取后确认超限",
        data: {
          receivedBytes: totalBytes,
          maxBytes: MAX_WEBHOOK_BODY_BYTES,
          ip: req.socket.remoteAddress,
        },
      });
      respondJson(res, 413, { error: "Payload Too Large" });
      return;
    }

    const body = Buffer.concat(chunks).toString("utf-8");

    // 验签
    if (currentConfig.secret) {
      const sig = readHeaderValue(req.headers["x-webhook-signature"]);
      if (!verifySignature(body, sig, currentConfig.secret)) {
        appLogger.warn({
          scope: "webhook",
          message: "签名验证失败",
          data: { ip: req.socket.remoteAddress },
        });
        respondJson(res, 401, { error: "Unauthorized" });
        return;
      }
    }

    // 解析 JSON
    let payload: unknown;
    try {
      payload = JSON.parse(body) as unknown;
    } catch {
      respondJson(res, 400, { error: "Invalid JSON" });
      return;
    }

    // 提取来源和事件类型
    const source = readHeaderValue(req.headers["x-webhook-source"]) || "unknown";
    const event = readHeaderValue(req.headers["x-webhook-event"]) || "generic";

    // 路由到 Event Bus
    bus.emit(BUS_EVENTS.WEBHOOK_RECEIVED, { source, event, payload });

    appLogger.info({
      scope: "webhook",
      message: `收到 webhook: ${source}/${event}`,
    });

    respondJson(res, 200, { ok: true });
  });

  req.on("error", (err) => {
    appLogger.error({
      scope: "webhook",
      message: "请求读取失败",
      error: err,
    });
    respondJson(res, 500, { error: "Internal Server Error" });
  });
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export async function startWebhookServer(config?: Partial<WebhookConfig>): Promise<void> {
  if (server) return;

  currentConfig = { ...DEFAULT_CONFIG, ...config };
  if (!currentConfig.enabled) return;

  const nextServer = createServer(handleRequest);

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      nextServer.removeListener("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      nextServer.removeListener("error", onError);
      resolve();
    };

    nextServer.once("error", onError);
    nextServer.once("listening", onListening);
    nextServer.listen(currentConfig.port, "127.0.0.1");
  });

  server = nextServer;

  appLogger.info({
    scope: "webhook",
    message: `Webhook 服务已启动 → 127.0.0.1:${currentConfig.port}`,
  });

  server.on("error", (err) => {
    appLogger.error({
      scope: "webhook",
      message: "Webhook 服务运行异常",
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
