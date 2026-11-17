import { cp, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { app } from "electron";

// Read a disposable copy so Chromium never upgrades the original WebView2 storage.
export async function importPreferences(main, profile, log) {
  const marker = join(profile, "electron-preferences-migrated.json");
  try { await stat(marker); return; } catch (error) { if (error.code !== "ENOENT") throw error; }
  const values = {};
  const sources = [
    { path: join(profile, "Local Storage/leveldb"), origin: "file" },
    { path: join(process.env.LOCALAPPDATA || "", "Chela/WebView2/EBWebView/Default/Local Storage/leveldb"), origin: "mygo" },
  ];
  // Custom profiles must never import preferences from the user's real profile.
  if (process.env.CHELA_SHELL_PROFILE) sources.splice(1);
  for (const source of sources) {
    try { await stat(source.path); } catch (error) { if (error.code === "ENOENT") continue; throw error; }
    const prefix = join(tmpdir(), "chela-preferences-");
    const temporary = await mkdtemp(prefix);
    try {
      await cp(source.path, join(temporary, "Local Storage/leveldb"), { recursive: true, filter: path => !path.endsWith("LOCK") });
      const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
      const { stdout } = await promisify(execFile)(process.execPath, [app.getAppPath(), "--chela-preferences-reader", temporary, source.origin], { windowsHide: true, env, timeout: 30000, maxBuffer: 16 * 1024 * 1024 });
      const line = stdout.split(/\r?\n/).find(line => line.startsWith("CHELA_PREFERENCES_JSON:"));
      if (!line) throw Error("无法读取旧版界面偏好");
      Object.assign(values, JSON.parse(line.slice("CHELA_PREFERENCES_JSON:".length)));
    } finally {
      if (!resolve(temporary).startsWith(resolve(prefix))) throw Error("偏好迁移临时目录无效");
      await rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }).catch(log);
    }
  }
  if (Object.keys(values).length) {
    await main.webContents.executeJavaScript(`for(const [key,value] of Object.entries(${JSON.stringify(values)})){if(localStorage.getItem(key)===null)localStorage.setItem(key,value)}`);
  }
  await writeFile(marker, JSON.stringify({ importedAt: new Date().toISOString(), keys: Object.keys(values) }));
}
