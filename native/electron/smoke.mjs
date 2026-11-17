import assert from "node:assert/strict";
import { createServer } from "node:http";
import { writeFile, mkdir } from "node:fs/promises";
import { BrowserWindow, session as electronSession } from "electron";
import { join } from "node:path";
import { importPreferences } from "./preferences.mjs";

export async function smoke({ main, pet, backend, browser, profile }) {
  const checks = [];
  const call = (method, ...args) => main.webContents.executeJavaScript(`window.chelaDesktop.call(${JSON.stringify(method)},...${JSON.stringify(args)})`);
  const errors = [];
  main.webContents.on("console-message", details => { if (details.level === "error") errors.push(details.message); });
  assert.equal(await main.webContents.executeJavaScript("typeof window.chelaDesktop.call"), "function");
  assert.equal(await main.webContents.executeJavaScript("typeof window.require"), "undefined");
  assert.equal(await main.webContents.executeJavaScript("Boolean(document.querySelector('.shell'))"), true);
  checks.push("renderer / isolated preload / existing shell");
  const legacyProfile = join(profile, "legacy-preferences-fixture");
  const legacySession = electronSession.fromPath(legacyProfile);
  legacySession.protocol.handle("file", () => new Response("<!doctype html><title>Legacy preferences fixture</title>", { headers: { "Content-Type": "text/html" } }));
  const legacy = new BrowserWindow({ show: false, webPreferences: { session: legacySession, sandbox: true, contextIsolation: true, nodeIntegration: false } });
  await legacy.loadURL("file:///chela-smoke-legacy.html");
  await legacy.webContents.executeJavaScript("localStorage.setItem('chela.smoke.imported','retained');localStorage.setItem('chela.smoke.existing','old');localStorage.setItem('unrelated','excluded')");
  legacySession.flushStorageData(); legacy.destroy();
  await main.webContents.executeJavaScript("localStorage.setItem('chela.smoke.existing','new')");
  await importPreferences(main, legacyProfile, error => { throw error; });
  assert.equal(await main.webContents.executeJavaScript("localStorage.getItem('chela.smoke.imported')"), "retained");
  assert.equal(await main.webContents.executeJavaScript("localStorage.getItem('chela.smoke.existing')"), "new");
  assert.equal(await main.webContents.executeJavaScript("localStorage.getItem('unrelated')"), null);
  checks.push("legacy preferences / disposable reader / existing values preserved");
  const fakeLocal = join(profile, "mygo-fixture");
  const mygoSession = electronSession.fromPath(join(fakeLocal, "Chela/WebView2/EBWebView/Default"));
  mygoSession.protocol.handle("http", () => new Response("<!doctype html><title>MyGo preferences fixture</title>", { headers: { "Content-Type": "text/html" } }));
  const mygo = new BrowserWindow({ show: false, webPreferences: { session: mygoSession, sandbox: true, contextIsolation: true, nodeIntegration: false } });
  await mygo.loadURL("http://mygo.localhost/");
  await mygo.webContents.executeJavaScript("localStorage.setItem('chela.smoke.mygo','retained')");
  mygoSession.flushStorageData(); mygo.destroy();
  const targetProfile = join(profile, "mygo-import-target"); await mkdir(targetProfile);
  const savedLocal = process.env.LOCALAPPDATA, savedProfile = process.env.CHELA_SHELL_PROFILE;
  try {
    process.env.LOCALAPPDATA = fakeLocal; delete process.env.CHELA_SHELL_PROFILE;
    await importPreferences(main, targetProfile, error => { throw error; });
    assert.equal(await main.webContents.executeJavaScript("localStorage.getItem('chela.smoke.mygo')"), "retained");
  } finally {
    if (savedLocal === undefined) delete process.env.LOCALAPPDATA; else process.env.LOCALAPPDATA = savedLocal;
    if (savedProfile === undefined) delete process.env.CHELA_SHELL_PROFILE; else process.env.CHELA_SHELL_PROFILE = savedProfile;
  }
  checks.push("WebView2 profile path / MyGo origin preference migration");
  const information = await call("Chat.AppInformation");
  assert.equal(information.dataDirectory.toLowerCase(), profile.toLowerCase());
  const session = await call("Chat.Create");
  assert.ok(session.id);
  await call("Chat.SelectProject", session.id, profile);
  const snapshot = await call("Chat.Snapshot");
  assert.ok(JSON.stringify(snapshot).includes(session.id));
  await assert.rejects(call("Chat.Start"));
  await assert.rejects(call("Chat.SelectProject", session.id, "relative-path"));
  checks.push("Go service / session persistence / validation");
  assert.ok(Array.isArray(await call("Work.Tasks")));
  assert.ok(Array.isArray(await call("Work.Notes")));
  for (const mode of ["tray", "minimize", "quit"]) { await call("Work.SetWindowCloseMode", mode); assert.equal(await call("Work.WindowCloseMode"), mode); }
  await call("Work.SetWindowCloseMode", "tray");
  checks.push("Work storage / window-close preferences");
  const terminal = await call("Terminal.Start", "pwsh", profile, "");
  await call("Terminal.Write", terminal.id, "Write-Output CHELA_ELECTRON_TERMINAL\r");
  let output;
  for (let i = 0; i < 30; i++) {
    await new Promise(resolve => setTimeout(resolve, 100));
    output = await call("Terminal.Read", terminal.id, 0);
    if (Buffer.from(output.data || "", "base64").toString().includes("CHELA_ELECTRON_TERMINAL")) break;
  }
  assert.ok(Buffer.from(output.data || "", "base64").toString().includes("CHELA_ELECTRON_TERMINAL"));
  await call("Terminal.Resize", terminal.id, 100, 30);
  await call("Terminal.Close", terminal.id);
  checks.push("real terminal / ConPTY / input-output / resize / close");
  const petState = await call("Pet.Snapshot");
  assert.ok(["idle", "hidden", "peeking", "thinking", "speaking", "listening"].includes(petState.state));
  await call("Pet.SetRegions", JSON.stringify([{ X: 10, Y: 10, Width: 50, Height: 50 }]));
  await assert.rejects(call("Pet.SetRegions", JSON.stringify([{ X: -1, Y: 10, Width: 50, Height: 50 }])));
  await pet.window.webContents.executeJavaScript("window.chelaDesktop.call('Pet.SetHidden',true)");
  await assert.rejects(pet.window.webContents.executeJavaScript("window.chelaDesktop.call('Chat.Snapshot')"));
  await call("Pet.Dock");
  await call("Pet.Open", "", "");
  assert.ok(main.webContents.getURL().endsWith("#chat"));
  checks.push("pet / hit regions / routing / role isolation");
  const server = createServer((_request, response) => {
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end("<!doctype html><title>Chela Smoke</title><h1 id='proof'>Browser proof</h1>");
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const id = "electron-smoke-tab", url = `http://127.0.0.1:${server.address().port}/`;
    await call("Browser.Create", id, url);
    for (let i = 0; i < 50; i++) {
      const tabs = await call("Browser.Snapshot");
      if (tabs.some(tab => tab.title === "Chela Smoke" && !tab.loading)) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    await call("Browser.Layout", id, JSON.stringify({ x: 100, y: 100, width: 400, height: 300, viewportWidth: 1480, viewportHeight: 920, visible: true }));
    assert.ok((await call("Browser.Text", id)).includes("Browser proof"));
    assert.equal(await browser.call("Browser.Eval", [id, "typeof window.chelaDesktop"]), "undefined");
    assert.equal(await browser.call("Browser.Eval", [id, "typeof require"]), "undefined");
    await call("Browser.Pick", id, true);
    await browser.call("Browser.Eval", [id, "document.querySelector('#proof').click()"]);
    assert.equal(JSON.parse(await call("Browser.PickResult", id)).selector, "#proof");
    await assert.rejects(call("Browser.Action", id, "navigate", "file:///C:/Windows/win.ini"));
    await assert.rejects(call("Browser.Layout", id, JSON.stringify({ x: 20000, y: 0, width: 1, height: 1, viewportWidth: 1, viewportHeight: 1 })));
    await call("Browser.Layout", "", "{}");
    await call("Browser.Close", id);
    checks.push("browser / local URL / layout / page reference / element picker / untrusted isolation");
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  for (const route of ["board", "calendar", "notes", "terminal", "settings"]) {
    await main.webContents.executeJavaScript(`location.hash=${JSON.stringify("#" + route)}`);
    await new Promise(resolve => setTimeout(resolve, 150));
    assert.ok(await main.webContents.executeJavaScript("document.querySelector('#root').textContent.length>20"));
  }
  assert.deepEqual(errors, []);
  checks.push("existing workspaces / no renderer console errors");
  const pid = backend.child.pid;
  await writeFile(process.env.CHELA_SMOKE_REPORT, JSON.stringify({ passed: true, checks, profile, backendPID: pid, electron: process.versions.electron, chromium: process.versions.chrome, piChanged: false }, null, 2));
  console.log("Chela Electron smoke passed: " + checks.length + " groups");
}
