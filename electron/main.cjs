const { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, session } = require("electron");
const path = require("node:path");
const fs = require("node:fs/promises");
const { fileURLToPath } = require("node:url");
const { toCsv } = require("./export.cjs");
const { API_BASE, makeApiUrl } = require("./api.cjs");

const LOGIN_ORIGIN = "https://www.aisweicloud.com";
// Resume a previously authenticated browser profile; the service redirects
// unauthenticated sessions back to its own login route.
const LOGIN_URL = `${LOGIN_ORIGIN}/home`;
const VALID_VIEWS = new Set(["overview", "plants", "devices", "service"]);
const PREFS_FILE = () => path.join(app.getPath("userData"), "preferences.json");
const loginSession = () => session.fromPartition("persist:solar-account");
let mainWindow;
let loginWindow;
let connection = { status: "disconnected" };
let accountToken;
let tokenRejected = false;
let apiVerified = false;
let verifyingToken = false;
let bounds = { width: 1440, height: 960 };
const ownsInstance = app.requestSingleInstanceLock();
if (!ownsInstance) app.quit();
app.on("second-instance", () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

async function readPreferences() {
  try {
    const prefs = JSON.parse(await fs.readFile(PREFS_FILE(), "utf8"));
    if (Number.isInteger(prefs.width) && Number.isInteger(prefs.height)) {
      bounds = { width: Math.max(900, Math.min(2400, prefs.width)), height: Math.max(650, Math.min(1800, prefs.height)) };
    }
  } catch {}
}

async function savePreferences() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const current = mainWindow.getBounds();
  try {
    await fs.mkdir(path.dirname(PREFS_FILE()), { recursive: true });
    await fs.writeFile(PREFS_FILE(), JSON.stringify({ width: current.width, height: current.height }), { mode: 0o600 });
  } catch {}
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    ...bounds,
    minWidth: 900,
    minHeight: 650,
    title: "晴川能源 · SOLARSPACE",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, target) => {
    const expected = path.resolve(__dirname, "../dist/index.html");
    try {
      const url = new URL(target);
      if (url.protocol !== "file:" || fileURLToPath(url) !== expected) event.preventDefault();
    } catch {
      event.preventDefault();
    }
  });
  mainWindow.webContents.on("will-redirect", (event, target) => {
    const expected = path.resolve(__dirname, "../dist/index.html");
    try {
      const url = new URL(target);
      if (url.protocol !== "file:" || fileURLToPath(url) !== expected) event.preventDefault();
    } catch {
      event.preventDefault();
    }
  });
  mainWindow.on("resize", savePreferences);
  mainWindow.on("close", savePreferences);
  mainWindow.on("closed", () => { mainWindow = null; });
}

