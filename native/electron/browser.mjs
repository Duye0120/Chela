import { WebContentsView, shell } from "electron";

function safeURL(raw) {
  const value = new URL(raw);
  if (raw.length > 8192 || !["http:", "https:"].includes(value.protocol) || !value.hostname || value.username || value.password) throw Error("请输入完整的 http 或 https 地址，不包含账号密码");
  return value.href;
}

export function createBrowser(main) {
  const tabs = new Map();
  let active = "", rect;
  const get = id => {
    const tab = tabs.get(id);
    if (!tab || tab.view.webContents.isDestroyed()) throw Error("预览标签已关闭");
    return tab;
  };
  const snapshot = tab => {
    const page = tab.view.webContents;
    return { id: tab.id, url: page.getURL() || "about:blank", title: page.getTitle().slice(0, 120) || "新标签页", error: tab.error, loading: page.isLoading(), back: page.navigationHistory.canGoBack(), forward: page.navigationHistory.canGoForward() };
  };
  function layout() {
    const [width, height] = main.getContentSize();
    for (const tab of tabs.values()) {
      const visible = tab.id === active && rect?.Visible && !main.isMinimized();
      tab.view.setVisible(Boolean(visible));
      if (visible) {
        const sx = width / rect.ViewportWidth, sy = height / rect.ViewportHeight;
        tab.view.setBounds({ x: Math.round(rect.X * sx), y: Math.round(rect.Y * sy), width: Math.round(rect.Width * sx), height: Math.round(rect.Height * sy) });
      }
    }
  }
  main.on("resize", layout);
  main.on("restore", layout);
  const load = (tab, url) => {
    tab.view.webContents.loadURL(url).catch(error => { if (!tab.view.webContents.isDestroyed() && error.code !== "ERR_ABORTED") tab.error = error.message; });
  };
  return {
    async call(method, args) {
      const [id, value, raw] = args;
      switch (method) {
        case "Browser.Create": {
          if (typeof id !== "string" || id.length < 8 || id.length > 100) throw Error("标签标识无效");
          if (tabs.has(id)) return snapshot(get(id));
          if (tabs.size >= 8) throw Error("最多打开 8 个预览标签，请先关闭一个");
          const address = value === "about:blank" ? value : safeURL(value);
          const view = new WebContentsView({ webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, partition: "persist:chela-browser" } });
          const tab = { id, view, error: "" };
          tabs.set(id, tab);
          main.contentView.addChildView(view);
          view.setVisible(false);
          view.setBorderRadius(10);
          const page = view.webContents;
          page.session.setPermissionRequestHandler((_page, _permission, callback) => callback(false));
          page.session.setPermissionCheckHandler(() => false);
          const guard = event => { try { if (event.url !== "about:blank") safeURL(event.url); } catch { event.preventDefault(); } };
          page.on("will-navigate", guard);
          page.on("will-redirect", guard);
          page.setWindowOpenHandler(({ url }) => { try { load(tab, safeURL(url)); } catch {} return { action: "deny" }; });
          page.on("did-start-navigation", () => { tab.error = ""; });
          page.on("did-fail-load", (_event, code, description, _url, isMainFrame) => { if (isMainFrame && code !== -3) tab.error = description; });
          page.on("render-process-gone", (_event, details) => { tab.error = "网页进程已退出: " + details.reason; });
          load(tab, address);
          return snapshot(tab);
        }
        case "Browser.Snapshot": return [...tabs.values()].map(snapshot);
        case "Browser.Get": return snapshot(get(id));
        case "Browser.Eval": return get(id).view.webContents.executeJavaScript(value);
        case "Browser.Layout": {
          if (id) {
            get(id);
            const keys = ["X", "Y", "Width", "Height", "ViewportWidth", "ViewportHeight"];
            if (!value || !keys.every(key => Number.isFinite(value[key]) && value[key] >= 0 && value[key] <= 20000) || value.Width < 1 || value.Height < 1 || value.ViewportWidth <= 0 || value.ViewportHeight <= 0 || value.X + value.Width > value.ViewportWidth + 1 || value.Y + value.Height > value.ViewportHeight + 1) throw Error("预览区域无效");
          }
          active = id; rect = value; layout(); return;
        }
        case "Browser.Action": {
          const tab = get(id), page = tab.view.webContents;
          switch (value) {
            case "navigate": load(tab, safeURL(raw)); break;
            case "back": if (page.navigationHistory.canGoBack()) page.navigationHistory.goBack(); break;
            case "forward": if (page.navigationHistory.canGoForward()) page.navigationHistory.goForward(); break;
            case "reload": page.reload(); break;
            case "external": await shell.openExternal(safeURL(page.getURL())); break;
            default: throw Error("不支持的浏览器操作");
          }
          return;
        }
        case "Browser.Close": {
          const tab = tabs.get(id);
          if (tab) { main.contentView.removeChildView(tab.view); tab.view.webContents.close(); tabs.delete(id); }
          if (active === id) active = "";
          return;
        }
        default: throw Error("未知的浏览器宿主操作");
      }
    },
    close() {
      for (const tab of tabs.values()) if (!tab.view.webContents.isDestroyed()) tab.view.webContents.close();
      tabs.clear();
    },
  };
}
