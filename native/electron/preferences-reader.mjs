import { app, BrowserWindow, session } from "electron";

const [directory, origin] = process.argv.slice(process.argv.indexOf("--chela-preferences-reader") + 1);
app.setName("Chela preferences import");
app.setPath("userData", directory);
app.whenReady().then(async () => {
  const storage = session.defaultSession;
  const response = () => new Response("<!doctype html><title>Chela preferences</title>", { headers: { "Content-Type": "text/html" } });
  storage.protocol.handle("http", request => new URL(request.url).host === "mygo.localhost" ? response() : new Response("Forbidden", { status: 403 }));
  storage.protocol.handle("file", response);
  const window = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  await window.loadURL(origin === "mygo" ? "http://mygo.localhost/" : "file:///chela-preferences.html");
  const values = await window.webContents.executeJavaScript("Object.fromEntries(Object.entries(localStorage).filter(([key])=>key.startsWith('chela.')))" );
  await new Promise((resolve, reject) => process.stdout.write("CHELA_PREFERENCES_JSON:" + JSON.stringify(values) + "\n", error => error ? reject(error) : resolve()));
  window.destroy(); app.quit();
}).catch(error => { console.error(error); app.exit(1); });