function openLoginWindow() {
  if (loginWindow && !loginWindow.isDestroyed()) {
    loginWindow.show();
    loginWindow.focus();
    return loginWindow;
  }
  loginWindow = new BrowserWindow({
    width: 1120,
    height: 820,
    minWidth: 800,
    minHeight: 600,
    title: "连接爱士惟账户",
    webPreferences: {
      partition: "persist:solar-account",
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  loginWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Only the service's own page may open in this isolated login window.
    if (isAllowedLoginUrl(url)) return { action: "allow" };
    return { action: "deny" };
  });
  loginWindow.webContents.on("will-navigate", (event, target) => {
    if (!isAllowedLoginUrl(target)) event.preventDefault();
  });
  loginWindow.webContents.on("will-redirect", (event, target) => {
    if (!isAllowedLoginUrl(target)) event.preventDefault();
  });
  const captureTokenOnKnownPage = () => {
    try {
      const url = new URL(loginWindow.webContents.getURL());
      if (url.pathname === "/user/login") {
        tokenRejected = false;
        accountToken = undefined;
        connection = { status: "login-window-open" };
      }
    } catch {}
    void captureLoginToken();
  };
  loginWindow.webContents.on("did-navigate", captureTokenOnKnownPage);
  loginWindow.webContents.on("did-navigate-in-page", captureTokenOnKnownPage);
  loginWindow.webContents.on("did-finish-load", captureTokenOnKnownPage);
  loginWindow.on("closed", () => {
    loginWindow = null;
    if (!apiVerified) connection = { status: "disconnected" };
  });
  connection = { status: "login-window-open" };
  loginWindow.loadURL(LOGIN_URL);
  return loginWindow;
}

async function captureLoginToken() {
  if (!loginWindow || loginWindow.isDestroyed() || accountToken || tokenRejected) return;
  const current = loginWindow.webContents.getURL();
  if (!isAllowedLoginUrl(current)) return;
  let url;
  try { url = new URL(current); } catch { return; }
  if (!/^\/(?:home|overview)(?:\/|$)/i.test(url.pathname)) return;
  try {
    // This runs only in the user's isolated, same-origin login window. The token
    // travels directly to the main process and never reaches the renderer or disk.
    const token = await loginWindow.webContents.executeJavaScript(`(() => {
      const value = localStorage.getItem("token");
      return value && value.trim() ? value.trim() : null;
    })()`);
    if (typeof token === "string" && token.length <= 8192) {
      accountToken = token.replace(/^Bearer\s+/i, "");
      tokenRejected = false;
      apiVerified = false;
      connection = { status: "login-window-open" };
      void verifyAccountSession();
    }
  } catch {
    // A missing token or an unavailable localStorage value simply leaves the
    // account in the login-window-open state.
  }
}

async function verifyAccountSession() {
  if (!accountToken || verifyingToken) return;
  verifyingToken = true;
  try {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const response = await requestApi(makeApiUrl("dashboard", { today }), accountToken);
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) expireConnection();
      return;
    }
    const envelope = await response.json();
    if (envelope && Number(envelope.code) === 200) {
      apiVerified = true;
      connection = { status: "connected" };
      if (loginWindow && !loginWindow.isDestroyed()) loginWindow.close();
    } else if (isAuthFailure(envelope?.code)) {
      expireConnection();
    }
  } catch {
    // Leave the account in the pending state when the service cannot be reached.
  } finally {
    verifyingToken = false;
  }
}

function isAuthFailure(code) {
  const value = String(code ?? "");
  return value === "401" || value === "403" || value.startsWith("I4");
}

function expireConnection() {
  accountToken = undefined;
  apiVerified = false;
  tokenRejected = true;
  connection = { status: loginWindow && !loginWindow.isDestroyed() ? "login-window-open" : "disconnected" };
}

async function requestApi(url, token) {
    return loginSession().fetch(url, {
      method: "GET",
      credentials: "include",
      redirect: "error",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        token,
        localE: "zh_CN",
      },
      signal: AbortSignal.timeout(15000),
    });
}

function isAllowedLoginUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "www.aisweicloud.com";
  } catch {
    return false;
  }
}

