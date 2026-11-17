import { BrowserWindow, powerMonitor, screen } from "electron";

export function createPet({ main, options, load, call, showMain, log }) {
  const area = screen.getPrimaryDisplay().workArea;
  const window = new BrowserWindow({ ...options, title: "Chela · 陪伴", width: 480, height: 360, x: area.x + area.width - 480, y: area.y + area.height - 380, show: false, transparent: true, backgroundColor: "#00000000", alwaysOnTop: true, skipTaskbar: true, resizable: false, maximizable: false, minimizable: false, hasShadow: false });
  let locked = false, stopping = false, ready = false, regions = [], ignoring;
  function clamp(dock = false) {
    if (window.isDestroyed()) return;
    const bounds = window.getBounds(), area = screen.getDisplayMatching(bounds).workArea;
    let x = Math.max(area.x, Math.min(bounds.x, area.x + area.width - bounds.width));
    const y = Math.max(area.y, Math.min(bounds.y, area.y + area.height - bounds.height));
    if (dock) x = bounds.x + bounds.width / 2 < area.x + area.width / 2 ? area.x : Math.max(area.x, area.x + area.width - bounds.width);
    if (x !== bounds.x || y !== bounds.y) window.setPosition(x, y);
  }
  function updateInput() {
    if (window.isDestroyed() || !window.isVisible()) return;
    const bounds = window.getBounds(), cursor = screen.getCursorScreenPoint();
    const x = cursor.x - bounds.x, y = cursor.y - bounds.y;
    const ignore = !regions.some(r => x >= r.X && y >= r.Y && x < r.X + r.Width && y < r.Y + r.Height);
    if (ignoring !== ignore) { window.setIgnoreMouseEvents(ignore, { forward: true }); ignoring = ignore; }
  }
  window.setIgnoreMouseEvents(true, { forward: true });
  const inputTimer = setInterval(updateInput, 30);
  window.webContents.once("did-finish-load", () => { ready = true; clamp(); });
  window.on("close", event => {
    if (stopping) return;
    event.preventDefault(); window.hide();
    call("Pet.SetHidden", true).catch(log);
  });
  const lock = () => { locked = true; window.hide(); };
  const unlock = () => { locked = false; };
  const displays = () => clamp();
  powerMonitor.on("lock-screen", lock);
  powerMonitor.on("unlock-screen", unlock);
  screen.on("display-added", displays);
  screen.on("display-removed", displays);
  screen.on("display-metrics-changed", displays);
  const loaded = load(window, true);
  return {
    window,
    loaded,
    async host(method, args) {
      switch (method) {
        case "Pet.Presence": {
          const bounds = window.getBounds(), area = screen.getDisplayMatching(bounds).workArea;
          const rect = r => ({ X: r.x, Y: r.y, Width: r.width, Height: r.height });
          return { Ready: ready && !stopping, Locked: locked, Busy: main.isFocused() && !window.isFocused() && powerMonitor.getSystemIdleTime() < 3, Focused: window.isFocused(), Visible: window.isVisible(), Bounds: rect(bounds), Area: rect(area) };
        }
        case "Pet.Visibility":
          if (args[0] || locked || !ready) window.hide(); else if (!window.isVisible()) { clamp(); window.showInactive(); }
          return;
        case "Pet.SetRegions":
          if (!Array.isArray(args[0]) || args[0].length > 8 || !args[0].every(r => [r.X, r.Y, r.Width, r.Height].every(Number.isFinite) && r.X >= 0 && r.Y >= 0 && r.Width >= 0 && r.Height >= 0 && r.X + r.Width <= 480 && r.Y + r.Height <= 360)) throw Error("命中区域无效");
          regions = args[0]; updateInput(); return;
        case "Pet.Dock": clamp(true); return;
        case "Pet.Open":
          if (typeof args[0] !== "string" || !/^#(?:chat|terminal|calendar|notifications|board)(?:[/?].*)?$/.test(args[0])) throw Error("提示入口无效");
          await main.webContents.executeJavaScript("location.hash=" + JSON.stringify(args[0]));
          showMain(); return;
        default: throw Error("未知的桌宠宿主操作");
      }
    },
    stop() {
      stopping = true;
      clearInterval(inputTimer);
      powerMonitor.off("lock-screen", lock); powerMonitor.off("unlock-screen", unlock);
      screen.off("display-added", displays); screen.off("display-removed", displays); screen.off("display-metrics-changed", displays);
      if (!window.isDestroyed()) window.destroy();
    },
  };
}
