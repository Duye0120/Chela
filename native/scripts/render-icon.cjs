const assert = require("node:assert/strict");
const { mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { app, BrowserWindow, nativeImage } = require("electron");

const root = join(__dirname, "../..");
const profile = join(root, "output/icon-renderer-profile");
mkdirSync(profile, { recursive: true });
app.setPath("userData", profile);
app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const svg = readFileSync(join(root, "native/frontend/src/assets/icons/Chela24Px.svg"), "utf8");
  const window = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  try {
    await window.loadURL("about:blank");
    const rendered = await window.webContents.executeJavaScript(`(async () => {
      const image = new Image();
      image.src = ${JSON.stringify(`data:image/svg+xml,${encodeURIComponent(svg)}`)};
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 512;
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0, 512, 512);
      return { png: canvas.toDataURL("image/png"), corner: [...context.getImageData(0, 0, 1, 1).data], body: [...context.getImageData(256, 256, 1, 1).data] };
    })()`);
    const png = Buffer.from(rendered.png.split(",")[1], "base64");
    assert.deepEqual(nativeImage.createFromBuffer(png).getSize(), { width: 512, height: 512 });
    assert.equal(rendered.corner[3], 0);
    assert.deepEqual(rendered.body, [27, 28, 32, 255]);
    writeFileSync(join(root, "native/electron/icon.png"), png);
  } finally {
    window.destroy();
  }
  app.quit();
}).catch(error => { console.error(error); app.exit(1); });
