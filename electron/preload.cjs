const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", Object.freeze({
  exportReport: (records) => ipcRenderer.invoke("desktop:export-report", records),
  connectAccount: () => ipcRenderer.invoke("desktop:connect-account"),
  disconnectAccount: () => ipcRenderer.invoke("desktop:disconnect-account"),
  getConnection: () => ipcRenderer.invoke("desktop:get-connection"),
  requestReadOnly: (path, body) => ipcRenderer.invoke("desktop:request-read-only", path, body),
  onNavigate: (callback) => {
    if (typeof callback !== "function") return () => {};
    const listener = (_event, view) => callback(view);
    ipcRenderer.on("desktop:navigate", listener);
    return () => ipcRenderer.removeListener("desktop:navigate", listener);
  },
  onLogout: (callback) => {
    if (typeof callback !== "function") return () => {};
    const listener = () => callback();
    ipcRenderer.on("desktop:logout", listener);
    return () => ipcRenderer.removeListener("desktop:logout", listener);
  },
}));
