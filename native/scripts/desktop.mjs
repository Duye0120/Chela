import { spawn } from "node:child_process";
import { createServer as createPortServer } from "node:net";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { mkdtemp, mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(import.meta.url);
const mode = process.argv[2] || "dev";
if (!["dev", "build", "smoke"].includes(mode)) throw Error("未知的桌面命令");
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const electron = require("electron");
let interrupted = false;
async function run(command, args, options = {}) {
  const child = spawn(command, args, { cwd: root, stdio: "inherit", windowsHide: true, env, ...options });
  const stop = () => { interrupted = true; child.kill(); };
  process.once("SIGINT", stop); process.once("SIGTERM", stop);
  try {
    await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => code === 0 ? resolve() : reject(Error(`${command} 退出 (${code ?? signal})`)));
    });
  } finally { process.off("SIGINT", stop); process.off("SIGTERM", stop); }
}
try {
  await run(process.execPath, ["native/scripts/build-agent.mjs"]);
  if (mode !== "dev") await run(process.execPath, ["node_modules/vite/bin/vite.js", "build", "native/frontend", "--config", "native/frontend/vite.config.ts"]);
  await run("go", ["-C", "native", "build", "-ldflags=-H=windowsgui", "-o", "bin/Chela-service.exe", "."]);
  if (mode === "dev") {
    const { createServer } = await import("vite");
    const reservation = createPortServer();
    await new Promise((resolve, reject) => { reservation.once("error", reject); reservation.listen(0, "127.0.0.1", resolve); });
    const port = reservation.address().port;
    await new Promise((resolve, reject) => reservation.close(error => error ? reject(error) : resolve()));
    const nonce = randomBytes(16).toString("base64");
    const server = await createServer({
      root: join(root, "native/frontend"), configFile: join(root, "native/frontend/vite.config.ts"),
      html: { cspNonce: nonce },
      server: { host: "127.0.0.1", port, strictPort: true, ws: { protocol: "ws", host: "127.0.0.1", clientPort: port } },
    });
    try {
      await server.listen();
      env.CHELA_RENDERER_DEV_URL = `http://127.0.0.1:${port}/`;
      env.CHELA_RENDERER_DEV_NONCE = nonce;
      console.log(`Chela Electron UI 热更新已就绪（Vite ${env.CHELA_RENDERER_DEV_URL}）`);
      console.log("React / CSS 保存后自动更新；Electron main / preload 或 Go 代码修改后需要重启。");
      await run(electron, [root, ...process.argv.slice(3)]);
    } finally { await server.close(); }
  } else if (mode === "build") {
    await run(process.execPath, [require.resolve("electron-builder/cli.js"), "--win", "--dir"]);
  } else {
    if (mode === "smoke") {
      const profile = await mkdtemp(join(tmpdir(), "chela-electron-smoke-"));
      await mkdir(join(root, "output"), { recursive: true });
      env.CHELA_SHELL_PROFILE = profile;
      env.CHELA_PROVIDER_DIR = join(profile, "providers");
      env.CHELA_SMOKE_REPORT = join(root, "output/electron-smoke.json");
    }
    await run(electron, [root]);
    if (mode === "smoke") {
      const report = JSON.parse(await readFile(env.CHELA_SMOKE_REPORT, "utf8"));
      if (!report.passed || report.profile !== env.CHELA_SHELL_PROFILE) throw Error("Electron 烟测没有生成本次成功报告");
      console.log(`Electron smoke passed: ${report.checks.length} groups`);
    }
  }
} catch (error) {
  if (!interrupted) throw error;
  process.exitCode = 130;
}
