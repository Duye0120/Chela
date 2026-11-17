import { app, BrowserWindow, Menu, Tray, dialog, ipcMain, nativeImage, net, protocol, screen, shell } from "electron";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { format } from "node:util";
import { startBackend } from "./backend.mjs";
import { createBrowser } from "./browser.mjs";
import { createPet } from "./pet.mjs";
import { importPreferences } from "./preferences.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const preferencesReader = process.argv.includes("--chela-preferences-reader");
if (!preferencesReader) {
  app.setName("Chela");
  if (process.platform === "win32") app.setAppUserModelId("com.chela.desktop");
  app.setPath("userData", process.env.CHELA_SHELL_PROFILE || join(app.getPath("appData"), "Chela"));
}
protocol.registerSchemesAsPrivileged([{ scheme: "chela", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
const origin = "chela://app";
const rendererDevURL = !app.isPackaged && process.env.CHELA_RENDERER_DEV_URL ? new URL(process.env.CHELA_RENDERER_DEV_URL) : null;
const rendererDevNonce = process.env.CHELA_RENDERER_DEV_NONCE || "";
if (rendererDevURL && (rendererDevURL.protocol !== "http:" || rendererDevURL.hostname !== "127.0.0.1" || !rendererDevURL.port || rendererDevURL.pathname !== "/" || rendererDevURL.search || rendererDevURL.hash || rendererDevURL.username || rendererDevURL.password || !/^[A-Za-z0-9+/]{22}==$/.test(rendererDevNonce))) throw Error("Electron 开发地址必须是本机 Vite 服务，请使用 npm run dev 启动");
let main, backend, browser, pet, tray, stopping = false, stopped = false, logStream, windowStates = {};
const log = error => logStream?.write(`${new Date().toISOString()} ${error instanceof Error ? error.stack : String(error)}\n`);
// Desktop launches may outlive the terminal's pipes; logging must not raise EPIPE.
for (const stream of [process.stdout, process.stderr]) stream.on("error", error => { if (error.code !== "EPIPE") log(error); });
if (!preferencesReader) {
  for (const name of ["log", "info", "warn", "error", "debug"]) console[name] = (...args) => log(format(...args));
  const fatal = error => { log(error); process.exitCode = 1; app.quit(); };
  process.on("uncaughtException", fatal);
  process.on("unhandledRejection", fatal);
}
const showMain = () => { if (main && !main.isDestroyed()) { if (main.isMinimized()) main.restore(); main.show(); main.focus(); } };

function trusted(event) {
  const isMain = event.sender === main?.webContents, isPet = event.sender === pet?.window.webContents;
  if ((!isMain && !isPet) || event.senderFrame !== event.sender.mainFrame) throw Error("拒绝非应用页面调用");
  const url = new URL(event.senderFrame.url);
  if (url.protocol !== "chela:" || url.host !== "app" || url.pathname !== "/") throw Error("拒绝非应用页面调用");
  return isMain ? "main" : "pet";
}

function remember(key, window) {
  const save = () => {
    if (window.isDestroyed()) return;
    windowStates[key] = { ...window.getNormalBounds(), maximized: window.isMaximized(), fullScreen: window.isFullScreen() };
  };
  for (const name of ["resize", "move", "maximize", "unmaximize", "enter-full-screen", "leave-full-screen", "close"]) window.on(name, save);
}

async function load(window, isPet = false) {
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  const guard = event => event.preventDefault();
  window.webContents.on("will-navigate", guard);
  window.webContents.on("will-redirect", guard);
  return window.loadURL(origin + "/" + (isPet ? "?pet=1" : ""));
}

async function hostCall(method, args) {
  if (method.startsWith("Browser.")) {
    if (!browser) throw Error("浏览器尚未就绪");
    return browser.call(method, args);
  }
  if (method.startsWith("Pet.")) {
    if (!pet) throw Error("桌宠尚未就绪");
    return pet.host(method, args);
  }
  switch (method) {
    case "Shell.OpenPath": {
      if (typeof args[0] !== "string" || !isAbsolute(args[0])) throw Error("本机路径无效");
      const error = await shell.openPath(args[0]);
      if (error) throw Error(error);
      return;
    }
    case "Shell.OpenExternal": {
      const url = new URL(args[0]);
      if (!["http:", "https:", "vscode:", "cursor:", "windsurf:"].includes(url.protocol) || url.username || url.password) throw Error("外部地址无效");
      await shell.openExternal(url.href); return;
    }
    case "Dialog.ChooseDirectory": {
      const result = await dialog.showOpenDialog(main, { title: String(args[0]).slice(0, 120), properties: ["openDirectory"] });
      return result.canceled ? [] : result.filePaths;
    }
    case "App.Quit": setImmediate(() => app.quit()); return;
    default: throw Error("未知的桌面宿主操作");
  }
}

async function start() {
  const profile = app.getPath("userData");
  await mkdir(join(profile, "logs"), { recursive: true });
  logStream = createWriteStream(join(profile, "logs", "electron.log"), { flags: "a" });
  logStream.on("error", () => { logStream = undefined; process.exitCode = 1; app.quit(); });
  try {
    windowStates = JSON.parse(await readFile(join(profile, "window-state.json"), "utf8"));
    if (!windowStates || typeof windowStates !== "object" || Array.isArray(windowStates)) throw Error("窗口位置记录无效，使用默认位置");
  } catch (error) { windowStates = {}; if (error.code !== "ENOENT") log(error); }
  const frontend = app.isPackaged ? join(process.resourcesPath, "frontend") : join(root, "native/dist");
  protocol.handle("chela", async request => {
    const url = new URL(request.url);
    if (url.host !== "app" || request.method !== "GET") return new Response("Forbidden", { status: 403 });
    if (url.pathname === "/__preferences") return new Response("<!doctype html><title>Chela</title>", { headers: { "Content-Type": "text/html" } });
    const path = join(frontend, decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname));
    const local = relative(frontend, path);
    if (local.startsWith(".." + sep) || isAbsolute(local)) return new Response("Forbidden", { status: 403 });
    try {
      const response = await net.fetch(rendererDevURL ? rendererDevURL.href + url.pathname.slice(1) + url.search : pathToFileURL(path).href, { redirect: "error" });
      const headers = new Headers(response.headers);
      headers.set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: http: https:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-src 'none'; form-action 'none'");
      if (rendererDevURL) headers.set("Content-Security-Policy", headers.get("Content-Security-Policy")
        .replace("script-src 'self'", `script-src 'self' 'nonce-${rendererDevNonce}'`)
        .replace("connect-src 'self'", `connect-src 'self' ws://${rendererDevURL.host}`));
      headers.set("X-Content-Type-Options", "nosniff");
      return new Response(response.body, { status: response.status, headers });
    } catch { return new Response(rendererDevURL ? "Vite 开发服务连接失败，请重新启动 npm run dev" : "Not found", { status: rendererDevURL ? 503 : 404 }); }
  });
  const options = { frame: false, show: false, icon: join(here, "icon.png"), webPreferences: { preload: join(here, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } };
  const saved = windowStates.main || {};
  const bounds = { width: Math.max(720, Math.min(20000, Number(saved.width) || 1480)), height: Math.max(460, Math.min(20000, Number(saved.height) || 920)) };
  if (Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
    const area = screen.getDisplayMatching({ ...bounds, x: saved.x, y: saved.y }).workArea;
    bounds.x = Math.max(area.x, Math.min(saved.x, area.x + area.width - Math.min(bounds.width, area.width)));
    bounds.y = Math.max(area.y, Math.min(saved.y, area.y + area.height - Math.min(bounds.height, area.height)));
  }
  main = new BrowserWindow({ ...options, ...bounds, minWidth: 720, minHeight: 460, title: "Chela", backgroundColor: "#f5f5f5" });
  remember("main", main);
  Menu.setApplicationMenu(null);
  browser = createBrowser(main);
  const executable = app.isPackaged ? join(process.resourcesPath, "backend", "Chela-service.exe") : join(root, "native/bin/Chela-service.exe");
  backend = startBackend(executable, profile, hostCall, logStream);
  backend.exited.then(() => {
    if (!stopping) { dialog.showErrorBox("Chela 后端已退出", "请重新启动应用。详细信息见数据目录 logs/host.log 和 logs/electron.log。"); app.quit(); }
  });
  ipcMain.handle("chela:service", (event, method, args) => {
    const role = trusted(event);
    if (stopping || typeof method !== "string" || !/^(Chat|Work|Terminal|Browser|Pet)\.[A-Z][A-Za-z]+$/.test(method) || !Array.isArray(args) || args.length > 12 || (role === "pet" && !method.startsWith("Pet."))) throw Error("服务请求无效");
    return backend.call(method, ...args);
  });
  ipcMain.handle("chela:window", (event, action) => {
    if (trusted(event) !== "main") throw Error("窗口请求无效");
    switch (action) {
      case "minimize": return main.minimize();
      case "toggleMaximize": return main.isMaximized() ? main.unmaximize() : main.maximize();
      case "isMaximized": return main.isMaximized();
      case "close": return main.close();
      default: throw Error("窗口请求无效");
    }
  });
  await main.loadURL(origin + "/__preferences");
  await importPreferences(main, profile, log).catch(log);
  await load(main);
  pet = createPet({ main, options, load, call: (method, ...args) => backend.call(method, ...args), showMain, log });
  const petSaved = windowStates.pet;
  if (Number.isFinite(petSaved?.x) && Number.isFinite(petSaved?.y)) pet.window.setPosition(petSaved.x, petSaved.y);
  remember("pet", pet.window);
  await pet.loaded;
  if (saved.maximized) main.maximize();
  if (saved.fullScreen) main.setFullScreen(true);
  if (!process.env.CHELA_SMOKE_REPORT) main.show();
  try {
    // Keep the existing Chela artwork in the native tray.
    tray = new Tray(nativeImage.createFromPath(join(here, "icon.png")));
    tray.setToolTip("Chela · 关闭主窗口后继续运行");
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: "打开 Chela", click: showMain },
      { label: "显示桌宠", click: () => backend.call("Pet.SetHidden", false).catch(log) },
      { label: "隐藏桌宠", click: () => backend.call("Pet.SetHidden", true).catch(log) },
      { label: "退出 Chela", click: () => app.quit() },
    ]));
    tray.on("double-click", showMain);
  } catch (error) { log(error); }
  let closing = false;
  main.on("close", event => {
    if (stopping) return;
    event.preventDefault();
    if (closing) return;
    closing = true;
    backend.call("Work.WindowCloseMode").then(mode => {
      if (mode === "quit" || !tray) app.quit(); else if (mode === "minimize") main.minimize(); else main.hide();
    }).catch(error => { log(error); if (tray) main.hide(); else app.quit(); }).finally(() => { closing = false; });
  });
  // An explicit smoke run uses an isolated profile and exits without contacting a model.
  if (process.env.CHELA_SMOKE_REPORT && !app.isPackaged) {
    const { smoke } = await import("./smoke.mjs");
    await smoke({ main, pet, backend, browser, profile });
    app.quit();
  }
}

app.on("second-instance", showMain);
app.on("activate", showMain);
app.on("window-all-closed", () => { if (!stopping) app.quit(); });
app.on("before-quit", event => {
  if (stopped || preferencesReader) return;
  event.preventDefault();
  if (stopping) return;
  stopping = true;
  void (async () => {
    try {
      pet?.stop(); browser?.close();
      await backend?.stop();
      const path = join(app.getPath("userData"), "window-state.json");
      await writeFile(path + ".tmp", JSON.stringify(windowStates, null, 2));
      await rename(path + ".tmp", path);
    } catch (error) { log(error); }
    tray?.destroy();
    if (logStream && !logStream.destroyed) await new Promise(resolve => logStream.end(resolve));
    stopped = true; app.exit(process.exitCode || 0);
  })();
});
if (preferencesReader) await import("./preferences-reader.mjs");
else if (!app.requestSingleInstanceLock()) { stopped = true; app.quit(); }
else app.whenReady().then(start).catch(error => { log(error); console.error(error); if (!process.env.CHELA_SMOKE_REPORT) dialog.showErrorBox("Chela 启动失败", error.message); process.exitCode = 1; app.quit(); });
