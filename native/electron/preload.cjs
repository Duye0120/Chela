const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("chelaDesktop", {
  call: (method, ...args) => ipcRenderer.invoke("chela:service", method, args),
  window: {
    minimize: () => ipcRenderer.invoke("chela:window", "minimize"),
    toggleMaximize: () => ipcRenderer.invoke("chela:window", "toggleMaximize"),
    isMaximized: () => ipcRenderer.invoke("chela:window", "isMaximized"),
    close: () => ipcRenderer.invoke("chela:window", "close"),
  },
});
