import {
  execFile,
  spawn,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";
import { promisify } from "node:util";
import { createInterface } from "node:readline";
import { resolve } from "node:path";
import type { Plugin } from "vite";

export function chatDev(): Plugin {
  return {
    name: "chela-local-chat",
    apply: "serve",
    configureServer(server) {
      const root = process.cwd(),
        run = promisify(execFile);
      let starting: Promise<ChildProcessWithoutNullStreams> | undefined,
        child: ChildProcessWithoutNullStreams | undefined,
        serial = 0,
        closed = false;
      const pending = new Map<
        number,
        (value: { value?: unknown; error?: string }) => void
      >();
      async function start() {
        await Promise.all([
          run(process.execPath, ["native/scripts/build-agent.mjs"], {
            cwd: root,
          }),
          run(
            "go",
            [
              "-C",
              "native",
              "build",
              "-o",
              "bin/chat-dev.exe",
              "./cmd/chat-dev",
            ],
            { cwd: root },
          ),
        ]);
        if (closed) throw Error("预览已关闭");
        const p = spawn(resolve(root, "native/bin/chat-dev.exe"), [], {
          windowsHide: true,
          stdio: "pipe",
        });
        child = p;
        createInterface({ input: p.stdout }).on("line", (line) => {
          const v = JSON.parse(line);
          pending.get(v.id)?.(v);
          pending.delete(v.id);
        });
        const end = () => {
          starting = undefined;
          child = undefined;
          for (const finish of pending.values())
            finish({ error: "聊天服务已断开" });
          pending.clear();
        };
        p.on("error", end);
        p.on("exit", end);
        return p;
      }
      server.httpServer?.once("close", () => {
        closed = true;
        child?.stdin.end();
      });
      server.middlewares.use("/__chela/chat", async (req, res) => {
        const host = req.headers.host || "";
        if (
          req.method !== "POST" ||
          !/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host) ||
          req.headers.origin !== "http://" + host ||
          req.headers["x-chela-chat"] !== "1"
        ) {
          res.statusCode = 403;
          res.end();
          return;
        }
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "no-store");
        try {
          let body = "";
          for await (const chunk of req) {
            body += chunk;
            if (Buffer.byteLength(body) > 1024 * 1024) throw Error("消息过长");
          }
          const { method, args } = JSON.parse(body);
          if (typeof method !== "string" || !Array.isArray(args))
            throw Error("无效请求");
          const p = await (starting ??= start().catch((e) => {
            starting = undefined;
            throw e;
          }));
          const id = ++serial;
          const result = await new Promise((resolve) => {
            pending.set(id, resolve);
            p.stdin.write(JSON.stringify({ id, method, args }) + "\n", (e) => {
              if (e) {
                pending.delete(id);
                resolve({ error: "聊天服务已断开" });
              }
            });
          });
          res.end(JSON.stringify(result));
        } catch (e) {
          res.statusCode = 500;
          res.end(
            JSON.stringify({
              error: e instanceof Error ? e.message : "无法启动聊天服务",
            }),
          );
        }
      });
    },
  };
}