function installMenu() {
  const template = [
    {
      label: app.name,
      submenu: [
        { label: "关于 SOLARSPACE", role: "about" },
        { type: "separator" },
        { label: "退出", role: "quit" },
      ],
    },
    {
      label: "编辑",
      submenu: [
        { role: "undo" }, { role: "redo" }, { type: "separator" },
        { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" },
      ],
    },
    {
      label: "显示",
      submenu: [
        { role: "reload" }, { role: "forceReload" }, { type: "separator" },
        { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" },
        { type: "separator" }, { role: "togglefullscreen" },
      ],
    },
    {
      label: "窗口",
      submenu: [{ role: "minimize" }, { role: "close" }, { role: "front" }],
    },
    {
      label: "导航",
      submenu: [
        ...[["总览", "overview"], ["电站管理", "plants"], ["设备管理", "devices"], ["服务与质保", "service"]]
          .map(([label, view]) => ({ label, click: () => navigate(view) })),
        { type: "separator" },
        { label: "退出演示", click: () => mainWindow?.webContents.send("desktop:logout") },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function navigate(view) {
  if (VALID_VIEWS.has(view) && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("desktop:navigate", view);
    mainWindow.webContents.executeJavaScript(`location.hash = ${JSON.stringify(`#${view}`)}`).catch(() => {});
  }
}

function registerIpc() {
  ipcMain.handle("desktop:export-report", async (event, records) => {
    if (!mainWindow || event.sender !== mainWindow.webContents) return { success: false, error: "Invalid caller" };
    let csv;
    try { csv = toCsv(records); } catch (error) { return { success: false, error: error.message }; }
    const result = await dialog.showSaveDialog(mainWindow, {
      title: "导出电站报表",
      defaultPath: "solar-report.csv",
      filters: [{ name: "CSV 文件", extensions: ["csv"] }],
    });
    if (result.canceled || !result.filePath) return { success: false, error: "cancelled" };
    try {
      await fs.writeFile(result.filePath, `\uFEFF${csv}`, { encoding: "utf8", flag: "w", mode: 0o600 });
      return { success: true, filePath: result.filePath };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
  ipcMain.handle("desktop:connect-account", (event) => {
    if (!mainWindow || event.sender !== mainWindow.webContents) return { success: false, error: "Invalid caller" };
    openLoginWindow();
    return { success: true, connection };
  });
  ipcMain.handle("desktop:disconnect-account", async (event) => {
    if (!mainWindow || event.sender !== mainWindow.webContents) return { success: false, error: "Invalid caller" };
    if (loginWindow && !loginWindow.isDestroyed()) loginWindow.close();
    await loginSession().clearStorageData();
    accountToken = undefined;
    tokenRejected = false;
    apiVerified = false;
    connection = { status: "disconnected" };
    return { success: true, connection };
  });
  ipcMain.handle("desktop:get-connection", async (event) => {
    if (!mainWindow || event.sender !== mainWindow.webContents) return { status: "disconnected" };
    await captureLoginToken();
    if (accountToken && !apiVerified) void verifyAccountSession();
    return { ...connection };
  });
  ipcMain.handle("desktop:request-read-only", async (event, name, params) => {
    if (!mainWindow || event.sender !== mainWindow.webContents) return { success: false, error: "Invalid caller" };
    if (typeof name !== "string" || !accountToken) {
      return { success: false, error: "请先连接爱士惟账户" };
    }
    let url;
    try { url = makeApiUrl(name, params); }
    catch (error) { return { success: false, error: error.message }; }
    if (url.origin !== API_BASE) return { success: false, error: "Unsupported API host" };
    try {
      const response = await requestApi(url, accountToken);
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          expireConnection();
          return { success: false, error: "登录已失效，请重新连接账户", code: response.status };
        }
        return { success: false, error: `请求失败（${response.status}）`, code: response.status };
      }
      const envelope = await response.json();
      if (!envelope || Number(envelope.code) !== 200) {
        const code = envelope?.code;
        const message = typeof envelope?.message === "string" ? envelope.message : "接口返回错误";
        if (isAuthFailure(code)) {
          expireConnection();
          return { success: false, error: "登录已失效，请重新连接账户", code };
        }
        return { success: false, error: message, code };
      }
      apiVerified = true;
      connection = { status: "connected" };
      const data = Object.prototype.hasOwnProperty.call(envelope, "result")
        ? envelope.result
        : (name === "inverterStorage" || name === "inverterEquipment") && envelope.deviceList !== undefined
          ? { deviceList: envelope.deviceList }
          : envelope;
      return { success: true, data };
    } catch (error) {
      const timedOut = error?.name === "AbortError" || error?.name === "TimeoutError";
      return { success: false, error: timedOut ? "请求超时，请稍后重试" : "无法连接服务，请检查网络" };
    }
  });
}

app.whenReady().then(async () => {
  if (!ownsInstance) return;
  loginSession().setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  loginSession().setPermissionCheckHandler(() => false);
  await readPreferences();
  if (process.platform === "darwin" && app.dock) {
    app.dock.setIcon(nativeImage.createFromPath(path.join(__dirname, "../assets/app-icon.png")));
  }
  installMenu();
  registerIpc();
  createMainWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createMainWindow(); });
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
