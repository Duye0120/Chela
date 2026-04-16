import { dialog, app, shell, BrowserWindow, ipcMain, Notification, globalShortcut } from "electron";
import path, { basename, join, extname, dirname } from "node:path";
import { stat, readFile, mkdir, writeFile } from "node:fs/promises";
import fs, { appendFileSync, existsSync, mkdirSync, statSync, readFileSync, readdirSync, renameSync, cpSync, writeFileSync, unlinkSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getModel, completeSimple, Type } from "@mariozechner/pi-ai";
import { randomUUID, createHash, createHmac } from "node:crypto";
import { execFile, execSync, spawn } from "node:child_process";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import { Agent } from "@mariozechner/pi-agent-core";
import { rgPath } from "@vscode/ripgrep";
import { StringDecoder } from "node:string_decoder";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import * as pty from "node-pty";
import { createServer } from "node:http";
import __cjs_mod__ from "node:module";
const __filename = import.meta.filename;
const __dirname = import.meta.dirname;
const require2 = __cjs_mod__.createRequire(import.meta.url);
const IPC_CHANNELS = {
  // Files
  filesPick: "files:pick",
  filesReadPreview: "files:read-preview",
  filesReadImageDataUrl: "files:read-image-data-url",
  filesSaveFromClipboard: "files:save-from-clipboard",
  // Sessions
  sessionsList: "sessions:list",
  sessionsLoad: "sessions:load",
  sessionsSave: "sessions:save",
  sessionsCreate: "sessions:create",
  sessionsArchive: "sessions:archive",
  sessionsUnarchive: "sessions:unarchive",
  sessionsListArchived: "sessions:list-archived",
  sessionsDelete: "sessions:delete",
  sessionsSetGroup: "sessions:set-group",
  sessionsRename: "sessions:rename",
  sessionsSetPinned: "sessions:set-pinned",
  // Groups
  groupsList: "groups:list",
  groupsCreate: "groups:create",
  groupsRename: "groups:rename",
  groupsDelete: "groups:delete",
  // Chat
  chatSend: "chat:send",
  chatTrimSessionMessages: "chat:trim-session-messages",
  contextGetSummary: "context:get-summary",
  contextCompact: "context:compact",
  // Agent events (main → renderer push)
  agentEvent: "agent:event",
  agentCancel: "agent:cancel",
  agentConfirmResponse: "agent:confirm-response",
  agentListPendingApprovalGroups: "agent:list-pending-approval-groups",
  agentListInterruptedApprovals: "agent:list-interrupted-approvals",
  agentListInterruptedApprovalGroups: "agent:list-interrupted-approval-groups",
  agentDismissInterruptedApproval: "agent:dismiss-interrupted-approval",
  agentResumeInterruptedApproval: "agent:resume-interrupted-approval",
  // Settings
  settingsGet: "settings:get",
  settingsUpdate: "settings:update",
  settingsGetLogSnapshot: "settings:get-log-snapshot",
  settingsOpenLogFolder: "settings:open-log-folder",
  // Providers
  providersListSources: "providers:list-sources",
  providersGetSource: "providers:get-source",
  providersSaveSource: "providers:save-source",
  providersDeleteSource: "providers:delete-source",
  providersTestSource: "providers:test-source",
  providersGetCredentials: "providers:get-credentials",
  providersSetCredentials: "providers:set-credentials",
  // Models
  modelsListEntries: "models:list-entries",
  modelsListEntriesBySource: "models:list-entries-by-source",
  modelsSaveEntry: "models:save-entry",
  modelsDeleteEntry: "models:delete-entry",
  modelsGetEntry: "models:get-entry",
  // Workspace
  workspaceChange: "workspace:change",
  workspaceGetSoul: "workspace:get-soul",
  workspacePickFolder: "workspace:pick-folder",
  workspaceOpenFolder: "workspace:open-folder",
  // Terminal (main ↔ renderer)
  terminalCreate: "terminal:create",
  terminalWrite: "terminal:write",
  terminalResize: "terminal:resize",
  terminalDestroy: "terminal:destroy",
  terminalData: "terminal:data",
  terminalExit: "terminal:exit",
  gitStageFiles: "git:stage-files",
  gitUnstageFiles: "git:unstage-files",
  gitCommit: "git:commit",
  gitPush: "git:push",
  gitSummary: "git:summary",
  gitStatus: "git:status",
  gitListBranches: "git:list-branches",
  gitSwitchBranch: "git:switch-branch",
  gitCreateBranch: "git:create-branch",
  // Worker (background model tasks)
  workerGenerateCommitMessage: "worker:generate-commit-message",
  // UI
  uiGetState: "ui:get-state",
  uiSetDiffPanelOpen: "ui:set-diff-panel-open",
  // Window
  windowGetState: "window:get-state",
  windowMinimize: "window:minimize",
  windowToggleMaximize: "window:toggle-maximize",
  windowClose: "window:close",
  windowStateChanged: "window:state-changed"
};
const IMAGE_EXTENSIONS$1 = /* @__PURE__ */ new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "ico"]);
const TEXT_EXTENSIONS$1 = /* @__PURE__ */ new Set([
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "json",
  "md",
  "txt",
  "yml",
  "yaml",
  "toml",
  "html",
  "css",
  "scss",
  "less",
  "py",
  "java",
  "go",
  "rs",
  "sh",
  "ps1",
  "xml",
  "csv",
  "env"
]);
const MAX_PREVIEW_CHARACTERS = 6e3;
const MIME_EXTENSION_MAP = /* @__PURE__ */ new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
  ["image/bmp", "bmp"],
  ["image/svg+xml", "svg"],
  ["text/plain", "txt"],
  ["text/markdown", "md"],
  ["application/json", "json"],
  ["application/pdf", "pdf"]
]);
const EXTENSION_MIME_MAP = /* @__PURE__ */ new Map([
  ["png", "image/png"],
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["webp", "image/webp"],
  ["gif", "image/gif"],
  ["bmp", "image/bmp"],
  ["svg", "image/svg+xml"],
  ["ico", "image/x-icon"]
]);
const TEXT_MIME_PREFIXES = ["text/"];
const TEXT_MIME_TYPES = /* @__PURE__ */ new Set([
  "application/json",
  "application/xml",
  "application/javascript",
  "application/typescript"
]);
function getExtension$1(filePath) {
  return extname(filePath).replace(/^\./, "").toLowerCase();
}
function inferFileKind(extension, mimeType) {
  const normalizedMimeType = mimeType?.trim().toLowerCase();
  if (normalizedMimeType?.startsWith("image/")) {
    return "image";
  }
  if (normalizedMimeType && (TEXT_MIME_PREFIXES.some((prefix) => normalizedMimeType.startsWith(prefix)) || TEXT_MIME_TYPES.has(normalizedMimeType))) {
    return "text";
  }
  if (!extension) {
    return "unknown";
  }
  if (TEXT_EXTENSIONS$1.has(extension)) {
    return "text";
  }
  if (IMAGE_EXTENSIONS$1.has(extension)) {
    return "image";
  }
  return "binary";
}
function getAttachmentsDir() {
  return join(app.getPath("userData"), "data", "attachments");
}
function inferExtensionFromMimeType(mimeType) {
  if (!mimeType) return "";
  return MIME_EXTENSION_MAP.get(mimeType.toLowerCase()) ?? "";
}
function inferMimeTypeFromExtension(extension) {
  if (!extension) return void 0;
  return EXTENSION_MIME_MAP.get(extension.toLowerCase());
}
function inferMimeTypeFromBuffer(buffer) {
  if (buffer.length >= 8 && buffer[0] === 137 && buffer[1] === 80 && buffer[2] === 78 && buffer[3] === 71 && buffer[4] === 13 && buffer[5] === 10 && buffer[6] === 26 && buffer[7] === 10) {
    return "image/png";
  }
  if (buffer.length >= 3 && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) {
    return "image/jpeg";
  }
  if (buffer.length >= 6 && buffer.subarray(0, 6).toString("ascii") === "GIF87a") {
    return "image/gif";
  }
  if (buffer.length >= 6 && buffer.subarray(0, 6).toString("ascii") === "GIF89a") {
    return "image/gif";
  }
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") {
    return "image/webp";
  }
  if (buffer.length >= 2 && buffer[0] === 66 && buffer[1] === 77) {
    return "image/bmp";
  }
  return void 0;
}
function sanitizeFileName(name) {
  return basename(name).replace(/[<>:"/\\|?*\x00-\x1F]/g, "-").trim();
}
function stripExtension(fileName) {
  const extension = extname(fileName);
  return extension ? fileName.slice(0, -extension.length) : fileName;
}
async function pickFiles(browserWindow) {
  const result = await dialog.showOpenDialog(browserWindow, {
    title: "选择要附加的本地文件",
    properties: ["openFile", "multiSelections"]
  });
  if (result.canceled) {
    return [];
  }
  const selectedFiles = await Promise.all(
    result.filePaths.map(async (filePath) => {
      const fileStat = await stat(filePath);
      const extension = getExtension$1(filePath);
      return {
        id: crypto.randomUUID(),
        name: basename(filePath),
        path: filePath,
        size: fileStat.size,
        extension,
        kind: inferFileKind(extension)
      };
    })
  );
  return selectedFiles;
}
async function saveClipboardFile(payload) {
  const safeName = sanitizeFileName(payload.name ?? "");
  const fileBuffer = Buffer.from(payload.buffer);
  const mimeType = payload.mimeType?.trim().toLowerCase() || inferMimeTypeFromBuffer(fileBuffer);
  const extension = getExtension$1(safeName) || inferExtensionFromMimeType(mimeType);
  const baseName = stripExtension(safeName) || (mimeType?.startsWith("image/") ? "pasted-image" : "pasted-file");
  const displayName = safeName || (extension ? `${baseName}.${extension}` : baseName);
  const storedFileName = `${baseName}-${Date.now()}-${crypto.randomUUID()}${extension ? `.${extension}` : ""}`;
  const filePath = join(getAttachmentsDir(), storedFileName);
  await mkdir(getAttachmentsDir(), { recursive: true });
  await writeFile(filePath, fileBuffer);
  return {
    id: crypto.randomUUID(),
    name: displayName,
    path: filePath,
    size: fileBuffer.byteLength,
    extension,
    kind: inferFileKind(extension, mimeType),
    mimeType
  };
}
async function readFilePreview(filePath) {
  const extension = getExtension$1(filePath);
  const kind = inferFileKind(extension);
  if (kind !== "text") {
    return {
      path: filePath,
      truncated: false,
      error: "当前文件类型暂不支持文本预览。"
    };
  }
  try {
    const content = await readFile(filePath, "utf8");
    const truncated = content.length > MAX_PREVIEW_CHARACTERS;
    return {
      path: filePath,
      previewText: truncated ? content.slice(0, MAX_PREVIEW_CHARACTERS) : content,
      truncated
    };
  } catch (error) {
    return {
      path: filePath,
      truncated: false,
      error: error instanceof Error ? error.message : "读取文件预览失败。"
    };
  }
}
async function readImageDataUrl(filePath) {
  const imageContent = await readImageContent(filePath);
  if (!imageContent) {
    return null;
  }
  return `data:${imageContent.mimeType};base64,${imageContent.data}`;
}
async function readImageContent(filePath, preferredMimeType) {
  const extension = getExtension$1(filePath);
  const kind = inferFileKind(extension, preferredMimeType);
  if (kind !== "image") {
    return null;
  }
  try {
    const fileBuffer = await readFile(filePath);
    const mimeType = preferredMimeType?.trim().toLowerCase() || inferMimeTypeFromExtension(extension) || inferMimeTypeFromBuffer(fileBuffer) || "application/octet-stream";
    return {
      data: fileBuffer.toString("base64"),
      mimeType
    };
  } catch {
    return null;
  }
}
function ensureDir$7(dirPath) {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}
function getHarnessAuditLogPath() {
  return join(app.getPath("userData"), "logs", "audit.log");
}
function appendHarnessAuditEvent(event) {
  const filePath = getHarnessAuditLogPath();
  ensureDir$7(dirname(filePath));
  appendFileSync(filePath, JSON.stringify(event) + "\n", "utf-8");
}
const REDACT_KEYS = [
  "apikey",
  "api_key",
  "authorization",
  "token",
  "password",
  "secret",
  "credential"
];
let processLoggingRegistered = false;
function ensureDir$6(dirPath) {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}
function getLogDirPath() {
  try {
    return join(app.getPath("userData"), "logs");
  } catch {
    return join(process.cwd(), ".pi-logs");
  }
}
function getAppLogPath() {
  return join(getLogDirPath(), "app.log");
}
function buildTail(content, maxLines) {
  const normalized = content.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const meaningfulLines = lines.length > 0 && lines[lines.length - 1] === "" ? lines.slice(0, -1) : lines;
  const tailLines = meaningfulLines.slice(-maxLines);
  return {
    tail: tailLines.join("\n"),
    lineCount: tailLines.length
  };
}
function buildLogSnapshot(input, maxLines) {
  if (!existsSync(input.path)) {
    return {
      id: input.id,
      label: input.label,
      path: input.path,
      exists: false,
      sizeBytes: 0,
      updatedAt: null,
      tail: "",
      lineCount: 0
    };
  }
  const stat2 = statSync(input.path);
  const content = readFileSync(input.path, "utf-8");
  const { tail, lineCount } = buildTail(content, maxLines);
  return {
    id: input.id,
    label: input.label,
    path: input.path,
    exists: true,
    sizeBytes: stat2.size,
    updatedAt: stat2.mtime.toISOString(),
    tail,
    lineCount
  };
}
function getDiagnosticLogSnapshot(maxLines = 120) {
  return {
    generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    files: [
      buildLogSnapshot(
        { id: "app", label: "应用日志", path: getAppLogPath() },
        maxLines
      ),
      buildLogSnapshot(
        { id: "audit", label: "审计日志", path: getHarnessAuditLogPath() },
        maxLines
      )
    ]
  };
}
async function openDiagnosticLogFolder(logId) {
  const filePath = logId === "audit" ? getHarnessAuditLogPath() : getAppLogPath();
  if (existsSync(filePath)) {
    shell.showItemInFolder(filePath);
    return;
  }
  const result = await shell.openPath(dirname(filePath));
  if (result) {
    throw new Error(result);
  }
}
function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function shouldRedact(key) {
  const normalized = key.replace(/[^a-z_]/gi, "").toLowerCase();
  return REDACT_KEYS.some((candidate) => normalized.includes(candidate));
}
function sanitizeForLog(value, depth = 0) {
  if (depth > 4) {
    return "[truncated]";
  }
  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return value.length <= 500 ? value : value.slice(0, 500) + "…";
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (typeof value === "function") {
    return `[function ${value.name || "anonymous"}]`;
  }
  if (value instanceof Error) {
    return serializeError(value);
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeForLog(item, depth + 1));
  }
  if (!isPlainObject(value)) {
    return String(value);
  }
  const next = {};
  for (const [key, nested] of Object.entries(value)) {
    next[key] = shouldRedact(key) ? "[redacted]" : sanitizeForLog(nested, depth + 1);
  }
  return next;
}
function serializeError(error) {
  if (error instanceof Error) {
    const serialized = {
      name: error.name,
      message: error.message,
      stack: error.stack
    };
    const withCause = error;
    if (withCause.cause !== void 0) {
      serialized.cause = sanitizeForLog(withCause.cause);
    }
    return serialized;
  }
  return {
    name: "NonError",
    message: typeof error === "string" ? error : JSON.stringify(sanitizeForLog(error))
  };
}
function writeLog(level, input) {
  const filePath = getAppLogPath();
  ensureDir$6(dirname(filePath));
  const entry = {
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    level,
    scope: input.scope,
    message: input.message,
    pid: process.pid,
    data: input.data === void 0 ? void 0 : sanitizeForLog(input.data),
    error: input.error === void 0 ? void 0 : serializeError(input.error)
  };
  appendFileSync(filePath, JSON.stringify(entry) + "\n", "utf-8");
}
const appLogger = {
  debug(input) {
    writeLog("debug", input);
  },
  info(input) {
    writeLog("info", input);
  },
  warn(input) {
    writeLog("warn", input);
  },
  error(input) {
    writeLog("error", input);
  }
};
function summarizeIpcArgs(args) {
  return args.slice(0, 6).map((arg) => {
    if (typeof arg === "string") {
      return arg.length <= 180 ? arg : arg.slice(0, 180) + "…";
    }
    if (Array.isArray(arg)) {
      return { type: "array", length: arg.length };
    }
    if (!isPlainObject(arg)) {
      return sanitizeForLog(arg);
    }
    const result = {};
    for (const key of [
      "sessionId",
      "runId",
      "id",
      "name",
      "path",
      "title",
      "modelEntryId",
      "groupId",
      "branchName"
    ]) {
      if (key in arg) {
        result[key] = sanitizeForLog(arg[key]);
      }
    }
    if ("text" in arg && typeof arg.text === "string") {
      result.textLength = arg.text.length;
    }
    if ("attachments" in arg && Array.isArray(arg.attachments)) {
      result.attachmentCount = arg.attachments.length;
    }
    if ("cwd" in arg && typeof arg.cwd === "string") {
      result.cwd = arg.cwd;
    }
    return Object.keys(result).length > 0 ? result : sanitizeForLog(arg);
  });
}
function registerProcessLogging() {
  if (processLoggingRegistered) {
    return;
  }
  processLoggingRegistered = true;
  process.on("uncaughtException", (error) => {
    appLogger.error({
      scope: "process",
      message: "未捕获异常",
      error
    });
  });
  process.on("unhandledRejection", (reason) => {
    appLogger.error({
      scope: "process",
      message: "未处理 Promise 拒绝",
      error: reason
    });
  });
}
function attachWindowLogging(window) {
  window.webContents.on(
    "console-message",
    (_event, level, message, line, sourceId) => {
      if (level < 2) {
        return;
      }
      const log = level >= 3 ? appLogger.error : appLogger.warn;
      log({
        scope: "renderer.console",
        message,
        data: {
          level,
          line,
          sourceId
        }
      });
    }
  );
  window.webContents.on(
    "render-process-gone",
    (_event, details) => {
      appLogger.error({
        scope: "renderer.lifecycle",
        message: "Renderer 进程退出",
        data: details
      });
    }
  );
  window.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      appLogger.error({
        scope: "renderer.lifecycle",
        message: "页面加载失败",
        data: {
          errorCode,
          errorDescription,
          validatedURL,
          isMainFrame
        }
      });
    }
  );
  window.on("unresponsive", () => {
    appLogger.warn({
      scope: "renderer.lifecycle",
      message: "主窗口无响应"
    });
  });
}
const __dirname$1 = dirname(fileURLToPath(import.meta.url));
const MIN_WINDOW_WIDTH = 920;
const MIN_WINDOW_HEIGHT = 600;
const APP_PRODUCT_NAME = "Chela";
const LEGACY_USER_DATA_DIR_NAMES = ["first-pi-agent", "first_pi_agent"];
let mainWindow$1 = null;
function configureAppIdentity() {
  app.setName(APP_PRODUCT_NAME);
}
function getPreloadPath() {
  return join(__dirname$1, "../preload/index.mjs");
}
function getRendererPath() {
  return join(__dirname$1, "../renderer/index.html");
}
function getDevServerUrl() {
  return process.env.ELECTRON_RENDERER_URL ?? process.env.VITE_DEV_SERVER_URL;
}
function migrateLegacyUserData() {
  const currentUserDataPath = app.getPath("userData");
  const hasCurrentData = existsSync(currentUserDataPath) && readdirSync(currentUserDataPath).length > 0;
  if (hasCurrentData) {
    return;
  }
  const appDataPath = app.getPath("appData");
  for (const legacyDirName of LEGACY_USER_DATA_DIR_NAMES) {
    const legacyUserDataPath = join(appDataPath, legacyDirName);
    if (legacyUserDataPath === currentUserDataPath || !existsSync(legacyUserDataPath)) {
      continue;
    }
    if (!existsSync(currentUserDataPath)) {
      renameSync(legacyUserDataPath, currentUserDataPath);
      return;
    }
    cpSync(legacyUserDataPath, currentUserDataPath, {
      recursive: true,
      force: false,
      errorOnExist: false
    });
    return;
  }
}
function getMainWindow() {
  return mainWindow$1;
}
function requireMainWindow() {
  if (!mainWindow$1) {
    throw new Error("Main window is not ready yet.");
  }
  return mainWindow$1;
}
function computeWindowFrameState() {
  const window = requireMainWindow();
  return {
    isMaximized: window.isMaximized()
  };
}
function notifyWindowState() {
  if (!mainWindow$1) {
    return;
  }
  mainWindow$1.webContents.send(
    IPC_CHANNELS.windowStateChanged,
    computeWindowFrameState()
  );
}
function createMainWindow() {
  mainWindow$1 = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    frame: false,
    backgroundColor: "#e8edf3",
    title: APP_PRODUCT_NAME,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  attachWindowLogging(mainWindow$1);
  mainWindow$1.on("maximize", notifyWindowState);
  mainWindow$1.on("unmaximize", notifyWindowState);
  mainWindow$1.on("ready-to-show", notifyWindowState);
  mainWindow$1.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;
    const isDevToolsShortcut = input.key === "F12" || (input.control || input.meta) && input.shift && input.key.toUpperCase() === "I";
    if (isDevToolsShortcut) {
      event.preventDefault();
      if (mainWindow$1?.webContents.isDevToolsOpened()) {
        mainWindow$1.webContents.closeDevTools();
      } else {
        mainWindow$1?.webContents.openDevTools({ mode: "detach" });
      }
      return;
    }
    const isReloadShortcut = input.key === "F5" || (input.control || input.meta) && !input.shift && input.key.toUpperCase() === "R";
    if (isReloadShortcut) {
      event.preventDefault();
      mainWindow$1?.webContents.reload();
      return;
    }
  });
  const devServerUrl = getDevServerUrl();
  if (devServerUrl) {
    void mainWindow$1.loadURL(devServerUrl);
  } else {
    void mainWindow$1.loadFile(getRendererPath());
  }
  appLogger.info({
    scope: "app.window",
    message: "主窗口已创建",
    data: {
      devServerUrl: devServerUrl ?? null
    }
  });
  return mainWindow$1;
}
function handleIpc(channel, handler) {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return await handler(event, ...args);
    } catch (error) {
      appLogger.error({
        scope: "ipc",
        message: "IPC 调用失败",
        data: {
          channel,
          args: summarizeIpcArgs(args)
        },
        error
      });
      throw error;
    }
  });
}
function registerFilesIpc() {
  handleIpc(
    IPC_CHANNELS.filesPick,
    async () => pickFiles(requireMainWindow())
  );
  handleIpc(
    IPC_CHANNELS.filesReadPreview,
    async (_event, filePath) => readFilePreview(filePath)
  );
  handleIpc(
    IPC_CHANNELS.filesReadImageDataUrl,
    async (_event, filePath) => readImageDataUrl(filePath)
  );
  handleIpc(
    IPC_CHANNELS.filesSaveFromClipboard,
    async (_event, payload) => saveClipboardFile(payload)
  );
}
const PRIMARY_AGENT_OWNER = "primary";
function buildSystemOwnerId(kind) {
  return `system:${kind}`;
}
function ensureDir$5(dirPath) {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}
function getInterruptedApprovalsPath() {
  return join(app.getPath("userData"), "data", "interrupted-approvals.json");
}
function atomicWrite$4(filePath, data) {
  ensureDir$5(dirname(filePath));
  const tempPath = filePath + ".tmp";
  writeFileSync(tempPath, data, "utf-8");
  renameSync(tempPath, filePath);
}
function loadInterruptedApprovals() {
  const filePath = getInterruptedApprovalsPath();
  if (!existsSync(filePath)) {
    return [];
  }
  try {
    const raw = readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.approvals) ? parsed.approvals.map((approval) => ({
      ...approval,
      canResume: approval?.canResume ?? true,
      recoveryStatus: approval?.recoveryStatus ?? "interrupted",
      ownerId: typeof approval?.ownerId === "string" && approval.ownerId.trim() ? approval.ownerId : PRIMARY_AGENT_OWNER
    })) : [];
  } catch {
    return [];
  }
}
function saveInterruptedApprovals(approvals) {
  const filePath = getInterruptedApprovalsPath();
  atomicWrite$4(
    filePath,
    JSON.stringify({ approvals }, null, 2)
  );
}
function ensureDir$4(dirPath) {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}
function getHarnessRunsPath() {
  return join(app.getPath("userData"), "data", "harness-runs.json");
}
function atomicWrite$3(filePath, data) {
  ensureDir$4(dirname(filePath));
  const tempPath = filePath + ".tmp";
  writeFileSync(tempPath, data, "utf-8");
  renameSync(tempPath, filePath);
}
function loadPersistedHarnessRuns() {
  const filePath = getHarnessRunsPath();
  if (!existsSync(filePath)) {
    return [];
  }
  try {
    const raw = readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.runs) ? parsed.runs.map((run) => ({
      ...run,
      ownerId: typeof run.ownerId === "string" && run.ownerId.trim() ? run.ownerId : run.runKind === "chat" ? PRIMARY_AGENT_OWNER : buildSystemOwnerId(run.runKind ?? "system"),
      runKind: run.runKind ?? "chat",
      runSource: run.runSource ?? ((run.lane ?? "foreground") === "foreground" ? "user" : "system"),
      lane: run.lane ?? "foreground",
      pendingApproval: run.pendingApproval ? {
        requestId: typeof run.pendingApproval.requestId === "string" && run.pendingApproval.requestId.trim() ? run.pendingApproval.requestId : `recovered-${run.runId}`,
        kind: run.pendingApproval.kind,
        payloadHash: run.pendingApproval.payloadHash,
        reason: run.pendingApproval.reason,
        createdAt: run.pendingApproval.createdAt,
        title: typeof run.pendingApproval.title === "string" && run.pendingApproval.title.trim() ? run.pendingApproval.title : "恢复待确认操作",
        description: typeof run.pendingApproval.description === "string" && run.pendingApproval.description.trim() ? run.pendingApproval.description : run.pendingApproval.reason,
        detail: typeof run.pendingApproval.detail === "string" ? run.pendingApproval.detail : void 0
      } : void 0
    })) : [];
  } catch {
    return [];
  }
}
function savePersistedHarnessRuns(runs) {
  const filePath = getHarnessRunsPath();
  atomicWrite$3(
    filePath,
    JSON.stringify({ runs }, null, 2)
  );
}
class EventBus {
  listeners = /* @__PURE__ */ new Map();
  wildcardListeners = /* @__PURE__ */ new Set();
  /**
   * 订阅事件。返回取消订阅函数。
   */
  on(event, handler) {
    let set = this.listeners.get(event);
    if (!set) {
      set = /* @__PURE__ */ new Set();
      this.listeners.set(event, set);
    }
    set.add(handler);
    return () => {
      set.delete(handler);
      if (set.size === 0) this.listeners.delete(event);
    };
  }
  /**
   * 一次性订阅。触发后自动取消。
   */
  once(event, handler) {
    const off = this.on(event, (data) => {
      off();
      handler(data);
    });
    return off;
  }
  /**
   * 通配符订阅 — 收到所有事件。用于审计/日志。
   */
  onAny(handler) {
    this.wildcardListeners.add(handler);
    return () => {
      this.wildcardListeners.delete(handler);
    };
  }
  /**
   * 发射事件。同步调用所有 handler（handler 内部可以 async）。
   */
  emit(event, data) {
    const set = this.listeners.get(event);
    if (set) {
      for (const handler of set) {
        try {
          handler(data);
        } catch (err) {
          appLogger.warn({
            scope: "event-bus",
            message: `handler error on "${event}"`,
            error: err instanceof Error ? err : new Error(String(err))
          });
        }
      }
    }
    for (const handler of this.wildcardListeners) {
      try {
        handler(event, data);
      } catch {
      }
    }
  }
  /**
   * 返回某个事件的当前监听器数量。
   */
  listenerCount(event) {
    return this.listeners.get(event)?.size ?? 0;
  }
  /**
   * 移除所有监听器（测试/清理用）。
   */
  removeAllListeners() {
    this.listeners.clear();
    this.wildcardListeners.clear();
  }
}
const bus = new EventBus();
class HarnessRunCancelledError extends Error {
  constructor() {
    super("Harness run cancelled.");
    this.name = "HarnessRunCancelledError";
  }
}
class HarnessRuntime {
  activeForegroundRunsBySession = /* @__PURE__ */ new Map();
  activeRunsById = /* @__PURE__ */ new Map();
  approvalWaitersByRequestId = /* @__PURE__ */ new Map();
  interruptedApprovals = [];
  pendingResumedRunsById = /* @__PURE__ */ new Map();
  hydrated = false;
  /** 返回因应用重启而中断的待确认记录。 */
  getInterruptedApprovals(sessionId) {
    if (sessionId) {
      return this.interruptedApprovals.filter((r) => r.sessionId === sessionId);
    }
    return [...this.interruptedApprovals];
  }
  getPendingApprovals(sessionId) {
    const pendingRuns = [...this.activeRunsById.values()].filter((run) => run.pendingApproval).map((run) => this.toSnapshot(run));
    if (sessionId) {
      return pendingRuns.filter((run) => run.sessionId === sessionId);
    }
    return pendingRuns;
  }
  /** 确认已知晓某条中断记录（从列表中移除）。 */
  dismissInterruptedApproval(runId) {
    const idx = this.interruptedApprovals.findIndex((r) => r.runId === runId);
    if (idx >= 0) {
      this.interruptedApprovals.splice(idx, 1);
      this.persistInterruptedApprovals();
      return true;
    }
    return false;
  }
  resumeInterruptedRun(interruptedRunId) {
    const interruptedApproval = this.interruptedApprovals.find(
      (record) => record.runId === interruptedRunId
    );
    if (!interruptedApproval) {
      throw new Error("找不到对应的中断审批记录。");
    }
    if (!interruptedApproval.canResume) {
      throw new Error("当前中断审批不支持恢复执行。");
    }
    const resumedRunId = crypto.randomUUID();
    this.pendingResumedRunsById.set(resumedRunId, {
      sessionId: interruptedApproval.sessionId,
      metadata: {
        resumedFromRunId: interruptedApproval.runId,
        resumedFromOwnerId: interruptedApproval.ownerId,
        resumedFromModelEntryId: interruptedApproval.modelEntryId ?? null,
        resumedFromRunKind: interruptedApproval.runKind ?? null,
        resumedFromRunSource: interruptedApproval.runSource ?? null,
        resumedFromLane: interruptedApproval.lane ?? null,
        resumedFromState: interruptedApproval.state ?? null,
        resumedFromStartedAt: interruptedApproval.startedAt ?? null,
        resumedFromCurrentStepId: interruptedApproval.currentStepId ?? null,
        resumedFromApprovalRequestId: interruptedApproval.approval.requestId,
        resumedFromApprovalKind: interruptedApproval.approval.kind,
        resumedFromApprovalPayloadHash: interruptedApproval.approval.payloadHash,
        resumedFromApprovalTitle: interruptedApproval.approval.title,
        resumedFromApprovalDescription: interruptedApproval.approval.description,
        resumedFromApprovalReason: interruptedApproval.approval.reason,
        resumedFromApprovalDetail: interruptedApproval.approval.detail ?? null,
        resumedFromApprovalCreatedAt: interruptedApproval.approval.createdAt,
        resumedFromInterruptedAt: interruptedApproval.interruptedAt,
        resumedFromRecoveryStatus: interruptedApproval.recoveryStatus ?? "interrupted"
      }
    });
    return resumedRunId;
  }
  hydrateFromDisk() {
    if (this.hydrated) {
      return [];
    }
    this.hydrated = true;
    const persistedRuns = loadPersistedHarnessRuns();
    if (persistedRuns.length === 0) {
      this.restoreInterruptedApprovalsFromStore();
      return [];
    }
    this.restoreInterruptedApprovalsFromStore();
    const now = Date.now();
    for (const run of persistedRuns) {
      const wasAwaitingConfirmation = run.state === "awaiting_confirmation";
      const finalState = wasAwaitingConfirmation ? "aborted" : "failed";
      const action = wasAwaitingConfirmation ? "run_aborted" : "run_failed";
      const reason = wasAwaitingConfirmation ? "应用重启中断了待确认操作。" : "应用启动时发现未完成 run，已标记为失败。";
      if (wasAwaitingConfirmation && run.pendingApproval) {
        const record = {
          sessionId: run.sessionId,
          runId: run.runId,
          ownerId: run.ownerId,
          modelEntryId: run.modelEntryId,
          runKind: run.runKind,
          runSource: run.runSource,
          lane: run.lane,
          state: run.state,
          startedAt: run.startedAt,
          currentStepId: run.currentStepId,
          canResume: true,
          recoveryStatus: "interrupted",
          approval: run.pendingApproval,
          interruptedAt: now
        };
        this.upsertInterruptedApproval(record);
      }
      this.audit({
        runId: run.runId,
        sessionId: run.sessionId,
        action,
        timestamp: now,
        state: finalState,
        reason,
        metadata: {
          recoveredFromDisk: true,
          previousState: run.state,
          startedAt: run.startedAt,
          endedAt: run.endedAt,
          pendingApproval: run.pendingApproval
        }
      });
    }
    savePersistedHarnessRuns([]);
    return persistedRuns;
  }
  getActiveRunBySession(sessionId) {
    const run = this.activeForegroundRunsBySession.get(sessionId);
    return run ? this.toSnapshot(run) : null;
  }
  createRun(input) {
    const pendingResumedRun = this.pendingResumedRunsById.get(input.runId);
    if (pendingResumedRun && pendingResumedRun.sessionId !== input.sessionId) {
      this.pendingResumedRunsById.delete(input.runId);
      throw new Error("恢复 run 的 session 不匹配。");
    }
    const lane = input.lane ?? "foreground";
    const ownerId = input.ownerId ?? (lane === "foreground" ? PRIMARY_AGENT_OWNER : buildSystemOwnerId(input.runKind));
    if (lane === "foreground") {
      const existing = this.activeForegroundRunsBySession.get(input.sessionId);
      if (existing && !existing.cancelled) {
        throw new Error("当前线程仍在生成中，请先停止当前回复。");
      }
      if (existing?.cancelled) {
        this.activeRunsById.delete(existing.runId);
      }
    }
    const run = {
      requestId: crypto.randomUUID(),
      runId: input.runId,
      sessionId: input.sessionId,
      ownerId,
      modelEntryId: input.modelEntryId,
      runKind: input.runKind,
      runSource: input.runSource ?? (lane === "foreground" ? "user" : "system"),
      lane,
      state: "running",
      startedAt: Date.now(),
      cancelled: false,
      metadata: pendingResumedRun ? {
        ...pendingResumedRun.metadata,
        ...input.metadata ?? {}
      } : input.metadata,
      handle: null
    };
    if (pendingResumedRun) {
      this.pendingResumedRunsById.delete(input.runId);
    }
    if (run.lane === "foreground") {
      this.activeForegroundRunsBySession.set(run.sessionId, run);
    }
    this.activeRunsById.set(run.runId, run);
    this.persistActiveRuns();
    this.audit({
      runId: run.runId,
      sessionId: run.sessionId,
      action: "run_created",
      timestamp: run.startedAt,
      state: run.state,
      metadata: {
        modelEntryId: run.modelEntryId,
        requestId: run.requestId,
        ownerId: run.ownerId,
        runKind: run.runKind,
        runSource: run.runSource,
        lane: run.lane,
        ...run.metadata
      }
    });
    bus.emit("run:started", {
      sessionId: run.sessionId,
      runId: run.runId,
      modelEntryId: run.modelEntryId
    });
    return this.toSnapshot(run);
  }
  attachHandle(scope, handle) {
    const run = this.getActiveRun(scope);
    if (!run) {
      return;
    }
    run.handle = handle;
  }
  getHandle(scope) {
    return this.getActiveRun(scope)?.handle ?? null;
  }
  assertRunActive(scope) {
    const run = this.getActiveRun(scope);
    if (!run || run.cancelled) {
      throw new HarnessRunCancelledError();
    }
    return this.toSnapshot(run);
  }
  isCancelRequested(scope) {
    const run = this.getActiveRun(scope);
    return !!run?.cancelled;
  }
  requestCancel(scope) {
    const run = this.getActiveRun(scope);
    if (!run) {
      return null;
    }
    if (!run.cancelled) {
      run.cancelled = true;
      this.persistActiveRuns();
      this.audit({
        runId: run.runId,
        sessionId: run.sessionId,
        action: "run_cancel_requested",
        timestamp: Date.now(),
        state: run.state
      });
      if (run.pendingApproval?.requestId) {
        this.resolvePendingApproval(
          {
            requestId: run.pendingApproval.requestId,
            allowed: false
          },
          "system"
        );
      }
    }
    return this.toSnapshot(run);
  }
  waitForApprovalResponse(scope, approval) {
    const existing = this.approvalWaitersByRequestId.get(approval.requestId);
    if (existing) {
      return existing.promise;
    }
    let resolveWaiter;
    const promise = new Promise((resolve) => {
      resolveWaiter = resolve;
    });
    this.approvalWaitersByRequestId.set(approval.requestId, {
      scope,
      promise,
      resolve: resolveWaiter,
      settled: false
    });
    return promise;
  }
  resolvePendingApproval(response, source = "renderer") {
    const waiter = this.approvalWaitersByRequestId.get(response.requestId);
    if (!waiter || waiter.settled) {
      return false;
    }
    waiter.settled = true;
    this.approvalWaitersByRequestId.delete(response.requestId);
    this.dismissInterruptedApproval(waiter.scope.runId);
    waiter.resolve({
      requestId: response.requestId,
      allowed: response.allowed,
      respondedAt: Date.now(),
      source,
      remember: response.remember
    });
    return true;
  }
  transitionState(scope, nextState, options) {
    const run = this.getActiveRun(scope);
    if (!run) {
      return null;
    }
    run.state = nextState;
    run.currentStepId = options?.currentStepId ?? run.currentStepId;
    if (options?.pendingApproval === null) {
      delete run.pendingApproval;
    } else if (options?.pendingApproval) {
      run.pendingApproval = options.pendingApproval;
    }
    this.audit({
      runId: run.runId,
      sessionId: run.sessionId,
      action: "run_state_changed",
      timestamp: Date.now(),
      state: run.state,
      reason: options?.reason,
      metadata: options?.metadata
    });
    this.persistActiveRuns();
    return this.toSnapshot(run);
  }
  finishRun(scope, finalState, options) {
    const run = this.getActiveRun(scope);
    if (!run) {
      return null;
    }
    run.state = finalState;
    run.endedAt = Date.now();
    if (finalState === "aborted") {
      run.cancelled = true;
    }
    const action = finalState === "completed" ? "run_completed" : finalState === "aborted" ? "run_aborted" : "run_failed";
    this.audit({
      runId: run.runId,
      sessionId: run.sessionId,
      action,
      timestamp: run.endedAt,
      state: run.state,
      reason: options?.reason,
      metadata: options?.metadata
    });
    if (run.pendingApproval?.requestId) {
      this.approvalWaitersByRequestId.delete(run.pendingApproval.requestId);
    }
    this.dismissInterruptedApproval(run.runId);
    this.activeRunsById.delete(run.runId);
    if (this.activeForegroundRunsBySession.get(run.sessionId)?.requestId === run.requestId) {
      this.activeForegroundRunsBySession.delete(run.sessionId);
    }
    this.persistActiveRuns();
    bus.emit("run:completed", {
      sessionId: run.sessionId,
      runId: run.runId,
      finalState,
      reason: options?.reason
    });
    return this.toSnapshot(run);
  }
  recordToolPolicyEvaluation(scope, evaluation, metadata) {
    const run = this.getActiveRun(scope);
    if (!run) {
      return;
    }
    this.audit({
      runId: run.runId,
      sessionId: run.sessionId,
      action: "tool_policy_evaluated",
      timestamp: Date.now(),
      state: run.state,
      toolName: evaluation.toolName,
      decision: evaluation.decision.type,
      reason: evaluation.decision.reason,
      metadata: {
        riskLevel: evaluation.riskLevel,
        ...evaluation.metadata ?? {},
        ...metadata ?? {}
      }
    });
  }
  restoreInterruptedApprovalsFromStore() {
    const persisted = loadInterruptedApprovals();
    this.interruptedApprovals.splice(0, this.interruptedApprovals.length, ...persisted);
  }
  persistInterruptedApprovals() {
    saveInterruptedApprovals(this.interruptedApprovals);
  }
  upsertInterruptedApproval(record) {
    const existingIndex = this.interruptedApprovals.findIndex(
      (item) => item.runId === record.runId
    );
    if (existingIndex >= 0) {
      this.interruptedApprovals[existingIndex] = record;
    } else {
      this.interruptedApprovals.push(record);
    }
    this.persistInterruptedApprovals();
  }
  getActiveRun(scope) {
    const run = this.activeRunsById.get(scope.runId);
    if (!run || run.sessionId !== scope.sessionId) {
      return null;
    }
    if (run.lane === "foreground" && this.activeForegroundRunsBySession.get(scope.sessionId)?.requestId !== run.requestId) {
      return null;
    }
    return run;
  }
  toSnapshot(run) {
    return {
      requestId: run.requestId,
      runId: run.runId,
      sessionId: run.sessionId,
      ownerId: run.ownerId,
      modelEntryId: run.modelEntryId,
      runKind: run.runKind,
      runSource: run.runSource,
      lane: run.lane,
      state: run.state,
      startedAt: run.startedAt,
      endedAt: run.endedAt,
      currentStepId: run.currentStepId,
      pendingApproval: run.pendingApproval,
      cancelled: run.cancelled,
      metadata: run.metadata
    };
  }
  audit(event) {
    appendHarnessAuditEvent(event);
  }
  persistActiveRuns() {
    const snapshots = [...this.activeRunsById.values()].map(
      (run) => this.toSnapshot(run)
    );
    savePersistedHarnessRuns(snapshots);
  }
}
const harnessRuntime = new HarnessRuntime();
function createEmptySession() {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  return {
    id: crypto.randomUUID(),
    title: "新的工作线程",
    messages: [],
    attachments: [],
    draft: "",
    createdAt: now,
    updatedAt: now
  };
}
function ensureDir$3(dirPath) {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}
function atomicWrite$2(filePath, data) {
  ensureDir$3(dirname(filePath));
  const tempPath = filePath + ".tmp";
  writeFileSync(tempPath, data, "utf-8");
  renameSync(tempPath, filePath);
}
function appendLine(filePath, line) {
  ensureDir$3(dirname(filePath));
  const current = existsSync(filePath) ? readFileSync(filePath, "utf-8") : "";
  atomicWrite$2(filePath, current + line + "\n");
}
function readJsonFile$2(filePath, fallback) {
  if (!existsSync(filePath)) {
    return fallback;
  }
  try {
    return JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    return fallback;
  }
}
const LEGACY_STORE_FILE = "desktop-shell-state.json";
const SESSIONS_DIR = "sessions";
const INDEX_FILE = "index.json";
const SESSION_FILE = "session.json";
const TRANSCRIPT_FILE = "transcript.jsonl";
const SNAPSHOT_FILE = "context-snapshot.json";
function getDataDir$1() {
  return join(app.getPath("userData"), "data");
}
function getSessionsDir() {
  return join(getDataDir$1(), SESSIONS_DIR);
}
function getSessionDir(sessionId) {
  return join(getSessionsDir(), sessionId);
}
function getIndexPath$1() {
  return join(getSessionsDir(), INDEX_FILE);
}
function getSessionMetaPath(sessionId) {
  return join(getSessionDir(sessionId), SESSION_FILE);
}
function getTranscriptPath(sessionId) {
  return join(getSessionDir(sessionId), TRANSCRIPT_FILE);
}
function getSnapshotPath(sessionId) {
  return join(getSessionDir(sessionId), SNAPSHOT_FILE);
}
function getLegacyStorePath() {
  return join(app.getPath("userData"), LEGACY_STORE_FILE);
}
function getLegacyFlatSessionPath(sessionId) {
  return join(getSessionsDir(), `${sessionId}.json`);
}
function loadTranscript(sessionId) {
  const filePath = getTranscriptPath(sessionId);
  if (!existsSync(filePath)) {
    return [];
  }
  const lines = readFileSync(filePath, "utf-8").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const events = [];
  for (const line of lines) {
    try {
      events.push(JSON.parse(line));
    } catch {
    }
  }
  return events;
}
function countMaterializedMessages(events) {
  let count = 0;
  for (const event of events) {
    if (event.type === "user_message" || event.type === "assistant_message") {
      count += 1;
      continue;
    }
    if (event.type === "run_finished" && event.finalState === "failed" && event.reason === "app_restart_interrupted") {
      count += 1;
    }
  }
  return count;
}
function materializeMessages(events) {
  const messages = [];
  for (const event of events) {
    if (event.type === "user_message" || event.type === "assistant_message") {
      messages.push(event.message);
      continue;
    }
    if (event.type === "run_finished" && event.finalState === "failed" && event.reason === "app_restart_interrupted") {
      messages.push({
        id: `system-${event.runId}-${event.seq}`,
        role: "system",
        content: "上次运行在应用退出或重启时中断，已标记为失败，可继续接着处理。",
        timestamp: event.timestamp,
        status: "done"
      });
    }
  }
  return messages;
}
function createMetaFromSession(session) {
  return {
    id: session.id,
    title: session.title,
    titleManuallySet: false,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    archived: session.archived,
    groupId: session.groupId,
    pinned: session.pinned,
    draft: session.draft,
    attachments: session.attachments,
    lastModelEntryId: null,
    lastRunId: null,
    transcriptSeq: 0,
    snapshotRevision: 0,
    autoCompactFailureCount: 0,
    todos: []
  };
}
function normalizePersistedSessionMeta(meta) {
  return {
    ...meta,
    titleManuallySet: meta.titleManuallySet === true,
    transcriptSeq: Number.isFinite(meta.transcriptSeq) ? Math.max(0, meta.transcriptSeq) : 0,
    snapshotRevision: Number.isFinite(meta.snapshotRevision) ? Math.max(0, meta.snapshotRevision) : 0,
    autoCompactFailureCount: Number.isFinite(meta.autoCompactFailureCount) ? Math.max(0, meta.autoCompactFailureCount) : 0,
    todos: Array.isArray(meta.todos) ? meta.todos.map(normalizeTodoItem) : []
  };
}
function normalizeTodoStatus(value) {
  switch (value) {
    case "pending":
    case "in_progress":
    case "completed":
      return value;
    default:
      return "pending";
  }
}
function normalizeTodoItem(item) {
  const content = typeof item.content === "string" ? item.content.trim() : "";
  const activeForm = typeof item.activeForm === "string" && item.activeForm.trim() ? item.activeForm.trim() : content;
  return {
    id: typeof item.id === "string" && item.id.trim() ? item.id : `todo-${randomUUID()}`,
    content,
    activeForm,
    status: normalizeTodoStatus(item.status)
  };
}
function writeMeta(meta) {
  atomicWrite$2(
    getSessionMetaPath(meta.id),
    JSON.stringify(normalizePersistedSessionMeta(meta), null, 2)
  );
}
function readMeta(sessionId) {
  const filePath = getSessionMetaPath(sessionId);
  if (!existsSync(filePath)) {
    return null;
  }
  try {
    return normalizePersistedSessionMeta(
      JSON.parse(readFileSync(filePath, "utf-8"))
    );
  } catch {
    return null;
  }
}
function readIndex() {
  return readJsonFile$2(getIndexPath$1(), { summaries: [] });
}
function writeIndex(index) {
  atomicWrite$2(getIndexPath$1(), JSON.stringify(index, null, 2));
}
function updateIndexWithMeta(meta) {
  const transcript = loadTranscript(meta.id);
  const summary = {
    id: meta.id,
    title: meta.title,
    updatedAt: meta.updatedAt,
    messageCount: countMaterializedMessages(transcript),
    archived: meta.archived,
    groupId: meta.groupId,
    pinned: meta.pinned,
    lastRunState: meta.lastRunState
  };
  const index = readIndex();
  const filtered = index.summaries.filter((entry) => entry.id !== meta.id);
  filtered.push(summary);
  filtered.sort((left, right) => {
    if (Boolean(left.pinned) !== Boolean(right.pinned)) {
      return left.pinned ? -1 : 1;
    }
    return right.updatedAt.localeCompare(left.updatedAt);
  });
  writeIndex({ summaries: filtered });
}
function sortSessionSummaries(summaries) {
  return summaries.sort((left, right) => {
    if (Boolean(left.pinned) !== Boolean(right.pinned)) {
      return left.pinned ? -1 : 1;
    }
    return right.updatedAt.localeCompare(left.updatedAt);
  });
}
function removeFromIndex(sessionId) {
  const index = readIndex();
  if (!index.summaries.some((summary) => summary.id === sessionId)) {
    return;
  }
  writeIndex({
    summaries: index.summaries.filter((summary) => summary.id !== sessionId)
  });
}
function updateMeta(sessionId, updater) {
  const meta = readMeta(sessionId);
  if (!meta) {
    return null;
  }
  updater(meta);
  meta.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  writeMeta(meta);
  updateIndexWithMeta(meta);
  return meta;
}
function deriveSessionTitle(text, attachments) {
  const trimmed = text.trim();
  if (trimmed) {
    return trimmed.slice(0, 24);
  }
  if (attachments.length > 0) {
    return `附件会话 · ${attachments[0]?.name ?? "未命名附件"}`;
  }
  return "新的工作线程";
}
function appendTranscriptEvent(sessionId, buildEvent) {
  const meta = readMeta(sessionId);
  if (!meta) {
    throw new Error(`会话不存在：${sessionId}`);
  }
  const nextSeq = meta.transcriptSeq + 1;
  const event = buildEvent(nextSeq, meta);
  appendLine(getTranscriptPath(sessionId), JSON.stringify(event));
  meta.transcriptSeq = nextSeq;
  meta.updatedAt = event.timestamp;
  writeMeta(meta);
  updateIndexWithMeta(meta);
  return event;
}
function appendUserMessageEvent$1(input) {
  const meta = readMeta(input.sessionId);
  if (!meta) {
    throw new Error(`会话不存在：${input.sessionId}`);
  }
  const title = loadTranscript(input.sessionId).length === 0 ? deriveSessionTitle(input.text, input.attachments) : meta.title;
  const message = {
    id: randomUUID(),
    role: "user",
    content: input.text.trim(),
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    status: "done",
    meta: {
      attachmentIds: input.attachments.map((attachment) => attachment.id),
      attachments: input.attachments
    }
  };
  meta.title = title;
  meta.attachments = [];
  meta.draft = "";
  meta.lastModelEntryId = input.modelEntryId;
  meta.updatedAt = message.timestamp;
  writeMeta(meta);
  appendTranscriptEvent(input.sessionId, (nextSeq) => ({
    seq: nextSeq,
    sessionId: input.sessionId,
    timestamp: message.timestamp,
    type: "user_message",
    message
  }));
  return { message, title };
}
function appendRunStartedEvent(input) {
  const event = appendTranscriptEvent(input.sessionId, (nextSeq) => ({
    seq: nextSeq,
    sessionId: input.sessionId,
    runId: input.runId,
    ownerId: input.ownerId,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    type: "run_started",
    runKind: input.runKind,
    modelEntryId: input.modelEntryId,
    thinkingLevel: input.thinkingLevel
  }));
  updateMeta(input.sessionId, (meta) => {
    meta.lastRunId = input.runId;
    meta.lastModelEntryId = input.modelEntryId;
    meta.lastRunState = "running";
  });
  return event;
}
function appendRunStateChangedEvent(input) {
  const event = appendTranscriptEvent(input.sessionId, (nextSeq) => ({
    seq: nextSeq,
    sessionId: input.sessionId,
    runId: input.runId,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    type: "run_state_changed",
    state: input.state,
    reason: input.reason,
    currentStepId: input.currentStepId
  }));
  updateMeta(input.sessionId, (meta) => {
    meta.lastRunId = input.runId;
    meta.lastRunState = input.state === "awaiting_confirmation" ? "awaiting_confirmation" : "running";
  });
  return event;
}
function appendToolStartedEvent(input) {
  return appendTranscriptEvent(input.sessionId, (nextSeq) => ({
    seq: nextSeq,
    sessionId: input.sessionId,
    runId: input.runId,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    type: "tool_started",
    stepId: input.stepId,
    toolName: input.toolName,
    args: input.args
  }));
}
function appendToolFinishedEvent(input) {
  return appendTranscriptEvent(input.sessionId, (nextSeq) => ({
    seq: nextSeq,
    sessionId: input.sessionId,
    runId: input.runId,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    type: "tool_finished",
    stepId: input.stepId,
    toolName: input.toolName,
    result: input.result,
    error: input.error
  }));
}
function appendConfirmationRequestedEvent(input) {
  return appendTranscriptEvent(input.sessionId, (nextSeq) => ({
    seq: nextSeq,
    sessionId: input.sessionId,
    runId: input.runId,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    type: "confirmation_requested",
    requestId: input.requestId,
    title: input.title,
    description: input.description,
    detail: input.detail
  }));
}
function appendConfirmationResolvedEvent(input) {
  return appendTranscriptEvent(input.sessionId, (nextSeq) => ({
    seq: nextSeq,
    sessionId: input.sessionId,
    runId: input.runId,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    type: "confirmation_resolved",
    requestId: input.requestId,
    allowed: input.allowed
  }));
}
function appendAssistantMessageEvent(input) {
  return appendTranscriptEvent(input.sessionId, (nextSeq) => ({
    seq: nextSeq,
    sessionId: input.sessionId,
    runId: input.runId,
    timestamp: input.message.timestamp,
    type: "assistant_message",
    message: input.message
  }));
}
function appendCompactAppliedEvent(input) {
  return appendTranscriptEvent(input.sessionId, (nextSeq) => ({
    seq: nextSeq,
    sessionId: input.sessionId,
    runId: input.runId,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    type: "compact_applied",
    snapshotRevision: input.snapshotRevision,
    compactedUntilSeq: input.compactedUntilSeq,
    reason: input.reason
  }));
}
function appendRunFinishedEvent(input) {
  const event = appendTranscriptEvent(input.sessionId, (nextSeq) => ({
    seq: nextSeq,
    sessionId: input.sessionId,
    runId: input.runId,
    ownerId: input.ownerId,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    type: "run_finished",
    finalState: input.finalState,
    reason: input.reason
  }));
  updateMeta(input.sessionId, (meta) => {
    meta.lastRunId = input.runId;
    meta.lastRunState = input.finalState === "completed" ? "completed" : input.finalState === "aborted" ? "cancelled" : "error";
  });
  return event;
}
function createEmptySnapshot(sessionId) {
  return {
    version: 1,
    sessionId,
    revision: 0,
    updatedAt: (/* @__PURE__ */ new Date(0)).toISOString(),
    compactedUntilSeq: 0,
    summary: "",
    currentTask: null,
    currentState: null,
    decisions: [],
    importantFiles: [],
    importantAttachments: [],
    openLoops: [],
    nextActions: [],
    risks: [],
    errors: [],
    learnings: [],
    workspace: {
      branchName: null,
      modelEntryId: null,
      thinkingLevel: null
    },
    sourceRunIds: [],
    sourceMessageIds: []
  };
}
function writeSnapshot(snapshot) {
  atomicWrite$2(
    getSnapshotPath(snapshot.sessionId),
    JSON.stringify(snapshot, null, 2)
  );
}
function readSnapshot(sessionId) {
  return readJsonFile$2(getSnapshotPath(sessionId), createEmptySnapshot(sessionId));
}
function materializeSession(meta) {
  const transcript = loadTranscript(meta.id);
  return {
    id: meta.id,
    title: meta.title,
    messages: materializeMessages(transcript),
    attachments: meta.attachments,
    draft: meta.draft,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
    archived: meta.archived,
    groupId: meta.groupId,
    pinned: meta.pinned
  };
}
function resolveLastRunFields(events) {
  let lastModelEntryId = null;
  let lastRunId = null;
  let lastRunState = void 0;
  for (const event of events) {
    switch (event.type) {
      case "run_started":
        lastModelEntryId = event.modelEntryId;
        lastRunId = event.runId;
        lastRunState = "running";
        break;
      case "run_state_changed":
        lastRunId = event.runId;
        lastRunState = event.state === "awaiting_confirmation" ? "awaiting_confirmation" : "running";
        break;
      case "run_finished":
        lastRunId = event.runId;
        lastRunState = event.finalState === "completed" ? "completed" : event.finalState === "aborted" ? "cancelled" : "error";
        break;
    }
  }
  return {
    lastModelEntryId,
    lastRunId,
    lastRunState
  };
}
function createTrimmedSnapshot(sessionId, currentSnapshot, modelEntryId, updatedAt) {
  return {
    ...createEmptySnapshot(sessionId),
    revision: currentSnapshot.revision + 1,
    updatedAt,
    workspace: {
      branchName: currentSnapshot.workspace.branchName,
      modelEntryId,
      thinkingLevel: currentSnapshot.workspace.thinkingLevel
    }
  };
}
function migrateLegacyDesktopShellState() {
  const legacyPath = getLegacyStorePath();
  if (!existsSync(legacyPath)) {
    return;
  }
  try {
    const parsed = JSON.parse(readFileSync(legacyPath, "utf-8"));
    if (Array.isArray(parsed.sessions)) {
      for (const session of parsed.sessions) {
        const flatPath = getLegacyFlatSessionPath(session.id);
        if (!existsSync(flatPath) && !existsSync(getSessionDir(session.id))) {
          atomicWrite$2(flatPath, JSON.stringify(session, null, 2));
        }
      }
    }
    renameSync(legacyPath, legacyPath + ".bak");
  } catch {
  }
}
function migrateFlatSessionFiles() {
  ensureDir$3(getSessionsDir());
  const entries = readdirSync(getSessionsDir(), { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue;
    }
    if (entry.name === INDEX_FILE) {
      continue;
    }
    const flatPath = join(getSessionsDir(), entry.name);
    let session = null;
    try {
      session = JSON.parse(readFileSync(flatPath, "utf-8"));
    } catch {
      session = null;
    }
    if (!session) {
      continue;
    }
    const sessionDir = getSessionDir(session.id);
    if (!existsSync(sessionDir)) {
      ensureDir$3(sessionDir);
      const meta = createMetaFromSession(session);
      writeMeta(meta);
      writeSnapshot(createEmptySnapshot(session.id));
      let lastAssistantRunState = void 0;
      const lines = [];
      let seq = 0;
      for (const message of session.messages) {
        if (message.role === "user") {
          seq += 1;
          lines.push(
            JSON.stringify({
              seq,
              sessionId: session.id,
              timestamp: message.timestamp,
              type: "user_message",
              message
            })
          );
          continue;
        }
        const legacyRunId = `legacy-${message.id}`;
        seq += 1;
        lines.push(
          JSON.stringify({
            seq,
            sessionId: session.id,
            runId: legacyRunId,
            timestamp: message.timestamp,
            type: "run_started",
            runKind: "chat",
            modelEntryId: meta.lastModelEntryId ?? "legacy",
            thinkingLevel: "off"
          })
        );
        seq += 1;
        lines.push(
          JSON.stringify({
            seq,
            sessionId: session.id,
            runId: legacyRunId,
            timestamp: message.timestamp,
            type: "assistant_message",
            message
          })
        );
        seq += 1;
        const finalState = message.status === "error" ? "error" : "completed";
        lines.push(
          JSON.stringify({
            seq,
            sessionId: session.id,
            runId: legacyRunId,
            timestamp: message.timestamp,
            type: "run_finished",
            finalState: message.status === "error" ? "failed" : "completed"
          })
        );
        lastAssistantRunState = finalState;
      }
      meta.transcriptSeq = seq;
      meta.lastRunState = lastAssistantRunState;
      writeMeta(meta);
      atomicWrite$2(getTranscriptPath(session.id), lines.join(lines.length > 0 ? "\n" : ""));
      updateIndexWithMeta(meta);
    }
    try {
      unlinkSync(flatPath);
    } catch {
    }
  }
}
let storageReady = false;
function ensureSessionStorageReady() {
  if (storageReady) {
    return;
  }
  storageReady = true;
  ensureDir$3(getSessionsDir());
  migrateLegacyDesktopShellState();
  migrateFlatSessionFiles();
  if (!existsSync(getIndexPath$1())) {
    writeIndex({ summaries: [] });
  }
}
function listPersistedSessions() {
  ensureSessionStorageReady();
  return sortSessionSummaries(
    readIndex().summaries.filter((summary) => !summary.archived)
  );
}
function listPersistedArchivedSessions() {
  ensureSessionStorageReady();
  return sortSessionSummaries(
    readIndex().summaries.filter((summary) => summary.archived)
  );
}
function loadPersistedSession(sessionId) {
  const meta = readMeta(sessionId);
  return meta ? materializeSession(meta) : null;
}
function saveSessionProjection(session) {
  ensureSessionStorageReady();
  const meta = readMeta(session.id);
  if (!meta) {
    return;
  }
  meta.title = session.title;
  meta.updatedAt = session.updatedAt;
  meta.archived = session.archived;
  meta.groupId = session.groupId;
  meta.pinned = session.pinned;
  meta.draft = session.draft;
  meta.attachments = session.attachments;
  writeMeta(meta);
  updateIndexWithMeta(meta);
}
function createPersistedSession() {
  ensureSessionStorageReady();
  const session = createEmptySession();
  const meta = createMetaFromSession(session);
  ensureDir$3(getSessionDir(session.id));
  writeMeta(meta);
  atomicWrite$2(getTranscriptPath(session.id), "");
  writeSnapshot(createEmptySnapshot(session.id));
  updateIndexWithMeta(meta);
  return materializeSession(meta);
}
function deletePersistedSession(sessionId) {
  ensureSessionStorageReady();
  const sessionDir = getSessionDir(sessionId);
  if (existsSync(sessionDir)) {
    rmSync(sessionDir, { recursive: true, force: true });
  }
  removeFromIndex(sessionId);
}
function trimPersistedSessionMessages(sessionId, messageId) {
  ensureSessionStorageReady();
  const meta = readMeta(sessionId);
  if (!meta) {
    throw new Error(`会话不存在：${sessionId}`);
  }
  const transcript = loadTranscript(sessionId);
  const targetEvent = transcript.find(
    (event) => (event.type === "user_message" || event.type === "assistant_message") && event.message.id === messageId
  );
  if (!targetEvent) {
    throw new Error(`未找到要裁剪的消息：${messageId}`);
  }
  const removedRunIds = /* @__PURE__ */ new Set();
  if (targetEvent.type === "assistant_message") {
    removedRunIds.add(targetEvent.runId);
  }
  const nextEvents = transcript.filter((event) => {
    if (event.seq >= targetEvent.seq) {
      return false;
    }
    return !("runId" in event && removedRunIds.has(event.runId));
  });
  const nextTranscript = nextEvents.map((event) => JSON.stringify(event)).join(nextEvents.length > 0 ? "\n" : "");
  atomicWrite$2(
    getTranscriptPath(sessionId),
    nextTranscript ? `${nextTranscript}
` : ""
  );
  const updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  const currentSnapshot = readSnapshot(sessionId);
  const { lastModelEntryId, lastRunId, lastRunState } = resolveLastRunFields(nextEvents);
  meta.attachments = [];
  meta.draft = "";
  meta.transcriptSeq = nextEvents.at(-1)?.seq ?? 0;
  meta.lastModelEntryId = lastModelEntryId;
  meta.lastRunId = lastRunId;
  meta.lastRunState = lastRunState;
  meta.snapshotRevision = currentSnapshot.revision + 1;
  meta.updatedAt = updatedAt;
  writeMeta(meta);
  updateIndexWithMeta(meta);
  writeSnapshot(
    createTrimmedSnapshot(
      sessionId,
      currentSnapshot,
      lastModelEntryId,
      updatedAt
    )
  );
  return materializeSession(meta);
}
function archivePersistedSession(sessionId) {
  updateSessionMeta(sessionId, (meta) => {
    meta.archived = true;
  });
}
function unarchivePersistedSession(sessionId) {
  updateSessionMeta(sessionId, (meta) => {
    meta.archived = false;
  });
}
function renamePersistedSession(sessionId, title, options) {
  updateSessionMeta(sessionId, (meta) => {
    meta.title = title;
    meta.titleManuallySet = options?.manual !== false;
  });
}
function setPersistedSessionGroup(sessionId, groupId) {
  updateSessionMeta(sessionId, (meta) => {
    if (groupId === null) {
      delete meta.groupId;
    } else {
      meta.groupId = groupId;
    }
  });
}
function setPersistedSessionPinned(sessionId, pinned) {
  updateSessionMeta(sessionId, (meta) => {
    meta.pinned = pinned;
  });
}
function getPersistedSnapshot(sessionId) {
  ensureSessionStorageReady();
  return readSnapshot(sessionId);
}
function writePersistedSnapshot(snapshot) {
  ensureSessionStorageReady();
  const meta = readMeta(snapshot.sessionId);
  if (!meta) {
    throw new Error(`会话不存在：${snapshot.sessionId}`);
  }
  meta.snapshotRevision = snapshot.revision;
  meta.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  writeMeta(meta);
  writeSnapshot(snapshot);
  updateIndexWithMeta(meta);
}
function loadTranscriptEvents(sessionId) {
  ensureSessionStorageReady();
  return loadTranscript(sessionId);
}
function updateSessionMeta(sessionId, updater) {
  ensureSessionStorageReady();
  return updateMeta(sessionId, updater);
}
function appendUserMessageEvent(input) {
  ensureSessionStorageReady();
  return appendUserMessageEvent$1(input);
}
function recoverInterruptedRuns(runs) {
  ensureSessionStorageReady();
  for (const run of runs) {
    const meta = readMeta(run.sessionId);
    if (!meta) {
      continue;
    }
    appendRunFinishedEvent({
      sessionId: run.sessionId,
      runId: run.runId,
      ownerId: run.ownerId,
      finalState: run.state === "awaiting_confirmation" ? "aborted" : "failed",
      reason: "app_restart_interrupted"
    });
  }
}
function getSessionMeta(sessionId) {
  ensureSessionStorageReady();
  return readMeta(sessionId);
}
function listSessionTodos(sessionId) {
  ensureSessionStorageReady();
  return readMeta(sessionId)?.todos?.map(normalizeTodoItem) ?? [];
}
function writeSessionTodos(sessionId, items) {
  const normalizedItems = items.map(normalizeTodoItem).filter((item) => item.content.length > 0);
  updateSessionMeta(sessionId, (meta) => {
    meta.todos = normalizedItems;
  });
  return normalizedItems;
}
async function executeScheduledRun(input) {
  const ownerId = input.ownerId ?? buildSystemOwnerId(input.runKind);
  const runId = `${input.runIdPrefix ?? input.runKind}-${randomUUID()}`;
  const runScope = {
    sessionId: input.sessionId,
    runId
  };
  harnessRuntime.createRun({
    ...runScope,
    ownerId,
    modelEntryId: input.modelEntryId,
    runKind: input.runKind,
    runSource: input.runSource,
    lane: input.lane,
    metadata: input.metadata
  });
  appendRunStartedEvent({
    sessionId: input.sessionId,
    runId,
    ownerId,
    runKind: input.runKind,
    modelEntryId: input.modelEntryId,
    thinkingLevel: input.thinkingLevel
  });
  try {
    const result = await input.execute({
      runScope,
      lane: input.lane,
      runKind: input.runKind,
      runSource: input.runSource,
      ownerId
    });
    appendRunFinishedEvent({
      sessionId: input.sessionId,
      runId,
      ownerId,
      finalState: "completed"
    });
    harnessRuntime.finishRun(runScope, "completed");
    return result;
  } catch (error) {
    const reason = error instanceof Error ? error.message : `${input.runKind} 失败`;
    appendRunFinishedEvent({
      sessionId: input.sessionId,
      runId,
      ownerId,
      finalState: "failed",
      reason
    });
    harnessRuntime.finishRun(runScope, "failed", {
      reason
    });
    throw error;
  }
}
async function executeBackgroundRun(input) {
  return executeScheduledRun({
    ...input,
    lane: "background",
    runSource: "system",
    execute: async ({ runScope }) => input.execute(runScope)
  });
}
const require$1 = createRequire(import.meta.url);
const diff = require$1("diff");
const { createTwoFilesPatch, parsePatch } = diff;
const execFileAsync$2 = promisify(execFile);
const EMPTY_TREE_HASH = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
const GIT_MAX_BUFFER = 10 * 1024 * 1024;
const IMAGE_EXTENSIONS = /* @__PURE__ */ new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "ico"]);
const TEXT_EXTENSIONS = /* @__PURE__ */ new Set([
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "json",
  "md",
  "txt",
  "yml",
  "yaml",
  "toml",
  "html",
  "css",
  "scss",
  "less",
  "py",
  "java",
  "go",
  "rs",
  "sh",
  "ps1",
  "xml",
  "csv",
  "env"
]);
const DIFF_SOURCES = ["unstaged", "staged", "all"];
async function runGit(args, cwd) {
  const result = await execFileAsync$2("git", args, {
    cwd,
    windowsHide: true,
    maxBuffer: GIT_MAX_BUFFER,
    encoding: "utf8"
  });
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? ""
  };
}
function createEmptySourceSnapshot() {
  return {
    files: [],
    totalFiles: 0,
    totalAdditions: 0,
    totalDeletions: 0
  };
}
function createEmptyBranchSummary() {
  return {
    branchName: null,
    isDetached: false,
    hasChanges: false
  };
}
function createEmptyOverview(generatedAt, isGitRepo) {
  return {
    isGitRepo,
    generatedAt,
    branch: createEmptyBranchSummary(),
    sources: {
      unstaged: createEmptySourceSnapshot(),
      staged: createEmptySourceSnapshot(),
      all: createEmptySourceSnapshot()
    }
  };
}
async function isGitRepository(workspacePath) {
  try {
    const result = await runGit(["rev-parse", "--is-inside-work-tree"], workspacePath);
    return result.stdout.trim() === "true";
  } catch {
    return false;
  }
}
function getGitErrorMessage(error, fallback) {
  if (!error || typeof error !== "object") {
    return fallback;
  }
  const candidate = error;
  const stderr = typeof candidate.stderr === "string" ? candidate.stderr.trim() : "";
  const stdout = typeof candidate.stdout === "string" ? candidate.stdout.trim() : "";
  if (stderr) return stderr;
  if (stdout) return stdout;
  if (typeof candidate.message === "string" && candidate.message.trim()) {
    return candidate.message.trim();
  }
  return fallback;
}
async function ensureGitRepository(workspacePath) {
  const repository = await isGitRepository(workspacePath);
  if (!repository) {
    throw new Error("当前 workspace 不是 Git 仓库。");
  }
}
async function assertBranchName(workspacePath, branchName) {
  const normalizedBranchName = branchName.trim();
  if (!normalizedBranchName) {
    throw new Error("分支名不能为空。");
  }
  try {
    await runGit(["check-ref-format", "--branch", normalizedBranchName], workspacePath);
  } catch (error) {
    throw new Error(getGitErrorMessage(error, "分支名不合法。"));
  }
  return normalizedBranchName;
}
async function resolveDiffBase(workspacePath) {
  try {
    await runGit(["rev-parse", "--verify", "HEAD"], workspacePath);
    return "HEAD";
  } catch {
    return EMPTY_TREE_HASH;
  }
}
function normalizeStatus(statusCode) {
  if (statusCode === "??") {
    return "untracked";
  }
  if (statusCode === "!!") {
    return null;
  }
  if (statusCode.includes("D")) {
    return "deleted";
  }
  return "modified";
}
function normalizePath(rawPath) {
  if (rawPath.includes(" -> ")) {
    return rawPath.split(" -> ").at(-1) ?? rawPath;
  }
  return rawPath;
}
function parseBranchTrackingCounts(summary) {
  const bracketStart = summary.indexOf("[");
  const bracketEnd = summary.indexOf("]", bracketStart + 1);
  if (bracketStart < 0 || bracketEnd <= bracketStart) {
    return {};
  }
  const trackingSummary = summary.slice(bracketStart + 1, bracketEnd);
  const aheadMatch = trackingSummary.match(/ahead\s+(\d+)/i);
  const behindMatch = trackingSummary.match(/behind\s+(\d+)/i);
  return {
    ahead: aheadMatch ? Number.parseInt(aheadMatch[1] ?? "0", 10) : void 0,
    behind: behindMatch ? Number.parseInt(behindMatch[1] ?? "0", 10) : void 0
  };
}
async function resolveDetachedHeadLabel(workspacePath) {
  try {
    const result = await runGit(["rev-parse", "--short", "HEAD"], workspacePath);
    const label = result.stdout.trim();
    return label || "HEAD";
  } catch {
    return "HEAD";
  }
}
async function resolveBranchSummary(branchLine, workspacePath) {
  if (!branchLine || !branchLine.startsWith("## ")) {
    return {
      branchName: null,
      isDetached: false
    };
  }
  const summary = branchLine.slice(3).trim();
  const trackingCounts = parseBranchTrackingCounts(summary);
  if (summary.startsWith("No commits yet on ")) {
    return {
      branchName: summary.slice("No commits yet on ".length).trim() || null,
      isDetached: false,
      ...trackingCounts
    };
  }
  if (summary.startsWith("HEAD")) {
    return {
      branchName: await resolveDetachedHeadLabel(workspacePath),
      isDetached: true,
      ...trackingCounts
    };
  }
  const branchName = summary.split("...")[0]?.trim() || null;
  return {
    branchName,
    isDetached: false,
    ...trackingCounts
  };
}
async function listStatusSnapshot(workspacePath) {
  const result = await runGit(
    ["status", "--porcelain=v1", "--branch", "--untracked-files=all"],
    workspacePath
  );
  const lines = result.stdout.split(/\r?\n/).map((line) => line.trimEnd()).filter(Boolean);
  const firstLine = lines[0];
  const statusLines = firstLine?.startsWith("## ") ? lines.slice(1) : lines;
  const entries = statusLines.map((line) => {
    const statusCode = line.slice(0, 2);
    const fileStatus = normalizeStatus(statusCode);
    const filePath = normalizePath(line.slice(3));
    if (!fileStatus || !filePath) {
      return null;
    }
    return {
      path: filePath,
      indexStatus: statusCode[0] ?? " ",
      worktreeStatus: statusCode[1] ?? " ",
      status: fileStatus
    };
  }).filter((entry) => !!entry);
  const branch = await resolveBranchSummary(firstLine, workspacePath);
  return {
    branch: {
      ...branch,
      hasChanges: entries.length > 0
    },
    entries
  };
}
function isEntryInSource(entry, source) {
  if (source === "staged") {
    return entry.status !== "untracked" && entry.indexStatus !== " " && entry.indexStatus !== "?";
  }
  if (source === "unstaged") {
    return entry.status === "untracked" || entry.worktreeStatus !== " " && entry.worktreeStatus !== "?";
  }
  return true;
}
function resolveSourceStatus(entry, source) {
  if (source === "staged") {
    return entry.indexStatus === "D" ? "deleted" : "modified";
  }
  if (source === "unstaged") {
    if (entry.status === "untracked") {
      return "untracked";
    }
    return entry.worktreeStatus === "D" ? "deleted" : "modified";
  }
  return entry.status;
}
function getExtension(filePath) {
  return path.extname(filePath).replace(/^\./, "").toLowerCase();
}
function resolveFileKind(filePath, patch) {
  const extension = getExtension(filePath);
  if (IMAGE_EXTENSIONS.has(extension)) {
    return "image";
  }
  if (patch.includes("Binary files")) {
    return "binary";
  }
  if (TEXT_EXTENSIONS.has(extension)) {
    return "text";
  }
  return "binary";
}
function resolvePreviewPath(workspacePath, filePath, kind) {
  if (kind !== "image") {
    return void 0;
  }
  const absolutePath = path.resolve(workspacePath, filePath);
  return existsSync(absolutePath) ? absolutePath : void 0;
}
function createUntrackedPatch(workspacePath, filePath) {
  const absolutePath = path.resolve(workspacePath, filePath);
  if (!existsSync(absolutePath)) {
    return `diff --git a/${filePath} b/${filePath}
new file mode 100644
`;
  }
  const buffer = readFileSync(absolutePath);
  if (buffer.includes(0)) {
    return [
      `diff --git a/${filePath} b/${filePath}`,
      "new file mode 100644",
      `Binary files /dev/null and b/${filePath} differ`
    ].join("\n");
  }
  const content = buffer.toString("utf8");
  return createTwoFilesPatch(
    filePath,
    filePath,
    "",
    content,
    "0000000",
    "working-tree",
    { context: 3 }
  );
}
async function createTrackedPatch(workspacePath, filePath, baseRef, source) {
  try {
    const sourceArgs = source === "staged" ? ["diff", "--cached", "--no-ext-diff", "--unified=3", "--relative", baseRef] : source === "all" ? ["diff", "--no-ext-diff", "--unified=3", "--relative", baseRef] : ["diff", "--no-ext-diff", "--unified=3", "--relative"];
    const result = await runGit(
      [...sourceArgs, "--", filePath],
      workspacePath
    );
    return result.stdout;
  } catch {
    return "";
  }
}
function countPatchStats(patch) {
  const parsed = parsePatch(patch);
  let additions = 0;
  let deletions = 0;
  for (const filePatch of parsed) {
    for (const hunk of filePatch.hunks) {
      for (const line of hunk.lines) {
        if (line.startsWith("+")) {
          additions += 1;
        } else if (line.startsWith("-")) {
          deletions += 1;
        }
      }
    }
  }
  return { additions, deletions };
}
async function buildDiffFile(workspacePath, baseRef, source, entry) {
  const status = resolveSourceStatus(entry, source);
  const patch = status === "untracked" ? createUntrackedPatch(workspacePath, entry.path) : await createTrackedPatch(workspacePath, entry.path, baseRef, source);
  const kind = resolveFileKind(entry.path, patch);
  const { additions, deletions } = countPatchStats(patch);
  return {
    path: entry.path,
    status,
    patch,
    kind,
    additions,
    deletions,
    previewPath: resolvePreviewPath(workspacePath, entry.path, kind)
  };
}
function createSourceSnapshot(files) {
  return {
    files,
    totalFiles: files.length,
    totalAdditions: files.reduce((sum, file) => sum + file.additions, 0),
    totalDeletions: files.reduce((sum, file) => sum + file.deletions, 0)
  };
}
async function buildSourceSnapshot(workspacePath, baseRef, source, entries) {
  const sourceEntries = entries.filter((entry) => isEntryInSource(entry, source)).sort((left, right) => left.path.localeCompare(right.path, "en"));
  if (sourceEntries.length === 0) {
    return createEmptySourceSnapshot();
  }
  const files = await Promise.all(
    sourceEntries.map((entry) => buildDiffFile(workspacePath, baseRef, source, entry))
  );
  return createSourceSnapshot(files);
}
async function getGitDiffSnapshot(workspacePath) {
  const generatedAt = Date.now();
  const repository = await isGitRepository(workspacePath);
  if (!repository) {
    return createEmptyOverview(generatedAt, false);
  }
  const baseRef = await resolveDiffBase(workspacePath);
  const statusSnapshot = await listStatusSnapshot(workspacePath);
  const sourceSnapshots = await Promise.all(
    DIFF_SOURCES.map(async (source) => [
      source,
      await buildSourceSnapshot(workspacePath, baseRef, source, statusSnapshot.entries)
    ])
  );
  return {
    isGitRepo: true,
    generatedAt,
    branch: statusSnapshot.branch,
    sources: Object.fromEntries(sourceSnapshots)
  };
}
async function getGitBranchSummary(workspacePath) {
  const repository = await isGitRepository(workspacePath);
  if (!repository) {
    return createEmptyBranchSummary();
  }
  try {
    const result = await runGit(["symbolic-ref", "--short", "-q", "HEAD"], workspacePath);
    const branchName = result.stdout.trim();
    if (branchName) {
      return {
        branchName,
        isDetached: false,
        hasChanges: false
      };
    }
  } catch {
  }
  return {
    branchName: await resolveDetachedHeadLabel(workspacePath),
    isDetached: true,
    hasChanges: false
  };
}
async function listGitBranches(workspacePath) {
  await ensureGitRepository(workspacePath);
  try {
    const result = await runGit(
      [
        "for-each-ref",
        "--format=%(refname:short)%00%(if)%(HEAD)%(then)1%(else)0%(end)",
        "refs/heads"
      ],
      workspacePath
    );
    return result.stdout.split(/\r?\n/).filter(Boolean).map((line) => {
      const [name, isCurrentFlag] = line.split("\0");
      return {
        name: name?.trim() ?? "",
        isCurrent: isCurrentFlag === "1"
      };
    }).filter((branch) => branch.name.length > 0).sort((left, right) => {
      if (left.isCurrent !== right.isCurrent) {
        return left.isCurrent ? -1 : 1;
      }
      return left.name.localeCompare(right.name, "en");
    });
  } catch (error) {
    throw new Error(getGitErrorMessage(error, "读取本地分支失败。"));
  }
}
async function switchGitBranch(workspacePath, branchName) {
  await ensureGitRepository(workspacePath);
  const normalizedBranchName = await assertBranchName(workspacePath, branchName);
  try {
    await runGit(["switch", "--quiet", normalizedBranchName], workspacePath);
  } catch (error) {
    throw new Error(getGitErrorMessage(error, "切换分支失败。"));
  }
}
async function createAndSwitchGitBranch(workspacePath, branchName) {
  await ensureGitRepository(workspacePath);
  const normalizedBranchName = await assertBranchName(workspacePath, branchName);
  try {
    await runGit(["switch", "--quiet", "-c", normalizedBranchName], workspacePath);
  } catch (error) {
    throw new Error(getGitErrorMessage(error, "创建并切换分支失败。"));
  }
}
async function stageGitFiles(workspacePath, paths) {
  if (paths.length === 0) return;
  await runGit(["add", ...paths], workspacePath);
}
async function unstageGitFiles(workspacePath, paths) {
  if (paths.length === 0) return;
  await runGit(["reset", "HEAD", ...paths], workspacePath);
}
async function commitGitChanges(workspacePath, message) {
  await runGit(["commit", "-m", message], workspacePath);
}
async function pushGitChanges(workspacePath) {
  await runGit(["push"], workspacePath);
}
async function getLatestCommitSubject(workspacePath) {
  const repository = await isGitRepository(workspacePath);
  if (!repository) {
    return null;
  }
  try {
    const result = await runGit(["log", "-1", "--pretty=%s"], workspacePath);
    const subject = result.stdout.trim();
    return subject || null;
  } catch {
    return null;
  }
}
async function getDiffForFiles(workspacePath, filePaths) {
  if (filePaths.length === 0) return "";
  await resolveDiffBase(workspacePath);
  const parts = [];
  for (const filePath of filePaths) {
    let patch = "";
    try {
      const result = await runGit(
        ["diff", "--no-ext-diff", "--unified=3", "--relative", "--", filePath],
        workspacePath
      );
      patch = result.stdout;
    } catch {
    }
    if (!patch) {
      try {
        const result = await runGit(
          ["diff", "--cached", "--no-ext-diff", "--unified=3", "--relative", "--", filePath],
          workspacePath
        );
        patch = result.stdout;
      } catch {
      }
    }
    if (!patch) {
      patch = createUntrackedPatch(workspacePath, filePath);
    }
    if (patch) {
      parts.push(patch);
    }
  }
  return parts.join("\n");
}
const BUILTIN_PROVIDER_SOURCE_IDS = {
  anthropic: "builtin:anthropic",
  openai: "builtin:openai",
  google: "builtin:google"
};
const DEFAULT_MODEL_ENTRY_ID = "builtin:anthropic:claude-sonnet-4-20250514";
function createBuiltinEntryId(providerType, modelId) {
  return `builtin:${providerType}:${modelId}`;
}
function getRuntimeApiForProviderType(providerType) {
  switch (providerType) {
    case "anthropic":
      return "anthropic-messages";
    case "openai":
      return "openai-responses";
    case "google":
      return "google-generative-ai";
    case "openai-compatible":
      return "openai-completions";
  }
}
function createEmptyCapabilitiesOverride() {
  return {
    vision: null,
    imageOutput: null,
    toolCalling: null,
    reasoning: null,
    embedding: null
  };
}
function createEmptyLimitsOverride() {
  return {
    contextWindow: null,
    maxOutputTokens: null
  };
}
function getUnknownModelCapabilities() {
  return {
    vision: null,
    imageOutput: null,
    toolCalling: null,
    reasoning: null,
    embedding: null
  };
}
function getUnknownModelLimits() {
  return {
    contextWindow: null,
    maxOutputTokens: null
  };
}
function cloneDetectedCapabilities(capabilities) {
  return { ...capabilities };
}
function cloneDetectedLimits(limits) {
  return { ...limits };
}
function defineKnownModelMetadata(item) {
  return {
    ...item,
    aliases: item.aliases ? [...item.aliases] : void 0,
    detectedCapabilities: cloneDetectedCapabilities(item.detectedCapabilities),
    detectedLimits: cloneDetectedLimits(item.detectedLimits)
  };
}
function normalizeKnownModelId(modelId) {
  const trimmed = modelId.trim().toLowerCase();
  return trimmed.startsWith("models/") ? trimmed.slice("models/".length) : trimmed;
}
const KNOWN_MODEL_METADATA_CATALOG = [
  defineKnownModelMetadata({
    modelId: "gpt-5.2",
    name: "GPT-5.2",
    aliases: ["gpt-5.2-2025-12-11"],
    detectedCapabilities: {
      vision: true,
      imageOutput: false,
      toolCalling: true,
      reasoning: true,
      embedding: false
    },
    detectedLimits: {
      contextWindow: 4e5,
      maxOutputTokens: 128e3
    }
  }),
  defineKnownModelMetadata({
    modelId: "gpt-5-mini",
    name: "GPT-5 Mini",
    aliases: ["gpt-5-mini-2025-08-07"],
    detectedCapabilities: {
      vision: true,
      imageOutput: false,
      toolCalling: true,
      reasoning: true,
      embedding: false
    },
    detectedLimits: {
      contextWindow: 4e5,
      maxOutputTokens: 128e3
    }
  }),
  defineKnownModelMetadata({
    modelId: "gpt-4.1",
    name: "GPT-4.1",
    aliases: ["gpt-4.1-2025-04-14"],
    detectedCapabilities: {
      vision: true,
      imageOutput: false,
      toolCalling: true,
      reasoning: false,
      embedding: false
    },
    detectedLimits: {
      contextWindow: 1047576,
      maxOutputTokens: 32768
    }
  }),
  defineKnownModelMetadata({
    modelId: "gpt-4.1-mini",
    name: "GPT-4.1 Mini",
    aliases: ["gpt-4.1-mini-2025-04-14"],
    detectedCapabilities: {
      vision: true,
      imageOutput: false,
      toolCalling: true,
      reasoning: false,
      embedding: false
    },
    detectedLimits: {
      contextWindow: 1047576,
      maxOutputTokens: 32768
    }
  }),
  defineKnownModelMetadata({
    modelId: "gpt-4o",
    name: "GPT-4o",
    aliases: ["gpt-4o-2024-11-20"],
    detectedCapabilities: {
      vision: true,
      imageOutput: false,
      toolCalling: true,
      reasoning: true,
      embedding: false
    },
    detectedLimits: {
      contextWindow: 128e3,
      maxOutputTokens: 16384
    }
  }),
  defineKnownModelMetadata({
    modelId: "gpt-4o-mini",
    name: "GPT-4o Mini",
    aliases: ["gpt-4o-mini-2024-07-18"],
    detectedCapabilities: {
      vision: true,
      imageOutput: false,
      toolCalling: true,
      reasoning: true,
      embedding: false
    },
    detectedLimits: {
      contextWindow: 128e3,
      maxOutputTokens: 16384
    }
  }),
  defineKnownModelMetadata({
    modelId: "o4-mini",
    name: "o4-mini",
    aliases: ["o4-mini-2025-04-16"],
    detectedCapabilities: {
      vision: true,
      imageOutput: false,
      toolCalling: true,
      reasoning: true,
      embedding: false
    },
    detectedLimits: {
      contextWindow: 2e5,
      maxOutputTokens: 1e5
    }
  }),
  defineKnownModelMetadata({
    modelId: "claude-opus-4-1-20250805",
    name: "Claude Opus 4.1",
    aliases: ["claude-opus-4-1"],
    detectedCapabilities: {
      vision: true,
      imageOutput: false,
      toolCalling: true,
      reasoning: true,
      embedding: false
    },
    detectedLimits: {
      contextWindow: 2e5,
      maxOutputTokens: 32e3
    }
  }),
  defineKnownModelMetadata({
    modelId: "claude-opus-4-20250514",
    name: "Claude Opus 4",
    aliases: ["claude-opus-4-0"],
    detectedCapabilities: {
      vision: true,
      imageOutput: false,
      toolCalling: true,
      reasoning: true,
      embedding: false
    },
    detectedLimits: {
      contextWindow: 2e5,
      maxOutputTokens: 32e3
    }
  }),
  defineKnownModelMetadata({
    modelId: "claude-sonnet-4-20250514",
    name: "Claude Sonnet 4",
    aliases: ["claude-sonnet-4-0"],
    detectedCapabilities: {
      vision: true,
      imageOutput: false,
      toolCalling: true,
      reasoning: true,
      embedding: false
    },
    detectedLimits: {
      contextWindow: 2e5,
      maxOutputTokens: 64e3
    }
  }),
  defineKnownModelMetadata({
    modelId: "claude-3-7-sonnet-20250219",
    name: "Claude 3.7 Sonnet",
    aliases: ["claude-3-7-sonnet-latest"],
    detectedCapabilities: {
      vision: true,
      imageOutput: false,
      toolCalling: true,
      reasoning: true,
      embedding: false
    },
    detectedLimits: {
      contextWindow: 2e5,
      maxOutputTokens: 64e3
    }
  }),
  defineKnownModelMetadata({
    modelId: "claude-haiku-3-5-20241022",
    name: "Claude Haiku 3.5",
    aliases: ["claude-3-5-haiku-latest"],
    detectedCapabilities: {
      vision: true,
      imageOutput: false,
      toolCalling: true,
      reasoning: false,
      embedding: false
    },
    detectedLimits: {
      contextWindow: 2e5,
      maxOutputTokens: 8192
    }
  }),
  defineKnownModelMetadata({
    modelId: "gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    aliases: ["gemini-2.5-pro-preview-06-05"],
    detectedCapabilities: {
      vision: true,
      imageOutput: false,
      toolCalling: true,
      reasoning: true,
      embedding: false
    },
    detectedLimits: {
      contextWindow: 1048576,
      maxOutputTokens: 65536
    }
  }),
  defineKnownModelMetadata({
    modelId: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    aliases: ["gemini-2.5-flash-preview-09-2025"],
    detectedCapabilities: {
      vision: true,
      imageOutput: false,
      toolCalling: true,
      reasoning: true,
      embedding: false
    },
    detectedLimits: {
      contextWindow: 1048576,
      maxOutputTokens: 65536
    }
  }),
  defineKnownModelMetadata({
    modelId: "gemini-2.0-flash",
    name: "Gemini 2.0 Flash",
    aliases: ["gemini-2.0-flash-001"],
    detectedCapabilities: {
      vision: true,
      imageOutput: false,
      toolCalling: true,
      reasoning: true,
      embedding: false
    },
    detectedLimits: {
      contextWindow: 1048576,
      maxOutputTokens: 8192
    }
  }),
  defineKnownModelMetadata({
    modelId: "kimi-k2.5",
    name: "Kimi K2.5",
    detectedCapabilities: {
      vision: true,
      imageOutput: false,
      toolCalling: true,
      reasoning: true,
      embedding: false
    },
    detectedLimits: {
      contextWindow: 256e3,
      maxOutputTokens: null
    }
  }),
  defineKnownModelMetadata({
    modelId: "kimi-k2-thinking",
    name: "Kimi K2 Thinking",
    aliases: ["kimi-k2-thinking-turbo"],
    detectedCapabilities: {
      vision: false,
      imageOutput: false,
      toolCalling: true,
      reasoning: true,
      embedding: false
    },
    detectedLimits: {
      contextWindow: 256e3,
      maxOutputTokens: null
    }
  }),
  defineKnownModelMetadata({
    modelId: "kimi-k2",
    name: "Kimi K2",
    aliases: ["kimi-k2-0905-preview", "kimi-k2-turbo-preview"],
    detectedCapabilities: {
      vision: false,
      imageOutput: false,
      toolCalling: true,
      reasoning: false,
      embedding: false
    },
    detectedLimits: {
      contextWindow: 256e3,
      maxOutputTokens: null
    }
  }),
  defineKnownModelMetadata({
    modelId: "deepseek-chat",
    name: "DeepSeek Chat",
    detectedCapabilities: {
      vision: false,
      imageOutput: false,
      toolCalling: true,
      reasoning: false,
      embedding: false
    },
    detectedLimits: {
      contextWindow: 128e3,
      maxOutputTokens: 8192
    }
  }),
  defineKnownModelMetadata({
    modelId: "deepseek-reasoner",
    name: "DeepSeek Reasoner",
    detectedCapabilities: {
      vision: false,
      imageOutput: false,
      toolCalling: true,
      reasoning: true,
      embedding: false
    },
    detectedLimits: {
      contextWindow: 128e3,
      maxOutputTokens: 64e3
    }
  }),
  defineKnownModelMetadata({
    modelId: "qwen3-max",
    name: "Qwen3 Max",
    aliases: ["qwen3-max-2025-09-23"],
    detectedCapabilities: {
      vision: false,
      imageOutput: false,
      toolCalling: true,
      reasoning: true,
      embedding: false
    },
    detectedLimits: {
      contextWindow: 262144,
      maxOutputTokens: 65536
    }
  }),
  defineKnownModelMetadata({
    modelId: "qwen3.5-plus",
    name: "Qwen3.5 Plus",
    aliases: ["qwen3.5-plus-2026-02-15"],
    detectedCapabilities: {
      vision: true,
      imageOutput: false,
      toolCalling: true,
      reasoning: true,
      embedding: false
    },
    detectedLimits: {
      contextWindow: 1e6,
      maxOutputTokens: 65536
    }
  }),
  defineKnownModelMetadata({
    modelId: "qwen3.5-flash",
    name: "Qwen3.5 Flash",
    aliases: ["qwen3.5-flash-2026-02-23"],
    detectedCapabilities: {
      vision: true,
      imageOutput: false,
      toolCalling: true,
      reasoning: true,
      embedding: false
    },
    detectedLimits: {
      contextWindow: 1e6,
      maxOutputTokens: 65536
    }
  }),
  defineKnownModelMetadata({
    modelId: "qwen-plus",
    name: "Qwen Plus",
    aliases: ["qwen-plus-2025-12-01"],
    detectedCapabilities: {
      vision: false,
      imageOutput: false,
      toolCalling: true,
      reasoning: true,
      embedding: false
    },
    detectedLimits: {
      contextWindow: 995904,
      maxOutputTokens: 32768
    }
  }),
  defineKnownModelMetadata({
    modelId: "qwen-flash",
    name: "Qwen Flash",
    aliases: ["qwen-flash-2025-07-28"],
    detectedCapabilities: {
      vision: false,
      imageOutput: false,
      toolCalling: true,
      reasoning: true,
      embedding: false
    },
    detectedLimits: {
      contextWindow: 995904,
      maxOutputTokens: 32768
    }
  }),
  defineKnownModelMetadata({
    modelId: "glm-5",
    name: "GLM-5",
    detectedCapabilities: {
      vision: false,
      imageOutput: false,
      toolCalling: true,
      reasoning: true,
      embedding: false
    },
    detectedLimits: {
      contextWindow: 2e5,
      maxOutputTokens: 128e3
    }
  }),
  defineKnownModelMetadata({
    modelId: "glm-4.7",
    name: "GLM-4.7",
    detectedCapabilities: {
      vision: false,
      imageOutput: false,
      toolCalling: true,
      reasoning: true,
      embedding: false
    },
    detectedLimits: {
      contextWindow: 2e5,
      maxOutputTokens: 128e3
    }
  }),
  defineKnownModelMetadata({
    modelId: "glm-4.6",
    name: "GLM-4.6",
    detectedCapabilities: {
      vision: false,
      imageOutput: false,
      toolCalling: true,
      reasoning: true,
      embedding: false
    },
    detectedLimits: {
      contextWindow: 2e5,
      maxOutputTokens: 128e3
    }
  }),
  defineKnownModelMetadata({
    modelId: "glm-4.5-air",
    name: "GLM-4.5 Air",
    detectedCapabilities: {
      vision: false,
      imageOutput: false,
      toolCalling: true,
      reasoning: true,
      embedding: false
    },
    detectedLimits: {
      contextWindow: 128e3,
      maxOutputTokens: 96e3
    }
  }),
  defineKnownModelMetadata({
    modelId: "glm-5v-turbo",
    name: "GLM-5V Turbo",
    aliases: ["glm-5v"],
    detectedCapabilities: {
      vision: true,
      imageOutput: false,
      toolCalling: true,
      reasoning: true,
      embedding: false
    },
    detectedLimits: {
      contextWindow: 2e5,
      maxOutputTokens: 128e3
    }
  })
];
const KNOWN_MODEL_METADATA_BY_ID = /* @__PURE__ */ new Map();
for (const metadata of KNOWN_MODEL_METADATA_CATALOG) {
  KNOWN_MODEL_METADATA_BY_ID.set(normalizeKnownModelId(metadata.modelId), metadata);
  for (const alias of metadata.aliases ?? []) {
    KNOWN_MODEL_METADATA_BY_ID.set(normalizeKnownModelId(alias), metadata);
  }
}
const KNOWN_MODEL_PREFIX_ALIASES = [
  { prefix: "gpt-5.2-", targetModelId: "gpt-5.2" },
  { prefix: "gpt-5-mini-", targetModelId: "gpt-5-mini" },
  { prefix: "gpt-4.1-", targetModelId: "gpt-4.1" },
  { prefix: "gpt-4.1-mini-", targetModelId: "gpt-4.1-mini" },
  { prefix: "gpt-4o-", targetModelId: "gpt-4o" },
  { prefix: "gpt-4o-mini-", targetModelId: "gpt-4o-mini" },
  { prefix: "o4-mini-", targetModelId: "o4-mini" },
  { prefix: "gemini-2.5-pro-preview", targetModelId: "gemini-2.5-pro" },
  { prefix: "gemini-2.5-flash-preview", targetModelId: "gemini-2.5-flash" },
  { prefix: "gemini-2.0-flash-", targetModelId: "gemini-2.0-flash" },
  { prefix: "qwen3-max-", targetModelId: "qwen3-max" },
  { prefix: "qwen3.5-plus-", targetModelId: "qwen3.5-plus" },
  { prefix: "qwen3.5-flash-", targetModelId: "qwen3.5-flash" },
  { prefix: "qwen-plus-", targetModelId: "qwen-plus" },
  { prefix: "qwen-flash-", targetModelId: "qwen-flash" }
];
function findKnownModelMetadata(modelId) {
  const normalizedModelId = normalizeKnownModelId(modelId);
  if (!normalizedModelId) {
    return null;
  }
  const directMatch = KNOWN_MODEL_METADATA_BY_ID.get(normalizedModelId);
  if (directMatch) {
    return defineKnownModelMetadata(directMatch);
  }
  const prefixMatch = KNOWN_MODEL_PREFIX_ALIASES.find(
    ({ prefix }) => normalizedModelId.startsWith(prefix)
  );
  if (!prefixMatch) {
    return null;
  }
  const matchedMetadata = KNOWN_MODEL_METADATA_BY_ID.get(prefixMatch.targetModelId);
  return matchedMetadata ? defineKnownModelMetadata(matchedMetadata) : null;
}
const BUILTIN_SOURCES = [
  {
    id: BUILTIN_PROVIDER_SOURCE_IDS.anthropic,
    name: "Anthropic",
    kind: "builtin",
    providerType: "anthropic",
    mode: "native",
    enabled: true,
    baseUrl: null
  },
  {
    id: BUILTIN_PROVIDER_SOURCE_IDS.openai,
    name: "OpenAI",
    kind: "builtin",
    providerType: "openai",
    mode: "native",
    enabled: true,
    baseUrl: null
  },
  {
    id: BUILTIN_PROVIDER_SOURCE_IDS.google,
    name: "Google",
    kind: "builtin",
    providerType: "google",
    mode: "native",
    enabled: true,
    baseUrl: null
  }
];
function requireKnownModelMetadata(modelId) {
  const metadata = findKnownModelMetadata(modelId);
  if (!metadata) {
    throw new Error(`Known model metadata is missing for ${modelId}.`);
  }
  return metadata;
}
const CURATED_MODEL_CATALOG = [
  {
    id: createBuiltinEntryId("anthropic", "claude-sonnet-4-20250514"),
    sourceId: BUILTIN_PROVIDER_SOURCE_IDS.anthropic,
    providerType: "anthropic",
    name: "Claude Sonnet 4",
    modelId: "claude-sonnet-4-20250514",
    detectedCapabilities: requireKnownModelMetadata("claude-sonnet-4-20250514").detectedCapabilities,
    detectedLimits: requireKnownModelMetadata("claude-sonnet-4-20250514").detectedLimits
  },
  {
    id: createBuiltinEntryId("anthropic", "claude-opus-4-20250514"),
    sourceId: BUILTIN_PROVIDER_SOURCE_IDS.anthropic,
    providerType: "anthropic",
    name: "Claude Opus 4",
    modelId: "claude-opus-4-20250514",
    detectedCapabilities: requireKnownModelMetadata("claude-opus-4-20250514").detectedCapabilities,
    detectedLimits: requireKnownModelMetadata("claude-opus-4-20250514").detectedLimits
  },
  {
    id: createBuiltinEntryId("anthropic", "claude-haiku-3-5-20241022"),
    sourceId: BUILTIN_PROVIDER_SOURCE_IDS.anthropic,
    providerType: "anthropic",
    name: "Claude Haiku 3.5",
    modelId: "claude-haiku-3-5-20241022",
    detectedCapabilities: requireKnownModelMetadata("claude-haiku-3-5-20241022").detectedCapabilities,
    detectedLimits: requireKnownModelMetadata("claude-haiku-3-5-20241022").detectedLimits
  },
  {
    id: createBuiltinEntryId("openai", "gpt-4o"),
    sourceId: BUILTIN_PROVIDER_SOURCE_IDS.openai,
    providerType: "openai",
    name: "GPT-4o",
    modelId: "gpt-4o",
    detectedCapabilities: requireKnownModelMetadata("gpt-4o").detectedCapabilities,
    detectedLimits: requireKnownModelMetadata("gpt-4o").detectedLimits
  },
  {
    id: createBuiltinEntryId("openai", "gpt-4o-mini"),
    sourceId: BUILTIN_PROVIDER_SOURCE_IDS.openai,
    providerType: "openai",
    name: "GPT-4o Mini",
    modelId: "gpt-4o-mini",
    detectedCapabilities: requireKnownModelMetadata("gpt-4o-mini").detectedCapabilities,
    detectedLimits: requireKnownModelMetadata("gpt-4o-mini").detectedLimits
  },
  {
    id: createBuiltinEntryId("google", "gemini-2.0-flash"),
    sourceId: BUILTIN_PROVIDER_SOURCE_IDS.google,
    providerType: "google",
    name: "Gemini 2.0 Flash",
    modelId: "gemini-2.0-flash",
    detectedCapabilities: requireKnownModelMetadata("gemini-2.0-flash").detectedCapabilities,
    detectedLimits: requireKnownModelMetadata("gemini-2.0-flash").detectedLimits
  }
];
function createCuratedEntry(catalogItem) {
  return {
    id: catalogItem.id,
    sourceId: catalogItem.sourceId,
    name: catalogItem.name,
    modelId: catalogItem.modelId,
    enabled: true,
    builtin: true,
    capabilities: createEmptyCapabilitiesOverride(),
    limits: createEmptyLimitsOverride(),
    providerOptions: null,
    detectedCapabilities: catalogItem.detectedCapabilities,
    detectedLimits: catalogItem.detectedLimits
  };
}
const SYSTEM_TIME_ZONE = "system";
const TIME_ZONE_FALLBACK = "UTC";
function asDate(value) {
  return value instanceof Date ? value : new Date(value);
}
function getSystemTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || TIME_ZONE_FALLBACK;
}
function isValidTimeZone(value) {
  if (typeof value !== "string" || !value.trim()) {
    return false;
  }
  try {
    new Intl.DateTimeFormat("zh-CN", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}
function normalizeTimeZoneSetting(value) {
  if (value === SYSTEM_TIME_ZONE || value == null || value === "") {
    return SYSTEM_TIME_ZONE;
  }
  return isValidTimeZone(value) ? value : SYSTEM_TIME_ZONE;
}
function resolveConfiguredTimeZone(value) {
  const normalized = normalizeTimeZoneSetting(value);
  return normalized === SYSTEM_TIME_ZONE ? getSystemTimeZone() : normalized;
}
function formatDateTimeInTimeZone(value, timeZone, locale = "zh-CN") {
  return formatTimeInZone(value, timeZone, locale, {
    hour12: false
  });
}
function formatTimeInZone(value, timeZone, locale = "zh-CN", options = {}) {
  return asDate(value).toLocaleString(locale, {
    timeZone,
    ...options
  });
}
function getWeekdayLabelInTimeZone(value, timeZone, locale = "zh-CN") {
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    timeZone
  }).format(asDate(value));
}
function getDateKeyInTimeZone(value, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone
  }).formatToParts(asDate(value));
  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}
function getClockTimeInTimeZone(value, timeZone) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone
  }).formatToParts(asDate(value));
  const hour = parts.find((part) => part.type === "hour")?.value ?? "00";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
  return `${hour}:${minute}`;
}
const SETTINGS_FILE = "settings.json";
function getDefaultWorkspacePath() {
  try {
    const documentsPath = app.getPath("documents");
    if (documentsPath) {
      return documentsPath;
    }
  } catch {
  }
  try {
    const homePath = app.getPath("home");
    if (homePath) {
      return homePath;
    }
  } catch {
  }
  return process.cwd();
}
function createDefaultModelRouting() {
  return {
    chat: {
      modelId: DEFAULT_MODEL_ENTRY_ID
    },
    utility: {
      modelId: null
    },
    subagent: {
      modelId: null
    },
    compact: {
      modelId: null
    }
  };
}
const DEFAULT_SETTINGS = {
  modelRouting: createDefaultModelRouting(),
  defaultModelId: DEFAULT_MODEL_ENTRY_ID,
  workerModelId: null,
  thinkingLevel: "off",
  timeZone: SYSTEM_TIME_ZONE,
  theme: "light",
  customTheme: null,
  terminal: {
    shell: "default",
    fontSize: 13,
    fontFamily: "JetBrains Mono",
    scrollback: 5e3
  },
  ui: {
    fontFamily: '"Segoe UI Variable", "PingFang SC", "Microsoft YaHei UI", sans-serif',
    fontSize: 13,
    codeFontSize: 13,
    codeFontFamily: "JetBrains Mono"
  },
  workspace: getDefaultWorkspacePath()
};
function normalizeThinkingLevel(value) {
  switch (value) {
    case "off":
    case "low":
    case "medium":
    case "high":
    case "xhigh":
      return value;
    case "minimal":
      return "low";
    default:
      return DEFAULT_SETTINGS.thinkingLevel;
  }
}
function resolveLegacyDefaultModelId(legacy) {
  if (!legacy || typeof legacy !== "object") {
    return void 0;
  }
  const candidate = legacy;
  if (candidate.provider === "anthropic" || candidate.provider === "openai" || candidate.provider === "google") {
    if (typeof candidate.model === "string" && candidate.model.trim()) {
      return `builtin:${candidate.provider}:${candidate.model.trim()}`;
    }
  }
  return void 0;
}
function normalizeOptionalModelId(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function normalizeChatModelId(value) {
  return normalizeOptionalModelId(value) ?? DEFAULT_MODEL_ENTRY_ID;
}
function normalizeModelRouting(source, legacyDefaultModelId, legacyWorkerModelId) {
  return {
    chat: {
      modelId: normalizeChatModelId(
        source?.chat?.modelId ?? legacyDefaultModelId
      )
    },
    utility: {
      modelId: normalizeOptionalModelId(
        source?.utility?.modelId ?? legacyWorkerModelId
      )
    },
    subagent: {
      modelId: normalizeOptionalModelId(source?.subagent?.modelId)
    },
    compact: {
      modelId: normalizeOptionalModelId(source?.compact?.modelId)
    }
  };
}
function mergeModelRouting(current, partial) {
  if (!partial) {
    return current;
  }
  return {
    chat: {
      ...current.chat,
      ...partial.chat
    },
    utility: {
      ...current.utility,
      ...partial.utility
    },
    subagent: {
      ...current.subagent,
      ...partial.subagent
    },
    compact: {
      ...current.compact,
      ...partial.compact
    }
  };
}
function mergeSettings(source) {
  const sourceWithLegacy = source ?? {};
  const legacyDefaultModelId = normalizeOptionalModelId(sourceWithLegacy.defaultModelId) ?? resolveLegacyDefaultModelId(sourceWithLegacy.defaultModel) ?? DEFAULT_MODEL_ENTRY_ID;
  const legacyWorkerModelId = normalizeOptionalModelId(
    sourceWithLegacy.workerModelId
  );
  const modelRouting = normalizeModelRouting(
    sourceWithLegacy.modelRouting,
    legacyDefaultModelId,
    legacyWorkerModelId
  );
  return {
    ...DEFAULT_SETTINGS,
    ...source,
    workspace: typeof source?.workspace === "string" && source.workspace.trim() ? source.workspace : getDefaultWorkspacePath(),
    modelRouting,
    defaultModelId: modelRouting.chat.modelId,
    workerModelId: modelRouting.utility.modelId,
    thinkingLevel: normalizeThinkingLevel(sourceWithLegacy.thinkingLevel),
    timeZone: normalizeTimeZoneSetting(sourceWithLegacy.timeZone),
    terminal: {
      ...DEFAULT_SETTINGS.terminal,
      ...source?.terminal
    },
    ui: {
      ...DEFAULT_SETTINGS.ui,
      ...source?.ui
    }
  };
}
function getSettingsPath() {
  return path.join(app.getPath("userData"), SETTINGS_FILE);
}
let cachedSettings = null;
function getSettings() {
  if (cachedSettings) return cachedSettings;
  const filePath = getSettingsPath();
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(raw);
      cachedSettings = mergeSettings(parsed);
      return cachedSettings;
    }
  } catch {
  }
  cachedSettings = mergeSettings();
  return cachedSettings;
}
function updateSettings(partial) {
  const current = getSettings();
  cachedSettings = mergeSettings({
    ...current,
    ...partial,
    modelRouting: mergeModelRouting(current.modelRouting, partial.modelRouting),
    terminal: {
      ...current.terminal,
      ...partial.terminal
    },
    ui: {
      ...current.ui,
      ...partial.ui
    }
  });
  const serialized = {
    ...cachedSettings,
    defaultModelId: cachedSettings.modelRouting.chat.modelId,
    workerModelId: cachedSettings.modelRouting.utility.modelId
  };
  const filePath = getSettingsPath();
  const tmpPath = filePath + ".tmp";
  fs.writeFileSync(tmpPath, JSON.stringify(serialized, null, 2), "utf-8");
  fs.renameSync(tmpPath, filePath);
}
const SOURCES_FILE = "provider-sources.json";
const ENTRIES_FILE = "model-entries.json";
const CREDENTIALS_FILE = "credentials.json";
const LEGACY_BUILTIN_PROVIDERS = /* @__PURE__ */ new Set(["anthropic", "openai", "google"]);
const DEFAULT_CONTEXT_WINDOW = 128e3;
const DEFAULT_MAX_OUTPUT_TOKENS = 8192;
function getUserDataPath(fileName) {
  return path.join(app.getPath("userData"), fileName);
}
function readJsonFile$1(filePath, fallback) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    }
  } catch {
  }
  return fallback;
}
function writeJsonFile(filePath, data) {
  const tmpPath = filePath + ".tmp";
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tmpPath, filePath);
}
function normalizeBaseUrl(value) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
function normalizeCapabilityValue(value) {
  return typeof value === "boolean" ? value : null;
}
function normalizeCapabilitiesOverride(value) {
  return {
    vision: normalizeCapabilityValue(value?.vision),
    imageOutput: normalizeCapabilityValue(value?.imageOutput),
    toolCalling: normalizeCapabilityValue(value?.toolCalling),
    reasoning: normalizeCapabilityValue(value?.reasoning),
    embedding: normalizeCapabilityValue(value?.embedding)
  };
}
function normalizeLimitValue(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}
function normalizeLimitsOverride(value) {
  return {
    contextWindow: normalizeLimitValue(value?.contextWindow),
    maxOutputTokens: normalizeLimitValue(value?.maxOutputTokens)
  };
}
function normalizeProviderOptions(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return { ...value };
}
function maskKey(key) {
  if (key.length <= 8) return "••••••••";
  return key.slice(0, 6) + "••••" + key.slice(-4);
}
function sortSources(sources) {
  return [...sources].sort((left, right) => {
    if (left.kind !== right.kind) {
      return left.kind === "builtin" ? -1 : 1;
    }
    return left.name.localeCompare(right.name, "zh-CN");
  });
}
function sortEntries(entries, sources) {
  const sourceOrder = new Map(sortSources(sources).map((source, index) => [source.id, index]));
  return [...entries].sort((left, right) => {
    const leftOrder = sourceOrder.get(left.sourceId) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = sourceOrder.get(right.sourceId) ?? Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }
    if (left.builtin !== right.builtin) {
      return left.builtin ? -1 : 1;
    }
    return left.name.localeCompare(right.name, "zh-CN");
  });
}
function cloneSource(source) {
  return { ...source };
}
function cloneEntry(entry) {
  return {
    ...entry,
    capabilities: { ...entry.capabilities },
    limits: { ...entry.limits },
    providerOptions: entry.providerOptions ? { ...entry.providerOptions } : null,
    detectedCapabilities: { ...entry.detectedCapabilities },
    detectedLimits: { ...entry.detectedLimits }
  };
}
function normalizeDetectedCapabilities(value) {
  return {
    vision: normalizeCapabilityValue(value?.vision),
    imageOutput: normalizeCapabilityValue(value?.imageOutput),
    toolCalling: normalizeCapabilityValue(value?.toolCalling),
    reasoning: normalizeCapabilityValue(value?.reasoning),
    embedding: normalizeCapabilityValue(value?.embedding)
  };
}
function normalizeDetectedLimits(value) {
  return {
    contextWindow: normalizeLimitValue(value?.contextWindow),
    maxOutputTokens: normalizeLimitValue(value?.maxOutputTokens)
  };
}
function resolveKnownDetectedMetadata(modelId) {
  const metadata = findKnownModelMetadata(modelId);
  if (!metadata) {
    return null;
  }
  return {
    detectedCapabilities: metadata.detectedCapabilities,
    detectedLimits: metadata.detectedLimits
  };
}
function readProviderState() {
  const sourcesPath = getUserDataPath(SOURCES_FILE);
  const entriesPath = getUserDataPath(ENTRIES_FILE);
  const credentialsPath = getUserDataPath(CREDENTIALS_FILE);
  const persistedSources = readJsonFile$1(sourcesPath, []);
  const persistedEntries = readJsonFile$1(entriesPath, []);
  const rawCredentials = readJsonFile$1(credentialsPath, {});
  const credentials = {};
  const legacyBaseUrls = /* @__PURE__ */ new Map();
  for (const [key, value] of Object.entries(rawCredentials)) {
    if (!value || typeof value !== "object") continue;
    const apiKey = typeof value.apiKey === "string" ? value.apiKey.trim() : "";
    const baseUrl = normalizeBaseUrl(value.baseUrl);
    if (LEGACY_BUILTIN_PROVIDERS.has(key)) {
      const sourceId = `builtin:${key}`;
      if (!credentials[sourceId] && apiKey) {
        credentials[sourceId] = { apiKey };
      }
      if (baseUrl) {
        legacyBaseUrls.set(sourceId, baseUrl);
      }
      continue;
    }
    credentials[key] = apiKey ? { apiKey } : {};
  }
  const builtinSources = BUILTIN_SOURCES.map((builtin) => {
    const persisted = persistedSources.find((source) => source.id === builtin.id);
    const legacyBaseUrl = legacyBaseUrls.get(builtin.id);
    const persistedBaseUrl = normalizeBaseUrl(persisted?.baseUrl);
    const baseUrl = persistedBaseUrl ?? legacyBaseUrl ?? null;
    const mode = baseUrl ? "custom" : persisted?.mode === "custom" ? "custom" : "native";
    return {
      ...builtin,
      enabled: persisted?.enabled ?? builtin.enabled,
      mode,
      baseUrl
    };
  });
  const customSources = persistedSources.filter((source) => source.kind === "custom").map((source) => ({
    id: source.id,
    name: source.name?.trim() || "Custom Provider",
    kind: "custom",
    providerType: source.providerType === "anthropic" || source.providerType === "openai" || source.providerType === "google" || source.providerType === "openai-compatible" ? source.providerType : "openai-compatible",
    mode: "custom",
    enabled: source.enabled ?? true,
    baseUrl: normalizeBaseUrl(source.baseUrl)
  }));
  const sources = sortSources([...builtinSources, ...customSources]);
  const curatedEntries = CURATED_MODEL_CATALOG.map((catalogItem) => {
    const persisted = persistedEntries.find((entry) => entry.id === catalogItem.id);
    const base = createCuratedEntry(catalogItem);
    return {
      ...base,
      name: persisted?.name?.trim() || base.name,
      enabled: persisted?.enabled ?? base.enabled,
      capabilities: normalizeCapabilitiesOverride(persisted?.capabilities),
      limits: normalizeLimitsOverride(persisted?.limits),
      providerOptions: normalizeProviderOptions(persisted?.providerOptions),
      detectedCapabilities: catalogItem.detectedCapabilities,
      detectedLimits: catalogItem.detectedLimits
    };
  });
  const customSourceIds = new Set(customSources.map((source) => source.id));
  const customEntries = persistedEntries.filter((entry) => !entry.builtin && customSourceIds.has(entry.sourceId)).map((entry) => {
    const modelId = entry.modelId?.trim() || entry.id;
    const knownDetectedMetadata = resolveKnownDetectedMetadata(modelId);
    return {
      id: entry.id,
      sourceId: entry.sourceId,
      name: entry.name?.trim() || modelId,
      modelId,
      enabled: entry.enabled ?? true,
      builtin: false,
      capabilities: normalizeCapabilitiesOverride(entry.capabilities),
      limits: normalizeLimitsOverride(entry.limits),
      providerOptions: normalizeProviderOptions(entry.providerOptions),
      detectedCapabilities: knownDetectedMetadata?.detectedCapabilities ?? normalizeDetectedCapabilities(entry.detectedCapabilities),
      detectedLimits: knownDetectedMetadata?.detectedLimits ?? normalizeDetectedLimits(entry.detectedLimits)
    };
  });
  const entries = sortEntries([...curatedEntries, ...customEntries], sources);
  const nextState = {
    sources,
    entries,
    credentials
  };
  const needsRewrite = JSON.stringify(sortSources(persistedSources)) !== JSON.stringify(sources) || JSON.stringify(sortEntries(persistedEntries, sources)) !== JSON.stringify(entries) || JSON.stringify(rawCredentials) !== JSON.stringify(credentials);
  if (needsRewrite) {
    writeProviderState(nextState);
  }
  return nextState;
}
function writeProviderState(state2) {
  writeJsonFile(getUserDataPath(SOURCES_FILE), sortSources(state2.sources));
  writeJsonFile(
    getUserDataPath(ENTRIES_FILE),
    sortEntries(state2.entries, state2.sources)
  );
  writeJsonFile(getUserDataPath(CREDENTIALS_FILE), state2.credentials);
  try {
    fs.chmodSync(getUserDataPath(CREDENTIALS_FILE), 384);
  } catch {
  }
}
function requireSource(state2, sourceId) {
  const source = state2.sources.find((item) => item.id === sourceId);
  if (!source) {
    throw new Error("找不到对应的 provider source。");
  }
  return source;
}
function requireEntry(state2, entryId) {
  const entry = state2.entries.find((item) => item.id === entryId);
  if (!entry) {
    throw new Error("找不到对应的模型条目。");
  }
  return entry;
}
function getRoleDisplayLabel(role) {
  switch (role) {
    case "chat":
      return "聊天模型";
    case "utility":
      return "工具模型";
    case "subagent":
      return "Sub-agent 模型";
    case "compact":
      return "Compact 模型";
    default:
      return "模型";
  }
}
function getReferenceType(role) {
  switch (role) {
    case "chat":
      return "chat-model";
    case "utility":
      return "utility-model";
    case "subagent":
      return "subagent-model";
    case "compact":
      return "compact-model";
    default:
      return "chat-model";
  }
}
function getExplicitRoleModelIds(settings = getSettings()) {
  return [
    { role: "chat", modelId: settings.modelRouting.chat.modelId },
    { role: "utility", modelId: settings.modelRouting.utility.modelId ?? "" },
    { role: "subagent", modelId: settings.modelRouting.subagent.modelId ?? "" },
    { role: "compact", modelId: settings.modelRouting.compact.modelId ?? "" }
  ].filter(
    (item) => item.modelId.trim().length > 0
  );
}
function updateModelRoutingFallback(entryIdsToRemove, fallbackEntryId) {
  const settings = getSettings();
  const currentRouting = settings.modelRouting;
  const nextRouting = {
    chat: {
      modelId: entryIdsToRemove.has(currentRouting.chat.modelId) ? fallbackEntryId ?? currentRouting.chat.modelId : currentRouting.chat.modelId
    },
    utility: {
      modelId: currentRouting.utility.modelId && entryIdsToRemove.has(currentRouting.utility.modelId) ? fallbackEntryId : currentRouting.utility.modelId
    },
    subagent: {
      modelId: currentRouting.subagent.modelId && entryIdsToRemove.has(currentRouting.subagent.modelId) ? fallbackEntryId : currentRouting.subagent.modelId
    },
    compact: {
      modelId: currentRouting.compact.modelId && entryIdsToRemove.has(currentRouting.compact.modelId) ? fallbackEntryId : currentRouting.compact.modelId
    }
  };
  updateSettings({
    modelRouting: nextRouting
  });
}
function getModelUsage(entryId) {
  return getExplicitRoleModelIds().flatMap(
    ({ role, modelId }) => modelId === entryId ? [
      {
        scope: "settings",
        referenceType: getReferenceType(role),
        referenceId: entryId,
        message: `该模型条目正在被${getRoleDisplayLabel(role)}引用。`
      }
    ] : []
  );
}
function ensureEntryNotInUse(entryId) {
  const conflicts = getModelUsage(entryId);
  if (conflicts.length > 0) {
    throw new Error(conflicts[0]?.message ?? "模型条目仍被引用，无法修改。");
  }
}
function validateSourceDraft(draft, existing) {
  const kind = existing?.kind ?? "custom";
  const name = draft.name.trim();
  const enabled = draft.enabled ?? true;
  if (kind === "builtin") {
    const providerType = existing?.providerType;
    if (!providerType) {
      throw new Error("内置 provider 无法识别。");
    }
    const mode = draft.mode === "custom" ? "custom" : "native";
    const baseUrl2 = mode === "custom" ? normalizeBaseUrl(draft.baseUrl) : null;
    if (mode === "custom" && !baseUrl2) {
      throw new Error("内置 provider 切到自定义模式时必须填写 Base URL。");
    }
    return {
      id: existing.id,
      name: existing.name,
      kind: "builtin",
      providerType,
      mode,
      enabled,
      baseUrl: baseUrl2
    };
  }
  if (!name) {
    throw new Error("自定义 provider 名称不能为空。");
  }
  if (draft.providerType !== "anthropic" && draft.providerType !== "openai" && draft.providerType !== "google" && draft.providerType !== "openai-compatible") {
    throw new Error("请选择有效的 provider 类型。");
  }
  const baseUrl = normalizeBaseUrl(draft.baseUrl);
  if (!baseUrl) {
    throw new Error("自定义 provider 必须填写 Base URL。");
  }
  return {
    id: existing?.id ?? `custom:${crypto.randomUUID()}`,
    name,
    kind: "custom",
    providerType: draft.providerType,
    mode: "custom",
    enabled,
    baseUrl
  };
}
function validateEntryDraft(state2, draft, existing) {
  const source = requireSource(state2, draft.sourceId);
  const name = draft.name.trim();
  const modelId = draft.modelId.trim();
  if (!name) {
    throw new Error("模型名称不能为空。");
  }
  if (!modelId) {
    throw new Error("模型 ID 不能为空。");
  }
  if (modelId === "new-model-id") {
    throw new Error("请先填写真实的模型 ID，再保存模型条目。");
  }
  if (existing?.builtin) {
    return {
      ...existing,
      enabled: draft.enabled,
      capabilities: normalizeCapabilitiesOverride(draft.capabilities ?? existing.capabilities),
      limits: normalizeLimitsOverride(draft.limits ?? existing.limits),
      providerOptions: normalizeProviderOptions(
        draft.providerOptions ?? existing.providerOptions
      ),
      name: existing.name,
      modelId: existing.modelId,
      sourceId: existing.sourceId
    };
  }
  if (source.kind !== "custom") {
    throw new Error("当前 source 不允许新增自定义模型条目。");
  }
  const knownDetectedMetadata = resolveKnownDetectedMetadata(modelId);
  const shouldReuseExistingDetectedMetadata = !!existing && normalizeKnownModelId(existing.modelId) === normalizeKnownModelId(modelId);
  const detectedCapabilities = knownDetectedMetadata?.detectedCapabilities ?? (shouldReuseExistingDetectedMetadata ? normalizeDetectedCapabilities(existing?.detectedCapabilities) : getUnknownModelCapabilities());
  const detectedLimits = knownDetectedMetadata?.detectedLimits ?? (shouldReuseExistingDetectedMetadata ? normalizeDetectedLimits(existing?.detectedLimits) : getUnknownModelLimits());
  return {
    id: existing?.id ?? `entry:${crypto.randomUUID()}`,
    sourceId: source.id,
    name,
    modelId,
    enabled: draft.enabled,
    builtin: false,
    capabilities: normalizeCapabilitiesOverride(draft.capabilities),
    limits: normalizeLimitsOverride(draft.limits),
    providerOptions: normalizeProviderOptions(draft.providerOptions),
    detectedCapabilities,
    detectedLimits
  };
}
function resolveCapabilities(entry) {
  return {
    vision: entry.capabilities.vision ?? entry.detectedCapabilities.vision,
    imageOutput: entry.capabilities.imageOutput ?? entry.detectedCapabilities.imageOutput,
    toolCalling: entry.capabilities.toolCalling ?? entry.detectedCapabilities.toolCalling,
    reasoning: entry.capabilities.reasoning ?? entry.detectedCapabilities.reasoning,
    embedding: entry.capabilities.embedding ?? entry.detectedCapabilities.embedding
  };
}
function resolveLimits(entry) {
  return {
    contextWindow: entry.limits.contextWindow ?? entry.detectedLimits.contextWindow,
    maxOutputTokens: entry.limits.maxOutputTokens ?? entry.detectedLimits.maxOutputTokens
  };
}
function extractCompat(entry) {
  const compat = entry.providerOptions?.compat;
  if (!compat || typeof compat !== "object" || Array.isArray(compat)) {
    return void 0;
  }
  return compat;
}
function inferOpenAiCompatibleCompat(source) {
  if (source.providerType !== "openai-compatible") {
    return void 0;
  }
  const baseUrl = source.baseUrl?.trim().toLowerCase();
  if (!baseUrl) {
    return void 0;
  }
  if (baseUrl.includes("dashscope.aliyuncs.com")) {
    return {
      supportsStore: false,
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      maxTokensField: "max_tokens"
    };
  }
  return void 0;
}
function resolveCompat(source, entry) {
  const inferredCompat = inferOpenAiCompatibleCompat(source);
  const explicitCompat = extractCompat(entry);
  if (!inferredCompat && !explicitCompat) {
    return void 0;
  }
  return {
    ...inferredCompat ?? {},
    ...explicitCompat ?? {}
  };
}
function extractHeaders(entry) {
  const headers = entry.providerOptions?.headers;
  if (!headers || typeof headers !== "object" || Array.isArray(headers)) {
    return void 0;
  }
  const result = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === "string") {
      result[key] = value;
    }
  }
  return Object.keys(result).length > 0 ? result : void 0;
}
function buildCustomModel(source, entry) {
  const capabilities = resolveCapabilities(entry);
  const limits = resolveLimits(entry);
  return {
    id: entry.modelId,
    name: entry.name,
    api: getRuntimeApiForProviderType(source.providerType),
    provider: source.providerType,
    baseUrl: source.baseUrl ?? "",
    reasoning: capabilities.reasoning ?? false,
    input: capabilities.vision ? ["text", "image"] : ["text"],
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0
    },
    contextWindow: limits.contextWindow ?? DEFAULT_CONTEXT_WINDOW,
    maxTokens: limits.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
    headers: extractHeaders(entry),
    compat: source.providerType === "openai-compatible" ? resolveCompat(source, entry) : void 0
  };
}
function buildNativeModel(source, entry) {
  const baseModel = getModel(source.providerType, entry.modelId);
  if (!baseModel) {
    throw new Error(`找不到内置模型：${entry.modelId}`);
  }
  const limits = resolveLimits(entry);
  return {
    ...baseModel,
    name: entry.name,
    contextWindow: limits.contextWindow ?? baseModel.contextWindow,
    maxTokens: limits.maxOutputTokens ?? baseModel.maxTokens,
    headers: extractHeaders(entry) ?? baseModel.headers
  };
}
function listSources() {
  return readProviderState().sources.map(cloneSource);
}
function getSource(sourceId) {
  const source = readProviderState().sources.find((item) => item.id === sourceId);
  return source ? cloneSource(source) : null;
}
function saveSource(draft) {
  const state2 = readProviderState();
  const existing = draft.id ? state2.sources.find((item) => item.id === draft.id) : void 0;
  const normalized = validateSourceDraft(draft, existing);
  if (!normalized.enabled) {
    const referencedRoleEntry = getExplicitRoleModelIds().find(({ modelId }) => {
      const entry = state2.entries.find((candidate) => candidate.id === modelId);
      return entry?.sourceId === normalized.id;
    });
    if (referencedRoleEntry) {
      throw new Error(
        `当前${getRoleDisplayLabel(referencedRoleEntry.role)}正在使用这个 source，无法直接禁用。`
      );
    }
  }
  const nextSources = existing ? state2.sources.map(
    (source) => source.id === existing.id ? normalized : source
  ) : [...state2.sources, normalized];
  writeProviderState({
    ...state2,
    sources: sortSources(nextSources)
  });
  return cloneSource(normalized);
}
function deleteSource(sourceId) {
  const state2 = readProviderState();
  const source = requireSource(state2, sourceId);
  if (source.kind === "builtin") {
    throw new Error("内置 source 不能删除。");
  }
  const entriesToDelete = state2.entries.filter((entry) => entry.sourceId === sourceId);
  const nextSources = state2.sources.filter((item) => item.id !== sourceId);
  const nextEntries = state2.entries.filter((entry) => entry.sourceId !== sourceId);
  const entryIdsToDelete = new Set(entriesToDelete.map((entry) => entry.id));
  const needsChatFallback = entryIdsToDelete.has(getSettings().modelRouting.chat.modelId);
  const fallbackEntry = sortEntries(nextEntries, nextSources).find((entry) => {
    if (!entry.enabled) {
      return false;
    }
    return nextSources.some(
      (candidate) => candidate.id === entry.sourceId && candidate.enabled
    );
  });
  if (needsChatFallback && !fallbackEntry) {
    throw new Error("当前聊天模型也在这个提供商里，且没有其它可用模型可切换，无法删除。");
  }
  if (entryIdsToDelete.size > 0) {
    updateModelRoutingFallback(entryIdsToDelete, fallbackEntry?.id ?? null);
  }
  const nextCredentials = { ...state2.credentials };
  delete nextCredentials[sourceId];
  writeProviderState({
    sources: nextSources,
    entries: nextEntries,
    credentials: nextCredentials
  });
}
function getCredentials(sourceId) {
  const state2 = readProviderState();
  requireSource(state2, sourceId);
  const apiKey = state2.credentials[sourceId]?.apiKey?.trim();
  return {
    sourceId,
    masked: apiKey ? maskKey(apiKey) : "",
    hasKey: !!apiKey
  };
}
function setCredentials(sourceId, apiKey) {
  const state2 = readProviderState();
  requireSource(state2, sourceId);
  const trimmed = apiKey.trim();
  const nextCredentials = { ...state2.credentials };
  if (!trimmed) {
    delete nextCredentials[sourceId];
  } else {
    nextCredentials[sourceId] = { apiKey: trimmed };
  }
  writeProviderState({
    ...state2,
    credentials: nextCredentials
  });
}
async function testSource(draft) {
  let normalized;
  try {
    const state2 = readProviderState();
    const existing = draft.id ? state2.sources.find((item) => item.id === draft.id) : void 0;
    normalized = validateSourceDraft(draft, existing);
    const apiKey = normalized.id ? state2.credentials[normalized.id]?.apiKey : void 0;
    if (!apiKey) {
      return draft.id ? { success: false, error: "请先保存 API Key。" } : { success: true, models: [] };
    }
    const candidateEntry = state2.entries.find(
      (entry) => entry.sourceId === normalized.id && entry.enabled
    ) ?? (() => {
      const modelId = normalized.providerType === "anthropic" ? "claude-haiku-3-5-20241022" : normalized.providerType === "openai" ? "gpt-4o-mini" : normalized.providerType === "google" ? "gemini-2.0-flash" : "";
      const knownDetectedMetadata = resolveKnownDetectedMetadata(modelId);
      return {
        id: "probe",
        sourceId: normalized.id,
        name: "Probe Model",
        modelId,
        enabled: true,
        builtin: false,
        capabilities: createEmptyCapabilitiesOverride(),
        limits: createEmptyLimitsOverride(),
        providerOptions: null,
        detectedCapabilities: knownDetectedMetadata?.detectedCapabilities ?? getUnknownModelCapabilities(),
        detectedLimits: knownDetectedMetadata?.detectedLimits ?? getUnknownModelLimits()
      };
    })();
    if (!candidateEntry.modelId) {
      return { success: true, models: [] };
    }
    const model = normalized.kind === "builtin" && normalized.mode === "native" ? buildNativeModel(normalized, candidateEntry) : buildCustomModel(normalized, candidateEntry);
    await completeSimple(
      model,
      {
        systemPrompt: "",
        messages: [{ role: "user", content: "hi", timestamp: Date.now() }],
        tools: []
      },
      { apiKey, maxTokens: 1 }
    );
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "连接测试失败"
    };
  }
}
function listEntries() {
  return readProviderState().entries.map(cloneEntry);
}
function listEntriesBySource(sourceId) {
  const state2 = readProviderState();
  requireSource(state2, sourceId);
  return state2.entries.filter((entry) => entry.sourceId === sourceId).map(cloneEntry);
}
function getEntry(entryId) {
  const entry = readProviderState().entries.find((item) => item.id === entryId);
  return entry ? cloneEntry(entry) : null;
}
function saveEntry(draft) {
  const state2 = readProviderState();
  const existing = draft.id ? state2.entries.find((item) => item.id === draft.id) : void 0;
  const normalized = validateEntryDraft(state2, draft, existing);
  if (!normalized.enabled) {
    const conflict = getModelUsage(normalized.id)[0];
    if (conflict) {
      throw new Error(conflict.message);
    }
  }
  const nextEntries = existing ? state2.entries.map((entry) => entry.id === existing.id ? normalized : entry) : [...state2.entries, normalized];
  writeProviderState({
    ...state2,
    entries: sortEntries(nextEntries, state2.sources)
  });
  return cloneEntry(normalized);
}
function deleteEntry(entryId) {
  const state2 = readProviderState();
  const entry = requireEntry(state2, entryId);
  ensureEntryNotInUse(entry.id);
  if (entry.builtin) {
    throw new Error("内置 curated 模型条目不能删除，只能禁用。");
  }
  writeProviderState({
    ...state2,
    entries: state2.entries.filter((item) => item.id !== entryId)
  });
}
function resolveModelEntry(entryId) {
  const state2 = readProviderState();
  const entry = state2.entries.find((item) => item.id === entryId) ?? state2.entries.find((item) => item.id === DEFAULT_MODEL_ENTRY_ID);
  if (!entry) {
    throw new Error("没有可用的模型条目。");
  }
  const source = requireSource(state2, entry.sourceId);
  if (!source.enabled) {
    throw new Error(`当前 source「${source.name}」已被禁用。`);
  }
  if (!entry.enabled) {
    throw new Error(`当前模型条目「${entry.name}」已被禁用。`);
  }
  const apiKey = state2.credentials[source.id]?.apiKey?.trim();
  if (!apiKey) {
    throw new Error(`source「${source.name}」尚未配置 API Key。`);
  }
  const model = source.kind === "builtin" && source.mode === "native" ? buildNativeModel(source, entry) : buildCustomModel(source, entry);
  return {
    entry: cloneEntry(entry),
    source: cloneSource(source),
    apiKey,
    model,
    runtimeSignature: JSON.stringify({
      sourceId: source.id,
      sourceEnabled: source.enabled,
      providerType: source.providerType,
      mode: source.mode,
      baseUrl: source.baseUrl,
      entryId: entry.id,
      modelId: entry.modelId,
      entryEnabled: entry.enabled,
      capabilities: entry.capabilities,
      limits: entry.limits,
      providerOptions: entry.providerOptions,
      apiKey
    })
  };
}
const FALLBACK_MODEL_ENTRY_IDS = [
  DEFAULT_MODEL_ENTRY_ID,
  "builtin:anthropic:claude-sonnet-4-20250514"
];
function buildCandidateModelIds(role, preferredEntryId) {
  const settings = getSettings();
  const chatModelId = settings.modelRouting.chat.modelId;
  const roleModelId = role === "chat" ? chatModelId : settings.modelRouting[role].modelId;
  return [preferredEntryId, roleModelId, chatModelId, ...FALLBACK_MODEL_ENTRY_IDS].filter(
    (value, index, list) => typeof value === "string" && value.trim().length > 0 && list.findIndex((candidate) => candidate === value) === index
  );
}
function resolveModelForRole(role, preferredEntryId) {
  const candidates = buildCandidateModelIds(role, preferredEntryId);
  let lastError = null;
  for (const candidateId of candidates) {
    try {
      return resolveModelEntry(candidateId);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("没有可用的模型配置。");
}
function resolveRuntimeModel(preferredEntryId) {
  return resolveModelForRole("chat", preferredEntryId);
}
const PROTECTED_USER_TURNS$1 = 6;
const PROTECTED_MESSAGE_COUNT = PROTECTED_USER_TURNS$1 * 2;
const SUMMARY_LINE_LIMIT = 6;
const MAX_IMPORTANT_ITEMS = 8;
const MAX_AUTO_COMPACT_FAILURES = 3;
const compactingSessionIds = /* @__PURE__ */ new Set();
function getMessageEvents(events) {
  return events.filter(
    (event) => event.type === "user_message" || event.type === "assistant_message"
  );
}
function truncateText$2(text, maxLength = 120) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }
  return normalized.length <= maxLength ? normalized : normalized.slice(0, Math.max(12, maxLength - 1)).trimEnd() + "…";
}
function dedupeTake(items, limit) {
  const seen = /* @__PURE__ */ new Set();
  const result = [];
  for (const item of items) {
    const normalized = item.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
    if (result.length >= limit) {
      break;
    }
  }
  return result;
}
function mergePriorityArray(primary, fallback, limit) {
  return dedupeTake([...primary, ...fallback], limit);
}
function isPersistedAttachment(value) {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value;
  return typeof candidate.id === "string" && typeof candidate.name === "string" && typeof candidate.path === "string" && typeof candidate.kind === "string";
}
function extractMessageAttachments(message) {
  const attachments = message.meta?.attachments;
  if (!Array.isArray(attachments)) {
    return [];
  }
  return attachments.filter(isPersistedAttachment);
}
function looksLikePath(value, keyHint) {
  if (!value.trim()) {
    return false;
  }
  if (!keyHint || !/(^|_)(path|file|files|cwd|dir|directory|workspace)(_|$)/i.test(keyHint)) {
    return false;
  }
  return /^[a-zA-Z]:\\/.test(value) || value.includes("\\") || value.includes("/");
}
function collectPathsFromValue(value, result, keyHint) {
  if (typeof value === "string") {
    if (looksLikePath(value, keyHint)) {
      result.add(value.trim());
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectPathsFromValue(item, result, keyHint));
    return;
  }
  if (!value || typeof value !== "object") {
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    collectPathsFromValue(nested, result, key);
  }
}
function collectImportantFiles(events, untilSeq) {
  const result = /* @__PURE__ */ new Set();
  for (const event of events) {
    if (event.seq > untilSeq) {
      break;
    }
    if (event.type === "tool_started") {
      collectPathsFromValue(event.args, result);
    }
    if (event.type === "user_message") {
      extractMessageAttachments(event.message).forEach((attachment) => {
        result.add(attachment.path);
      });
    }
  }
  return [...result].slice(0, MAX_IMPORTANT_ITEMS);
}
function collectImportantAttachments(events) {
  const attachments = events.flatMap((event) => extractMessageAttachments(event.message));
  const unique = /* @__PURE__ */ new Map();
  for (const attachment of attachments) {
    if (!unique.has(attachment.id)) {
      unique.set(attachment.id, attachment);
    }
  }
  return [...unique.values()].slice(0, MAX_IMPORTANT_ITEMS);
}
function getMessageSnippets(message, maxLength = 100) {
  return message.content.split(/\r?\n+|(?<=[。！？；])/u).map((line) => truncateText$2(line, maxLength)).filter(Boolean);
}
function getLatestPendingConfirmation(events) {
  const latestRequested = [...events].reverse().find(
    (event) => event.type === "confirmation_requested"
  );
  if (!latestRequested) {
    return null;
  }
  const resolved = [...events].reverse().find(
    (event) => event.type === "confirmation_resolved" && event.requestId === latestRequested.requestId
  );
  return resolved ? null : latestRequested;
}
function getLatestUserEvent(events) {
  return [...events].reverse().find(
    (event) => event.type === "user_message"
  );
}
function getLatestAssistantEvent(events) {
  return [...events].reverse().find(
    (event) => event.type === "assistant_message"
  );
}
function getLatestToolFailure(events) {
  return [...events].reverse().find(
    (event) => event.type === "tool_finished" && typeof event.error === "string" && !!event.error.trim()
  );
}
function getLatestUnansweredUserEvent(events) {
  const latestUser = getLatestUserEvent(events);
  const latestAssistant = getLatestAssistantEvent(events);
  if (latestUser && (!latestAssistant || Date.parse(latestUser.timestamp) > Date.parse(latestAssistant.timestamp))) {
    return latestUser;
  }
  return null;
}
function collectDecisionHighlights(messages) {
  const decisionKeywords = /(决定|改成|采用|切到|保留|不做|默认|约束|方案|先|暂时|优先)/i;
  const lines = messages.flatMap((message) => getMessageSnippets(message, 92));
  const decisionLines = lines.filter((line) => decisionKeywords.test(line));
  if (decisionLines.length > 0) {
    return dedupeTake(decisionLines.reverse(), 4);
  }
  return dedupeTake(
    messages.slice(-2).flatMap((message) => getMessageSnippets(message, 92)).reverse(),
    3
  );
}
function collectProgressHighlights(events) {
  const assistantMessages = events.filter((event) => event.type === "assistant_message").map((event) => event.message);
  const assistantLines = assistantMessages.flatMap(
    (message) => getMessageSnippets(message, 96)
  );
  return dedupeTake(assistantLines.reverse(), 3);
}
function resolveCurrentTask(events) {
  const unansweredUser = getLatestUnansweredUserEvent(events);
  if (unansweredUser) {
    return truncateText$2(unansweredUser.message.content, 120);
  }
  const latestUser = getLatestUserEvent(events);
  return latestUser ? truncateText$2(latestUser.message.content, 120) : null;
}
function getLatestRunFinished(events) {
  return [...events].reverse().find(
    (event) => event.type === "run_finished"
  );
}
function getLatestRunStarted(events) {
  return [...events].reverse().find(
    (event) => event.type === "run_started"
  );
}
function resolveCurrentState(events) {
  const pendingConfirmation = getLatestPendingConfirmation(events);
  if (pendingConfirmation) {
    return "等待用户确认";
  }
  const latestToolFailure = getLatestToolFailure(events);
  if (latestToolFailure) {
    return `卡在 ${latestToolFailure.toolName} 错误`;
  }
  const unansweredUser = getLatestUnansweredUserEvent(events);
  if (unansweredUser) {
    return "等待继续处理最新用户请求";
  }
  const latestFinished = getLatestRunFinished(events);
  if (latestFinished?.finalState === "failed") {
    return "上次运行失败，等待恢复";
  }
  if (latestFinished?.finalState === "aborted") {
    return "上次运行已取消，等待下一步";
  }
  if (latestFinished?.finalState === "completed") {
    return "已有阶段性结果，可继续推进";
  }
  const meta = getSessionMeta(events[0]?.sessionId ?? "");
  return meta?.lastRunState ?? null;
}
function collectOpenLoops(events) {
  const loops = [];
  const latestToolFailure = getLatestToolFailure(events);
  const latestFinished = getLatestRunFinished(events);
  if (latestFinished?.finalState === "failed") {
    loops.push(
      latestFinished.reason ? `上次运行失败：${truncateText$2(latestFinished.reason, 80)}` : "上次运行失败，原因待排查。"
    );
  }
  if (latestToolFailure?.error) {
    loops.push(
      `${latestToolFailure.toolName} 执行失败：${truncateText$2(latestToolFailure.error, 80)}`
    );
  }
  const pendingConfirmation = getLatestPendingConfirmation(events);
  if (pendingConfirmation) {
    loops.push(`仍有待确认操作：${truncateText$2(pendingConfirmation.description, 80)}`);
  }
  const unansweredUser = getLatestUnansweredUserEvent(events);
  if (unansweredUser) {
    loops.push(`最近一条用户请求仍待收口：${truncateText$2(unansweredUser.message.content, 80)}`);
  }
  return dedupeTake(loops, 4);
}
function collectNextActions(events) {
  const actions = [];
  const pendingConfirmation = getLatestPendingConfirmation(events);
  const latestToolFailure = getLatestToolFailure(events);
  const latestUser = getLatestUserEvent(events);
  const latestAssistant = getLatestAssistantEvent(events);
  if (pendingConfirmation) {
    actions.push(`先处理确认：${truncateText$2(pendingConfirmation.title, 72)}`);
  }
  if (latestToolFailure) {
    actions.push(`先排查 ${latestToolFailure.toolName} 的失败原因并决定是否重试。`);
  }
  if (latestAssistant?.message.steps?.length) {
    const lastTool = [...latestAssistant.message.steps].reverse().find((step) => step.kind === "tool_call" && step.toolName);
    if (lastTool?.toolName) {
      actions.push(`继续围绕 ${lastTool.toolName} 对应结果推进收口。`);
    }
  }
  if (latestUser?.message.content.trim()) {
    actions.push(`优先响应最近用户目标：${truncateText$2(latestUser.message.content, 80)}`);
  }
  return dedupeTake(actions, 3);
}
function collectRisks(events) {
  const risks = [];
  const latestFinished = getLatestRunFinished(events);
  if (latestFinished?.reason === "app_restart_interrupted") {
    risks.push("应用重启打断过一次运行，需要人工确认线程现场是否完整。");
  }
  const latestConfirmation = [...events].reverse().find(
    (event) => event.type === "confirmation_resolved"
  );
  if (latestConfirmation && latestConfirmation.allowed === false) {
    risks.push("最近一次高风险操作被用户拒绝，后续执行路径可能需要改写。");
  }
  return dedupeTake(risks, 3);
}
function collectErrors(events) {
  const errors = [];
  for (const event of events) {
    if (event.type === "tool_finished" && event.error) {
      errors.push(`工具 ${event.toolName} 失败: ${truncateText$2(event.error, 80)}`);
    }
    if (event.type === "run_finished" && event.finalState === "failed" && event.reason) {
      errors.push(`运行失败: ${truncateText$2(event.reason, 80)}`);
    }
  }
  return dedupeTake(errors, 5);
}
function buildSummaryText(input) {
  const lines = [
    input.backgroundGoals.length > 0 ? `背景目标：${input.backgroundGoals.join("；")}` : "",
    input.progress.length > 0 ? `已做进展：${input.progress.join("；")}` : "",
    input.currentState ? `当前停点：${input.currentState}` : "",
    input.decisions.length > 0 ? `关键决策：${input.decisions.join("；")}` : "",
    input.importantFiles.length > 0 ? `关键文件：${input.importantFiles.map((file) => truncateText$2(file, 72)).join("，")}` : "",
    input.openLoops.length > 0 ? `未闭环：${input.openLoops.join("；")}` : "",
    input.nextActions.length > 0 ? `下一步：${input.nextActions.join("；")}` : "",
    input.risks.length > 0 ? `风险：${input.risks.join("；")}` : ""
  ].filter(Boolean);
  return lines.slice(0, SUMMARY_LINE_LIMIT).join("\n");
}
function buildCompactTranscriptExcerpt(events) {
  const head = events.slice(0, 4);
  const tail = events.slice(-16);
  const merged = [...head, ...tail].filter(
    (event, index, list) => list.findIndex((candidate) => candidate.message.id === event.message.id) === index
  );
  return merged.map((event) => {
    const roleLabel = event.type === "user_message" ? "user" : event.message.role === "assistant" ? "assistant" : event.message.role;
    return `- [${roleLabel}] ${truncateText$2(event.message.content, 220)}`;
  }).join("\n");
}
function extractTextBlocks(contents) {
  return contents.flatMap((content) => {
    if (content.type !== "text") {
      return [];
    }
    return [content.text];
  }).join("\n").trim();
}
function tryParseJsonObject(text) {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }
  const normalized = trimmed.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/, "").trim();
  const candidates = [normalized];
  const firstBrace = normalized.indexOf("{");
  const lastBrace = normalized.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(normalized.slice(firstBrace, lastBrace + 1));
  }
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
    }
  }
  return null;
}
function normalizeDraftString(value, maxLength) {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return null;
  }
  return truncateText$2(normalized, maxLength);
}
function normalizeDraftStringArray(value, limit, maxLength) {
  if (!Array.isArray(value)) {
    return [];
  }
  return dedupeTake(
    value.map((item) => normalizeDraftString(item, maxLength)).filter((item) => !!item),
    limit
  );
}
function normalizeSnapshotDraft(value) {
  const summary = normalizeDraftString(value.summary, 1200);
  if (!summary) {
    return null;
  }
  return {
    summary,
    currentTask: normalizeDraftString(value.currentTask, 120),
    currentState: normalizeDraftString(value.currentState, 120),
    decisions: normalizeDraftStringArray(value.decisions, 4, 120),
    openLoops: normalizeDraftStringArray(value.openLoops, 4, 120),
    nextActions: normalizeDraftStringArray(value.nextActions, 3, 120),
    risks: normalizeDraftStringArray(value.risks, 3, 120),
    errors: normalizeDraftStringArray(value.errors, 5, 120),
    learnings: normalizeDraftStringArray(value.learnings, 3, 120)
  };
}
async function buildSnapshotDraftWithModel(input) {
  const meta = getSessionMeta(input.sessionId);
  const preferredModelId = meta?.lastModelEntryId ?? getSettings().modelRouting.chat.modelId;
  try {
    const resolved = resolveRuntimeModel(preferredModelId);
    const response = await completeSimple(
      resolved.model,
      {
        systemPrompt: [
          "你是 session continuity compact summarizer。",
          "你的任务是把一段历史线程压缩成可续会话摘要。",
          "只输出 JSON，不要解释，不要 Markdown。",
          "禁止编造没有出现在输入里的文件、风险、决策或任务。",
          "summary 要像工作现场记录，覆盖：背景目标、已做进展、当前停点、关键决策、下一步、风险。"
        ].join("\n"),
        messages: [
          {
            role: "user",
            content: [
              "请基于下面材料生成 JSON，字段固定为：",
              "{",
              '  "summary": string,',
              '  "currentTask": string | null,',
              '  "currentState": string | null,',
              '  "decisions": string[],',
              '  "openLoops": string[],',
              '  "nextActions": string[],',
              '  "risks": string[],',
              '  "errors": string[],',
              '  "learnings": string[]',
              "}",
              "",
              "要求：",
              "- summary 用中文，控制在 6 行以内，适合下次打开线程直接接上。",
              "- 数组项简短具体，不超过 4 项。",
              "- errors 只记录本轮遇到的工具/API 失败，不是用户提到的 bug。",
              "- learnings 只记录跨会话有价值的经验教训（如某方案不可行、某 API 有坑）。",
              "- 如果某字段不确定，就给 null 或空数组。",
              "",
              `当前任务候选：${input.currentTask ?? "null"}`,
              `当前状态候选：${input.currentState ?? "null"}`,
              `关键决策候选：${input.decisions.join("；") || "无"}`,
              `未闭环候选：${input.openLoops.join("；") || "无"}`,
              `下一步候选：${input.nextActions.join("；") || "无"}`,
              `风险候选：${input.risks.join("；") || "无"}`,
              `关键文件候选：${input.importantFiles.join("，") || "无"}`,
              "",
              "可被 compact 的历史摘录：",
              buildCompactTranscriptExcerpt(input.compactedEvents)
            ].join("\n"),
            timestamp: Date.now()
          }
        ]
      },
      {
        apiKey: resolved.apiKey,
        maxTokens: 900
      }
    );
    const text = extractTextBlocks(response.content);
    const parsed = tryParseJsonObject(text);
    return parsed ? normalizeSnapshotDraft(parsed) : null;
  } catch {
    return null;
  }
}
function getUsageStats(events) {
  let latest = null;
  let messageCount = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.type === "assistant_message" && typeof event.message.usage?.inputTokens === "number" && typeof event.message.usage?.outputTokens === "number") {
      if (!latest) {
        latest = event.message.usage;
      }
      messageCount += 1;
      totalInputTokens += event.message.usage.inputTokens;
      totalOutputTokens += event.message.usage.outputTokens;
    }
  }
  return {
    latest,
    messageCount,
    totalInputTokens,
    totalOutputTokens
  };
}
function getCompactedMessageCount(events, compactedUntilSeq) {
  if (compactedUntilSeq <= 0) {
    return 0;
  }
  return getMessageEvents(events).filter((event) => event.seq <= compactedUntilSeq).length;
}
function resolveContextWindow(sessionId) {
  const meta = getSessionMeta(sessionId);
  const preferredModelEntryId = getSettings().modelRouting.chat.modelId;
  const entry = getEntry(preferredModelEntryId) ?? (meta?.lastModelEntryId ? getEntry(meta.lastModelEntryId) : null);
  return entry?.limits.contextWindow ?? entry?.detectedLimits.contextWindow ?? null;
}
function buildContextSummaryFromUsage(sessionId) {
  const events = loadTranscriptEvents(sessionId);
  const usageStats = getUsageStats(events);
  const usage = usageStats.latest;
  const contextWindow = resolveContextWindow(sessionId);
  const meta = getSessionMeta(sessionId);
  const latestInputTokens = usage?.inputTokens ?? null;
  const latestOutputTokens = usage?.outputTokens ?? null;
  const estimatedUsedTokens = typeof latestInputTokens === "number" && typeof latestOutputTokens === "number" ? Math.max(latestInputTokens + latestOutputTokens, 0) : typeof contextWindow === "number" ? 0 : null;
  const estimatedRemainingTokens = typeof estimatedUsedTokens === "number" && typeof contextWindow === "number" ? Math.max(contextWindow - estimatedUsedTokens, 0) : null;
  const usedRatio = typeof estimatedUsedTokens === "number" && typeof contextWindow === "number" && contextWindow > 0 ? Math.min(1, Math.max(0, estimatedUsedTokens / contextWindow)) : null;
  const remainingRatio = typeof estimatedRemainingTokens === "number" && typeof contextWindow === "number" && contextWindow > 0 ? Math.min(1, Math.max(0, estimatedRemainingTokens / contextWindow)) : null;
  const snapshot = getPersistedSnapshot(sessionId);
  const requiredCompactedUntilSeq = getRequiredCompactedUntilSeq(sessionId);
  const hasSnapshot = snapshot.revision > 0;
  const compactedMessageCount = getCompactedMessageCount(
    events,
    snapshot.compactedUntilSeq
  );
  return {
    state: typeof contextWindow === "number" && usage ? "ready" : typeof contextWindow === "number" ? "window-only" : usage ? "usage-only" : "unknown",
    contextWindow,
    latestInputTokens,
    latestOutputTokens,
    usageMessageCount: usageStats.messageCount,
    usageTotalInputTokens: usageStats.totalInputTokens,
    usageTotalOutputTokens: usageStats.totalOutputTokens,
    estimatedUsedTokens,
    estimatedRemainingTokens,
    usedRatio,
    remainingRatio,
    snapshotRevision: snapshot.revision,
    snapshotUpdatedAt: hasSnapshot ? snapshot.updatedAt : null,
    compactedUntilSeq: snapshot.compactedUntilSeq > 0 ? snapshot.compactedUntilSeq : null,
    compactedMessageCount,
    snapshotSummary: hasSnapshot && snapshot.summary.trim() ? snapshot.summary : null,
    currentTask: hasSnapshot ? snapshot.currentTask : null,
    currentState: hasSnapshot ? snapshot.currentState : null,
    branchName: hasSnapshot ? snapshot.workspace.branchName : null,
    importantFiles: hasSnapshot ? snapshot.importantFiles.slice(0, 4) : [],
    openLoops: hasSnapshot ? snapshot.openLoops.slice(0, 3) : [],
    nextActions: hasSnapshot ? snapshot.nextActions.slice(0, 3) : [],
    risks: hasSnapshot ? snapshot.risks.slice(0, 3) : [],
    autoCompactFailureCount: meta?.autoCompactFailureCount ?? 0,
    autoCompactBlocked: !!meta?.autoCompactBlockedAt,
    autoCompactBlockedAt: meta?.autoCompactBlockedAt ?? null,
    canCompact: requiredCompactedUntilSeq > snapshot.compactedUntilSeq,
    isCompacting: compactingSessionIds.has(sessionId)
  };
}
function getRequiredCompactedUntilSeq(sessionId) {
  const messageEvents = getMessageEvents(loadTranscriptEvents(sessionId));
  if (messageEvents.length <= PROTECTED_MESSAGE_COUNT) {
    return 0;
  }
  return messageEvents[messageEvents.length - PROTECTED_MESSAGE_COUNT - 1]?.seq ?? 0;
}
async function resolveBranchName() {
  const workspacePath = getSettings().workspace;
  try {
    const snapshot = await getGitDiffSnapshot(workspacePath);
    return snapshot.branch.branchName;
  } catch {
    return null;
  }
}
async function buildSnapshot(sessionId) {
  const currentSnapshot = getPersistedSnapshot(sessionId);
  const events = loadTranscriptEvents(sessionId);
  const messageEvents = getMessageEvents(events);
  if (messageEvents.length <= PROTECTED_MESSAGE_COUNT) {
    return null;
  }
  const cutoffIndex = messageEvents.length - PROTECTED_MESSAGE_COUNT;
  const olderEvents = messageEvents.slice(0, cutoffIndex);
  const compactedUntilSeq = olderEvents.at(-1)?.seq ?? 0;
  if (compactedUntilSeq <= 0) {
    return null;
  }
  const olderMessages = olderEvents.map((event) => event.message);
  const nonSystemOlderMessages = olderMessages.filter((message) => message.role !== "system");
  const backgroundGoals = dedupeTake(
    olderMessages.filter((message) => message.role === "user").slice(-3).map((message) => truncateText$2(message.content, 88)).reverse(),
    3
  );
  const decisions = collectDecisionHighlights(nonSystemOlderMessages);
  const progress = collectProgressHighlights(olderEvents);
  const importantFiles = collectImportantFiles(events, compactedUntilSeq);
  const importantAttachments = collectImportantAttachments(olderEvents).map((attachment) => ({
    id: attachment.id,
    name: attachment.name,
    path: attachment.path,
    kind: attachment.kind
  }));
  const heuristicOpenLoops = collectOpenLoops(events);
  const heuristicNextActions = collectNextActions(events);
  const heuristicRisks = collectRisks(events);
  const heuristicErrors = collectErrors(olderEvents);
  const latestRunStarted = getLatestRunStarted(events);
  const heuristicCurrentTask = resolveCurrentTask(events);
  const heuristicCurrentState = resolveCurrentState(events);
  const heuristicSummary = buildSummaryText({
    backgroundGoals,
    progress,
    currentState: heuristicCurrentState,
    decisions,
    importantFiles,
    openLoops: heuristicOpenLoops,
    nextActions: heuristicNextActions,
    risks: heuristicRisks
  });
  const modelDraft = await buildSnapshotDraftWithModel({
    sessionId,
    compactedEvents: olderEvents,
    importantFiles,
    openLoops: heuristicOpenLoops,
    nextActions: heuristicNextActions,
    risks: heuristicRisks,
    decisions,
    currentState: heuristicCurrentState,
    currentTask: heuristicCurrentTask
  });
  const summary = modelDraft?.summary ?? heuristicSummary;
  const currentTask = modelDraft?.currentTask ?? heuristicCurrentTask;
  const currentState = modelDraft?.currentState ?? heuristicCurrentState;
  const openLoops = mergePriorityArray(
    modelDraft?.openLoops ?? [],
    heuristicOpenLoops,
    4
  );
  const nextActions = mergePriorityArray(
    modelDraft?.nextActions ?? [],
    heuristicNextActions,
    3
  );
  const risks = mergePriorityArray(
    modelDraft?.risks ?? [],
    heuristicRisks,
    3
  );
  const mergedDecisions = mergePriorityArray(
    modelDraft?.decisions ?? [],
    decisions,
    4
  );
  return {
    version: 1,
    sessionId,
    revision: currentSnapshot.revision + 1,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    compactedUntilSeq,
    summary,
    currentTask,
    currentState,
    decisions: mergedDecisions,
    importantFiles,
    importantAttachments,
    openLoops,
    nextActions,
    risks,
    errors: heuristicErrors,
    learnings: modelDraft?.learnings ?? [],
    workspace: {
      branchName: await resolveBranchName(),
      modelEntryId: getSessionMeta(sessionId)?.lastModelEntryId ?? null,
      thinkingLevel: latestRunStarted?.thinkingLevel ?? null
    },
    sourceRunIds: dedupeTake(
      events.flatMap((event) => {
        if (!("runId" in event) || event.seq > compactedUntilSeq) {
          return [];
        }
        return [event.runId];
      }),
      MAX_IMPORTANT_ITEMS
    ),
    sourceMessageIds: olderMessages.map((message) => message.id).filter(Boolean).slice(-MAX_IMPORTANT_ITEMS)
  };
}
async function applySnapshot(sessionId, reason) {
  const snapshot = await buildSnapshot(sessionId);
  if (!snapshot) {
    return buildContextSummaryFromUsage(sessionId);
  }
  const meta = getSessionMeta(sessionId);
  const thinkingLevel = getLatestRunStarted(loadTranscriptEvents(sessionId))?.thinkingLevel ?? getSettings().thinkingLevel;
  const resolvedModel = resolveModelForRole(
    "compact",
    meta?.lastModelEntryId ?? getSettings().modelRouting.chat.modelId
  );
  const modelEntryId = resolvedModel.entry.id;
  await executeBackgroundRun({
    sessionId,
    runKind: "compact",
    modelEntryId,
    thinkingLevel,
    runIdPrefix: reason,
    metadata: {
      reason,
      snapshotRevision: snapshot.revision,
      compactedUntilSeq: snapshot.compactedUntilSeq
    },
    execute: async (runScope) => {
      writePersistedSnapshot(snapshot);
      updateSessionMeta(sessionId, (meta2) => {
        meta2.autoCompactFailureCount = 0;
        delete meta2.autoCompactBlockedAt;
      });
      appendCompactAppliedEvent({
        sessionId,
        runId: runScope.runId,
        snapshotRevision: snapshot.revision,
        compactedUntilSeq: snapshot.compactedUntilSeq,
        reason
      });
    }
  });
  return buildContextSummaryFromUsage(sessionId);
}
function recordAutoCompactFailure(sessionId) {
  updateSessionMeta(sessionId, (meta) => {
    const nextCount = (meta.autoCompactFailureCount ?? 0) + 1;
    meta.autoCompactFailureCount = nextCount;
    if (nextCount >= MAX_AUTO_COMPACT_FAILURES && !meta.autoCompactBlockedAt) {
      meta.autoCompactBlockedAt = (/* @__PURE__ */ new Date()).toISOString();
    }
  });
}
function buildSnapshotPrompt(snapshot) {
  if (snapshot.revision <= 0 || !snapshot.summary.trim()) {
    return "";
  }
  const sections = [
    "## Session Continuity Snapshot",
    "以下内容是系统为当前线程生成的续接摘要，用于重启续会话与 context compact。",
    snapshot.summary,
    snapshot.currentTask ? `当前任务：${snapshot.currentTask}` : "",
    snapshot.currentState ? `当前状态：${snapshot.currentState}` : "",
    snapshot.decisions.length > 0 ? `关键决策：${snapshot.decisions.join("；")}` : "",
    snapshot.openLoops.length > 0 ? `未闭环：${snapshot.openLoops.join("；")}` : "",
    snapshot.nextActions.length > 0 ? `下一步：${snapshot.nextActions.join("；")}` : "",
    snapshot.risks.length > 0 ? `风险：${snapshot.risks.join("；")}` : "",
    snapshot.errors.length > 0 ? `遇到的错误：${snapshot.errors.join("；")}` : "",
    snapshot.learnings.length > 0 ? `经验教训：${snapshot.learnings.join("；")}` : ""
  ].filter(Boolean);
  return sections.join("\n");
}
async function getContextSummary(sessionId) {
  return buildContextSummaryFromUsage(sessionId);
}
async function compactSession(sessionId) {
  const activeRun = harnessRuntime.getActiveRunBySession(sessionId);
  if (activeRun && !activeRun.cancelled) {
    throw new Error("当前线程仍在生成中，先停掉再 compact。");
  }
  compactingSessionIds.add(sessionId);
  try {
    return await applySnapshot(sessionId, "manual");
  } finally {
    compactingSessionIds.delete(sessionId);
  }
}
async function reactiveCompact(sessionId) {
  if (compactingSessionIds.has(sessionId)) return false;
  const meta = getSessionMeta(sessionId);
  if (meta?.autoCompactBlockedAt) return false;
  compactingSessionIds.add(sessionId);
  try {
    await applySnapshot(sessionId, "auto");
    return true;
  } catch {
    recordAutoCompactFailure(sessionId);
    return false;
  } finally {
    compactingSessionIds.delete(sessionId);
  }
}
async function getSessionMemoryPromptSection(sessionId) {
  return buildSnapshotPrompt(getPersistedSnapshot(sessionId));
}
async function ensureContextSnapshotCoverage(sessionId) {
  const requiredCompactedUntilSeq = getRequiredCompactedUntilSeq(sessionId);
  const snapshot = getPersistedSnapshot(sessionId);
  const meta = getSessionMeta(sessionId);
  if (requiredCompactedUntilSeq <= snapshot.compactedUntilSeq) {
    return buildContextSummaryFromUsage(sessionId);
  }
  if (meta?.autoCompactBlockedAt) {
    return buildContextSummaryFromUsage(sessionId);
  }
  compactingSessionIds.add(sessionId);
  try {
    try {
      return await applySnapshot(sessionId, "auto");
    } catch {
      recordAutoCompactFailure(sessionId);
      return buildContextSummaryFromUsage(sessionId);
    }
  } finally {
    compactingSessionIds.delete(sessionId);
  }
}
const CONTEXT_BUDGET_RATIO = 0.7;
const PROTECTED_USER_TURNS = 6;
function getAgentMessageRole(message) {
  if (!message || typeof message !== "object" || !("role" in message)) {
    return null;
  }
  const role = message.role;
  return typeof role === "string" ? role : null;
}
function extractTextFromContent(content) {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content.flatMap((part) => {
    if (!part || typeof part !== "object") {
      return [];
    }
    const textPart = part;
    if (textPart.type === "text" && typeof textPart.text === "string") {
      return [textPart.text];
    }
    if (textPart.type === "thinking" && typeof textPart.thinking === "string") {
      return [textPart.thinking];
    }
    return [];
  }).join("\n");
}
function estimateMessageTokens(message) {
  if (!message || typeof message !== "object") {
    return 0;
  }
  const role = getAgentMessageRole(message);
  const content = extractTextFromContent(message.content);
  const base = role === "user" || role === "assistant" ? 18 : 8;
  return base + Math.ceil(content.length * 0.8);
}
function estimateMessagesTokens(messages) {
  return messages.reduce((sum, message) => sum + estimateMessageTokens(message), 0);
}
function findProtectedTailIndex(messages) {
  let userTurns = 0;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (getAgentMessageRole(messages[index]) !== "user") {
      continue;
    }
    userTurns += 1;
    if (userTurns >= PROTECTED_USER_TURNS) {
      return index;
    }
  }
  return 0;
}
function isShortChatter(message) {
  const role = getAgentMessageRole(message);
  if (role !== "user" && role !== "assistant") {
    return false;
  }
  const text = extractTextFromContent(message.content);
  return text.length < 60;
}
function isToolResultMessage(message) {
  return getAgentMessageRole(message) === "tool";
}
function truncateToolResult(message) {
  const content = message.content;
  if (typeof content !== "string" && !Array.isArray(content)) {
    return message;
  }
  const text = extractTextFromContent(content);
  if (text.length <= 200) {
    return message;
  }
  return {
    ...message,
    content: `${text.slice(0, 100)}
...[已截断]...
${text.slice(-50)}`
  };
}
function applyBudgetAllocation(messages, budget, protectedTailIndex) {
  let working = [...messages];
  let estimated = estimateMessagesTokens(working);
  if (estimated <= budget) {
    return working;
  }
  for (let index = 0; index < protectedTailIndex && estimated > budget; index += 1) {
    if (!isShortChatter(working[index])) {
      continue;
    }
    estimated -= estimateMessageTokens(working[index]);
    working[index] = null;
  }
  working = working.filter(Boolean);
  if (estimated <= budget) {
    return working;
  }
  const newProtectedIndex = findProtectedTailIndex(working);
  for (let index = 0; index < newProtectedIndex && estimated > budget; index += 1) {
    if (!isToolResultMessage(working[index])) {
      continue;
    }
    const before = estimateMessageTokens(working[index]);
    working[index] = truncateToolResult(working[index]);
    const after = estimateMessageTokens(working[index]);
    estimated -= before - after;
  }
  if (estimated <= budget) {
    return working;
  }
  const finalProtectedIndex = findProtectedTailIndex(working);
  return finalProtectedIndex > 0 ? working.slice(finalProtectedIndex) : working;
}
function createTransformContext(sessionId, contextWindow) {
  return async (messages, signal) => {
    if (signal?.aborted || messages.length === 0) {
      return messages;
    }
    const budget = typeof contextWindow === "number" && contextWindow > 0 ? Math.floor(contextWindow * CONTEXT_BUDGET_RATIO) : null;
    if (!budget) {
      return messages;
    }
    const estimatedTotal = estimateMessagesTokens(messages);
    if (estimatedTotal <= budget) {
      return messages;
    }
    const protectedTailIndex = findProtectedTailIndex(messages);
    if (protectedTailIndex <= 0) {
      return messages;
    }
    const requiredCompactedUntilSeq = getRequiredCompactedUntilSeq(sessionId);
    const snapshot = getPersistedSnapshot(sessionId);
    if (requiredCompactedUntilSeq > snapshot.compactedUntilSeq) {
      await ensureContextSnapshotCoverage(sessionId);
    }
    return applyBudgetAllocation(messages, budget, protectedTailIndex);
  };
}
function safeExec(cmd, cwd) {
  try {
    return execSync(cmd, { cwd, timeout: 3e3, encoding: "utf-8" }).trim();
  } catch {
    return null;
  }
}
function collectAmbientData(workspacePath) {
  const now = /* @__PURE__ */ new Date();
  const timeZone = resolveConfiguredTimeZone(getSettings().timeZone);
  return {
    localTime: formatDateTimeInTimeZone(now, timeZone),
    timeZone,
    dayOfWeek: getWeekdayLabelInTimeZone(now, timeZone),
    platform: process.platform,
    workspacePath,
    gitBranch: safeExec("git rev-parse --abbrev-ref HEAD", workspacePath),
    gitDirty: safeExec("git status --porcelain", workspacePath) !== "",
    gitLastCommit: safeExec("git log -1 --oneline --no-decorate", workspacePath)
  };
}
function buildAmbientContextSection(workspacePath) {
  let data;
  try {
    data = collectAmbientData(workspacePath);
  } catch (err) {
    appLogger.warn({
      scope: "ambient",
      message: "收集环境感知数据失败",
      error: err instanceof Error ? err : new Error(String(err))
    });
    const now = /* @__PURE__ */ new Date();
    const timeZone = resolveConfiguredTimeZone(getSettings().timeZone);
    data = {
      localTime: formatDateTimeInTimeZone(now, timeZone),
      timeZone,
      dayOfWeek: getWeekdayLabelInTimeZone(now, timeZone),
      platform: process.platform,
      workspacePath,
      gitBranch: null,
      gitDirty: false,
      gitLastCommit: null
    };
  }
  const lines = [
    "## Ambient Context",
    `- 当前时间：${data.localTime}（${data.dayOfWeek}，${data.timeZone}）`,
    `- 运行平台：${data.platform}`,
    `- 工作目录：${data.workspacePath}`
  ];
  if (data.gitBranch) {
    lines.push(`- Git 分支：${data.gitBranch}${data.gitDirty ? "（有未提交改动）" : ""}`);
  }
  if (data.gitLastCommit) {
    lines.push(`- 最近提交：${data.gitLastCommit}`);
  }
  return {
    id: "ambient-context",
    layer: "runtime",
    role: "fact",
    authority: "soft",
    priority: 45,
    cacheScope: "turn",
    // 每次都刷新
    trimPriority: 10,
    // 接近上限时优先丢弃
    writableBack: false,
    content: lines.join("\n")
  };
}
const MAX_INDEX_LINES = 200;
const MAX_INDEX_BYTES = 25e3;
const MAX_TOPIC_FILE_BYTES = 5e4;
const MAX_PROMPT_SECTION_CHARS = 6e3;
const MAX_SEARCH_RESULTS = 8;
function getMemoryDir$1() {
  return join(app.getPath("userData"), "data", "memory");
}
function getIndexPath() {
  return join(getMemoryDir$1(), "MEMORY.md");
}
function getTopicsDir() {
  return join(getMemoryDir$1(), "topics");
}
function getTopicFilePath(topic) {
  const safeName = topic.replace(/[^a-zA-Z0-9_\-\u4e00-\u9fff]/g, "_");
  return join(getTopicsDir(), `${safeName}.md`);
}
function ensureDir$2(dirPath) {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}
function atomicWrite$1(filePath, data) {
  ensureDir$2(dirname(filePath));
  const tempPath = filePath + ".tmp";
  writeFileSync(tempPath, data, "utf-8");
  renameSync(tempPath, filePath);
}
function safeReadFile(filePath) {
  if (!existsSync(filePath)) return "";
  try {
    return readFileSync(filePath, "utf-8");
  } catch {
    return "";
  }
}
function parseIndex(content) {
  const entries = [];
  for (const line of content.split("\n")) {
    const match = line.match(
      /^-\s+(.+?)\s+\[→\s*topics\/([^\]]+?)\.md\]\s*$/
    );
    if (match) {
      entries.push({ summary: match[1].trim(), topic: match[2].trim() });
    }
  }
  return entries;
}
function renderIndex(entries) {
  const lines = ["# Long-term Memory Index", ""];
  const grouped = /* @__PURE__ */ new Map();
  for (const entry of entries) {
    const list = grouped.get(entry.topic) ?? [];
    list.push(entry.summary);
    grouped.set(entry.topic, list);
  }
  for (const [topic, summaries] of grouped) {
    lines.push(`## ${topic}`);
    for (const summary of summaries) {
      lines.push(`- ${summary} [→ topics/${topic}.md]`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
function readTopicFile(topic) {
  return safeReadFile(getTopicFilePath(topic));
}
function appendToTopicFile(topic, summary, detail, source) {
  const filePath = getTopicFilePath(topic);
  const existing = safeReadFile(filePath);
  const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace("T", " ").slice(0, 19);
  const block = [
    `### ${summary}`,
    `_source: ${source} | saved: ${timestamp}_`,
    "",
    detail ? detail : "_（无详细正文）_",
    ""
  ].join("\n");
  let newContent;
  if (!existing.trim()) {
    newContent = `# ${topic}

${block}`;
  } else {
    newContent = existing.trimEnd() + "\n\n" + block;
  }
  const bytes = Buffer.byteLength(newContent, "utf-8");
  if (bytes > MAX_TOPIC_FILE_BYTES) {
    appLogger.info({
      scope: "memdir",
      message: `Topic file '${topic}' exceeds ${MAX_TOPIC_FILE_BYTES} bytes, truncating oldest entries`
    });
    const lines = newContent.split("\n");
    const halfStart = Math.floor(lines.length / 2);
    newContent = `# ${topic}

_（早期记忆已被截断）_

` + lines.slice(halfStart).join("\n");
  }
  atomicWrite$1(filePath, newContent);
}
function tokenize(text) {
  return text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((tok) => tok.length > 1);
}
function computeScore(text, queryTokens) {
  if (queryTokens.length === 0) return 0;
  const haystack = text.toLowerCase();
  let matched = 0;
  for (const token of queryTokens) {
    if (haystack.includes(token)) matched++;
  }
  return matched / queryTokens.length;
}
class MemdirStore {
  indexCache = null;
  loadIndex() {
    if (this.indexCache) return this.indexCache;
    const content = safeReadFile(getIndexPath());
    this.indexCache = parseIndex(content);
    return this.indexCache;
  }
  invalidateCache() {
    this.indexCache = null;
  }
  isEnabled() {
    return true;
  }
  /** 保存一条记忆：写 topic 文件 → 更新索引 */
  save(input) {
    const topic = input.topic || "general";
    const source = input.source || "agent";
    const summary = input.summary.trim();
    appendToTopicFile(topic, summary, input.detail, source);
    const entries = this.loadIndex();
    const duplicate = entries.find(
      (e) => e.topic === topic && e.summary.toLowerCase() === summary.toLowerCase()
    );
    if (!duplicate) {
      entries.push({ summary, topic });
    }
    this.enforceIndexLimits(entries);
    atomicWrite$1(getIndexPath(), renderIndex(entries));
    this.invalidateCache();
    appLogger.info({
      scope: "memdir",
      message: "Memory saved",
      data: { topic, summary: summary.slice(0, 80) }
    });
    return { summary, topic, source };
  }
  /** 删除一条索引记录 */
  remove(summary, topic) {
    const entries = this.loadIndex();
    const before = entries.length;
    const filtered = entries.filter(
      (e) => !(e.topic === topic && e.summary.toLowerCase() === summary.toLowerCase())
    );
    if (filtered.length === before) return false;
    atomicWrite$1(getIndexPath(), renderIndex(filtered));
    this.invalidateCache();
    return true;
  }
  /** 搜索：对索引条目 + topic 正文做关键词匹配 */
  search(query, limit) {
    const entries = this.loadIndex();
    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) return [];
    const cap = limit ?? MAX_SEARCH_RESULTS;
    const results = [];
    for (const entry of entries) {
      const indexScore = computeScore(
        entry.summary + " " + entry.topic,
        queryTokens
      );
      if (indexScore > 0) {
        results.push({
          summary: entry.summary,
          topic: entry.topic,
          score: indexScore
        });
      }
    }
    results.sort((a, b) => b.score - a.score);
    const topResults = results.slice(0, cap);
    const loadedTopics = /* @__PURE__ */ new Set();
    for (const result of topResults) {
      if (loadedTopics.has(result.topic)) continue;
      loadedTopics.add(result.topic);
      const content = readTopicFile(result.topic);
      if (content) {
        const detailBlock = extractDetailBlock(content, result.summary);
        if (detailBlock) {
          result.detail = detailBlock;
        }
      }
    }
    return topResults;
  }
  /** 列出所有索引条目 */
  listIndex() {
    return [...this.loadIndex()];
  }
  /** 列出所有 topic 文件名 */
  listTopics() {
    const dir = getTopicsDir();
    if (!existsSync(dir)) return [];
    try {
      return readdirSync(dir).filter((f) => f.endsWith(".md")).map((f) => f.replace(/\.md$/, ""));
    } catch {
      return [];
    }
  }
  /** 读取完整 topic 文件 */
  readTopic(topic) {
    return readTopicFile(topic);
  }
  /** 获取当前索引的原始 markdown 内容 */
  getIndexContent() {
    return safeReadFile(getIndexPath());
  }
  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------
  enforceIndexLimits(entries) {
    while (entries.length > MAX_INDEX_LINES) {
      entries.shift();
    }
    let rendered = renderIndex(entries);
    while (Buffer.byteLength(rendered, "utf-8") > MAX_INDEX_BYTES && entries.length > 0) {
      entries.shift();
      rendered = renderIndex(entries);
    }
  }
}
function extractDetailBlock(content, summary) {
  const lines = content.split("\n");
  const normalizedSummary = summary.toLowerCase().trim();
  let startIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("### ")) {
      const heading = lines[i].replace(/^###\s+/, "").toLowerCase().trim();
      if (heading === normalizedSummary) {
        startIndex = i;
        break;
      }
    }
  }
  if (startIndex < 0) return void 0;
  const blockLines = [];
  for (let i = startIndex + 1; i < lines.length; i++) {
    if (lines[i].startsWith("### ")) break;
    blockLines.push(lines[i]);
  }
  const block = blockLines.join("\n").trim();
  return block || void 0;
}
function buildMemoryInstructions() {
  return [
    "## 长期记忆系统",
    "",
    "你有一个文件化的长期记忆系统（memdir），用于保存跨会话有价值的信息。",
    "",
    "### 保存纪律",
    "- **只保存长期有价值的事实**：用户偏好、项目约定、架构决定、反复出现的模式",
    "- **不要保存临时信息**：当前任务进度、计划、待办事项、一次性指令",
    "- **每条记忆需要一个 topic 分类**：如 preferences、architecture、conventions、workflow、project-structure",
    "- **摘要必须一句话、可独立理解**：不依赖上下文就能明白含义",
    "- **有详细内容时补充 detail**：detail 会写入 topic 文件供后续深度检索",
    "",
    "### 使用 memory_save 工具",
    "```",
    'memory_save({ summary: "用户偏好用 pnpm 而非 npm", topic: "preferences" })',
    'memory_save({ summary: "项目使用四层架构拆分", topic: "architecture", detail: "Harness Runtime / Context Engine / Memory System / Transcript Persistence" })',
    "```",
    "",
    "### 不该保存的",
    "- 当前对话的上下文（session memory 会处理）",
    "- 任务计划或待办（用 todo 工具）",
    "- 代码片段（存在文件里更好）",
    "- 显而易见的事实（不需要记忆来提醒）"
  ].join("\n");
}
const memdirStore = new MemdirStore();
async function getSemanticMemoryPromptSection(input) {
  const query = input.query?.trim();
  if (!query) {
    const indexContent2 = memdirStore.getIndexContent().trim();
    const parts2 = [buildMemoryInstructions()];
    if (indexContent2) {
      parts2.push("");
      parts2.push("## 已有记忆索引");
      const indexLines = indexContent2.split("\n");
      if (indexLines.length > 20) {
        parts2.push(indexLines.slice(0, 20).join("\n"));
        parts2.push(`_（共 ${indexLines.length} 行，已截断显示前 20 行）_`);
      } else {
        parts2.push(indexContent2);
      }
    }
    return parts2.join("\n");
  }
  const indexContent = memdirStore.getIndexContent().trim();
  const results = memdirStore.search(query);
  const parts = [];
  parts.push(buildMemoryInstructions());
  if (indexContent) {
    parts.push("");
    parts.push("## 已有记忆索引");
    const indexLines = indexContent.split("\n");
    if (indexLines.length > 30) {
      parts.push(indexLines.slice(0, 30).join("\n"));
      parts.push(`_（共 ${indexLines.length} 行，已截断显示前 30 行）_`);
    } else {
      parts.push(indexContent);
    }
  }
  if (results.length > 0) {
    parts.push("");
    parts.push("## 与当前话题相关的记忆");
    let totalChars = 0;
    for (const result of results) {
      const line = `- **[${result.topic}]** ${result.summary}`;
      totalChars += line.length;
      if (totalChars > MAX_PROMPT_SECTION_CHARS) break;
      parts.push(line);
      if (result.detail) {
        const detailPreview = result.detail.length > 300 ? result.detail.slice(0, 300) + "…" : result.detail;
        parts.push(`  > ${detailPreview.replace(/\n/g, "\n  > ")}`);
        totalChars += detailPreview.length;
      }
    }
  }
  return parts.join("\n");
}
function getMemdirStore() {
  return memdirStore;
}
const MCP_CONFIG_FILE = "mcp.json";
function loadMcpConfig(workspacePath) {
  const configPath = join(workspacePath, MCP_CONFIG_FILE);
  if (!existsSync(configPath)) {
    return { mcpServers: {} };
  }
  try {
    const raw = readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw);
    return {
      mcpServers: parsed.mcpServers ?? {}
    };
  } catch {
    return { mcpServers: {} };
  }
}
function getActiveServers(config) {
  return Object.entries(config.mcpServers).filter(
    ([, cfg]) => !cfg.disabled
  );
}
const LAYER_ORDER = {
  constitution: 10,
  workspace: 20,
  runtime: 30,
  "semantic-memory": 40,
  session: 50,
  turn: 60
};
function normalizeContent(content) {
  return content.trim().replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n");
}
function createSection(input) {
  const content = normalizeContent(input.content ?? "");
  if (!content) {
    return null;
  }
  return {
    ...input,
    content
  };
}
function sortSections(a, b) {
  if (a.priority !== b.priority) {
    return a.priority - b.priority;
  }
  return LAYER_ORDER[a.layer] - LAYER_ORDER[b.layer];
}
function resolveShellLabel(shell2) {
  const normalized = shell2.trim().toLowerCase();
  if (!normalized || normalized === "default") {
    return "系统默认 shell（Windows 下通常是 PowerShell）";
  }
  if (normalized.includes("pwsh") || normalized.includes("powershell")) {
    return "PowerShell";
  }
  if (normalized.includes("cmd")) {
    return "cmd";
  }
  return shell2;
}
function truncateText$1(text, maxLength = 120) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }
  return normalized.length <= maxLength ? normalized : normalized.slice(0, Math.max(16, maxLength - 1)).trimEnd() + "…";
}
function inferTurnMode(text) {
  const normalized = text.replace(/\s+/g, "");
  if (/^\/btw(?:\s|$)/i.test(text.trim())) {
    return "旁路补充 / btw";
  }
  if (/(讨论|方案|架构|设计|怎么做|思路)/.test(normalized)) {
    return "讨论 / 方案收敛";
  }
  if (/(review|审查|检查|过一遍|代码审阅)/i.test(text)) {
    return "review / 审查";
  }
  if (/(排查|排障|定位|报错|错误|异常|失败|bug)/i.test(text)) {
    return "排障 / 根因定位";
  }
  if (/(实现|修改|调整|重构|修复|改一下|动代码)/.test(normalized)) {
    return "实现 / 修改";
  }
  return null;
}
function collectTurnConstraints(text) {
  const normalized = text.replace(/\s+/g, "");
  const constraints = [];
  if (/(先讨论|只讨论|讨论方案|先聊|别急着改|先别改|不要改代码|暂不改代码)/.test(normalized)) {
    constraints.push("本轮先以讨论和收敛方案为主，不直接改代码。");
  }
  if (/(只改文档|文档为主|更新文档|改文档)/.test(normalized)) {
    constraints.push("本轮以文档调整为主，不扩散到无关代码。");
  }
  if (/(不要build|别build|先别build|不需要build|不要check|别check|先别check|不需要check)/i.test(normalized)) {
    constraints.push("本轮避免无必要的 build / check。");
  }
  if (/(只看|只review|只检查|别动别的|限制范围)/.test(normalized)) {
    constraints.push("本轮只处理用户点名的范围，不主动扩散修改。");
  }
  if (/^\/btw(?:\s|$)/i.test(text.trim())) {
    constraints.push("本轮是 /btw 旁路补充：短答优先，尽量不改变主线任务状态，不主动扩大工具调用范围。");
  }
  return constraints;
}
function assemblePromptSections(sections) {
  return sections.filter((section) => !!section).sort(sortSections).map((section) => section.content).join("\n\n");
}
function buildPlatformConstitutionSection() {
  return {
    id: "platform-constitution",
    layer: "constitution",
    role: "instruction",
    authority: "hard",
    priority: 10,
    cacheScope: "stable",
    trimPriority: 100,
    writableBack: false,
    content: [
      "## Platform Constitution",
      "你是 Pi，一个运行在用户桌面上的 AI 助手。",
      "默认用中文回复，优先说人话、保持简洁。",
      "你可以帮助用户完成软件开发和日常任务。",
      "需要使用工具时，先遵守 Harness Runtime 的边界，不能把 prompt 当成权限系统。"
    ].join("\n")
  };
}
function buildTalkNormalSection() {
  return {
    id: "talk-normal",
    layer: "constitution",
    role: "instruction",
    authority: "hard",
    priority: 12,
    cacheScope: "stable",
    trimPriority: 95,
    writableBack: false,
    content: [
      "## Response Style",
      "回答要直接、資訊完整、但不要拖泥帶水。",
      "先回答，再补充必要上下文；不要先寒暄、不要重复题目。",
      "避免用否定式对比来立论，例如“不是 X，而是 Y”或“X，而不是 Y”；优先直接陈述你真正要表达的正向结论。",
      "简单问题短答，复杂问题可以分点，但只保留最重要的结构。",
      "不要写总结标签式收尾，不要用“总结一下 / 一句话说 / hope this helps / 如果你愿意我还可以”这类尾句。",
      "不要为了显得自然而重复改写同一个意思；说清楚一次就停。"
    ].join("\n")
  };
}
function buildWorkspacePolicySection(content) {
  return createSection({
    id: "workspace-policy",
    layer: "workspace",
    role: "instruction",
    authority: "hard",
    priority: 20,
    cacheScope: "stable",
    trimPriority: 90,
    writableBack: false,
    content: [
      "## Workspace Policy",
      "以下是当前仓库的长期规则：",
      content
    ].join("\n\n")
  });
}
function buildRuntimeCapabilitySection(input) {
  const activeServers = getActiveServers(loadMcpConfig(input.workspacePath)).map(
    ([name]) => name
  );
  const builtinToolNames = input.toolNames.filter((name) => !name.startsWith("mcp_"));
  const mcpToolCount = input.toolNames.filter((name) => name.startsWith("mcp_")).length;
  return {
    id: "runtime-capability-manifest",
    layer: "runtime",
    role: "fact",
    authority: "hard",
    priority: 30,
    cacheScope: "session",
    trimPriority: 60,
    writableBack: false,
    content: [
      "## Runtime Capability Manifest",
      "以下是当前运行时的真实能力与边界，以此为准：",
      `当前模型：${input.modelName}（${input.modelId}）`,
      `当前 source：${input.sourceName} / ${input.providerType}`,
      `视觉输入：${input.supportsVision ? "支持" : "不支持"}`,
      `工具调用：${input.supportsToolCalling ? "支持" : "不支持"}`,
      input.contextWindow ? `上下文窗口：约 ${input.contextWindow} tokens` : "",
      `thinking level：${input.thinkingLevel}`,
      `shell：${resolveShellLabel(input.shell)}`,
      `内置工具：${builtinToolNames.join("、")}`,
      activeServers.length > 0 ? `已启用 MCP Server：${activeServers.join("、")}` : "已启用 MCP Server：无",
      mcpToolCount > 0 ? `动态 MCP 工具数：${mcpToolCount}` : "",
      input.toolNames.includes("mcp") ? "MCP 代理：可用 mcp(action=list) 发现工具，再用 mcp(action=call, server, tool, args) 调用工具；MCP 工具很多时优先使用代理。" : "",
      input.toolNames.includes("web_search") && input.toolNames.includes("web_fetch") ? "网页访问：web_search 用于搜索，web_fetch 用于抓取 URL 内容。" : "",
      input.toolNames.includes("command_history") ? "命令历史：command_history 可读取当前线程最近 shell_exec 命令、退出码和耗时。" : "",
      "文件路径默认相对于当前 workspace。",
      `shell_exec 使用 ${resolveShellLabel(input.shell)} 语法，不要默认写 bash 专属语法。`
    ].filter(Boolean).join("\n")
  };
}
function buildSemanticMemorySection(content) {
  return createSection({
    id: "semantic-memory",
    layer: "semantic-memory",
    role: "memory",
    authority: "reference",
    priority: 40,
    cacheScope: "turn",
    trimPriority: 10,
    writableBack: "semantic",
    content
  });
}
function buildSessionSnapshotSection(content) {
  return createSection({
    id: "session-continuity",
    layer: "session",
    role: "memory",
    authority: "reference",
    priority: 50,
    cacheScope: "session",
    trimPriority: 20,
    writableBack: "session",
    content
  });
}
function buildTurnIntentPatchSection(latestUserText) {
  const text = latestUserText?.trim();
  if (!text) {
    return null;
  }
  const mode = inferTurnMode(text);
  const constraints = collectTurnConstraints(text);
  return createSection({
    id: "turn-intent-patch",
    layer: "turn",
    role: "intent",
    authority: "soft",
    priority: 60,
    cacheScope: "turn",
    trimPriority: 100,
    writableBack: false,
    content: [
      "## Turn Intent Patch",
      "以下仅对当前轮生效：",
      mode ? `本轮模式：${mode}` : "",
      `用户最新诉求：${truncateText$1(text)}`,
      ...constraints
    ].filter(Boolean).join("\n")
  });
}
const SOUL_DIR = ".pi";
const SOUL_FILE = "SOUL.md";
const USER_FILE = "USER.md";
const AGENTS_FILE = "AGENTS.md";
function readSoulFile(workspacePath, filename) {
  const filePath = join(workspacePath, SOUL_DIR, filename);
  if (!existsSync(filePath)) return "";
  try {
    return readFileSync(filePath, "utf-8");
  } catch {
    return "";
  }
}
function getSoulFilesStatus(workspacePath) {
  function fileInfo(filename) {
    const filePath = join(workspacePath, SOUL_DIR, filename);
    if (!existsSync(filePath)) return { exists: false, sizeBytes: 0 };
    try {
      const content = readFileSync(filePath, "utf-8");
      return { exists: true, sizeBytes: Buffer.byteLength(content, "utf-8") };
    } catch {
      return { exists: false, sizeBytes: 0 };
    }
  }
  return {
    soul: fileInfo(SOUL_FILE),
    user: fileInfo(USER_FILE),
    agents: fileInfo(AGENTS_FILE)
  };
}
function buildSoulPromptSection(workspacePath) {
  const soul = readSoulFile(workspacePath, SOUL_FILE);
  const user = readSoulFile(workspacePath, USER_FILE);
  const agents = readSoulFile(workspacePath, AGENTS_FILE);
  if (!soul && !user && !agents) return "";
  const sections = [];
  if (soul) {
    sections.push("## 项目说明（SOUL.md）\n\n" + soul);
  }
  if (user) {
    sections.push("## 用户偏好（USER.md）\n\n" + user);
  }
  if (agents) {
    sections.push("## Agent 配置（AGENTS.md）\n\n" + agents);
  }
  return sections.join("\n\n---\n\n");
}
const SYSTEM_PROMPT_RATIO = 0.18;
const MIN_SYSTEM_PROMPT_BUDGET = 1200;
const MAX_SYSTEM_PROMPT_BUDGET = 12e3;
const MIN_TRIMMABLE_SECTION_TOKENS = 120;
const MIN_SECTION_BODY_CHARS = 160;
function estimateSectionTokens(section) {
  return 18 + Math.ceil(section.content.length * 0.8);
}
function estimateSectionsTokens(sections) {
  return sections.reduce((sum, section) => sum + estimateSectionTokens(section), 0);
}
function resolveSystemPromptBudget(contextWindow) {
  if (typeof contextWindow !== "number" || contextWindow <= 0) {
    return null;
  }
  return Math.max(
    MIN_SYSTEM_PROMPT_BUDGET,
    Math.min(MAX_SYSTEM_PROMPT_BUDGET, Math.floor(contextWindow * SYSTEM_PROMPT_RATIO))
  );
}
function truncateSectionContent(section, targetTokens) {
  const estimatedTokens = estimateSectionTokens(section);
  if (estimatedTokens <= targetTokens) {
    return section;
  }
  const targetChars = Math.max(
    MIN_SECTION_BODY_CHARS,
    Math.floor(Math.max(targetTokens - 18, 1) / 0.8)
  );
  if (section.content.length <= targetChars) {
    return section;
  }
  const lines = section.content.split("\n");
  const heading = lines[0] ?? "";
  const body = lines.slice(1).join("\n").trim();
  const suffix = "\n[...已按上下文预算截断]";
  const availableBodyChars = targetChars - heading.length - suffix.length - 1;
  if (!body || availableBodyChars < MIN_SECTION_BODY_CHARS / 2) {
    return null;
  }
  return {
    ...section,
    content: `${heading}
${body.slice(0, availableBodyChars).trimEnd()}${suffix}`
  };
}
function trimPromptSectionsForBudget(sections, budget) {
  if (!budget) {
    return sections;
  }
  let working = [...sections];
  let estimated = estimateSectionsTokens(working);
  if (estimated <= budget) {
    return working;
  }
  const trimOrder = [...working].map((section) => section.id).sort((leftId, rightId) => {
    const left = working.find((section) => section.id === leftId);
    const right = working.find((section) => section.id === rightId);
    if (left.trimPriority !== right.trimPriority) {
      return left.trimPriority - right.trimPriority;
    }
    return right.priority - left.priority;
  });
  for (const sectionId of trimOrder) {
    if (estimated <= budget) {
      break;
    }
    const index = working.findIndex((section2) => section2.id === sectionId);
    if (index < 0) {
      continue;
    }
    const section = working[index];
    const sectionTokens = estimateSectionTokens(section);
    const overflow = estimated - budget;
    const targetTokens = Math.max(
      MIN_TRIMMABLE_SECTION_TOKENS,
      sectionTokens - overflow
    );
    if (section.role === "memory" || section.authority !== "hard" || section.trimPriority < 90) {
      const truncated = truncateSectionContent(section, targetTokens);
      if (truncated) {
        working[index] = truncated;
        estimated = estimateSectionsTokens(working);
        if (estimated <= budget) {
          break;
        }
      }
    }
    if (section.authority !== "hard") {
      working.splice(index, 1);
      estimated = estimateSectionsTokens(working);
    }
  }
  return working;
}
function buildPromptSections(input, semanticMemory, snapshot) {
  const settings = getSettings();
  return [
    buildPlatformConstitutionSection(),
    buildTalkNormalSection(),
    buildWorkspacePolicySection(buildSoulPromptSection(input.workspacePath)),
    buildRuntimeCapabilitySection({
      workspacePath: input.workspacePath,
      shell: settings.terminal.shell,
      sourceName: input.promptRuntime.sourceName,
      providerType: input.promptRuntime.providerType,
      modelName: input.promptRuntime.modelName,
      modelId: input.promptRuntime.modelId,
      contextWindow: input.promptRuntime.contextWindow,
      supportsVision: input.promptRuntime.supportsVision,
      supportsToolCalling: input.promptRuntime.supportsToolCalling,
      thinkingLevel: input.thinkingLevel,
      toolNames: input.toolNames
    }),
    buildAmbientContextSection(input.workspacePath),
    buildSemanticMemorySection(semanticMemory),
    buildSessionSnapshotSection(snapshot),
    buildTurnIntentPatchSection(input.latestUserText)
  ].filter((section) => !!section);
}
async function buildContextSystemPrompt(input) {
  await ensureContextSnapshotCoverage(input.sessionId);
  const [snapshot, semanticMemory] = await Promise.all([
    getSessionMemoryPromptSection(input.sessionId),
    getSemanticMemoryPromptSection({
      sessionId: input.sessionId,
      query: input.latestUserText ?? null
    })
  ]);
  const sections = buildPromptSections(input, semanticMemory, snapshot);
  const budget = resolveSystemPromptBudget(input.promptRuntime.contextWindow);
  const trimmedSections = trimPromptSectionsForBudget(sections, budget);
  return assemblePromptSections(trimmedSections);
}
function listSessions() {
  return listPersistedSessions();
}
function loadSession(sessionId) {
  return loadPersistedSession(sessionId);
}
function saveSession(session) {
  saveSessionProjection(session);
}
function createSession() {
  return createPersistedSession();
}
function deleteSession(sessionId) {
  deletePersistedSession(sessionId);
}
function trimSessionMessages(sessionId, messageId) {
  return trimPersistedSessionMessages(sessionId, messageId);
}
function listArchivedSessions() {
  return listPersistedArchivedSessions();
}
function archiveSession(sessionId) {
  archivePersistedSession(sessionId);
}
function unarchiveSession(sessionId) {
  unarchivePersistedSession(sessionId);
}
function setSessionGroup(sessionId, groupId) {
  setPersistedSessionGroup(sessionId, groupId);
}
function renameSession(sessionId, title) {
  const nextTitle = title.trim();
  if (!nextTitle) {
    return;
  }
  renamePersistedSession(sessionId, nextTitle);
}
function setSessionPinned(sessionId, pinned) {
  setPersistedSessionPinned(sessionId, pinned);
}
const UI_STATE_FILE = "ui-state.json";
const GROUPS_FILE = "groups.json";
function getDataDir() {
  return join(app.getPath("userData"), "data");
}
function getUiStatePath() {
  return join(getDataDir(), UI_STATE_FILE);
}
function getGroupsPath() {
  return join(getDataDir(), GROUPS_FILE);
}
function ensureParentDir(filePath) {
  const parent = dirname(filePath);
  if (parent && !existsSync(parent)) {
    mkdirSync(parent, { recursive: true });
  }
}
function atomicWrite(filePath, data) {
  ensureParentDir(filePath);
  const tmpPath = filePath + ".tmp";
  writeFileSync(tmpPath, data, "utf-8");
  renameSync(tmpPath, filePath);
}
function readJsonFile(filePath, fallback) {
  if (!existsSync(filePath)) {
    return fallback;
  }
  try {
    return JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    return fallback;
  }
}
function getUiState() {
  const filePath = getUiStatePath();
  const parsed = readJsonFile(filePath, {});
  return {
    diffPanelOpen: typeof parsed.diffPanelOpen === "boolean" ? parsed.diffPanelOpen : typeof parsed.rightPanelOpen === "boolean" ? parsed.rightPanelOpen : false
  };
}
function writeUiState(ui) {
  atomicWrite(getUiStatePath(), JSON.stringify(ui, null, 2));
}
function setDiffPanelOpen(open) {
  const ui = getUiState();
  ui.diffPanelOpen = open;
  writeUiState(ui);
}
function listGroups() {
  return readJsonFile(getGroupsPath(), []);
}
function writeGroups(groups) {
  atomicWrite(getGroupsPath(), JSON.stringify(groups, null, 2));
}
function createGroup(name) {
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error("分组名不能为空。");
  }
  const group = {
    id: randomUUID(),
    name: trimmedName
  };
  const groups = listGroups();
  groups.push(group);
  writeGroups(groups);
  return group;
}
function renameGroup(groupId, name) {
  const trimmedName = name.trim();
  if (!trimmedName) {
    return;
  }
  const groups = listGroups();
  const group = groups.find((item) => item.id === groupId);
  if (!group) {
    return;
  }
  group.name = trimmedName;
  writeGroups(groups);
}
function deleteGroup(groupId) {
  const summaries = [...listPersistedSessions(), ...listPersistedArchivedSessions()];
  for (const summary of summaries) {
    if (summary.groupId === groupId) {
      setPersistedSessionGroup(summary.id, null);
    }
  }
  writeGroups(listGroups().filter((group) => group.id !== groupId));
}
function registerSessionsIpc() {
  handleIpc(IPC_CHANNELS.sessionsList, async () => listSessions());
  handleIpc(
    IPC_CHANNELS.sessionsLoad,
    async (_event, sessionId) => loadSession(sessionId)
  );
  handleIpc(
    IPC_CHANNELS.sessionsSave,
    async (_event, session) => saveSession(session)
  );
  handleIpc(IPC_CHANNELS.sessionsCreate, async () => createSession());
  handleIpc(
    IPC_CHANNELS.sessionsArchive,
    async (_event, sessionId) => archiveSession(sessionId)
  );
  handleIpc(
    IPC_CHANNELS.sessionsUnarchive,
    async (_event, sessionId) => unarchiveSession(sessionId)
  );
  handleIpc(
    IPC_CHANNELS.sessionsListArchived,
    async () => listArchivedSessions()
  );
  handleIpc(
    IPC_CHANNELS.sessionsDelete,
    async (_event, sessionId) => deleteSession(sessionId)
  );
  handleIpc(
    IPC_CHANNELS.sessionsSetGroup,
    async (_event, sessionId, groupId) => setSessionGroup(sessionId, groupId)
  );
  handleIpc(
    IPC_CHANNELS.sessionsRename,
    async (_event, sessionId, title) => renameSession(sessionId, title)
  );
  handleIpc(
    IPC_CHANNELS.sessionsSetPinned,
    async (_event, sessionId, pinned) => setSessionPinned(sessionId, pinned)
  );
  handleIpc(
    IPC_CHANNELS.contextGetSummary,
    async (_event, sessionId) => getContextSummary(sessionId)
  );
  handleIpc(
    IPC_CHANNELS.contextCompact,
    async (_event, sessionId) => compactSession(sessionId)
  );
  handleIpc(IPC_CHANNELS.groupsList, async () => listGroups());
  handleIpc(
    IPC_CHANNELS.groupsCreate,
    async (_event, name) => createGroup(name)
  );
  handleIpc(
    IPC_CHANNELS.groupsRename,
    async (_event, groupId, name) => renameGroup(groupId, name)
  );
  handleIpc(
    IPC_CHANNELS.groupsDelete,
    async (_event, groupId) => deleteGroup(groupId)
  );
}
async function mcpToolsFromConnection(conn) {
  if (!conn.connected) return [];
  try {
    const result = await conn.client.listTools();
    return result.tools.map((tool) => mcpToolToAgentTool(conn, tool));
  } catch {
    return [];
  }
}
function mcpToolToAgentTool(conn, tool) {
  const prefixedName = `mcp_${conn.name}_${tool.name}`;
  const parameters2 = Type.Object({
    args: Type.Optional(Type.Any({ description: "工具参数（JSON 对象）" }))
  });
  return {
    name: prefixedName,
    label: `${conn.name}/${tool.name}`,
    description: tool.description ?? `MCP 工具: ${tool.name}（来自 ${conn.name}）`,
    parameters: parameters2,
    async execute(_toolCallId, params) {
      if (!conn.connected) {
        return {
          content: [{ type: "text", text: `MCP 服务 ${conn.name} 已断开连接` }],
          details: { error: "disconnected" }
        };
      }
      try {
        const result = await conn.client.callTool({
          name: tool.name,
          arguments: params.args ?? {}
        });
        const textParts = [];
        if ("content" in result && Array.isArray(result.content)) {
          for (const block of result.content) {
            if (block.type === "text") {
              textParts.push(block.text);
            }
          }
        }
        const text = textParts.length > 0 ? textParts.join("\n") : JSON.stringify(result, null, 2);
        return {
          content: [{ type: "text", text }],
          details: {
            server: conn.name,
            tool: tool.name,
            isError: "isError" in result ? result.isError : false
          }
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "MCP 调用失败";
        return {
          content: [{ type: "text", text: `MCP 工具调用失败: ${message}` }],
          details: { server: conn.name, tool: tool.name, error: message }
        };
      }
    }
  };
}
async function getAllMcpTools(connections) {
  const results = await Promise.allSettled(
    connections.map((conn) => mcpToolsFromConnection(conn))
  );
  const tools = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      tools.push(...result.value);
    }
  }
  return tools;
}
const listMcpResourcesParameters = Type.Object({
  server: Type.Optional(Type.String({ description: "可选 server 名；不填则枚举所有已连接服务" }))
});
const readMcpResourceParameters = Type.Object({
  server: Type.String({ description: "MCP server 名" }),
  uri: Type.String({ description: "资源 URI" })
});
const listMcpResourceTemplatesParameters = Type.Object({
  server: Type.Optional(Type.String({ description: "可选 server 名；不填则枚举所有已连接服务" }))
});
function getConnectionsForServer(manager, server2) {
  if (server2?.trim()) {
    const connection = manager.getConnection(server2.trim());
    return connection ? [connection] : [];
  }
  return manager.getConnections();
}
function getMcpResourceTools(manager) {
  const listMcpResourcesTool = {
    name: "list_mcp_resources",
    label: "列出 MCP 资源",
    description: "列出已连接 MCP server 暴露的资源。",
    parameters: listMcpResourcesParameters,
    async execute(_toolCallId, params) {
      const connections = getConnectionsForServer(manager, params.server);
      if (connections.length === 0) {
        return {
          content: [{ type: "text", text: JSON.stringify({ resources: [], error: "当前没有可用的 MCP 资源服务。" }, null, 2) }],
          details: { resources: [] }
        };
      }
      const resources = [];
      for (const connection of connections) {
        try {
          const result = await connection.client.listResources();
          resources.push(
            ...result.resources.map((resource) => ({
              server: connection.name,
              uri: resource.uri,
              name: resource.name,
              description: resource.description,
              mimeType: resource.mimeType
            }))
          );
        } catch {
        }
      }
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            resources,
            count: resources.length
          }, null, 2)
        }],
        details: { resources }
      };
    }
  };
  const readMcpResourceTool = {
    name: "read_mcp_resource",
    label: "读取 MCP 资源",
    description: "读取指定 MCP 资源的内容。",
    parameters: readMcpResourceParameters,
    async execute(_toolCallId, params) {
      const connection = manager.getConnection(params.server);
      if (!connection) {
        return {
          content: [{ type: "text", text: JSON.stringify({ server: params.server, uri: params.uri, error: `MCP 服务不存在或未连接: ${params.server}` }, null, 2) }],
          details: { server: params.server, uri: params.uri, contents: [] }
        };
      }
      try {
        const result = await connection.client.readResource({ uri: params.uri });
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              server: params.server,
              uri: params.uri,
              contents: result.contents
            }, null, 2)
          }],
          details: {
            server: params.server,
            uri: params.uri,
            contents: result.contents
          }
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "读取资源失败";
        return {
          content: [{ type: "text", text: JSON.stringify({ server: params.server, uri: params.uri, error: message }, null, 2) }],
          details: { server: params.server, uri: params.uri, contents: [], error: message }
        };
      }
    }
  };
  const listMcpResourceTemplatesTool = {
    name: "list_mcp_resource_templates",
    label: "列出 MCP 资源模板",
    description: "列出已连接 MCP server 暴露的资源模板。",
    parameters: listMcpResourceTemplatesParameters,
    async execute(_toolCallId, params) {
      const connections = getConnectionsForServer(manager, params.server);
      if (connections.length === 0) {
        return {
          content: [{ type: "text", text: JSON.stringify({ templates: [], error: "当前没有可用的 MCP 资源模板服务。" }, null, 2) }],
          details: { templates: [] }
        };
      }
      const templates = [];
      for (const connection of connections) {
        try {
          const result = await connection.client.listResourceTemplates();
          templates.push(
            ...result.resourceTemplates.map((template) => ({
              server: connection.name,
              uriTemplate: template.uriTemplate,
              name: template.name,
              description: template.description,
              mimeType: template.mimeType
            }))
          );
        } catch {
        }
      }
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            templates,
            count: templates.length
          }, null, 2)
        }],
        details: { templates }
      };
    }
  };
  return [
    listMcpResourcesTool,
    {
      ...listMcpResourcesTool,
      name: "ListMcpResources",
      label: "列出 MCP 资源",
      async execute(toolCallId, params) {
        return listMcpResourcesTool.execute(toolCallId, params);
      }
    },
    readMcpResourceTool,
    {
      ...readMcpResourceTool,
      name: "ReadMcpResource",
      label: "读取 MCP 资源",
      async execute(toolCallId, params) {
        return readMcpResourceTool.execute(toolCallId, params);
      }
    },
    listMcpResourceTemplatesTool
  ];
}
const MAX_MCP_RESULT_CHARS = 24e3;
const MAX_MCP_LIST_ITEMS = 80;
const MCP_NAME_PATTERN$1 = /^[A-Za-z0-9_.:-]{1,96}$/;
const mcpBrokerParameters = Type.Object({
  action: Type.Union([
    Type.Literal("list"),
    Type.Literal("call")
  ], { description: "list 枚举 MCP 工具；call 调用 MCP 工具" }),
  server: Type.Optional(Type.String({ description: "MCP server 名" })),
  tool: Type.Optional(Type.String({ description: "MCP 工具名" })),
  query: Type.Optional(Type.String({ description: "list 时按工具名或描述过滤" })),
  includeSchema: Type.Optional(Type.Boolean({ description: "list 时是否包含压缩后的 inputSchema，默认 true" })),
  args: Type.Optional(Type.Any({ description: "调用 MCP 工具时传入的 JSON 参数" }))
});
function compactDescription(value, maxLength = 240) {
  const normalized = value?.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return void 0;
  }
  return normalized.length <= maxLength ? normalized : normalized.slice(0, maxLength - 1).trimEnd() + "…";
}
function normalizeMcpName$1(value) {
  const normalized = value?.trim();
  if (!normalized || !MCP_NAME_PATTERN$1.test(normalized)) {
    return null;
  }
  return normalized;
}
function truncateText(text, maxLength = MAX_MCP_RESULT_CHARS) {
  if (text.length <= maxLength) {
    return { text, truncated: false };
  }
  return {
    text: `${text.slice(0, maxLength).trimEnd()}

[内容已截断，原始长度 ${text.length} 字符]`,
    truncated: true
  };
}
function safeJsonStringify(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
function compactSchema(schema) {
  if (!schema || typeof schema !== "object") {
    return schema;
  }
  const source = schema;
  if (!source.properties || typeof source.properties !== "object") {
    return {
      type: source.type,
      required: Array.isArray(source.required) ? source.required : void 0
    };
  }
  const properties = Object.fromEntries(
    Object.entries(source.properties).map(([name, property]) => [
      name,
      {
        type: property.type,
        description: compactDescription(property.description, 120)
      }
    ])
  );
  return {
    type: source.type,
    required: Array.isArray(source.required) ? source.required : void 0,
    properties
  };
}
async function listMcpTools(manager, options) {
  const query = options.query?.replace(/\s+/g, " ").trim().toLowerCase();
  const connections = getConnectionsForServer(manager, options.server);
  const tools = [];
  for (const connection of connections) {
    try {
      const result = await connection.client.listTools();
      tools.push(
        ...result.tools.map((tool) => ({
          server: connection.name,
          name: tool.name,
          description: compactDescription(tool.description),
          inputSchema: options.includeSchema ? compactSchema(tool.inputSchema) : void 0
        })).filter((tool) => {
          if (!query) {
            return true;
          }
          return [
            tool.server,
            tool.name,
            tool.description ?? ""
          ].join(" ").toLowerCase().includes(query);
        })
      );
    } catch {
      tools.push({
        server: connection.name,
        name: "__list_failed__",
        description: "该 MCP server 的 tools/list 调用失败。"
      });
    }
  }
  return {
    tools: tools.slice(0, MAX_MCP_LIST_ITEMS),
    total: tools.length,
    truncated: tools.length > MAX_MCP_LIST_ITEMS
  };
}
function stringifyMcpResult(result) {
  if (result && typeof result === "object" && "content" in result && Array.isArray(result.content)) {
    const textParts = [];
    for (const block of result.content) {
      if (block.type === "text" && block.text) {
        textParts.push(block.text);
      }
    }
    if (textParts.length > 0) {
      return textParts.join("\n");
    }
  }
  return safeJsonStringify(result);
}
function getMcpBrokerTool(manager) {
  return {
    name: "mcp",
    label: "MCP",
    description: "单工具 MCP 代理。先用 action=list 查看已连接 server 的工具，再用 action=call 调用指定 server/tool，适合 MCP 工具很多时减少上下文占用。",
    parameters: mcpBrokerParameters,
    async execute(_toolCallId, params) {
      const action = params.action;
      const server2 = normalizeMcpName$1(params.server);
      if (params.server?.trim() && !server2) {
        return {
          content: [{ type: "text", text: "MCP server 名格式无效。" }],
          details: { action, server: params.server, error: "invalid_server" }
        };
      }
      if (action === "list") {
        const result = await listMcpTools(manager, {
          server: server2 ?? void 0,
          query: params.query,
          includeSchema: params.includeSchema ?? true
        });
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              tools: result.tools,
              count: result.tools.length,
              total: result.total,
              truncated: result.truncated
            }, null, 2)
          }],
          details: {
            action,
            server: server2 ?? void 0,
            count: result.tools.length,
            truncated: result.truncated
          }
        };
      }
      const requestedTool = normalizeMcpName$1(params.tool);
      if (!requestedTool) {
        return {
          content: [{ type: "text", text: "调用 MCP 工具需要提供格式有效的 tool。" }],
          details: { action, server: server2 ?? void 0, error: "missing_or_invalid_tool" }
        };
      }
      if (!server2) {
        return {
          content: [{ type: "text", text: "调用 MCP 工具需要显式提供 server。" }],
          details: { action, tool: requestedTool, error: "missing_server" }
        };
      }
      const connections = getConnectionsForServer(manager, server2);
      const matches = [];
      for (const connection2 of connections) {
        try {
          const result = await connection2.client.listTools();
          if (result.tools.some((tool) => tool.name === requestedTool)) {
            matches.push(connection2);
          }
        } catch {
          continue;
        }
      }
      if (matches.length === 0) {
        return {
          content: [{ type: "text", text: `未找到 MCP 工具：${requestedTool}` }],
          details: {
            action,
            server: params.server,
            tool: requestedTool,
            error: "tool_not_found"
          }
        };
      }
      const connection = matches[0];
      try {
        const result = await connection.client.callTool({
          name: requestedTool,
          arguments: params.args ?? {}
        });
        const isError = "isError" in result ? Boolean(result.isError) : false;
        const output = truncateText(stringifyMcpResult(result));
        return {
          content: [{ type: "text", text: output.text }],
          details: {
            action,
            server: connection.name,
            tool: requestedTool,
            isError,
            truncated: output.truncated
          }
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "MCP 调用失败";
        return {
          content: [{ type: "text", text: `MCP 工具调用失败: ${message}` }],
          details: {
            action,
            server: connection.name,
            tool: requestedTool,
            error: message
          }
        };
      }
    }
  };
}
const MAX_HISTORY_ENTRIES = 200;
const commandHistoryParameters = Type.Object({
  limit: Type.Optional(Type.Number({ description: "返回最近命令数量，默认 20，上限 100" })),
  query: Type.Optional(Type.String({ description: "按命令内容过滤" })),
  failedOnly: Type.Optional(Type.Boolean({ description: "只返回失败命令" }))
});
const commandHistory = [];
const SENSITIVE_COMMAND_PATTERNS = [
  [/(api[_-]?key|token|secret|password|passwd|pwd)=("[^"]*"|'[^']*'|[^\s]+)/gi, "$1=[redacted]"],
  [/--(api[_-]?key|token|secret|password|passwd|pwd)(=|\s+)("[^"]*"|'[^']*'|[^\s]+)/gi, "--$1$2[redacted]"],
  [/(bearer\s+)[A-Za-z0-9._~+/=-]{12,}/gi, "$1[redacted]"],
  [/(sk-[A-Za-z0-9_-]{8})[A-Za-z0-9_-]+/g, "$1[redacted]"]
];
function getString(value) {
  return typeof value === "string" && value.trim() ? value : null;
}
function getNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function redactSensitiveCommand(command) {
  return SENSITIVE_COMMAND_PATTERNS.reduce(
    (current, [pattern, replacement]) => current.replace(pattern, replacement),
    command
  );
}
function getShellResultDetails(result) {
  if (!result || typeof result !== "object" || !("details" in result)) {
    return {};
  }
  const details = result.details;
  return details && typeof details === "object" ? details : {};
}
function loadTranscriptCommandHistory(sessionId) {
  const started = /* @__PURE__ */ new Map();
  const entries = [];
  for (const event of loadTranscript(sessionId)) {
    if (event.type === "tool_started" && event.toolName === "shell_exec") {
      const command = getString(event.args.command);
      if (command) {
        started.set(event.stepId, {
          command,
          cwd: getString(event.args.cwd) ?? "",
          createdAt: event.timestamp
        });
      }
      continue;
    }
    if (event.type === "tool_finished" && event.toolName === "shell_exec") {
      const firstSeen = started.get(event.stepId);
      const details = getShellResultDetails(event.result);
      const command = getString(details.command) ?? firstSeen?.command;
      if (!command) {
        continue;
      }
      entries.push({
        id: `cmd-${event.stepId}`,
        sessionId,
        command,
        cwd: getString(details.cwd) ?? firstSeen?.cwd ?? "",
        exitCode: getNumber(details.exitCode) ?? (event.error ? -1 : 0),
        durationMs: getNumber(details.durationMs) ?? 0,
        createdAt: event.timestamp
      });
    }
  }
  return entries.reverse();
}
function entryKey(entry) {
  return [
    entry.sessionId,
    entry.command,
    entry.cwd,
    entry.exitCode,
    Math.round(entry.durationMs / 100)
  ].join("\0");
}
function listCommandHistory(sessionId) {
  const seen = /* @__PURE__ */ new Set();
  const entries = [];
  for (const entry of [
    ...commandHistory.filter((item) => item.sessionId === sessionId),
    ...loadTranscriptCommandHistory(sessionId)
  ]) {
    const key = entryKey(entry);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    entries.push(entry);
  }
  return entries.sort(
    (left, right) => right.createdAt.localeCompare(left.createdAt)
  );
}
function recordShellCommand(entry) {
  commandHistory.unshift({
    ...entry,
    id: `cmd-${randomUUID()}`,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  });
  if (commandHistory.length > MAX_HISTORY_ENTRIES) {
    commandHistory.splice(MAX_HISTORY_ENTRIES);
  }
}
function createCommandHistoryTool(sessionId) {
  return {
    name: "command_history",
    label: "命令历史",
    description: "读取当前线程最近通过 shell_exec 执行过的命令、退出码和耗时。",
    parameters: commandHistoryParameters,
    async execute(_toolCallId, params) {
      const limit = Math.max(1, Math.min(params.limit ?? 20, 100));
      const query = params.query?.replace(/\s+/g, " ").trim().toLowerCase();
      const entries = listCommandHistory(sessionId).filter((entry) => {
        if (params.failedOnly && entry.exitCode === 0) {
          return false;
        }
        if (!query) {
          return true;
        }
        return entry.command.toLowerCase().includes(query);
      }).slice(0, limit).map((entry) => ({
        ...entry,
        command: redactSensitiveCommand(entry.command)
      }));
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            entries,
            count: entries.length
          }, null, 2)
        }],
        details: {
          count: entries.length,
          entries
        }
      };
    }
  };
}
const parameters$9 = Type.Object({});
const getTimeTool = {
  name: "get_time",
  label: "Get Time",
  description: "Get the current local time for the running environment.",
  parameters: parameters$9,
  async execute(_toolCallId, _params) {
    const now = /* @__PURE__ */ new Date();
    const timeZone = resolveConfiguredTimeZone(getSettings().timeZone);
    const localTime = formatDateTimeInTimeZone(now, timeZone);
    return {
      content: [
        {
          type: "text",
          text: `当前本地时间是 ${localTime}，时区是 ${timeZone}。`
        }
      ],
      details: {
        isoTime: now.toISOString(),
        localTime,
        timeZone
      }
    };
  }
};
const DANGEROUS_COMMAND_PATTERNS = [
  /\brm\s+(-rf?|--recursive)\s+[\/~]/,
  /\bmkfs\b/,
  /\bdd\b.*\bof=/,
  /\b(shutdown|reboot|halt|poweroff)\b/,
  /\bchmod\s+777\b/,
  />\s*\/dev\/sd/,
  /\bcurl\b.*\|\s*(bash|sh)\b/,
  /\bwget\b.*\|\s*(bash|sh)\b/,
  /\bnpm\s+publish\b/,
  /\bgit\s+push\s+.*--force\b/,
  /\bgit\s+reset\s+--hard\b/
];
const SAFE_COMMAND_PATTERNS = [
  /^(ls|dir|pwd|echo|cat|head|tail|wc|which|where|type)\b/,
  /^git\s+(status|log|diff|branch|show|rev-parse|remote)\b/,
  /^(node|npx|pnpm|npm|yarn)\s+(--version|-v)\b/,
  /^(pnpm|npm|yarn)\s+(list|ls|why|outdated)\b/,
  /^(pnpm|npm|yarn)\s+(run|exec)\s/,
  /^(pnpm|npm|yarn)\s+(install|add|remove)\b/,
  /^(tsc|eslint|prettier|vitest|jest)\b/
];
const FORBIDDEN_FILE_PATTERNS = [
  "**/.env",
  "**/.env.*",
  "**/credentials.json",
  "**/*.pem",
  "**/*.key",
  "**/id_rsa*",
  "**/.git/config"
];
const FORBIDDEN_WRITE_DIRS = [
  "node_modules",
  ".git"
];
const FETCH_POLICY = {
  allowedSchemes: ["http", "https"],
  blockedHostPatterns: [
    /^localhost$/,
    /^127\.0\.0\.1$/,
    /^0\.0\.0\.0$/,
    /^10\./,
    /^192\.168\./,
    /^172\.(1[6-9]|2\d|3[01])\./
  ],
  maxResponseSizeBytes: 5 * 1024 * 1024,
  timeoutMs: 15e3
};
function isPathAllowed(targetPath, workspacePath) {
  const resolved = path.resolve(targetPath);
  const wsResolved = path.resolve(workspacePath);
  return resolved.startsWith(wsResolved + path.sep) || resolved === wsResolved;
}
function isPathForbiddenRead(targetPath) {
  const normalized = targetPath.replace(/\\/g, "/");
  return FORBIDDEN_FILE_PATTERNS.some((pattern) => {
    const regex = pattern.replace(/\*\*\//g, "(.*/)?").replace(/\*/g, "[^/]*").replace(/\./g, "\\.");
    return new RegExp(`(^|/)${regex}$`).test(normalized);
  });
}
function isWritePathForbidden(targetPath) {
  const normalized = targetPath.replace(/\\/g, "/");
  return FORBIDDEN_WRITE_DIRS.some(
    (dir) => normalized.includes(`/${dir}/`) || normalized.endsWith(`/${dir}`)
  );
}
function checkShellCommand(command) {
  for (const pattern of DANGEROUS_COMMAND_PATTERNS) {
    if (pattern.test(command)) {
      return {
        allowed: false,
        reason: `该命令被安全策略拦截（匹配危险命令模式）`,
        needsConfirmation: false
      };
    }
  }
  for (const pattern of SAFE_COMMAND_PATTERNS) {
    if (pattern.test(command)) {
      return { allowed: true, needsConfirmation: false };
    }
  }
  return { allowed: true, needsConfirmation: true };
}
function checkFetchUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { allowed: false, reason: "无效的 URL" };
  }
  const scheme = parsed.protocol.replace(":", "");
  if (!FETCH_POLICY.allowedSchemes.includes(scheme)) {
    return { allowed: false, reason: `不允许的协议: ${scheme}` };
  }
  const hostname = parsed.hostname;
  for (const pattern of FETCH_POLICY.blockedHostPatterns) {
    if (pattern.test(hostname)) {
      return { allowed: false, reason: `不允许访问内网地址: ${hostname}` };
    }
  }
  return { allowed: true };
}
const BINARY_EXTENSIONS = /* @__PURE__ */ new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".bmp",
  ".pdf",
  ".zip",
  ".tar",
  ".gz",
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".wasm",
  ".jar",
  ".ttf",
  ".woff",
  ".woff2"
]);
const DEFAULT_IGNORED_DIRS = /* @__PURE__ */ new Set([
  ".git",
  "node_modules",
  "dist",
  "out"
]);
function escapeRegExp$1(value) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}
function resolveWorkspacePath$1(workspacePath, targetPath) {
  return path.isAbsolute(targetPath) ? targetPath : path.resolve(workspacePath, targetPath);
}
function toRelativeWorkspacePath(workspacePath, targetPath) {
  const relativePath = path.relative(workspacePath, targetPath);
  return relativePath.split(path.sep).join("/");
}
function isTextFile(filePath) {
  return !BINARY_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}
function readTextFileSafe(filePath) {
  if (!isTextFile(filePath)) {
    return null;
  }
  const buffer = fs.readFileSync(filePath);
  if (buffer.includes(0)) {
    return null;
  }
  return buffer.toString("utf-8");
}
function globToRegExp(pattern) {
  const normalized = pattern.trim().replace(/\\/g, "/");
  if (!normalized || normalized === "**") {
    return /^.*$/;
  }
  let regex = "";
  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    const nextChar = normalized[index + 1];
    const afterNextChar = normalized[index + 2];
    if (char === "*" && nextChar === "*" && afterNextChar === "/") {
      regex += "(?:.*/)?";
      index += 2;
      continue;
    }
    if (char === "*" && nextChar === "*") {
      regex += ".*";
      index += 1;
      continue;
    }
    if (char === "*") {
      regex += "[^/]*";
      continue;
    }
    if (char === "?") {
      regex += "[^/]";
      continue;
    }
    regex += escapeRegExp$1(char);
  }
  return new RegExp(`^${regex}$`);
}
function resolveWorkspaceBasePath(workspacePath, targetPath) {
  if (!targetPath?.trim()) {
    return workspacePath;
  }
  return resolveWorkspacePath$1(workspacePath, targetPath);
}
function collectWorkspaceFileEntries(workspacePath, basePath, options) {
  const matches = [];
  const pattern = options?.pattern?.trim();
  const maxResults = Math.max(1, Math.min(options?.maxResults ?? 200, 2e3));
  const includeHidden = options?.includeHidden ?? false;
  const patternMatcher = pattern ? globToRegExp(pattern) : null;
  const walk = (dirPath) => {
    if (matches.length >= maxResults) {
      return;
    }
    let entries = [];
    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (matches.length >= maxResults) {
        return;
      }
      if (!includeHidden && entry.name.startsWith(".")) {
        if (entry.isDirectory() && !DEFAULT_IGNORED_DIRS.has(entry.name)) {
          continue;
        }
        if (!entry.isDirectory()) {
          continue;
        }
      }
      const absolutePath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        if (DEFAULT_IGNORED_DIRS.has(entry.name)) {
          continue;
        }
        walk(absolutePath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      if (!isPathAllowed(absolutePath, workspacePath) || isPathForbiddenRead(absolutePath)) {
        continue;
      }
      const relativePath = toRelativeWorkspacePath(workspacePath, absolutePath);
      if (patternMatcher && !patternMatcher.test(relativePath)) {
        continue;
      }
      let mtimeMs = 0;
      try {
        mtimeMs = fs.statSync(absolutePath).mtimeMs;
      } catch {
        mtimeMs = 0;
      }
      matches.push({
        absolutePath,
        relativePath,
        mtimeMs
      });
    }
  };
  if (!fs.existsSync(basePath)) {
    return [];
  }
  const stat2 = fs.statSync(basePath);
  if (stat2.isFile()) {
    if (isPathAllowed(basePath, workspacePath) && !isPathForbiddenRead(basePath)) {
      const relativePath = toRelativeWorkspacePath(workspacePath, basePath);
      if (!patternMatcher || patternMatcher.test(relativePath)) {
        matches.push({
          absolutePath: basePath,
          relativePath,
          mtimeMs: stat2.mtimeMs
        });
      }
    }
    return matches;
  }
  walk(basePath);
  return matches;
}
const parameters$8 = Type.Object({
  path: Type.String({ description: "文件路径（相对于 workspace 或绝对路径）" }),
  old_string: Type.Optional(Type.String({ description: "要替换的原始文本" })),
  new_string: Type.Optional(Type.String({ description: "替换后的文本" })),
  replace_all: Type.Optional(Type.Boolean({ description: "是否替换全部匹配，默认 false" })),
  oldText: Type.Optional(Type.String({ description: "兼容参数：旧版 oldText" })),
  newText: Type.Optional(Type.String({ description: "兼容参数：旧版 newText" })),
  replaceAll: Type.Optional(Type.Boolean({ description: "兼容参数：旧版 replaceAll" }))
});
function normalizePatch(originalPath, original, updated) {
  const patch = createTwoFilesPatch(
    originalPath,
    originalPath,
    original,
    updated,
    "original",
    "updated",
    { context: 3 }
  );
  const parsed = parsePatch(patch);
  return parsed.flatMap(
    (entry) => entry.hunks.map((hunk) => ({
      oldStart: hunk.oldStart,
      oldLines: hunk.oldLines,
      newStart: hunk.newStart,
      newLines: hunk.newLines,
      lines: hunk.lines
    }))
  );
}
function createFileEditTool(workspacePath) {
  return {
    name: "file_edit",
    label: "编辑文件",
    description: "对已有文本文件做精确替换。默认只替换首个匹配，可选 replace_all。",
    parameters: parameters$8,
    async execute(_toolCallId, params) {
      const filePath = resolveWorkspacePath$1(workspacePath, params.path);
      const oldString = params.old_string ?? params.oldText ?? "";
      const newString = params.new_string ?? params.newText ?? "";
      const replaceAll = params.replace_all ?? params.replaceAll ?? false;
      if (!isPathAllowed(filePath, workspacePath)) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "路径超出 workspace 范围。" }, null, 2) }],
          details: {
            filePath,
            oldString,
            newString,
            originalFile: "",
            structuredPatch: [],
            userModified: false,
            replaceAll,
            gitDiff: null
          }
        };
      }
      if (isWritePathForbidden(filePath)) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "该目录受写保护。" }, null, 2) }],
          details: {
            filePath,
            oldString,
            newString,
            originalFile: "",
            structuredPatch: [],
            userModified: false,
            replaceAll,
            gitDiff: null
          }
        };
      }
      if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "目标文件不存在或不是普通文件。" }, null, 2) }],
          details: {
            filePath,
            oldString,
            newString,
            originalFile: "",
            structuredPatch: [],
            userModified: false,
            replaceAll,
            gitDiff: null
          }
        };
      }
      if (!oldString.length) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "old_string 不能为空。" }, null, 2) }],
          details: {
            filePath,
            oldString,
            newString,
            originalFile: "",
            structuredPatch: [],
            userModified: false,
            replaceAll,
            gitDiff: null
          }
        };
      }
      if (oldString === newString) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "old_string 和 new_string 不能相同。" }, null, 2) }],
          details: {
            filePath,
            oldString,
            newString,
            originalFile: "",
            structuredPatch: [],
            userModified: false,
            replaceAll,
            gitDiff: null
          }
        };
      }
      const originalFile = readTextFileSafe(filePath);
      if (originalFile === null) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "该文件不是可安全编辑的文本文件。" }, null, 2) }],
          details: {
            filePath,
            oldString,
            newString,
            originalFile: "",
            structuredPatch: [],
            userModified: false,
            replaceAll,
            gitDiff: null
          }
        };
      }
      if (!originalFile.includes(oldString)) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "old_string 未在文件中命中。" }, null, 2) }],
          details: {
            filePath,
            oldString,
            newString,
            originalFile,
            structuredPatch: [],
            userModified: false,
            replaceAll,
            gitDiff: null
          }
        };
      }
      const updated = replaceAll ? originalFile.replaceAll(oldString, newString) : originalFile.replace(oldString, newString);
      fs.writeFileSync(filePath, updated, "utf-8");
      const details = {
        filePath,
        oldString,
        newString,
        originalFile,
        structuredPatch: normalizePatch(filePath, originalFile, updated),
        userModified: false,
        replaceAll,
        gitDiff: null
      };
      return {
        content: [{ type: "text", text: JSON.stringify(details, null, 2) }],
        details
      };
    }
  };
}
const parameters$7 = Type.Object({
  path: Type.String({ description: "文件路径（相对于 workspace 或绝对路径）" }),
  offset: Type.Optional(Type.Number({ description: "从第几行开始读（默认 1）" })),
  limit: Type.Optional(Type.Number({ description: "读多少行（默认 200）" }))
});
function createFileReadTool(workspacePath) {
  return {
    name: "file_read",
    label: "读取文件",
    description: "读取本地文件内容。返回指定行范围的文本，用于查看代码、配置等文件。",
    parameters: parameters$7,
    async execute(_toolCallId, params) {
      const filePath = path.isAbsolute(params.path) ? params.path : path.resolve(workspacePath, params.path);
      if (!isPathAllowed(filePath, workspacePath)) {
        return {
          content: [{ type: "text", text: `路径超出 workspace 范围: ${params.path}` }],
          details: { path: params.path, totalLines: 0, readRange: { from: 0, to: 0 }, truncated: false }
        };
      }
      if (isPathForbiddenRead(filePath)) {
        return {
          content: [{ type: "text", text: `该文件包含敏感信息，不允许读取: ${params.path}` }],
          details: { path: params.path, totalLines: 0, readRange: { from: 0, to: 0 }, truncated: false }
        };
      }
      if (!fs.existsSync(filePath)) {
        return {
          content: [{ type: "text", text: `文件不存在: ${params.path}` }],
          details: { path: params.path, totalLines: 0, readRange: { from: 0, to: 0 }, truncated: false }
        };
      }
      const stat2 = fs.statSync(filePath);
      if (!stat2.isFile()) {
        return {
          content: [{ type: "text", text: `${params.path} 不是文件` }],
          details: { path: params.path, totalLines: 0, readRange: { from: 0, to: 0 }, truncated: false }
        };
      }
      const ext = path.extname(filePath).toLowerCase();
      const binaryExts = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".bmp", ".pdf", ".zip", ".tar", ".gz", ".exe", ".dll", ".so", ".dylib", ".wasm"];
      if (binaryExts.includes(ext)) {
        const sizeKB = (stat2.size / 1024).toFixed(1);
        return {
          content: [{ type: "text", text: `这是一个二进制文件（${ext}，${sizeKB}KB），无法以文本形式读取。` }],
          details: { path: params.path, totalLines: 0, readRange: { from: 0, to: 0 }, truncated: false }
        };
      }
      const raw = fs.readFileSync(filePath, "utf-8");
      const allLines = raw.split("\n");
      const totalLines = allLines.length;
      const offset = Math.max(1, params.offset ?? 1);
      const limit = Math.min(500, params.limit ?? 200);
      const from = offset;
      const to = Math.min(offset + limit - 1, totalLines);
      const truncated = to < totalLines;
      const selectedLines = allLines.slice(from - 1, to);
      const numbered = selectedLines.map((line, i) => `${from + i}  ${line}`).join("\n");
      const header = `文件: ${params.path}（第 ${from}-${to} 行，共 ${totalLines} 行）

`;
      const footer = truncated ? `

[文件共 ${totalLines} 行，当前显示第 ${from}-${to} 行。如需查看更多，请指定 offset 和 limit]` : "";
      return {
        content: [{ type: "text", text: header + numbered + footer }],
        details: { path: params.path, totalLines, readRange: { from, to }, truncated }
      };
    }
  };
}
const parameters$6 = Type.Object({
  path: Type.String({ description: "文件路径（相对于 workspace 或绝对路径）" }),
  content: Type.String({ description: "要写入的内容" }),
  mode: Type.Optional(Type.Union([
    Type.Literal("overwrite"),
    Type.Literal("append")
  ], { description: "覆盖还是追加（默认 overwrite）" }))
});
function createFileWriteTool(workspacePath) {
  return {
    name: "file_write",
    label: "写入文件",
    description: "创建或写入本地文件。可以覆盖或追加内容。",
    parameters: parameters$6,
    async execute(_toolCallId, params) {
      const filePath = path.isAbsolute(params.path) ? params.path : path.resolve(workspacePath, params.path);
      if (!isPathAllowed(filePath, workspacePath)) {
        return {
          content: [{ type: "text", text: `路径超出 workspace 范围: ${params.path}` }],
          details: { path: params.path, size: 0, isNew: false, newContent: params.content }
        };
      }
      if (isWritePathForbidden(filePath)) {
        return {
          content: [{ type: "text", text: `不允许写入该目录: ${params.path}` }],
          details: { path: params.path, size: 0, isNew: false, newContent: params.content }
        };
      }
      const mode = params.mode ?? "overwrite";
      const exists = fs.existsSync(filePath);
      let previousContent;
      if (exists) {
        try {
          previousContent = fs.readFileSync(filePath, "utf-8");
        } catch {
        }
      }
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      if (mode === "append") {
        fs.appendFileSync(filePath, params.content, "utf-8");
      } else {
        fs.writeFileSync(filePath, params.content, "utf-8");
      }
      const stat2 = fs.statSync(filePath);
      const isNew = !exists;
      const text = isNew ? `文件已创建: ${params.path}（${stat2.size} 字节）` : mode === "append" ? `文件已追加: ${params.path}（${stat2.size} 字节）` : `文件已更新: ${params.path}（${previousContent?.length ?? 0} → ${stat2.size} 字节）`;
      return {
        content: [{ type: "text", text }],
        details: {
          path: params.path,
          size: stat2.size,
          isNew,
          previousContent,
          newContent: params.content
        }
      };
    }
  };
}
function resolveRipgrepCommand() {
  return fs.existsSync(rgPath) ? rgPath : "rg";
}
const execFileAsync$1 = promisify(execFile);
const parameters$5 = Type.Object({
  pattern: Type.String({ description: "glob 模式，例如 **/*.ts" }),
  path: Type.Optional(Type.String({ description: "可选搜索根目录，默认 workspace 根目录" })),
  maxResults: Type.Optional(Type.Number({ description: "最多返回多少个结果，默认 100" })),
  includeHidden: Type.Optional(Type.Boolean({ description: "是否包含隐藏文件，默认 false" }))
});
function createFallbackResult(workspacePath, basePath, pattern, maxResults, includeHidden, startedAt) {
  const entries = collectWorkspaceFileEntries(workspacePath, basePath, {
    pattern,
    includeHidden,
    maxResults: Math.max(maxResults * 4, maxResults + 1)
  }).sort((left, right) => right.mtimeMs - left.mtimeMs);
  const truncated = entries.length > maxResults;
  const filenames = entries.slice(0, maxResults).map((entry) => entry.relativePath);
  return {
    durationMs: Date.now() - startedAt,
    numFiles: filenames.length,
    filenames,
    truncated
  };
}
async function runRipgrepGlob(workspacePath, basePath, pattern, maxResults, includeHidden, startedAt) {
  const rgBasePath = path.relative(workspacePath, basePath) || ".";
  const args = ["--files", rgBasePath, "-g", pattern];
  if (includeHidden) {
    args.push("--hidden");
  }
  const result = await execFileAsync$1(resolveRipgrepCommand(), args, {
    cwd: workspacePath,
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
    encoding: "utf8"
  });
  const paths = (result.stdout ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean).filter((filePath) => {
    const normalized = filePath.replace(/\//g, "\\");
    return !normalized.includes("\\.git\\");
  });
  const entries = paths.map((filePath) => {
    const absolutePath = resolveWorkspaceBasePath(workspacePath, filePath);
    if (!fs.existsSync(absolutePath) || !isPathAllowed(absolutePath, workspacePath) || isPathForbiddenRead(absolutePath)) {
      return null;
    }
    let mtimeMs = 0;
    try {
      mtimeMs = fs.statSync(absolutePath).mtimeMs;
    } catch {
      mtimeMs = 0;
    }
    return {
      relativePath: toRelativeWorkspacePath(workspacePath, absolutePath),
      mtimeMs
    };
  }).filter((entry) => !!entry).sort((left, right) => right.mtimeMs - left.mtimeMs);
  const truncated = entries.length > maxResults;
  const filenames = entries.slice(0, maxResults).map((entry) => entry.relativePath);
  return {
    durationMs: Date.now() - startedAt,
    numFiles: filenames.length,
    filenames,
    truncated
  };
}
function createGlobSearchTool(workspacePath) {
  return {
    name: "glob_search",
    label: "匹配文件",
    description: "按 glob 模式快速找文件。优先走原生 ripgrep，速度更稳。",
    parameters: parameters$5,
    async execute(_toolCallId, params) {
      const startedAt = Date.now();
      const maxResults = Math.max(1, Math.min(params.maxResults ?? 100, 500));
      const includeHidden = params.includeHidden ?? false;
      const basePath = resolveWorkspaceBasePath(workspacePath, params.path);
      if (!isPathAllowed(basePath, workspacePath)) {
        const details2 = {
          durationMs: Date.now() - startedAt,
          numFiles: 0,
          filenames: [],
          truncated: false
        };
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "路径超出 workspace 范围。" }, null, 2) }],
          details: details2
        };
      }
      let details;
      try {
        details = await runRipgrepGlob(
          workspacePath,
          basePath,
          params.pattern,
          maxResults,
          includeHidden,
          startedAt
        );
      } catch {
        details = createFallbackResult(
          workspacePath,
          basePath,
          params.pattern,
          maxResults,
          includeHidden,
          startedAt
        );
      }
      return {
        content: [{ type: "text", text: JSON.stringify(details, null, 2) }],
        details
      };
    }
  };
}
const execFileAsync = promisify(execFile);
const parameters$4 = Type.Object({
  pattern: Type.Optional(Type.String({ description: "要搜索的模式；默认按正则解释" })),
  query: Type.Optional(Type.String({ description: "兼容参数：旧版 literal 搜索词" })),
  path: Type.Optional(Type.String({ description: "可选搜索根目录，默认 workspace 根目录" })),
  glob: Type.Optional(Type.String({ description: "可选 glob 过滤，例如 src/**/*.ts" })),
  filePattern: Type.Optional(Type.String({ description: "兼容参数：旧版 glob 过滤" })),
  output_mode: Type.Optional(Type.String({ description: "files_with_matches | content | count" })),
  regex: Type.Optional(Type.Boolean({ description: "兼容参数：旧版是否按正则处理 query" })),
  caseSensitive: Type.Optional(Type.Boolean({ description: "兼容参数：旧版是否区分大小写" })),
  "-B": Type.Optional(Type.Number({ description: "前文行数" })),
  "-A": Type.Optional(Type.Number({ description: "后文行数" })),
  "-C": Type.Optional(Type.Number({ description: "上下文行数" })),
  context: Type.Optional(Type.Number({ description: "上下文行数" })),
  "-n": Type.Optional(Type.Boolean({ description: "是否显示行号" })),
  "-i": Type.Optional(Type.Boolean({ description: "是否忽略大小写" })),
  type: Type.Optional(Type.String({ description: "文件类型，例如 ts / rs / py" })),
  head_limit: Type.Optional(Type.Number({ description: "最多返回多少条，默认 250" })),
  offset: Type.Optional(Type.Number({ description: "从第几条开始截取，默认 0" })),
  multiline: Type.Optional(Type.Boolean({ description: "是否启用 multiline" })),
  maxResults: Type.Optional(Type.Number({ description: "兼容参数：旧版最大结果数" }))
});
function toSafeInteger(value, fallback) {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback;
}
function sliceItems(items, offset, limit) {
  const sliced = items.slice(offset, offset + limit);
  return {
    items: sliced,
    appliedLimit: items.length > offset + limit ? limit : null,
    appliedOffset: offset > 0 ? offset : null
  };
}
function normalizeMode(value) {
  switch (value) {
    case "content":
    case "count":
      return value;
    default:
      return "files_with_matches";
  }
}
function normalizePattern(params) {
  const query = typeof params.query === "string" ? params.query.trim() : "";
  const pattern = typeof params.pattern === "string" ? params.pattern.trim() : "";
  const regex = params.regex === true;
  const caseSensitive = params.caseSensitive === true;
  const caseInsensitive = params["-i"] === true || !caseSensitive && !params["-i"];
  if (query) {
    return {
      pattern: query,
      fixedStrings: !regex,
      caseInsensitive
    };
  }
  return {
    pattern,
    fixedStrings: false,
    caseInsensitive
  };
}
async function runRipgrep(workspacePath, args) {
  const result = await execFileAsync(resolveRipgrepCommand(), args, {
    cwd: workspacePath,
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
    encoding: "utf8"
  });
  return result.stdout ?? "";
}
function normalizeRipgrepPath(workspacePath, rawPath) {
  const trimmed = rawPath.trim();
  if (!trimmed) {
    return trimmed;
  }
  return toRelativeWorkspacePath(workspacePath, path.resolve(workspacePath, trimmed));
}
function extractFilenameFromContentLine(workspacePath, line) {
  const matchLine = line.match(/^(.+?):(\d+):/);
  if (matchLine?.[1]) {
    return normalizeRipgrepPath(workspacePath, matchLine[1]);
  }
  const contextLine = line.match(/^(.+?)-(\d+)-/);
  if (contextLine?.[1]) {
    return normalizeRipgrepPath(workspacePath, contextLine[1]);
  }
  return null;
}
function createGrepSearchTool(workspacePath) {
  return {
    name: "grep_search",
    label: "文本搜索",
    description: "在 workspace 中做高性能全文搜索。优先走原生 ripgrep。",
    parameters: parameters$4,
    async execute(_toolCallId, params) {
      const normalized = normalizePattern(params);
      if (!normalized.pattern) {
        const details2 = {
          mode: "files_with_matches",
          numFiles: 0,
          filenames: [],
          content: null,
          numLines: null,
          numMatches: null,
          appliedLimit: null,
          appliedOffset: null
        };
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "pattern 不能为空。" }, null, 2) }],
          details: details2
        };
      }
      const basePath = resolveWorkspaceBasePath(workspacePath, params.path);
      if (!isPathAllowed(basePath, workspacePath)) {
        const details2 = {
          mode: "files_with_matches",
          numFiles: 0,
          filenames: [],
          content: null,
          numLines: null,
          numMatches: null,
          appliedLimit: null,
          appliedOffset: null
        };
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "路径超出 workspace 范围。" }, null, 2) }],
          details: details2
        };
      }
      const mode = normalizeMode(params.output_mode);
      const rgBasePath = path.relative(workspacePath, basePath) || ".";
      const limit = Math.max(
        1,
        Math.min(
          toSafeInteger(params.head_limit, toSafeInteger(params.maxResults, 250)),
          1e3
        )
      );
      const offset = toSafeInteger(params.offset, 0);
      const context = toSafeInteger(
        params.context ?? params["-C"] ?? void 0,
        0
      );
      const before = toSafeInteger(params["-B"], context);
      const after = toSafeInteger(params["-A"], context);
      const glob = typeof params.glob === "string" ? params.glob : typeof params.filePattern === "string" ? params.filePattern : void 0;
      const commonArgs = ["--color", "never", "--no-heading"];
      if (normalized.caseInsensitive) {
        commonArgs.push("-i");
      }
      if (normalized.fixedStrings) {
        commonArgs.push("-F");
      }
      if (params.multiline) {
        commonArgs.push("--multiline");
      }
      if (glob?.trim()) {
        commonArgs.push("-g", glob.trim());
      }
      if (params.type?.trim()) {
        commonArgs.push("--type", params.type.trim());
      }
      let details;
      if (mode === "files_with_matches") {
        const stdout = await runRipgrep(workspacePath, [
          ...commonArgs,
          "-l",
          normalized.pattern,
          rgBasePath
        ]).catch(() => "");
        const filenames = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => normalizeRipgrepPath(workspacePath, line));
        const sliced = sliceItems(filenames, offset, limit);
        details = {
          mode,
          numFiles: sliced.items.length,
          filenames: sliced.items,
          content: null,
          numLines: null,
          numMatches: null,
          appliedLimit: sliced.appliedLimit,
          appliedOffset: sliced.appliedOffset
        };
      } else if (mode === "count") {
        const stdout = await runRipgrep(workspacePath, [
          ...commonArgs,
          "--count-matches",
          normalized.pattern,
          rgBasePath
        ]).catch(() => "");
        const rows = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
        const filenames = rows.map((row) => {
          const lastColonIndex = row.lastIndexOf(":");
          return normalizeRipgrepPath(
            workspacePath,
            lastColonIndex >= 0 ? row.slice(0, lastColonIndex) : row
          );
        });
        const matchCounts = rows.reduce((sum, row) => {
          const tail = row.slice(row.lastIndexOf(":") + 1) || "0";
          const value = Number.parseInt(tail, 10);
          return sum + (Number.isFinite(value) ? value : 0);
        }, 0);
        const sliced = sliceItems(filenames, offset, limit);
        details = {
          mode,
          numFiles: sliced.items.length,
          filenames: sliced.items,
          content: null,
          numLines: null,
          numMatches: matchCounts,
          appliedLimit: sliced.appliedLimit,
          appliedOffset: sliced.appliedOffset
        };
      } else {
        const stdout = await runRipgrep(workspacePath, [
          ...commonArgs,
          "-n",
          ...before > 0 ? ["-B", String(before)] : [],
          ...after > 0 ? ["-A", String(after)] : [],
          normalized.pattern,
          rgBasePath
        ]).catch(() => "");
        const contentLines = stdout.split(/\r?\n/).filter((line) => line.trim().length > 0);
        const sliced = sliceItems(contentLines, offset, limit);
        const filenames = [...new Set(
          sliced.items.map((line) => extractFilenameFromContentLine(workspacePath, line)).filter((value) => !!value)
        )];
        details = {
          mode,
          numFiles: filenames.length,
          filenames,
          content: sliced.items.join("\n"),
          numLines: sliced.items.length,
          numMatches: null,
          appliedLimit: sliced.appliedLimit,
          appliedOffset: sliced.appliedOffset
        };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(details, null, 2) }],
        details
      };
    }
  };
}
const memorySaveParameters = Type.Object({
  summary: Type.String({
    description: "记忆内容的一句话摘要，要清晰、具体、可独立理解。例如：'用户偏好使用 pnpm 而非 npm'"
  }),
  topic: Type.String({
    description: "记忆所属分类。常用：preferences、architecture、conventions、workflow、project-structure、errors"
  }),
  detail: Type.Optional(
    Type.String({
      description: "详细补充内容（可选）。会写入 topic 文件供后续深度检索。适合放一段解释、原因或示例。"
    })
  ),
  source: Type.Optional(
    Type.String({
      description: "记忆来源，默认 'agent'。可选 'user' / 'system'。"
    })
  )
});
const memoryListParameters = Type.Object({
  topic: Type.Optional(
    Type.String({
      description: "只列出指定 topic 的记忆。不填则显示索引概览。"
    })
  )
});
function createMemorySaveTool(_sessionId) {
  return {
    name: "memory_save",
    label: "保存记忆",
    description: "将重要的事实、用户偏好、项目约定等信息保存到长期记忆系统。需要指定 topic 分类和一句话摘要。只保存跨会话有价值的信息。",
    parameters: memorySaveParameters,
    async execute(_toolCallId, params) {
      const store = getMemdirStore();
      const entry = store.save({
        summary: params.summary,
        topic: params.topic,
        detail: params.detail,
        source: params.source ?? "agent"
      });
      return {
        content: [
          {
            type: "text",
            text: `已保存记忆到 [${entry.topic}]：${entry.summary}`
          }
        ],
        details: { saved: entry }
      };
    }
  };
}
function createMemoryListTool() {
  return {
    name: "memory_list",
    label: "查看记忆",
    description: "列出长期记忆。不带 topic 参数时显示索引概览；带 topic 时显示该分类的详细内容。",
    parameters: memoryListParameters,
    async execute(_toolCallId, params) {
      const store = getMemdirStore();
      const topics = store.listTopics();
      if (params.topic) {
        const content = store.readTopic(params.topic);
        if (!content) {
          return {
            content: [
              {
                type: "text",
                text: `Topic '${params.topic}' 不存在。已有 topics：${topics.join(", ") || "无"}`
              }
            ],
            details: { count: 0, topics }
          };
        }
        return {
          content: [{ type: "text", text: content }],
          details: { count: 1, topics }
        };
      }
      const indexEntries = store.listIndex();
      if (indexEntries.length === 0) {
        return {
          content: [{ type: "text", text: "当前没有已保存的记忆。" }],
          details: { count: 0, topics: [] }
        };
      }
      const indexContent = store.getIndexContent();
      return {
        content: [
          {
            type: "text",
            text: `共 ${indexEntries.length} 条记忆，${topics.length} 个 topic：

${indexContent}`
          }
        ],
        details: { count: indexEntries.length, topics }
      };
    }
  };
}
function getPathValue() {
  return process.env.PATH ?? process.env.Path ?? "";
}
function normalizeExecutablePath(fullPath, executableName) {
  return fullPath.toLowerCase().includes("\\windowsapps\\") ? executableName : fullPath;
}
function findExistingPath(candidates) {
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}
function findExecutableOnPath(executableNames) {
  const pathValue = getPathValue();
  if (!pathValue) {
    return null;
  }
  const directories = pathValue.split(path.delimiter).filter(Boolean);
  for (const directory of directories) {
    for (const executableName of executableNames) {
      const fullPath = path.join(directory, executableName);
      if (fs.existsSync(fullPath)) {
        return normalizeExecutablePath(fullPath, executableName);
      }
      try {
        fs.statSync(fullPath);
      } catch (err) {
        if ((err.code === "EACCES" || err.code === "EPERM") && fullPath.toLowerCase().includes("\\windowsapps\\")) {
          return normalizeExecutablePath(fullPath, executableName);
        }
      }
    }
  }
  return null;
}
function findGitBash() {
  const candidates = [
    "C:\\Program Files\\Git\\bin\\bash.exe",
    "C:\\Program Files\\Git\\usr\\bin\\bash.exe",
    "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
    "C:\\Program Files (x86)\\Git\\usr\\bin\\bash.exe"
  ];
  return findExistingPath(candidates) ?? findExecutableOnPath(["bash.exe", "git-bash.exe"]);
}
function findPowerShellExecutable() {
  const programFiles = process.env.ProgramFiles ?? "C:\\Program Files";
  const systemRoot = process.env.SystemRoot ?? "C:\\Windows";
  return findExistingPath([
    path.join(programFiles, "PowerShell", "7", "pwsh.exe"),
    path.join(programFiles, "PowerShell", "7-preview", "pwsh.exe")
  ]) ?? findExecutableOnPath(["pwsh.exe"]) ?? findExistingPath([
    path.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
  ]) ?? findExecutableOnPath(["powershell.exe"]);
}
function inferShellFamily(command) {
  const executable = path.basename(command).toLowerCase();
  if (executable === "pwsh" || executable === "pwsh.exe" || executable === "powershell.exe") {
    return "powershell";
  }
  if (executable === "cmd" || executable === "cmd.exe") {
    return "cmd";
  }
  if (executable === "wsl" || executable === "wsl.exe") {
    return "wsl";
  }
  if (executable === "bash" || executable === "bash.exe" || executable === "zsh" || executable === "zsh.exe" || executable === "sh" || executable === "sh.exe") {
    return "posix";
  }
  return process.platform === "win32" ? "custom" : "posix";
}
function resolveWindowsShell(selection) {
  switch (selection) {
    case "powershell":
    case "default": {
      const command = findPowerShellExecutable() ?? "powershell.exe";
      return { command, args: [], label: "PowerShell", family: "powershell" };
    }
    case "cmd": {
      const command = process.env.ComSpec ?? findExecutableOnPath(["cmd.exe"]) ?? "cmd.exe";
      return { command, args: [], label: "Command Prompt", family: "cmd" };
    }
    case "git-bash": {
      const command = findGitBash();
      if (command) {
        return { command, args: ["--login", "-i"], label: "Git Bash", family: "git-bash" };
      }
      break;
    }
    case "wsl": {
      const command = findExecutableOnPath(["wsl.exe"]) ?? "wsl.exe";
      return { command, args: [], label: "WSL", family: "wsl" };
    }
    default:
      if (selection.trim()) {
        return {
          command: selection,
          args: [],
          label: path.basename(selection) || selection,
          family: inferShellFamily(selection)
        };
      }
      break;
  }
  const fallback = findPowerShellExecutable() ?? "powershell.exe";
  return {
    command: fallback,
    args: [],
    label: "PowerShell",
    family: "powershell"
  };
}
function resolveShell(selection) {
  if (process.platform === "win32") {
    return resolveWindowsShell(selection);
  }
  if (selection !== "default" && selection.trim()) {
    return {
      command: selection,
      args: [],
      label: path.basename(selection) || selection,
      family: inferShellFamily(selection)
    };
  }
  const command = process.env.SHELL ?? "/bin/zsh";
  return {
    command,
    args: [],
    label: "System Shell",
    family: inferShellFamily(command)
  };
}
function buildPowerShellCommand(command) {
  return [
    "[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)",
    "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)",
    "$OutputEncoding = [System.Text.UTF8Encoding]::new($false)",
    "if ($null -ne $PSStyle) { $PSStyle.OutputRendering = 'PlainText' }",
    command
  ].join("; ");
}
function buildPosixArgs(shellCommand, command) {
  const executable = path.basename(shellCommand).toLowerCase();
  if (executable === "bash" || executable === "bash.exe" || executable === "zsh" || executable === "zsh.exe") {
    return ["-lc", command];
  }
  return ["-c", command];
}
function buildShellExecSpawn(shell2, command) {
  switch (shell2.family) {
    case "powershell":
      return {
        command: shell2.command,
        args: [
          "-NoLogo",
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          buildPowerShellCommand(command)
        ]
      };
    case "cmd":
      return {
        command: shell2.command,
        args: ["/d", "/s", "/c", `chcp 65001>nul & ${command}`]
      };
    case "git-bash":
      return {
        command: shell2.command,
        args: ["--login", "-c", command]
      };
    case "wsl":
      return {
        command: shell2.command,
        args: ["bash", "-lc", command]
      };
    case "posix":
      return {
        command: shell2.command,
        args: buildPosixArgs(shell2.command, command)
      };
    case "custom":
    default:
      return {
        command: shell2.command,
        args: buildPosixArgs(shell2.command, command)
      };
  }
}
const parameters$3 = Type.Object({
  command: Type.String({ description: "要执行的 shell 命令" }),
  cwd: Type.Optional(Type.String({ description: "工作目录（默认 workspace 根目录）" })),
  timeout: Type.Optional(Type.Number({ description: "超时秒数（默认 30，上限 300）" }))
});
const ANSI_ESCAPE_REGEX = /\u001B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;
function sanitizeShellOutput(text) {
  return text.replace(ANSI_ESCAPE_REGEX, "");
}
function createShellExecTool(workspacePath, sessionId) {
  const configuredShell = resolveShell(getSettings().terminal.shell);
  return {
    name: "shell_exec",
    label: "执行命令",
    description: `执行 shell 命令。可以安装依赖、运行测试、查看进程状态等。命令会在 workspace 目录下执行，并使用当前配置的 ${configuredShell.label}。请按对应 shell 语法编写命令。`,
    parameters: parameters$3,
    async execute(_toolCallId, params, signal, onUpdate) {
      const check = checkShellCommand(params.command);
      if (!check.allowed) {
        recordShellCommand({
          sessionId,
          command: params.command,
          cwd: workspacePath,
          exitCode: -1,
          durationMs: 0
        });
        return {
          content: [{ type: "text", text: `命令被安全策略拦截: ${check.reason}
如果你确实需要执行，请在终端中手动运行。` }],
          details: {
            command: params.command,
            cwd: workspacePath,
            exitCode: -1,
            stdout: "",
            stderr: check.reason ?? "blocked",
            durationMs: 0
          }
        };
      }
      const cwd = params.cwd ? path.resolve(workspacePath, params.cwd) : workspacePath;
      const timeoutSec = Math.min(params.timeout ?? 30, 300);
      const startTime = Date.now();
      const shell2 = resolveShell(getSettings().terminal.shell);
      const shellSpawn = buildShellExecSpawn(shell2, params.command);
      return new Promise((resolve) => {
        const child = spawn(shellSpawn.command, shellSpawn.args, {
          cwd,
          env: { ...process.env },
          stdio: ["ignore", "pipe", "pipe"],
          windowsHide: true
        });
        let stdout = "";
        let stderr = "";
        let killed = false;
        const stdoutDecoder = new StringDecoder("utf8");
        const stderrDecoder = new StringDecoder("utf8");
        const pushOutput = (stream, text) => {
          const normalizedText = sanitizeShellOutput(text);
          if (!normalizedText) {
            return;
          }
          if (stream === "stdout") {
            stdout += normalizedText;
          } else {
            stderr += normalizedText;
          }
          onUpdate?.({
            content: [{ type: "text", text: normalizedText }],
            details: { type: stream, data: normalizedText }
          });
        };
        const timer = setTimeout(() => {
          killed = true;
          child.kill("SIGTERM");
          setTimeout(() => {
            if (!child.killed) child.kill("SIGKILL");
          }, 3e3);
        }, timeoutSec * 1e3);
        if (signal) {
          signal.addEventListener("abort", () => {
            killed = true;
            child.kill("SIGTERM");
          }, { once: true });
        }
        child.stdout.on("data", (chunk) => {
          pushOutput("stdout", stdoutDecoder.write(chunk));
        });
        child.stderr.on("data", (chunk) => {
          pushOutput("stderr", stderrDecoder.write(chunk));
        });
        child.on("close", (code) => {
          clearTimeout(timer);
          pushOutput("stdout", stdoutDecoder.end());
          pushOutput("stderr", stderrDecoder.end());
          const durationMs = Date.now() - startTime;
          const exitCode = code ?? (killed ? -1 : 0);
          recordShellCommand({
            sessionId,
            command: params.command,
            cwd,
            exitCode,
            durationMs
          });
          const MAX_LINES = 200;
          const lines = stdout.split("\n");
          let llmStdout;
          if (lines.length > MAX_LINES) {
            const tail = lines.slice(-50).join("\n");
            llmStdout = `stdout（最后 50 行，共 ${lines.length} 行）:
${tail}

[输出共 ${lines.length} 行，已截断。完整输出可在终端面板查看]`;
          } else {
            llmStdout = `stdout:
${stdout}`;
          }
          const text = [
            `命令: ${params.command}`,
            `退出码: ${exitCode}`,
            killed ? "(命令超时被终止)" : "",
            llmStdout,
            stderr ? `stderr:
${stderr}` : ""
          ].filter(Boolean).join("\n");
          resolve({
            content: [{ type: "text", text }],
            details: {
              command: params.command,
              cwd,
              exitCode,
              stdout,
              stderr,
              durationMs
            }
          });
        });
        child.on("error", (err) => {
          clearTimeout(timer);
          stdoutDecoder.end();
          stderrDecoder.end();
          const durationMs = Date.now() - startTime;
          recordShellCommand({
            sessionId,
            command: params.command,
            cwd,
            exitCode: -1,
            durationMs
          });
          resolve({
            content: [{ type: "text", text: `命令执行失败: ${err.message}` }],
            details: {
              command: params.command,
              cwd,
              exitCode: -1,
              stdout: "",
              stderr: err.message,
              durationMs
            }
          });
        });
      });
    }
  };
}
const todoStatusSchema = Type.Union([
  Type.Literal("pending"),
  Type.Literal("in_progress"),
  Type.Literal("completed")
]);
const todoItemSchema = Type.Object({
  id: Type.Optional(Type.String({ description: "已有任务 id；新任务可不填" })),
  content: Type.String({ description: "任务内容" }),
  activeForm: Type.Optional(Type.String({ description: "正在做时的进行式描述" })),
  status: todoStatusSchema
});
const todoWriteParameters = Type.Object({
  todos: Type.Optional(Type.Array(todoItemSchema, { description: "外部语义：完整任务列表" })),
  items: Type.Optional(Type.Array(Type.Object({
    id: Type.Optional(Type.String({ description: "兼容参数：已有任务 id" })),
    content: Type.String({ description: "兼容参数：任务内容" }),
    status: Type.Optional(todoStatusSchema)
  }), { description: "兼容参数：旧版 items" }))
});
const todoReadParameters = Type.Object({});
function normalizeInputItems(params) {
  if (params.todos?.length) {
    return params.todos.map((item) => ({
      id: item.id?.trim() || `todo-${randomUUID()}`,
      content: item.content,
      activeForm: item.activeForm?.trim() || item.content,
      status: item.status
    }));
  }
  return (params.items ?? []).map((item) => ({
    id: item.id?.trim() || `todo-${randomUUID()}`,
    content: item.content,
    activeForm: item.content,
    status: item.status ?? "pending"
  }));
}
function formatTodos(items) {
  if (items.length === 0) {
    return "[]";
  }
  return JSON.stringify(items, null, 2);
}
function createTodoReadTool(sessionId) {
  return {
    name: "todo_read",
    label: "读取待办",
    description: "读取当前线程的待办列表。",
    parameters: todoReadParameters,
    async execute() {
      const items = listSessionTodos(sessionId);
      return {
        content: [{ type: "text", text: formatTodos(items) }],
        details: { count: items.length, items }
      };
    }
  };
}
function createTodoWriteTool(sessionId) {
  return {
    name: "todo_write",
    label: "写入待办",
    description: "覆盖当前线程的待办列表。支持外部 TodoWrite 语义。",
    parameters: todoWriteParameters,
    async execute(_toolCallId, params) {
      const nextItems = normalizeInputItems(params);
      if (nextItems.length === 0) {
        const oldTodos2 = listSessionTodos(sessionId);
        const details2 = {
          oldTodos: oldTodos2,
          newTodos: oldTodos2,
          verificationNudgeNeeded: null
        };
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "todos 不能为空。" }, null, 2) }],
          details: details2
        };
      }
      const oldTodos = listSessionTodos(sessionId);
      const newTodos = writeSessionTodos(sessionId, nextItems);
      const allDone = newTodos.every((item) => item.status === "completed");
      const verificationNudgeNeeded = allDone && newTodos.length >= 3 && !newTodos.some((item) => item.content.toLowerCase().includes("verif")) ? true : null;
      const details = {
        oldTodos,
        newTodos,
        verificationNudgeNeeded
      };
      return {
        content: [{ type: "text", text: JSON.stringify(details, null, 2) }],
        details
      };
    }
  };
}
const parameters$2 = Type.Object({
  url: Type.String({ description: "网页 URL（必须是 http/https）" }),
  maxLength: Type.Optional(Type.Number({ description: "返回内容最大字符数（默认 10000）" }))
});
function htmlToText$1(html) {
  return html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "").replace(/<(nav|header|footer)[^>]*>[\s\S]*?<\/\1>/gi, "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}
function createWebFetchTool() {
  return {
    name: "web_fetch",
    label: "获取网页",
    description: "获取网页内容并转换为纯文本。用于查看文档、API 参考等在线资源。",
    parameters: parameters$2,
    async execute(_toolCallId, params, signal) {
      const urlCheck = checkFetchUrl(params.url);
      if (!urlCheck.allowed) {
        return {
          content: [{ type: "text", text: `无法访问: ${urlCheck.reason}` }],
          details: { url: params.url, statusCode: 0, contentLength: 0, truncated: false }
        };
      }
      const maxLength = params.maxLength ?? 1e4;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), FETCH_POLICY.timeoutMs);
        if (signal) {
          signal.addEventListener("abort", () => controller.abort(), { once: true });
        }
        const response = await fetch(params.url, {
          signal: controller.signal,
          headers: { "User-Agent": "PiDesktopAgent/1.0" }
        });
        clearTimeout(timeout);
        if (!response.ok) {
          return {
            content: [{ type: "text", text: `HTTP ${response.status}: ${response.statusText}` }],
            details: { url: params.url, statusCode: response.status, contentLength: 0, truncated: false }
          };
        }
        const contentType = response.headers.get("content-type") ?? "";
        const raw = await response.text();
        if (raw.length > FETCH_POLICY.maxResponseSizeBytes) {
          return {
            content: [{ type: "text", text: `响应体过大（${(raw.length / 1024 / 1024).toFixed(1)}MB），已拒绝` }],
            details: { url: params.url, statusCode: response.status, contentLength: raw.length, truncated: true }
          };
        }
        let text;
        if (contentType.includes("html")) {
          text = htmlToText$1(raw);
        } else {
          text = raw;
        }
        const truncated = text.length > maxLength;
        if (truncated) {
          text = text.slice(0, maxLength) + `

[内容已截断，原始长度 ${raw.length} 字符]`;
        }
        return {
          content: [{ type: "text", text: `网页内容（${params.url}）:

${text}` }],
          details: {
            url: params.url,
            statusCode: response.status,
            contentLength: raw.length,
            truncated
          }
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "请求失败";
        return {
          content: [{ type: "text", text: `获取失败: ${message}` }],
          details: { url: params.url, statusCode: 0, contentLength: 0, truncated: false }
        };
      }
    }
  };
}
const parameters$1 = Type.Object({
  query: Type.String({ description: "搜索关键词" }),
  allowed_domains: Type.Optional(Type.Array(Type.String(), { description: "允许域名白名单" })),
  blocked_domains: Type.Optional(Type.Array(Type.String(), { description: "屏蔽域名黑名单" })),
  maxResults: Type.Optional(Type.Number({ description: "兼容参数：最多返回多少条，默认 8" }))
});
function decodeHtml(value) {
  return value.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}
function htmlToText(input) {
  return decodeHtml(input.replace(/<[^>]+>/g, " "));
}
function normalizeDomain(value) {
  return value.trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/.*$/, "").toLowerCase();
}
function hostMatchesList(urlValue, domains) {
  try {
    const url = new URL(urlValue);
    const host = normalizeDomain(url.hostname);
    return domains.map(normalizeDomain).some((domain) => host === domain || host.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}
function decodeDuckDuckGoRedirect(urlValue) {
  const trimmed = urlValue.trim();
  if (!trimmed) {
    return null;
  }
  const joined = trimmed.startsWith("//") ? `https:${trimmed}` : trimmed.startsWith("/") ? `https://duckduckgo.com${trimmed}` : trimmed;
  try {
    const parsed = new URL(joined);
    if (parsed.hostname.includes("duckduckgo.com")) {
      const redirectTarget = parsed.searchParams.get("uddg");
      if (redirectTarget) {
        return decodeURIComponent(redirectTarget);
      }
    }
    return parsed.toString();
  } catch {
    return null;
  }
}
function extractQuotedValue(input) {
  const quote = input[0];
  if (!quote || quote !== '"' && quote !== "'") {
    return null;
  }
  const endIndex = input.indexOf(quote, 1);
  if (endIndex === -1) {
    return null;
  }
  return {
    value: input.slice(1, endIndex),
    rest: input.slice(endIndex + 1)
  };
}
function extractSearchHits(html) {
  const hits = [];
  let remaining = html;
  while (true) {
    const anchorStart = remaining.indexOf("result__a");
    if (anchorStart === -1) {
      break;
    }
    const afterClass = remaining.slice(anchorStart);
    const hrefIndex = afterClass.indexOf("href=");
    if (hrefIndex === -1) {
      remaining = afterClass.slice(1);
      continue;
    }
    const hrefValue = extractQuotedValue(afterClass.slice(hrefIndex + 5));
    if (!hrefValue) {
      remaining = afterClass.slice(1);
      continue;
    }
    const tagClose = hrefValue.rest.indexOf(">");
    if (tagClose === -1) {
      remaining = hrefValue.rest;
      continue;
    }
    const afterTag = hrefValue.rest.slice(tagClose + 1);
    const endAnchor = afterTag.indexOf("</a>");
    if (endAnchor === -1) {
      remaining = afterTag;
      continue;
    }
    const url = decodeDuckDuckGoRedirect(hrefValue.value);
    const title = htmlToText(afterTag.slice(0, endAnchor));
    if (url && title) {
      hits.push({ title, url });
    }
    remaining = afterTag.slice(endAnchor + 4);
  }
  return hits;
}
function extractGenericLinkHits(html) {
  const hits = [];
  let remaining = html;
  while (true) {
    const anchorStart = remaining.indexOf("<a");
    if (anchorStart === -1) {
      break;
    }
    const afterAnchor = remaining.slice(anchorStart);
    const hrefIndex = afterAnchor.indexOf("href=");
    if (hrefIndex === -1) {
      remaining = afterAnchor.slice(2);
      continue;
    }
    const hrefValue = extractQuotedValue(afterAnchor.slice(hrefIndex + 5));
    if (!hrefValue) {
      remaining = afterAnchor.slice(2);
      continue;
    }
    const tagClose = hrefValue.rest.indexOf(">");
    if (tagClose === -1) {
      remaining = hrefValue.rest;
      continue;
    }
    const afterTag = hrefValue.rest.slice(tagClose + 1);
    const endAnchor = afterTag.indexOf("</a>");
    if (endAnchor === -1) {
      remaining = afterTag;
      continue;
    }
    const title = htmlToText(afterTag.slice(0, endAnchor));
    const url = decodeDuckDuckGoRedirect(hrefValue.value) ?? hrefValue.value;
    if (title && /^https?:\/\//i.test(url)) {
      hits.push({ title, url });
    }
    remaining = afterTag.slice(endAnchor + 4);
  }
  return hits;
}
function dedupeHits(hits) {
  const seen = /* @__PURE__ */ new Set();
  return hits.filter((hit) => {
    if (seen.has(hit.url)) {
      return false;
    }
    seen.add(hit.url);
    return true;
  });
}
function createWebSearchTool() {
  return {
    name: "web_search",
    label: "网页搜索",
    description: "搜索网页结果并返回可引用链接。支持 allowed_domains / blocked_domains。",
    parameters: parameters$1,
    async execute(_toolCallId, params, signal) {
      const startedAt = Date.now();
      if (!params.query.trim()) {
        const details = {
          query: params.query,
          results: [],
          durationSeconds: 0
        };
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "query 不能为空。" }, null, 2) }],
          details
        };
      }
      const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(params.query)}`;
      const urlCheck = checkFetchUrl(searchUrl);
      if (!urlCheck.allowed) {
        const details = {
          query: params.query,
          results: [],
          durationSeconds: 0
        };
        return {
          content: [{ type: "text", text: JSON.stringify({ error: urlCheck.reason ?? "搜索被拦截。" }, null, 2) }],
          details
        };
      }
      try {
        const controller = new AbortController();
        if (signal) {
          signal.addEventListener("abort", () => controller.abort(), { once: true });
        }
        const response = await fetch(searchUrl, {
          signal: controller.signal,
          headers: {
            "User-Agent": "PiDesktopAgent/1.0",
            Accept: "text/html"
          }
        });
        const html = await response.text();
        let hits = extractSearchHits(html);
        if (hits.length === 0) {
          hits = extractGenericLinkHits(html);
        }
        if (params.allowed_domains?.length) {
          hits = hits.filter((hit) => hostMatchesList(hit.url, params.allowed_domains));
        }
        if (params.blocked_domains?.length) {
          hits = hits.filter((hit) => !hostMatchesList(hit.url, params.blocked_domains));
        }
        const dedupedHits = dedupeHits(hits).slice(0, Math.max(1, Math.min(params.maxResults ?? 8, 8)));
        const commentary = dedupedHits.length === 0 ? `No web search results matched the query "${params.query}".` : `Search results for "${params.query}". Include a Sources section in the final answer.
${dedupedHits.map((hit) => `- [${hit.title}](${hit.url})`).join("\n")}`;
        const details = {
          query: params.query,
          results: [
            commentary,
            {
              tool_use_id: "web_search_1",
              content: dedupedHits
            }
          ],
          durationSeconds: (Date.now() - startedAt) / 1e3
        };
        return {
          content: [{ type: "text", text: JSON.stringify(details, null, 2) }],
          details
        };
      } catch (error) {
        const details = {
          query: params.query,
          results: [],
          durationSeconds: (Date.now() - startedAt) / 1e3
        };
        return {
          content: [{ type: "text", text: JSON.stringify({ error: error instanceof Error ? error.message : "搜索失败" }, null, 2) }],
          details
        };
      }
    }
  };
}
const parameters = Type.Object({
  title: Type.String({ description: "通知标题" }),
  body: Type.String({ description: "通知正文" })
});
const notifyUserTool = {
  name: "notify_user",
  label: "Notify User",
  description: "Send a desktop notification to the user. Use when you need to proactively inform the user about something (task completed, reminder, alert).",
  parameters,
  async execute(_toolCallId, params) {
    const { title, body } = params;
    const supported = Notification.isSupported();
    if (supported) {
      const notification = new Notification({ title, body });
      notification.show();
    }
    bus.emit("notification:sent", { title, body });
    return {
      content: [
        {
          type: "text",
          text: supported ? `已发送桌面通知：「${title}」` : "当前系统不支持桌面通知，但消息已记录。"
        }
      ],
      details: { shown: supported }
    };
  }
};
const MAX_DIRECT_MCP_TOOLS = 12;
function dedupeTools(tools) {
  const seen = /* @__PURE__ */ new Set();
  const deduped = [];
  for (const tool of tools) {
    if (seen.has(tool.name)) {
      continue;
    }
    seen.add(tool.name);
    deduped.push(tool);
  }
  return deduped;
}
function aliasTool(tool, aliasName, aliasLabel) {
  return {
    ...tool,
    name: aliasName,
    label: aliasLabel ?? tool.label,
    async execute(toolCallId, params, signal, onUpdate) {
      return tool.execute(toolCallId, params, signal, onUpdate);
    }
  };
}
function getBuiltinTools(options) {
  const fileEdit = createFileEditTool(options.workspacePath);
  const globSearch = createGlobSearchTool(options.workspacePath);
  const grepSearch = createGrepSearchTool(options.workspacePath);
  const webSearch = createWebSearchTool();
  const todoRead = createTodoReadTool(options.sessionId);
  const todoWrite = createTodoWriteTool(options.sessionId);
  return [
    getTimeTool,
    createFileReadTool(options.workspacePath),
    fileEdit,
    aliasTool(fileEdit, "edit_file", "编辑文件"),
    createFileWriteTool(options.workspacePath),
    globSearch,
    grepSearch,
    createShellExecTool(options.workspacePath, options.sessionId),
    createCommandHistoryTool(options.sessionId),
    createWebFetchTool(),
    webSearch,
    aliasTool(webSearch, "WebSearch", "网页搜索"),
    todoRead,
    todoWrite,
    aliasTool(todoWrite, "TodoWrite", "写入待办"),
    createMemorySaveTool(),
    createMemoryListTool(),
    notifyUserTool
  ];
}
async function buildToolPool(options) {
  const builtinTools = getBuiltinTools(options);
  const mcpResourceTools = getMcpResourceTools(options.mcpManager);
  const mcpBrokerTool = getMcpBrokerTool(options.mcpManager);
  const mcpTools = await getAllMcpTools(options.mcpManager.getConnections());
  const directMcpTools = mcpTools.length <= MAX_DIRECT_MCP_TOOLS ? mcpTools : [];
  return dedupeTools([
    ...builtinTools,
    ...mcpResourceTools,
    mcpBrokerTool,
    ...directMcpTools
  ]);
}
class McpConnectionManager {
  connections = /* @__PURE__ */ new Map();
  async connectServer(name, config) {
    await this.disconnectServer(name);
    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args,
      env: config.env ? { ...process.env, ...config.env } : void 0,
      cwd: config.cwd,
      stderr: "pipe"
    });
    const client = new Client(
      { name: "chela-desktop-agent", version: "0.1.0" },
      { capabilities: {} }
    );
    await client.connect(transport);
    const conn = { name, client, transport, connected: true };
    this.connections.set(name, conn);
    transport.onclose = () => {
      conn.connected = false;
    };
    transport.onerror = () => {
      conn.connected = false;
    };
    return conn;
  }
  async disconnectServer(name) {
    const conn = this.connections.get(name);
    if (!conn) return;
    try {
      await conn.transport.close();
    } catch {
    }
    conn.connected = false;
    this.connections.delete(name);
  }
  async disconnectAll() {
    const names = [...this.connections.keys()];
    await Promise.allSettled(names.map((name) => this.disconnectServer(name)));
  }
  getConnections() {
    return [...this.connections.values()].filter((conn) => conn.connected);
  }
  getConnection(name) {
    const conn = this.connections.get(name);
    return conn?.connected ? conn : void 0;
  }
}
const SIDE_EFFECT_FREE_TOOLS = /* @__PURE__ */ new Set([
  "file_read",
  "glob_search",
  "grep_search",
  "command_history",
  "get_time",
  "todo_read",
  "list_mcp_resources",
  "list_mcp_resource_templates",
  "read_mcp_resource"
]);
class ParallelExecutionManager {
  batches = /* @__PURE__ */ new Map();
  cache = /* @__PURE__ */ new Map();
  executors = /* @__PURE__ */ new Map();
  activeSignals = /* @__PURE__ */ new Map();
  /**
   * 注册工具执行器（在 agent 初始化时调用）
   */
  registerExecutor(toolName, executor) {
    this.executors.set(toolName, executor);
  }
  /**
   * 注册一批待执行的工具调用（从 assistant 消息的 toolCall 块提取）
   */
  registerBatch(runId, toolCalls, signal) {
    const parallelCandidates = toolCalls.filter(
      (tc) => SIDE_EFFECT_FREE_TOOLS.has(tc.toolName)
    );
    if (parallelCandidates.length <= 1) return;
    this.batches.set(runId, parallelCandidates);
    this.activeSignals.set(runId, signal);
  }
  /**
   * 当第一个工具开始执行时调用，启动其余工具的预执行
   */
  startPreExecution(runId, currentToolCallId) {
    const batch = this.batches.get(runId);
    const signal = this.activeSignals.get(runId);
    if (!batch || !signal || signal.aborted) return;
    for (const entry of batch) {
      if (entry.toolCallId === currentToolCallId) continue;
      if (this.cache.has(entry.toolCallId)) continue;
      const executor = this.executors.get(entry.toolName);
      if (!executor) continue;
      const promise = executor(entry.toolCallId, entry.args, signal).catch((err) => {
        appLogger.debug({
          scope: "parallel-tools",
          message: `预执行失败 ${entry.toolName}:${entry.toolCallId}`,
          data: { error: err instanceof Error ? err.message : String(err) }
        });
        return null;
      });
      this.cache.set(entry.toolCallId, promise);
    }
    appLogger.debug({
      scope: "parallel-tools",
      message: `启动并行预执行: ${batch.length - 1} 个工具`,
      data: { runId, excludeToolCallId: currentToolCallId }
    });
  }
  /**
   * 获取缓存的预执行结果
   */
  async getCachedResult(toolCallId) {
    const cached = this.cache.get(toolCallId);
    if (!cached) return null;
    try {
      const result = await cached;
      if (!result) return null;
      return result;
    } catch {
      this.cache.delete(toolCallId);
      return null;
    }
  }
  /**
   * 清理某次 run 的批次数据
   */
  clearRun(runId) {
    const batch = this.batches.get(runId);
    if (batch) {
      for (const entry of batch) {
        this.cache.delete(entry.toolCallId);
      }
    }
    this.batches.delete(runId);
    this.activeSignals.delete(runId);
  }
  /**
   * 检查某个工具调用是否有缓存
   */
  hasCached(toolCallId) {
    return this.cache.has(toolCallId);
  }
}
const parallelManager = new ParallelExecutionManager();
const MCP_NAME_PATTERN = /^[A-Za-z0-9_.:-]{1,96}$/;
function normalizeMcpName(value) {
  return typeof value === "string" ? value.trim() : "";
}
function isValidMcpName(value) {
  const normalized = normalizeMcpName(value);
  return normalized.length > 0 && MCP_NAME_PATTERN.test(normalized);
}
function getRiskLevel(toolName) {
  if (toolName === "web_fetch" || toolName === "WebFetch" || toolName === "web_search" || toolName === "WebSearch" || toolName === "get_time" || toolName === "glob_search" || toolName === "grep_search" || toolName === "command_history" || toolName === "todo_read" || toolName === "todo_write" || toolName === "TodoWrite" || toolName === "list_mcp_resources" || toolName === "ListMcpResources" || toolName === "list_mcp_resource_templates" || toolName === "read_mcp_resource" || toolName === "ReadMcpResource" || toolName === "notify_user") {
    return "safe";
  }
  if (toolName.startsWith("mcp_")) {
    return "guarded";
  }
  if (toolName === "mcp") {
    return "guarded";
  }
  if (toolName === "file_read" || toolName === "file_edit" || toolName === "edit_file" || toolName === "file_write" || toolName === "shell_exec") {
    return "guarded";
  }
  return "safe";
}
function resolveWorkspacePath(workspacePath, targetPath) {
  return path.isAbsolute(targetPath) ? targetPath : path.resolve(workspacePath, targetPath);
}
function evaluateToolPolicy({
  workspacePath,
  toolName,
  args
}) {
  const riskLevel = getRiskLevel(toolName);
  if (toolName === "shell_exec") {
    const command = typeof args.command === "string" ? args.command : "";
    if (!command.trim()) {
      return {
        toolName,
        riskLevel,
        decision: { type: "deny", reason: "缺少有效命令。" }
      };
    }
    const result = checkShellCommand(command);
    if (!result.allowed) {
      return {
        toolName,
        riskLevel,
        decision: { type: "deny", reason: result.reason ?? "命令被安全策略拦截。" },
        normalizedArgs: { ...args, command }
      };
    }
    if (result.needsConfirmation) {
      return {
        toolName,
        riskLevel,
        decision: { type: "confirm", reason: "该命令不在自动通过白名单中。" },
        normalizedArgs: { ...args, command }
      };
    }
    return {
      toolName,
      riskLevel,
      decision: { type: "allow" },
      normalizedArgs: { ...args, command }
    };
  }
  if (toolName === "file_write") {
    const targetPath = typeof args.path === "string" ? args.path : "";
    if (!targetPath.trim()) {
      return {
        toolName,
        riskLevel,
        decision: { type: "deny", reason: "缺少有效文件路径。" }
      };
    }
    const resolvedPath = resolveWorkspacePath(workspacePath, targetPath);
    if (!isPathAllowed(resolvedPath, workspacePath)) {
      return {
        toolName,
        riskLevel,
        decision: { type: "deny", reason: "路径超出 workspace 范围。" },
        metadata: { resolvedPath }
      };
    }
    if (isWritePathForbidden(resolvedPath)) {
      return {
        toolName,
        riskLevel,
        decision: { type: "deny", reason: "该目录受写保护。" },
        metadata: { resolvedPath }
      };
    }
    const fileExists = fs.existsSync(resolvedPath);
    if (fileExists) {
      return {
        toolName,
        riskLevel,
        decision: { type: "confirm", reason: "覆盖已有文件需要用户确认。" },
        normalizedArgs: { ...args, path: targetPath },
        metadata: { resolvedPath, fileExists: true }
      };
    }
    return {
      toolName,
      riskLevel,
      decision: { type: "allow" },
      normalizedArgs: { ...args, path: targetPath },
      metadata: { resolvedPath, fileExists: false }
    };
  }
  if (toolName === "file_edit" || toolName === "edit_file") {
    const targetPath = typeof args.path === "string" ? args.path : "";
    if (!targetPath.trim()) {
      return {
        toolName,
        riskLevel,
        decision: { type: "deny", reason: "缺少有效文件路径。" }
      };
    }
    const resolvedPath = resolveWorkspacePath(workspacePath, targetPath);
    if (!isPathAllowed(resolvedPath, workspacePath)) {
      return {
        toolName,
        riskLevel,
        decision: { type: "deny", reason: "路径超出 workspace 范围。" },
        metadata: { resolvedPath }
      };
    }
    if (isWritePathForbidden(resolvedPath)) {
      return {
        toolName,
        riskLevel,
        decision: { type: "deny", reason: "该目录受写保护。" },
        metadata: { resolvedPath }
      };
    }
    if (!fs.existsSync(resolvedPath)) {
      return {
        toolName,
        riskLevel,
        decision: { type: "deny", reason: "目标文件不存在。" },
        metadata: { resolvedPath }
      };
    }
    return {
      toolName,
      riskLevel,
      decision: { type: "allow" },
      normalizedArgs: { ...args, path: targetPath },
      metadata: { resolvedPath }
    };
  }
  if (toolName === "file_read") {
    const targetPath = typeof args.path === "string" ? args.path : "";
    if (!targetPath.trim()) {
      return {
        toolName,
        riskLevel,
        decision: { type: "deny", reason: "缺少有效文件路径。" }
      };
    }
    const resolvedPath = resolveWorkspacePath(workspacePath, targetPath);
    if (!isPathAllowed(resolvedPath, workspacePath)) {
      return {
        toolName,
        riskLevel,
        decision: { type: "deny", reason: "路径超出 workspace 范围。" },
        metadata: { resolvedPath }
      };
    }
    if (isPathForbiddenRead(resolvedPath)) {
      return {
        toolName,
        riskLevel,
        decision: { type: "deny", reason: "该文件受敏感读取保护。" },
        metadata: { resolvedPath }
      };
    }
    return {
      toolName,
      riskLevel,
      decision: { type: "allow" },
      normalizedArgs: { ...args, path: targetPath },
      metadata: { resolvedPath }
    };
  }
  if (toolName === "web_fetch" || toolName === "WebFetch") {
    const url = typeof args.url === "string" ? args.url : "";
    if (!url.trim()) {
      return {
        toolName,
        riskLevel,
        decision: { type: "deny", reason: "缺少有效 URL。" }
      };
    }
    const result = checkFetchUrl(url);
    if (!result.allowed) {
      return {
        toolName,
        riskLevel,
        decision: { type: "deny", reason: result.reason ?? "URL 被策略拒绝。" },
        normalizedArgs: { ...args, url }
      };
    }
    return {
      toolName,
      riskLevel,
      decision: { type: "allow" },
      normalizedArgs: { ...args, url }
    };
  }
  if (toolName === "web_search" || toolName === "WebSearch") {
    const query = typeof args.query === "string" ? args.query : "";
    if (!query.trim()) {
      return {
        toolName,
        riskLevel,
        decision: { type: "deny", reason: "缺少有效搜索关键词。" }
      };
    }
    return {
      toolName,
      riskLevel,
      decision: { type: "allow" },
      normalizedArgs: { ...args, query }
    };
  }
  if (toolName === "glob_search" || toolName === "grep_search") {
    return {
      toolName,
      riskLevel,
      decision: { type: "allow" },
      normalizedArgs: args
    };
  }
  if (toolName === "command_history") {
    return {
      toolName,
      riskLevel,
      decision: { type: "allow" },
      normalizedArgs: args
    };
  }
  if (toolName === "todo_read" || toolName === "todo_write" || toolName === "TodoWrite" || toolName === "list_mcp_resources" || toolName === "ListMcpResources" || toolName === "list_mcp_resource_templates" || toolName === "read_mcp_resource" || toolName === "ReadMcpResource") {
    return {
      toolName,
      riskLevel,
      decision: { type: "allow" },
      normalizedArgs: args
    };
  }
  if (toolName.startsWith("mcp_")) {
    return {
      toolName,
      riskLevel,
      decision: { type: "confirm", reason: "MCP 工具默认需要通过 Harness 确认。" },
      normalizedArgs: args
    };
  }
  if (toolName === "mcp") {
    const action = typeof args.action === "string" ? args.action : "";
    if (action === "list") {
      const server2 = normalizeMcpName(args.server);
      if (server2 && !MCP_NAME_PATTERN.test(server2)) {
        return {
          toolName,
          riskLevel,
          decision: { type: "deny", reason: "MCP server 名格式无效。" },
          normalizedArgs: args
        };
      }
      return {
        toolName,
        riskLevel,
        decision: { type: "allow" },
        normalizedArgs: args
      };
    }
    if (action === "call") {
      if (!isValidMcpName(args.server)) {
        return {
          toolName,
          riskLevel,
          decision: { type: "deny", reason: "调用 MCP 工具需要提供格式有效的 server。" },
          normalizedArgs: args
        };
      }
      if (!isValidMcpName(args.tool)) {
        return {
          toolName,
          riskLevel,
          decision: { type: "deny", reason: "调用 MCP 工具需要提供格式有效的 tool。" },
          normalizedArgs: args
        };
      }
      return {
        toolName,
        riskLevel,
        decision: { type: "confirm", reason: "MCP 工具默认需要通过 Harness 确认。" },
        normalizedArgs: args
      };
    }
    return {
      toolName,
      riskLevel,
      decision: { type: "deny", reason: "MCP action 只能是 list 或 call。" },
      normalizedArgs: args
    };
  }
  return {
    toolName,
    riskLevel,
    decision: { type: "allow" },
    normalizedArgs: args
  };
}
function buildPayloadHash(toolName, args) {
  return createHash("sha256").update(JSON.stringify({ toolName, args })).digest("hex");
}
function inferApprovalKind(toolName) {
  if (toolName === "shell_exec") {
    return "shell";
  }
  if (toolName === "file_write") {
    return "file_write";
  }
  return "mcp";
}
function buildDecisionText(toolName, evaluation, mode) {
  if (mode === "deny") {
    return `操作被拒绝：${toolName} 未通过 Harness 策略校验。原因：${evaluation.decision.reason}`;
  }
  return `操作未执行：${toolName} 需要用户确认，但本次确认被拒绝。原因：${evaluation.decision.reason}`;
}
function buildConfirmDescription(toolName, args) {
  if (toolName === "shell_exec") {
    return {
      title: "确认执行命令",
      description: "Agent 想执行一条未进入自动通过白名单的命令。",
      detail: String(args.command ?? "")
    };
  }
  if (toolName === "file_write") {
    return {
      title: "确认覆盖文件",
      description: "Agent 想覆盖一个已有文件。",
      detail: String(args.path ?? "")
    };
  }
  return {
    title: "确认调用外部工具",
    description: `Agent 想调用 MCP 工具：${toolName}`,
    detail: JSON.stringify(args, null, 2)
  };
}
function buildApprovalRequestId(scope, toolCallId) {
  return `${scope.runId}:${toolCallId}`;
}
function ensureRunScope(runtime, getRunScope) {
  const runScope = getRunScope();
  if (!runScope) {
    throw new Error("当前工具调用没有关联到有效 run。");
  }
  runtime.assertRunActive(runScope);
  return runScope;
}
async function executeWithHarness(tool, context, toolCallId, args, signal, onUpdate) {
  const runScope = ensureRunScope(context.runtime, context.getRunScope);
  const adapter = context.getAdapter();
  context.runtime.assertRunActive(runScope);
  const emitRunStateChanged = (state2, reason) => {
    adapter.sendRunStateChanged({
      sessionId: runScope.sessionId,
      runId: runScope.runId,
      state: state2,
      reason,
      currentStepId: toolCallId
    });
  };
  const evaluation = evaluateToolPolicy({
    workspacePath: context.workspacePath,
    toolName: tool.name,
    args
  });
  context.runtime.recordToolPolicyEvaluation(runScope, evaluation, {
    toolCallId
  });
  if (evaluation.decision.type === "deny") {
    const nextRun = context.runtime.transitionState(runScope, "running", {
      currentStepId: toolCallId,
      reason: evaluation.decision.reason,
      metadata: {
        toolName: tool.name,
        decision: evaluation.decision.type
      }
    });
    if (nextRun) {
      emitRunStateChanged(nextRun.state, evaluation.decision.reason);
    }
    return {
      content: [
        {
          type: "text",
          text: buildDecisionText(tool.name, evaluation, "deny")
        }
      ],
      details: {
        harness: {
          decision: "deny",
          reason: evaluation.decision.reason,
          toolName: tool.name
        }
      }
    };
  }
  if (evaluation.decision.type === "confirm") {
    const normalizedArgs2 = evaluation.normalizedArgs ?? args;
    const confirmCopy = buildConfirmDescription(tool.name, normalizedArgs2);
    const pendingApproval = {
      requestId: buildApprovalRequestId(runScope, toolCallId),
      kind: inferApprovalKind(tool.name),
      payloadHash: buildPayloadHash(tool.name, normalizedArgs2),
      reason: evaluation.decision.reason,
      createdAt: Date.now(),
      title: confirmCopy.title,
      description: confirmCopy.description,
      detail: confirmCopy.detail
    };
    const pendingResponse = context.runtime.waitForApprovalResponse(
      runScope,
      pendingApproval
    );
    bus.emit("approval:requested", {
      sessionId: runScope.sessionId,
      runId: runScope.runId,
      requestId: pendingApproval.requestId,
      toolName: tool.name
    });
    const pendingRun = context.runtime.transitionState(runScope, "awaiting_confirmation", {
      currentStepId: toolCallId,
      pendingApproval,
      reason: evaluation.decision.reason,
      metadata: {
        toolName: tool.name,
        decision: evaluation.decision.type,
        requestId: pendingApproval.requestId
      }
    });
    if (pendingRun) {
      emitRunStateChanged(pendingRun.state, evaluation.decision.reason);
    }
    if (adapter.prefersInlineConfirmation()) {
      void adapter.presentConfirmationRequest({
        requestId: pendingApproval.requestId,
        title: confirmCopy.title,
        description: confirmCopy.description,
        detail: confirmCopy.detail
      }).catch(() => {
        context.runtime.resolvePendingApproval(
          {
            requestId: pendingApproval.requestId,
            allowed: false
          },
          "system"
        );
      });
    } else {
      void adapter.presentConfirmationRequest({
        requestId: pendingApproval.requestId,
        title: confirmCopy.title,
        description: confirmCopy.description,
        detail: confirmCopy.detail
      }).then((response) => {
        if (!response) {
          return;
        }
        context.runtime.resolvePendingApproval(response, "dialog");
      }).catch(() => {
        context.runtime.resolvePendingApproval(
          {
            requestId: pendingApproval.requestId,
            allowed: false
          },
          "system"
        );
      });
    }
    const approvalResolution = await pendingResponse;
    adapter.recordConfirmationResolution(approvalResolution);
    const allowed = approvalResolution.allowed;
    bus.emit("approval:resolved", {
      sessionId: runScope.sessionId,
      runId: runScope.runId,
      requestId: pendingApproval.requestId,
      allowed
    });
    if (!allowed) {
      const denyReason = approvalResolution.source === "system" ? "当前操作在等待确认时被系统中断。" : "用户拒绝了当前操作。";
      const resumedRun = context.runtime.transitionState(runScope, "running", {
        currentStepId: toolCallId,
        pendingApproval: null,
        reason: denyReason,
        metadata: {
          toolName: tool.name,
          decision: "reject-confirm",
          requestId: pendingApproval.requestId,
          source: approvalResolution.source
        }
      });
      if (resumedRun) {
        emitRunStateChanged(resumedRun.state, denyReason);
      }
      return {
        content: [
          {
            type: "text",
            text: buildDecisionText(tool.name, evaluation, "reject-confirm")
          }
        ],
        details: {
          harness: {
            decision: "reject-confirm",
            reason: evaluation.decision.reason,
            toolName: tool.name
          }
        }
      };
    }
  }
  const normalizedArgs = evaluation.normalizedArgs ?? args;
  if (signal?.aborted || context.runtime.isCancelRequested(runScope)) {
    throw new HarnessRunCancelledError();
  }
  const executingRun = context.runtime.transitionState(runScope, "executing_tool", {
    currentStepId: toolCallId,
    pendingApproval: null,
    reason: "Harness 已批准工具执行。",
    metadata: {
      toolName: tool.name,
      decision: evaluation.decision.type
    }
  });
  if (executingRun) {
    emitRunStateChanged(executingRun.state, "Harness 已批准工具执行。");
  }
  bus.emit("tool:executing", {
    sessionId: runScope.sessionId,
    runId: runScope.runId,
    toolName: tool.name,
    toolCallId
  });
  if (SIDE_EFFECT_FREE_TOOLS.has(tool.name)) {
    parallelManager.startPreExecution(runScope.runId, toolCallId);
  }
  try {
    const cachedResult = await parallelManager.getCachedResult(toolCallId);
    const result = cachedResult ?? await tool.execute(
      toolCallId,
      normalizedArgs,
      signal,
      onUpdate
    );
    const resumedRun = context.runtime.transitionState(runScope, "running", {
      currentStepId: toolCallId,
      pendingApproval: null,
      reason: "工具执行完成，继续回到 agent loop。",
      metadata: {
        toolName: tool.name
      }
    });
    if (resumedRun) {
      emitRunStateChanged(resumedRun.state, "工具执行完成，继续回到 agent loop。");
    }
    bus.emit("tool:completed", {
      sessionId: runScope.sessionId,
      runId: runScope.runId,
      toolName: tool.name,
      toolCallId
    });
    return result;
  } catch (error) {
    const resumedRun = context.runtime.transitionState(runScope, "running", {
      currentStepId: toolCallId,
      pendingApproval: null,
      reason: error instanceof Error ? error.message : "工具执行失败",
      metadata: {
        toolName: tool.name,
        error: error instanceof Error ? error.message : String(error)
      }
    });
    if (resumedRun) {
      emitRunStateChanged(
        resumedRun.state,
        error instanceof Error ? error.message : "工具执行失败"
      );
    }
    bus.emit("tool:failed", {
      sessionId: runScope.sessionId,
      runId: runScope.runId,
      toolName: tool.name,
      toolCallId,
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}
function wrapToolWithHarness(tool, context) {
  return {
    ...tool,
    async execute(toolCallId, params, signal, onUpdate) {
      return executeWithHarness(
        tool,
        context,
        toolCallId,
        params ?? {},
        signal,
        onUpdate
      );
    }
  };
}
function wrapToolsWithHarness(tools, context) {
  return tools.map((tool) => wrapToolWithHarness(tool, context));
}
function isAttachmentLike(value) {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value;
  return typeof candidate.id === "string" && typeof candidate.name === "string" && typeof candidate.path === "string" && typeof candidate.size === "number" && typeof candidate.extension === "string" && typeof candidate.kind === "string";
}
function extractPersistedAttachments(message) {
  const attachments = message.meta?.attachments;
  if (!Array.isArray(attachments)) {
    return [];
  }
  return attachments.filter(isAttachmentLike);
}
function resolveTimestamp(value) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : Date.now();
}
function createZeroCostUsage(inputTokens, outputTokens) {
  return {
    input: inputTokens,
    output: outputTokens,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: inputTokens + outputTokens,
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      total: 0
    }
  };
}
function createTextBlock(text) {
  return {
    type: "text",
    text
  };
}
async function attachmentToUserContent(attachment, allowImages) {
  if (attachment.kind === "image") {
    if (!allowImages) {
      return [
        createTextBlock(
          `已附加图片“${attachment.name}”，但当前模型不支持直接查看图片内容。`
        )
      ];
    }
    const imageContent = await readImageContent(
      attachment.path,
      attachment.mimeType
    );
    if (imageContent) {
      return [
        {
          type: "image",
          data: imageContent.data,
          mimeType: imageContent.mimeType
        }
      ];
    }
    return [
      createTextBlock(
        `已附加图片“${attachment.name}”，但当前无法读取图片内容。`
      )
    ];
  }
  if (attachment.kind === "text") {
    let previewText = attachment.previewText;
    let truncated = attachment.truncated ?? false;
    let error = attachment.error;
    if (!previewText?.trim() && !error) {
      const preview = await readFilePreview(attachment.path);
      previewText = preview.previewText;
      truncated = preview.truncated;
      error = preview.error;
    }
    if (previewText?.trim()) {
      const suffix = truncated ? "\n\n[内容已截断]" : "";
      return [
        createTextBlock(
          `<attachment name="${attachment.name}" kind="text">
${previewText}${suffix}
</attachment>`
        )
      ];
    }
    return [
      createTextBlock(
        error ? `已附加文本文件“${attachment.name}”，但读取失败：${error}` : `已附加文本文件“${attachment.name}”，但当前没有可用预览。`
      )
    ];
  }
  const descriptor = attachment.mimeType ? `${attachment.mimeType}, ${attachment.size} bytes` : `${attachment.size} bytes`;
  return [
    createTextBlock(
      `已附加文件“${attachment.name}” (${descriptor})，当前无法直接读取其文本内容。`
    )
  ];
}
async function buildUserMessageContent(text, attachments, allowImages = true) {
  const content = [];
  const trimmedText = text.trim();
  if (trimmedText) {
    content.push(createTextBlock(trimmedText));
  }
  for (const attachment of attachments) {
    content.push(...await attachmentToUserContent(attachment, allowImages));
  }
  if (content.length === 0) {
    throw new Error("消息不能为空。");
  }
  return content;
}
async function buildUserPromptMessage(text, attachments, allowImages = true) {
  return {
    role: "user",
    content: await buildUserMessageContent(text, attachments, allowImages),
    timestamp: Date.now()
  };
}
function normalizeAssistantMessage(message, model) {
  const text = message.content.trim();
  if (!text) {
    return null;
  }
  const inputTokens = message.usage?.inputTokens ?? 0;
  const outputTokens = message.usage?.outputTokens ?? 0;
  return {
    role: "assistant",
    content: [createTextBlock(text)],
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: createZeroCostUsage(inputTokens, outputTokens),
    stopReason: message.status === "error" ? "error" : "stop",
    timestamp: resolveTimestamp(message.timestamp)
  };
}
async function normalizePersistedSessionMessages(messages, model) {
  const normalized = [];
  const allowImages = model.input.includes("image");
  for (const message of messages) {
    if (message.role === "user") {
      try {
        normalized.push({
          role: "user",
          content: await buildUserMessageContent(
            message.content,
            extractPersistedAttachments(message),
            allowImages
          ),
          timestamp: resolveTimestamp(message.timestamp)
        });
      } catch {
      }
      continue;
    }
    if (message.role === "assistant") {
      const normalizedAssistantMessage = normalizeAssistantMessage(
        message,
        model
      );
      if (normalizedAssistantMessage) {
        normalized.push(normalizedAssistantMessage);
      }
    }
  }
  return normalized;
}
const handlesByOwner = /* @__PURE__ */ new Map();
const initGenerations = /* @__PURE__ */ new Map();
function getHandleOwnerKey(sessionId, ownerId = PRIMARY_AGENT_OWNER) {
  return `${sessionId}:${ownerId}`;
}
function subscribeToAgent(agent, adapter, runId) {
  return agent.subscribe((event) => {
    if (event.type === "message_end" && "message" in event && event.message && typeof event.message === "object" && "role" in event.message && event.message.role === "assistant" && "content" in event.message && Array.isArray(event.message.content)) {
      const toolCalls = event.message.content.filter(
        (c) => c.type === "toolCall"
      );
      if (toolCalls.length > 1 && runId) {
        const entries = toolCalls.map((tc) => ({
          toolCallId: tc.id,
          toolName: tc.name,
          args: tc.arguments ?? {}
        }));
        const controller = new AbortController();
        parallelManager.registerBatch(runId, entries, controller.signal);
      }
    }
    adapter.handleCoreEvent(event);
  });
}
async function initAgent(sessionId, adapter, resolved, ownerId = PRIMARY_AGENT_OWNER, existingMessages) {
  const ownerKey = getHandleOwnerKey(sessionId, ownerId);
  const generation = (initGenerations.get(ownerKey) ?? 0) + 1;
  initGenerations.set(ownerKey, generation);
  const existingHandle = handlesByOwner.get(ownerKey);
  if (existingHandle) {
    await destroyAgent(existingHandle);
  }
  const settings = getSettings();
  const normalizedMessages = await normalizePersistedSessionMessages(
    existingMessages ?? [],
    resolved.model
  );
  const handleRef = { current: null };
  const mcpManager = new McpConnectionManager();
  try {
    const mcpConfig = loadMcpConfig(adapter.workspacePath);
    const servers = getActiveServers(mcpConfig);
    for (const [name, cfg] of servers) {
      try {
        await mcpManager.connectServer(name, cfg);
      } catch {
      }
    }
  } catch {
  }
  const rawTools = await buildToolPool({
    workspacePath: adapter.workspacePath,
    sessionId,
    mcpManager
  });
  for (const tool of rawTools) {
    if (SIDE_EFFECT_FREE_TOOLS.has(tool.name)) {
      parallelManager.registerExecutor(
        tool.name,
        (toolCallId, args, signal) => tool.execute(toolCallId, args, signal, () => {
        })
      );
    }
  }
  const tools = wrapToolsWithHarness(rawTools, {
    workspacePath: adapter.workspacePath,
    runtime: harnessRuntime,
    getAdapter: () => handleRef.current?.adapter ?? adapter,
    getRunScope: () => {
      const activeRunId = handleRef.current?.activeRunId;
      return activeRunId ? {
        sessionId,
        runId: activeRunId
      } : null;
    }
  });
  const promptRuntime = {
    sourceName: resolved.source.name,
    providerType: resolved.source.providerType,
    modelName: resolved.entry.name,
    modelId: resolved.entry.modelId,
    contextWindow: resolved.model.contextWindow ?? null,
    supportsVision: resolved.model.input.includes("image"),
    supportsToolCalling: resolved.entry.capabilities.toolCalling ?? resolved.entry.detectedCapabilities.toolCalling ?? false
  };
  const agent = new Agent({
    initialState: {
      systemPrompt: await buildSystemPrompt({
        workspacePath: adapter.workspacePath,
        sessionId,
        latestUserText: null,
        toolNames: tools.map((tool) => tool.name),
        thinkingLevel: settings.thinkingLevel,
        promptRuntime
      }),
      model: resolved.model,
      thinkingLevel: settings.thinkingLevel,
      tools,
      messages: normalizedMessages
    },
    getApiKey: () => resolved.apiKey,
    transformContext: createTransformContext(
      sessionId,
      resolved.model.contextWindow ?? null
    ),
    sessionId
  });
  const unsubscribe = subscribeToAgent(agent, adapter);
  const handle = {
    agent,
    unsubscribe,
    adapter,
    sessionId,
    ownerId,
    modelEntryId: resolved.entry.id,
    runtimeSignature: resolved.runtimeSignature,
    thinkingLevel: settings.thinkingLevel,
    mcpManager,
    workspacePath: adapter.workspacePath,
    activeRunId: null,
    promptRuntime
  };
  handleRef.current = handle;
  if (initGenerations.get(ownerKey) !== generation) {
    unsubscribe();
    agent.abort();
    await mcpManager.disconnectAll();
    throw new Error("Agent initialization superseded.");
  }
  handlesByOwner.set(ownerKey, handle);
  return handle;
}
function bindHandleToRun(handle, adapter, runId) {
  handle.unsubscribe();
  handle.unsubscribe = subscribeToAgent(handle.agent, adapter, runId);
  handle.adapter = adapter;
  handle.activeRunId = runId;
}
async function promptAgent(handle, text, attachments) {
  handle.agent.setSystemPrompt(
    await buildSystemPrompt({
      workspacePath: handle.workspacePath,
      sessionId: handle.sessionId,
      latestUserText: text,
      toolNames: handle.agent.state.tools.map((tool) => tool.name),
      thinkingLevel: handle.thinkingLevel,
      promptRuntime: handle.promptRuntime
    })
  );
  await handle.agent.prompt(
    await buildUserPromptMessage(
      text,
      attachments,
      handle.agent.state.model.input.includes("image")
    )
  );
}
function cancelAgent(handle) {
  handle.agent.abort();
}
function completeRun(handle, runId) {
  if (handle.activeRunId === runId) {
    handle.activeRunId = null;
  }
  parallelManager.clearRun(runId);
}
async function destroyAgent(handle) {
  handle.unsubscribe();
  handle.agent.abort();
  handle.activeRunId = null;
  const ownerKey = getHandleOwnerKey(handle.sessionId, handle.ownerId);
  if (handlesByOwner.get(ownerKey) === handle) {
    handlesByOwner.delete(ownerKey);
  }
  await handle.mcpManager.disconnectAll();
}
async function destroyAllAgents() {
  await Promise.allSettled(
    [...handlesByOwner.values()].map((handle) => destroyAgent(handle))
  );
}
function getHandle(sessionId, ownerId = PRIMARY_AGENT_OWNER) {
  return handlesByOwner.get(getHandleOwnerKey(sessionId, ownerId)) ?? null;
}
async function buildSystemPrompt(input) {
  return buildContextSystemPrompt(input);
}
async function cancelChatRun(scope) {
  const activeRun = harnessRuntime.requestCancel(scope);
  const activeHandle = harnessRuntime.getHandle(scope);
  if (activeRun) {
    if (activeHandle) {
      cancelAgent(activeHandle);
    }
    return;
  }
  const handle = getHandle(scope.sessionId);
  if (handle && handle.activeRunId === scope.runId) {
    cancelAgent(handle);
  }
}
function isPromptTooLongError(err) {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return msg.includes("prompt is too long") || msg.includes("context_length_exceeded") || msg.includes("maximum context length") || msg.includes("too many tokens") || msg.includes("prompt_too_long") || msg.includes("request too large") || msg.includes("请求过长") || msg.includes("context") && msg.includes("exceed");
}
function isMaxTokensTruncation(stopReason) {
  if (!stopReason) return false;
  const normalized = stopReason.toLowerCase();
  return normalized === "max_tokens" || normalized === "length";
}
async function executeChatRun(context) {
  if (!context.handle) {
    throw new Error("Agent handle 未就绪，无法执行聊天 run。");
  }
  try {
    await promptAgent(context.handle, context.input.text, context.input.attachments);
  } catch (promptErr) {
    if (isPromptTooLongError(promptErr) && !harnessRuntime.isCancelRequested(context.runScope)) {
      appLogger.warn({
        scope: "chat.send",
        message: "检测到 prompt-too-long，尝试反应式 compact 后重试",
        data: {
          sessionId: context.input.sessionId,
          runId: context.input.runId
        }
      });
      const compacted = await reactiveCompact(context.input.sessionId);
      if (compacted) {
        await promptAgent(
          context.handle,
          context.input.text,
          context.input.attachments
        );
      } else {
        throw promptErr;
      }
    } else {
      throw promptErr;
    }
  }
  const stopReason = context.adapter.getLastStopReason();
  if (isMaxTokensTruncation(stopReason) && !harnessRuntime.isCancelRequested(context.runScope)) {
    appLogger.info({
      scope: "chat.send",
      message: "检测到 max_output_tokens 截断，注入续写指令",
      data: {
        sessionId: context.input.sessionId,
        runId: context.input.runId,
        stopReason
      }
    });
    try {
      await promptAgent(
        context.handle,
        "直接继续，不要道歉，不要回顾，从中断处接着写。",
        []
      );
    } catch (contErr) {
      appLogger.warn({
        scope: "chat.send",
        message: "max_tokens 续写失败",
        error: contErr
      });
    }
  }
}
const COMMIT_TYPE_META = {
  feat: { emoji: "✨", label: "feat" },
  fix: { emoji: "🐛", label: "fix" },
  docs: { emoji: "📝", label: "docs" },
  refactor: { emoji: "♻️", label: "refactor" },
  test: { emoji: "✅", label: "test" },
  chore: { emoji: "🔧", label: "chore" },
  ci: { emoji: "👷", label: "ci" },
  build: { emoji: "📦", label: "build" }
};
const COMMIT_SKILL_FALLBACK = [
  "## 提交消息格式",
  "- 标题使用 Conventional Commit 风格。",
  "- 第一行只写标题，后续内容写描述。",
  "",
  "## 类型与 emoji",
  "- feat ✨",
  "- fix 🐛",
  "- docs 📝",
  "- style 🎨",
  "- refactor ♻️",
  "- perf ⚡️",
  "- test ✅",
  "- chore 🔧",
  "- ci 👷",
  "- build 📦",
  "- revert ⏪",
  "",
  "## 关键规则",
  "- 动词使用现在时、祈使句。",
  "- 标题保持单行，不加句号。",
  "- 避免把无关改动混在同一个标题里。",
  "- 正文简短，只写对 reviewer 有帮助的信息。"
].join("\n");
function extractText(content) {
  return content.filter((block) => block.type === "text").map((block) => block.text).join("\n").trim();
}
function extractToolCallText(content) {
  return content.filter(
    (block) => block.type === "toolCall" && "arguments" in block
  ).map((block) => JSON.stringify(block.arguments)).join("\n").trim();
}
function extractThinking(content) {
  return content.filter((block) => block.type === "thinking").map((block) => block.thinking).join("\n\n").trim();
}
function getErrorMessage(error, fallback) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return fallback;
}
function normalizeTitleLine(value) {
  return value.split(/\r?\n/, 1)[0]?.replace(/[。！？!?,，;；:：\s]+$/g, "").trim().slice(0, 24) ?? "";
}
function resolveWorkerModel(role) {
  const settings = getSettings();
  const entryId = role === "utility" ? settings.modelRouting.utility.modelId : settings.modelRouting.chat.modelId;
  if (!entryId) {
    throw new Error(role === "utility" ? "当前未配置工具模型。" : "当前未配置聊天模型。");
  }
  return resolveModelEntry(entryId);
}
async function completeTextWithRole(role, systemPrompt, userPrompt, options) {
  const resolved = resolveWorkerModel(role);
  const runCompletion = async (nextSystemPrompt, nextUserPrompt) => {
    const response = await completeSimple(
      resolved.model,
      {
        systemPrompt: nextSystemPrompt,
        messages: [{ role: "user", content: nextUserPrompt, timestamp: Date.now() }],
        tools: []
      },
      { apiKey: resolved.apiKey }
    );
    const text = extractText(response.content);
    const toolText = extractToolCallText(response.content);
    const thinking = extractThinking(response.content);
    return {
      text,
      fallbackText: text || toolText || thinking,
      thinking,
      stopReason: response.stopReason,
      errorMessage: response.errorMessage,
      content: response.content,
      usage: response.usage
    };
  };
  const primary = await runCompletion(systemPrompt, userPrompt);
  if (primary.text) {
    return primary.text;
  }
  if (primary.thinking && options?.repairPromptBuilder) {
    appLogger.info({
      scope: "worker.commit",
      message: "提交信息生成收到 thinking-only 响应，开始二次收束",
      data: {
        role,
        modelEntryId: resolved.entry.id,
        modelId: resolved.entry.modelId,
        sourceId: resolved.source.id,
        stopReason: primary.stopReason
      }
    });
    const repairPrompt = options.repairPromptBuilder(primary.thinking);
    const repaired = await runCompletion(repairPrompt.systemPrompt, repairPrompt.userPrompt);
    if (repaired.text) {
      return repaired.text;
    }
    if (repaired.fallbackText) {
      appLogger.warn({
        scope: "worker.commit",
        message: "提交信息二次收束未返回 text，改用备用内容",
        data: {
          role,
          modelEntryId: resolved.entry.id,
          modelId: resolved.entry.modelId,
          sourceId: resolved.source.id,
          stopReason: repaired.stopReason,
          content: repaired.content,
          usage: repaired.usage,
          errorMessage: repaired.errorMessage
        }
      });
      return repaired.fallbackText;
    }
  }
  if (!primary.fallbackText) {
    appLogger.warn({
      scope: "worker.commit",
      message: "提交信息生成未返回可解析文本",
      data: {
        role,
        modelEntryId: resolved.entry.id,
        modelId: resolved.entry.modelId,
        sourceId: resolved.source.id,
        stopReason: primary.stopReason,
        content: primary.content,
        usage: primary.usage,
        errorMessage: primary.errorMessage
      }
    });
  }
  return primary.fallbackText;
}
async function generateTextWithFallback(input) {
  let utilityError = null;
  try {
    return {
      text: await completeTextWithRole("utility", input.systemPrompt, input.userPrompt, {
        repairPromptBuilder: input.repairPromptBuilder
      }),
      usedModelRole: "utility",
      fallbackUsed: false
    };
  } catch (error) {
    utilityError = error;
  }
  try {
    return {
      text: await completeTextWithRole("chat", input.systemPrompt, input.userPrompt, {
        repairPromptBuilder: input.repairPromptBuilder
      }),
      usedModelRole: "chat",
      fallbackUsed: true
    };
  } catch (fallbackError) {
    const utilityMessage = getErrorMessage(utilityError, "工具模型生成失败。");
    const chatMessage = getErrorMessage(fallbackError, "聊天模型回退失败。");
    throw new Error(`${utilityMessage} 聊天模型回退也失败：${chatMessage}`);
  }
}
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function extractMarkdownSection(markdown, heading) {
  const pattern = new RegExp(
    `^##\\s+${escapeRegExp(heading)}\\s*$([\\s\\S]*?)(?=^##\\s+|\\Z)`,
    "m"
  );
  const match = markdown.match(pattern);
  if (!match?.[1]?.trim()) {
    return null;
  }
  return `## ${heading}
${match[1].trim()}`;
}
function readCommitSkillGuidance(workspacePath) {
  const skillPath = path.resolve(workspacePath, ".agents", "skills", "commit", "SKILL.md");
  if (!fs.existsSync(skillPath)) {
    return COMMIT_SKILL_FALLBACK;
  }
  try {
    const skillMarkdown = fs.readFileSync(skillPath, "utf8");
    const sections = [
      extractMarkdownSection(skillMarkdown, "目标"),
      extractMarkdownSection(skillMarkdown, "提交消息格式"),
      extractMarkdownSection(skillMarkdown, "类型与 emoji"),
      extractMarkdownSection(skillMarkdown, "关键规则"),
      extractMarkdownSection(skillMarkdown, "示例")
    ].filter((section) => !!section);
    return sections.length > 0 ? sections.join("\n\n") : COMMIT_SKILL_FALLBACK;
  } catch {
    return COMMIT_SKILL_FALLBACK;
  }
}
function buildCommitMessageSystemPrompt(workspacePath) {
  return [
    "你是 Chela 的提交信息生成器。",
    "当前任务由工具模型优先执行，职责只有分析变更并生成提交标题与描述。",
    "必须遵循下面的 commit skill 规则。",
    "",
    readCommitSkillGuidance(workspacePath),
    "",
    "输出约束：",
    "- 只输出纯文本，不要代码块，不要解释。",
    "- 第一行输出标题。",
    "- 第二行起输出描述，可为空。",
    "- 不要执行 git add、git commit、lint、build 或其它命令。",
    "- 标题必须可直接放进 commit title 输入框。",
    "- 描述必须可直接放进 description 输入框。"
  ].join("\n");
}
function buildCommitMessagePrompt(request) {
  const fileList = request.selectedFiles.map((file) => `[${file.status}] ${file.path} (+${file.additions}/-${file.deletions})`).join("\n");
  return [
    "请基于下面的改动生成提交标题和描述。",
    "",
    "[当前分支]",
    request.branchName ?? "未知分支",
    "",
    "[最近一次提交标题]",
    request.latestCommitSubject ?? "无可用参考",
    "",
    "[文件列表]",
    fileList || "无文件",
    "",
    "[Diff]",
    request.diffContent?.trim() || "无 diff 内容"
  ].join("\n");
}
function buildCommitMessageRepairPrompt(analysis) {
  const compactAnalysis = analysis.trim().slice(0, 6e3);
  return {
    systemPrompt: [
      "你是 Chela 的提交信息整理器。",
      "你已经完成改动分析，现在只负责输出最终提交标题和描述。",
      "只输出纯文本。",
      "第一行输出标题。",
      "第二行起输出描述，可为空。",
      "不要解释，不要复述分析过程。"
    ].join("\n"),
    userPrompt: [
      "请把下面这段分析整理成最终 commit 标题和描述。",
      "",
      "[分析结果]",
      compactAnalysis || "无可用分析"
    ].join("\n")
  };
}
function stripCodeFence(value) {
  return value.trim().replace(/^```[a-zA-Z0-9_-]*\s*/u, "").replace(/\s*```$/u, "").trim();
}
function stripLeadingLabel(value) {
  return value.replace(/^(title|subject|description|body|标题|描述|正文)\s*[:：-]\s*/iu, "").trim();
}
function stripFieldPrefix(value) {
  return value.replace(/^(?:[-*+]\s+|\d+\.\s+)?(?:#{1,6}\s+)?/u, "").trim();
}
function stripWrappingQuotes(value) {
  return value.replace(/^["'`]+|["'`]+$/gu, "").trim();
}
function cleanTitleCandidate(value) {
  return stripWrappingQuotes(stripLeadingLabel(stripFieldPrefix(value)));
}
function cleanDescriptionLine(value) {
  return stripLeadingLabel(value.trim());
}
function matchTitleField(value) {
  return stripFieldPrefix(value).match(/^(?:title|subject|标题|提交标题)\s*[:：-]?\s*(.*)$/iu);
}
function matchDescriptionField(value) {
  return stripFieldPrefix(value).match(
    /^(?:description|body|描述|正文|提交描述)\s*[:：-]?\s*(.*)$/iu
  );
}
function previewCommitResponse(rawText) {
  const preview = stripCodeFence(rawText).replace(/\s+/g, " ").trim();
  return preview.length > 120 ? `${preview.slice(0, 120)}…` : preview;
}
function toPosixPath(value) {
  return value.replace(/\\/g, "/");
}
function detectCommitTopics(selectedFiles) {
  const normalizedPaths = selectedFiles.map((file) => toPosixPath(file.path));
  const topics = [
    {
      key: "commit",
      scope: "commit",
      label: "commit generation",
      matches: normalizedPaths.some(
        (filePath) => filePath.includes("diff-panel") || filePath.includes("worker-service") || filePath.includes("ipc/worker")
      )
    },
    {
      key: "models",
      scope: "models",
      label: "model directory refresh",
      matches: normalizedPaths.some(
        (filePath) => filePath.includes("provider-directory") || filePath.includes("settings-view") || filePath.includes("keys-section") || filePath.includes("thread")
      )
    },
    {
      key: "contracts",
      scope: "shared",
      label: "shared contract updates",
      matches: normalizedPaths.some((filePath) => filePath.includes("contracts"))
    },
    {
      key: "docs",
      scope: "docs",
      label: "documentation updates",
      matches: normalizedPaths.some((filePath) => filePath.startsWith("docs/"))
    }
  ];
  return topics.filter((topic) => topic.matches).map(({ key, scope, label }) => ({ key, scope, label }));
}
function inferCommitType(request, topics) {
  const normalizedPaths = request.selectedFiles.map((file) => toPosixPath(file.path));
  if (normalizedPaths.every((filePath) => filePath.startsWith("docs/"))) {
    return "docs";
  }
  if (normalizedPaths.every(
    (filePath) => filePath.includes(".github/") || filePath.includes("/workflows/") || filePath.includes("ci")
  )) {
    return "ci";
  }
  if (normalizedPaths.some(
    (filePath) => filePath.includes("package.json") || filePath.includes("pnpm-lock") || filePath.includes("vite.config") || filePath.includes("tsconfig")
  )) {
    return "build";
  }
  if (normalizedPaths.every((filePath) => /(^|\/)(test|tests|__tests__)\//.test(filePath))) {
    return "test";
  }
  if (topics.some((topic) => topic.key === "commit" || topic.key === "models")) {
    return "refactor";
  }
  return "chore";
}
function buildHeuristicCommitTitle(request, topics) {
  const commitType = inferCommitType(request, topics);
  const { emoji, label } = COMMIT_TYPE_META[commitType];
  const scope = topics.length === 1 ? topics[0]?.scope ?? "app" : topics.length > 1 ? "app" : "workspace";
  const labels = topics.map((topic) => topic.label);
  let subject = "";
  if (labels.length >= 2) {
    subject = `improve ${labels[0]} and ${labels[1]}`;
  } else if (labels.length === 1) {
    subject = `improve ${labels[0]}`;
  } else if (request.selectedFiles.length === 1) {
    subject = `update ${path.basename(request.selectedFiles[0]?.path ?? "changes")}`;
  } else {
    subject = `update workspace changes`;
  }
  return `${emoji} ${label}(${scope}): ${subject}`;
}
function buildHeuristicCommitDescription(request, topics) {
  const descriptionLines = [
    topics.length > 0 ? `- focus: ${topics.map((topic) => topic.label).join(", ")}` : null,
    request.branchName ? `- branch: ${request.branchName}` : null,
    `- files: ${request.selectedFiles.length}`
  ].filter((line) => !!line);
  return descriptionLines.join("\n");
}
function buildHeuristicCommitMessageResult(request, rawText, meta) {
  const topics = detectCommitTopics(request.selectedFiles);
  const title = buildHeuristicCommitTitle(request, topics);
  const description = buildHeuristicCommitDescription(request, topics);
  appLogger.warn({
    scope: "worker.commit",
    message: "提交信息生成进入本地兜底",
    data: {
      usedModelRole: meta.usedModelRole,
      fallbackUsed: meta.fallbackUsed,
      selectedFiles: request.selectedFiles.map((file) => file.path),
      rawResponsePreview: previewCommitResponse(rawText),
      title,
      description
    }
  });
  return {
    title,
    description,
    skillName: "commit",
    ...meta
  };
}
function pickFirstString(values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}
function tryParseCommitMessageJson(rawText) {
  const normalized = stripCodeFence(rawText);
  if (!normalized.startsWith("{")) {
    return null;
  }
  try {
    const parsed = JSON.parse(normalized);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    const record = parsed;
    const title = cleanTitleCandidate(
      pickFirstString([record.title, record.subject, record["标题"], record["提交标题"]])
    );
    if (!title) {
      return null;
    }
    return {
      title,
      description: pickFirstString([
        record.description,
        record.body,
        record["描述"],
        record["正文"],
        record["提交描述"]
      ])
    };
  } catch {
    return null;
  }
}
function parseCommitMessageResult(rawText, meta) {
  const jsonResult = tryParseCommitMessageJson(rawText);
  if (jsonResult) {
    return {
      ...jsonResult,
      skillName: "commit",
      ...meta
    };
  }
  const normalized = stripCodeFence(rawText);
  const lines = normalized.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  let title = "";
  const descriptionLines = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (!title) {
      const titleMatch = matchTitleField(line);
      if (titleMatch) {
        const inlineTitle = cleanTitleCandidate(titleMatch[1] ?? "");
        if (inlineTitle) {
          title = inlineTitle;
          continue;
        }
        for (let nextIndex = index + 1; nextIndex < lines.length; nextIndex += 1) {
          const nextLine = lines[nextIndex] ?? "";
          if (!nextLine) {
            continue;
          }
          if (matchDescriptionField(nextLine)) {
            break;
          }
          title = cleanTitleCandidate(nextLine);
          index = nextIndex;
          break;
        }
        continue;
      }
      if (matchDescriptionField(line)) {
        continue;
      }
      title = cleanTitleCandidate(line);
      continue;
    }
    const descriptionMatch = matchDescriptionField(line);
    if (descriptionMatch) {
      const inlineDescription = cleanDescriptionLine(descriptionMatch[1] ?? "");
      if (inlineDescription) {
        descriptionLines.push(inlineDescription);
      }
      continue;
    }
    descriptionLines.push(cleanDescriptionLine(line));
  }
  if (!title) {
    const responsePreview = previewCommitResponse(rawText);
    throw new Error(
      responsePreview ? `模型没有返回可用的提交标题。原始返回：${responsePreview}` : "模型没有返回可用的提交标题。"
    );
  }
  return {
    title,
    description: descriptionLines.join("\n").trim(),
    skillName: "commit",
    ...meta
  };
}
function buildSessionTitlePrompt(input) {
  return {
    systemPrompt: [
      "你是聊天标题生成器。",
      "只输出标题本身，不要解释。"
    ].join("\n"),
    userPrompt: [
      "请基于下面这一轮对话生成一个简洁中文标题。",
      "要求：",
      "- 12 个字以内，最长 24 个字符。",
      "- 体现任务意图，不要写成口语句子。",
      "- 不要带书名号、引号、句号、冒号等结尾标点。",
      "",
      "[用户首条消息]",
      input.userText,
      "",
      "[助手首条回复]",
      input.assistantText
    ].join("\n")
  };
}
class WorkerService {
  static async generateCommitMessage(request) {
    const workspacePath = getSettings().workspace;
    const generation = await generateTextWithFallback({
      systemPrompt: buildCommitMessageSystemPrompt(workspacePath),
      userPrompt: buildCommitMessagePrompt(request),
      repairPromptBuilder: buildCommitMessageRepairPrompt
    });
    const meta = {
      usedModelRole: generation.usedModelRole,
      fallbackUsed: generation.fallbackUsed
    };
    try {
      return parseCommitMessageResult(generation.text, meta);
    } catch (error) {
      appLogger.warn({
        scope: "worker.commit",
        message: "提交信息解析失败，切换本地兜底",
        data: {
          usedModelRole: generation.usedModelRole,
          fallbackUsed: generation.fallbackUsed,
          rawResponsePreview: previewCommitResponse(generation.text)
        },
        error
      });
      return buildHeuristicCommitMessageResult(request, generation.text, meta);
    }
  }
  static async generateSessionTitle(input) {
    const prompt = buildSessionTitlePrompt(input);
    const result = await generateTextWithFallback(prompt);
    const title = normalizeTitleLine(result.text);
    return title || null;
  }
}
async function maybeAutoRenameSessionTitle(sessionId, assistantText) {
  const meta = getSessionMeta(sessionId);
  if (!meta || meta.titleManuallySet) {
    return;
  }
  const events = loadTranscriptEvents(sessionId);
  const assistantMessages = events.filter(
    (event) => event.type === "assistant_message"
  );
  if (assistantMessages.length !== 1) {
    return;
  }
  const firstUserMessage = events.find((event) => event.type === "user_message");
  const userText = firstUserMessage?.type === "user_message" ? firstUserMessage.message.content.trim() : "";
  const normalizedAssistantText = assistantText.trim();
  if (!userText || !normalizedAssistantText) {
    return;
  }
  try {
    const title = await WorkerService.generateSessionTitle({
      userText,
      assistantText: normalizedAssistantText
    });
    if (!title || title === meta.title) {
      return;
    }
    renamePersistedSession(sessionId, title, { manual: false });
  } catch (error) {
    appLogger.warn({
      scope: "chat.send",
      message: "自动标题生成失败",
      data: {
        sessionId
      },
      error
    });
  }
}
async function finalizeCompletedChatRun(context) {
  const assistantMessage = context.adapter.buildAssistantMessage("completed");
  if (assistantMessage) {
    appendAssistantMessageEvent({
      sessionId: context.input.sessionId,
      runId: context.input.runId,
      message: assistantMessage
    });
    bus.emit("message:assistant", {
      sessionId: context.input.sessionId,
      runId: context.input.runId
    });
  }
  appendRunFinishedEvent({
    sessionId: context.input.sessionId,
    runId: context.input.runId,
    ownerId: PRIMARY_AGENT_OWNER,
    finalState: "completed"
  });
  harnessRuntime.finishRun(context.runScope, "completed");
  if (assistantMessage?.content) {
    await maybeAutoRenameSessionTitle(
      context.input.sessionId,
      assistantMessage.content
    );
  }
  appLogger.info({
    scope: "chat.send",
    message: "消息发送完成",
    data: {
      sessionId: context.input.sessionId,
      runId: context.input.runId
    }
  });
  context.adapter.flushTerminalEvent({ type: "agent_end" });
}
async function finalizeFailedChatRun(context, err) {
  if (err instanceof HarnessRunCancelledError || harnessRuntime.isCancelRequested(context.runScope)) {
    const cancelledMessage = context.adapter.buildAssistantMessage("cancelled");
    if (cancelledMessage && context.transcriptStarted) {
      appendAssistantMessageEvent({
        sessionId: context.input.sessionId,
        runId: context.input.runId,
        message: cancelledMessage
      });
    }
    if (context.transcriptStarted) {
      appendRunFinishedEvent({
        sessionId: context.input.sessionId,
        runId: context.input.runId,
        ownerId: PRIMARY_AGENT_OWNER,
        finalState: "aborted",
        reason: "用户取消了当前 run。"
      });
    }
    if (context.createdHandle && context.handle) {
      await destroyAgent(context.handle);
    }
    if (context.runCreated) {
      harnessRuntime.finishRun(context.runScope, "aborted", {
        reason: "用户取消了当前 run。"
      });
    }
    appLogger.warn({
      scope: "chat.send",
      message: "消息发送被取消",
      data: {
        sessionId: context.input.sessionId,
        runId: context.input.runId
      }
    });
    context.adapter.flushTerminalEvent({ type: "agent_end" });
    return;
  }
  const errorMessage = err instanceof Error ? err.message : "Agent 执行失败";
  const failedMessage = context.adapter.buildAssistantMessage(
    "error",
    errorMessage
  );
  if (failedMessage && context.transcriptStarted) {
    appendAssistantMessageEvent({
      sessionId: context.input.sessionId,
      runId: context.input.runId,
      message: failedMessage
    });
  }
  if (context.transcriptStarted) {
    appendRunFinishedEvent({
      sessionId: context.input.sessionId,
      runId: context.input.runId,
      ownerId: PRIMARY_AGENT_OWNER,
      finalState: "failed",
      reason: errorMessage
    });
  }
  if (context.runCreated) {
    harnessRuntime.finishRun(context.runScope, "failed", {
      reason: errorMessage
    });
  }
  appLogger.error({
    scope: "chat.send",
    message: "消息发送失败",
    data: {
      sessionId: context.input.sessionId,
      runId: context.input.runId,
      createdHandle: context.createdHandle,
      runCreated: context.runCreated,
      transcriptStarted: context.transcriptStarted
    },
    error: err
  });
  context.adapter.queueTerminalError(errorMessage);
  context.adapter.flushTerminalEvent({
    type: "agent_error",
    message: errorMessage
  });
}
function completeChatRun(context) {
  if (context.handle) {
    completeRun(context.handle, context.input.runId);
  }
}
function stringifyPartialResult(value) {
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return String(value ?? "");
  }
}
function createStep(kind, id) {
  return {
    id: id ?? randomUUID(),
    kind,
    status: "executing",
    startedAt: Date.now()
  };
}
function getAssistantFinalText(event) {
  if (event.message.role !== "assistant") {
    return void 0;
  }
  const text = event.message.content.flatMap(
    (part) => part.type === "text" && part.text.trim().length > 0 ? [part.text] : []
  ).join("");
  return text || void 0;
}
function getAssistantFinalThinking(event) {
  if (event.message.role !== "assistant") {
    return void 0;
  }
  const thinking = event.message.content.flatMap(
    (part) => part.type === "thinking" && part.thinking.trim().length > 0 ? [part.thinking] : []
  ).join("\n\n");
  return thinking || void 0;
}
function getLatestThinkingStep(steps) {
  return [...steps].reverse().find((step) => step.kind === "thinking");
}
class ElectronAdapter {
  window;
  scope;
  buffer;
  pendingTerminalEvent = null;
  terminalEventFlushed = false;
  constructor(window, scope) {
    this.window = window;
    this.scope = scope;
    this.buffer = {
      startedAt: Date.now(),
      finalText: "",
      steps: []
    };
  }
  send(event) {
    if (!this.window.isDestroyed()) {
      this.window.webContents.send(IPC_CHANNELS.agentEvent, event);
    }
  }
  sendRunStateChanged(input) {
    appendRunStateChangedEvent({
      sessionId: input.sessionId,
      runId: input.runId,
      state: input.state,
      reason: input.reason,
      currentStepId: input.currentStepId
    });
    this.send({
      type: "run_state_changed",
      sessionId: input.sessionId,
      runId: input.runId,
      state: input.state,
      reason: input.reason,
      currentStepId: input.currentStepId,
      timestamp: Date.now()
    });
  }
  async presentConfirmationRequest(input) {
    appendConfirmationRequestedEvent({
      sessionId: this.scope.sessionId,
      runId: this.scope.runId,
      requestId: input.requestId,
      title: input.title,
      description: input.description,
      detail: input.detail
    });
    this.send({
      type: "confirmation_request",
      sessionId: this.scope.sessionId,
      runId: this.scope.runId,
      requestId: input.requestId,
      title: input.title,
      description: input.description,
      detail: input.detail,
      timestamp: Date.now()
    });
    if (this.window.isDestroyed()) {
      return {
        requestId: input.requestId,
        allowed: false
      };
    }
    if (this.prefersInlineConfirmation()) {
      return null;
    }
    const result = await dialog.showMessageBox(this.window, {
      type: "warning",
      buttons: ["拒绝", "允许"],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
      title: input.title,
      message: input.description,
      detail: input.detail
    });
    return {
      requestId: input.requestId,
      allowed: result.response === 1
    };
  }
  prefersInlineConfirmation() {
    return !this.window.isDestroyed();
  }
  recordConfirmationResolution(resolution) {
    appendConfirmationResolvedEvent({
      sessionId: this.scope.sessionId,
      runId: this.scope.runId,
      requestId: resolution.requestId,
      allowed: resolution.allowed
    });
  }
  handleCoreEvent(event) {
    const now = Date.now();
    const { sessionId, runId } = this.scope;
    switch (event.type) {
      case "agent_start":
        this.send({ type: "agent_start", sessionId, runId, timestamp: now });
        break;
      case "agent_end": {
        const errorMessage = [...event.messages].reverse().flatMap(
          (message) => message.role === "assistant" && message.errorMessage ? [message.errorMessage] : []
        )[0];
        if (errorMessage) {
          this.queueTerminalError(errorMessage);
          break;
        }
        this.queueTerminalEnd();
        break;
      }
      case "turn_start":
        this.send({
          type: "turn_start",
          sessionId,
          runId,
          turnIndex: 0,
          timestamp: now
        });
        break;
      case "turn_end":
        this.send({
          type: "turn_end",
          sessionId,
          runId,
          turnIndex: 0,
          timestamp: now
        });
        break;
      case "message_start":
        if (event.message.role !== "assistant") {
          break;
        }
        this.send({
          type: "message_start",
          sessionId,
          runId,
          role: "assistant",
          timestamp: now
        });
        break;
      case "message_end": {
        const message = event.message;
        if (message.role !== "assistant") {
          break;
        }
        const stopReason = message.stopReason;
        if (typeof stopReason === "string") {
          this.buffer.lastStopReason = stopReason;
        }
        const usage = message.usage ? { inputTokens: message.usage.input, outputTokens: message.usage.output } : void 0;
        this.buffer.usage = usage;
        const finalThinking = getAssistantFinalThinking(event);
        if (finalThinking?.trim()) {
          const thinkingStep = getLatestThinkingStep(this.buffer.steps);
          if (thinkingStep) {
            if (!thinkingStep.thinkingText?.trim()) {
              thinkingStep.thinkingText = finalThinking;
            }
          } else {
            const nextThinking = createStep("thinking");
            nextThinking.thinkingText = finalThinking;
            nextThinking.status = "success";
            nextThinking.endedAt = now;
            this.buffer.steps.push(nextThinking);
          }
        }
        const finalText = getAssistantFinalText(event);
        if (typeof finalText === "string") {
          this.buffer.finalText = finalText;
        }
        this.send({
          type: "message_end",
          sessionId,
          runId,
          usage,
          finalText,
          finalThinking,
          timestamp: now
        });
        break;
      }
      case "message_update": {
        const sub = event.assistantMessageEvent;
        if (sub.type === "thinking_delta") {
          let step = this.buffer.steps.find(
            (item) => item.kind === "thinking" && item.status === "executing"
          );
          if (!step) {
            step = createStep("thinking");
            this.buffer.steps.push(step);
          }
          step.thinkingText = (step.thinkingText ?? "") + sub.delta;
          this.send({
            type: "thinking_delta",
            sessionId,
            runId,
            delta: sub.delta,
            timestamp: now
          });
        } else if (sub.type === "text_delta") {
          this.buffer.finalText += sub.delta;
          this.send({
            type: "text_delta",
            sessionId,
            runId,
            delta: sub.delta,
            timestamp: now
          });
        }
        break;
      }
      case "tool_execution_start": {
        const thinking = this.buffer.steps.find(
          (item) => item.kind === "thinking" && item.status === "executing"
        );
        if (thinking) {
          thinking.status = "success";
          thinking.endedAt = now;
        }
        const step = createStep("tool_call", event.toolCallId);
        step.toolName = event.toolName;
        step.toolArgs = event.args;
        this.buffer.steps.push(step);
        appendToolStartedEvent({
          sessionId,
          runId,
          stepId: event.toolCallId,
          toolName: event.toolName,
          args: event.args
        });
        this.send({
          type: "tool_execution_start",
          sessionId,
          runId,
          stepId: event.toolCallId,
          toolName: event.toolName,
          args: event.args,
          timestamp: now
        });
        break;
      }
      case "tool_execution_update": {
        const step = this.buffer.steps.find((item) => item.id === event.toolCallId);
        if (step) {
          const chunk = stringifyPartialResult(event.partialResult);
          step.streamOutput = (step.streamOutput ?? "") + chunk;
        }
        this.send({
          type: "tool_execution_update",
          sessionId,
          runId,
          stepId: event.toolCallId,
          output: stringifyPartialResult(event.partialResult),
          timestamp: now
        });
        break;
      }
      case "tool_execution_end": {
        const step = this.buffer.steps.find((item) => item.id === event.toolCallId);
        if (step) {
          step.status = event.isError ? "error" : "success";
          step.toolResult = event.result;
          step.toolError = event.isError ? String(event.result) : void 0;
          step.endedAt = now;
        }
        appendToolFinishedEvent({
          sessionId,
          runId,
          stepId: event.toolCallId,
          toolName: event.toolName,
          result: event.isError ? void 0 : event.result,
          error: event.isError ? String(event.result) : void 0
        });
        if (event.isError) {
          appLogger.warn({
            scope: "agent.tool",
            message: "工具执行失败",
            data: {
              sessionId,
              runId,
              stepId: event.toolCallId,
              toolName: event.toolName
            },
            error: event.result
          });
        }
        this.send({
          type: "tool_execution_end",
          sessionId,
          runId,
          stepId: event.toolCallId,
          result: event.result,
          error: event.isError ? String(event.result) : void 0,
          durationMs: 0,
          timestamp: now
        });
        break;
      }
    }
  }
  queueTerminalEnd() {
    if (this.terminalEventFlushed) {
      return;
    }
    this.pendingTerminalEvent = {
      type: "agent_end",
      sessionId: this.scope.sessionId,
      runId: this.scope.runId,
      timestamp: Date.now()
    };
  }
  queueTerminalError(message) {
    if (this.terminalEventFlushed) {
      return;
    }
    appLogger.error({
      scope: "agent.runtime",
      message: "Agent 终止于错误",
      data: {
        sessionId: this.scope.sessionId,
        runId: this.scope.runId
      },
      error: message
    });
    this.pendingTerminalEvent = {
      type: "agent_error",
      sessionId: this.scope.sessionId,
      runId: this.scope.runId,
      message,
      timestamp: Date.now()
    };
  }
  flushTerminalEvent(fallback) {
    if (this.terminalEventFlushed) {
      return;
    }
    if (!this.pendingTerminalEvent) {
      if (fallback?.type === "agent_error") {
        this.queueTerminalError(fallback.message);
      } else {
        this.queueTerminalEnd();
      }
    }
    if (this.pendingTerminalEvent) {
      this.send(this.pendingTerminalEvent);
      this.pendingTerminalEvent = null;
      this.terminalEventFlushed = true;
    }
  }
  buildAssistantMessage(status, fallbackText) {
    const finalText = this.buffer.finalText.trim() || (fallbackText ? fallbackText.trim() : "");
    const steps = this.buffer.steps.map((step) => ({ ...step }));
    const endedAt = Date.now();
    for (const step of steps) {
      if (step.status === "executing") {
        step.status = status === "cancelled" ? "cancelled" : "success";
        step.endedAt = step.endedAt ?? endedAt;
      }
    }
    if (!finalText && steps.length === 0 && !this.buffer.usage) {
      return null;
    }
    return {
      id: `assistant-${this.scope.runId}`,
      role: "assistant",
      content: finalText,
      timestamp: new Date(endedAt).toISOString(),
      status: status === "completed" ? "done" : "error",
      usage: this.buffer.usage,
      steps
    };
  }
  /** 获取最后一次 message_end 的 stop reason，用于 max_output_tokens 检测 */
  getLastStopReason() {
    return this.buffer.lastStopReason;
  }
  get workspacePath() {
    return getSettings().workspace;
  }
}
function createChatRunContext(input) {
  const settings = getSettings();
  const existingSession = loadSession(input.sessionId);
  if (!existingSession) {
    throw new Error("会话不存在，无法继续发送。");
  }
  const resolvedModel = resolveRuntimeModel(settings.modelRouting.chat.modelId);
  const runScope = {
    sessionId: input.sessionId,
    runId: input.runId
  };
  const adapter = new ElectronAdapter(requireMainWindow(), {
    sessionId: input.sessionId,
    runId: input.runId
  });
  return {
    input,
    runScope,
    settings,
    existingSession,
    resolvedModel,
    adapter,
    createdHandle: false,
    handle: null,
    runCreated: false,
    transcriptStarted: false
  };
}
async function prepareChatRun(context) {
  const { input, runScope, resolvedModel, settings } = context;
  appLogger.info({
    scope: "chat.send",
    message: "开始发送消息",
    data: {
      sessionId: input.sessionId,
      runId: input.runId,
      textLength: input.text.length,
      attachmentCount: input.attachments.length,
      modelEntryId: resolvedModel.entry.id
    }
  });
  harnessRuntime.createRun({
    ...runScope,
    ownerId: PRIMARY_AGENT_OWNER,
    modelEntryId: resolvedModel.entry.id,
    runKind: "chat",
    runSource: "user",
    lane: "foreground"
  });
  context.runCreated = true;
  appendUserMessageEvent({
    sessionId: input.sessionId,
    text: input.text,
    attachments: input.attachments,
    modelEntryId: resolvedModel.entry.id,
    thinkingLevel: settings.thinkingLevel
  });
  bus.emit("message:user", {
    sessionId: input.sessionId,
    text: input.text
  });
  appendRunStartedEvent({
    sessionId: input.sessionId,
    runId: input.runId,
    ownerId: PRIMARY_AGENT_OWNER,
    runKind: "chat",
    modelEntryId: resolvedModel.entry.id,
    thinkingLevel: settings.thinkingLevel
  });
  context.transcriptStarted = true;
  harnessRuntime.assertRunActive(runScope);
  let handle = getHandle(input.sessionId);
  if (!handle || handle.modelEntryId !== resolvedModel.entry.id || handle.runtimeSignature !== resolvedModel.runtimeSignature || handle.thinkingLevel !== settings.thinkingLevel) {
    harnessRuntime.assertRunActive(runScope);
    handle = await initAgent(
      input.sessionId,
      context.adapter,
      resolvedModel,
      PRIMARY_AGENT_OWNER,
      context.existingSession.messages
    );
    context.createdHandle = true;
  }
  context.handle = handle;
  bindHandleToRun(handle, context.adapter, input.runId);
  harnessRuntime.attachHandle(runScope, handle);
  harnessRuntime.assertRunActive(runScope);
}
async function sendChatMessage(input) {
  const context = createChatRunContext(input);
  try {
    await prepareChatRun(context);
    await executeChatRun(context);
    await finalizeCompletedChatRun(context);
  } catch (err) {
    await finalizeFailedChatRun(context, err);
  } finally {
    completeChatRun(context);
  }
}
function registerChatIpc() {
  handleIpc(IPC_CHANNELS.chatSend, async (_event, input) => sendChatMessage(input));
  handleIpc(
    IPC_CHANNELS.chatTrimSessionMessages,
    async (_event, input) => trimSessionMessages(input.sessionId, input.messageId)
  );
  handleIpc(IPC_CHANNELS.agentCancel, async (_event, scope) => cancelChatRun(scope));
}
function formatNullable(value) {
  return value === null ? "unknown" : String(value);
}
function buildInterruptedApprovalRecoveryPrompt(approval) {
  const lines = [
    "请基于以下中断审批上下文继续处理当前任务。",
    "",
    "恢复原则：",
    "- 先说明你准备继续做什么。",
    "- 需要再次执行工具时重新走审批链。",
    "- 使用当前工作区真实状态判断下一步。",
    "",
    "中断审批上下文：",
    `- sessionId: ${approval.sessionId}`,
    `- runId: ${approval.runId}`,
    `- ownerId: ${approval.ownerId}`,
    `- modelEntryId: ${formatNullable(approval.modelEntryId)}`,
    `- runKind: ${formatNullable(approval.runKind)}`,
    `- runSource: ${formatNullable(approval.runSource)}`,
    `- lane: ${formatNullable(approval.lane)}`,
    `- state: ${formatNullable(approval.state)}`,
    `- currentStepId: ${formatNullable(approval.currentStepId)}`,
    `- interruptedAt: ${approval.interruptedAt}`,
    "",
    "待确认操作：",
    `- requestId: ${approval.approval.requestId}`,
    `- kind: ${approval.approval.kind}`,
    `- payloadHash: ${approval.approval.payloadHash}`,
    `- createdAt: ${approval.approval.createdAt}`,
    `- title: ${approval.approval.title}`,
    `- description: ${approval.approval.description}`,
    `- reason: ${approval.approval.reason}`
  ];
  if (approval.approval.detail?.trim()) {
    lines.push("", "detail:", "```", approval.approval.detail, "```");
  }
  return lines.join("\n");
}
function listPendingApprovalGroups(sessionId) {
  const pendingApprovals = harnessRuntime.getPendingApprovals(sessionId).flatMap((run) => {
    if (!run.pendingApproval) {
      return [];
    }
    return [
      {
        sessionId: run.sessionId,
        runId: run.runId,
        ownerId: run.ownerId,
        modelEntryId: run.modelEntryId ?? null,
        runKind: run.runKind ?? null,
        runSource: run.runSource ?? null,
        lane: run.lane ?? null,
        state: run.state ?? null,
        startedAt: run.startedAt ?? null,
        currentStepId: run.currentStepId ?? null,
        approval: run.pendingApproval
      }
    ];
  }).sort((left, right) => right.approval.createdAt - left.approval.createdAt);
  const grouped = /* @__PURE__ */ new Map();
  for (const approval of pendingApprovals) {
    const key = `${approval.sessionId}::${approval.ownerId}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.count += 1;
      existing.latestCreatedAt = Math.max(
        existing.latestCreatedAt,
        approval.approval.createdAt
      );
      existing.approvals.push(approval);
      existing.approvals.sort(
        (left, right) => right.approval.createdAt - left.approval.createdAt
      );
      continue;
    }
    grouped.set(key, {
      sessionId: approval.sessionId,
      ownerId: approval.ownerId,
      count: 1,
      latestCreatedAt: approval.approval.createdAt,
      approvals: [approval]
    });
  }
  return [...grouped.values()].sort(
    (left, right) => right.latestCreatedAt - left.latestCreatedAt
  );
}
function listInterruptedApprovals(sessionId) {
  return harnessRuntime.getInterruptedApprovals(sessionId).map((record) => {
    const noticeWithoutPrompt = {
      sessionId: record.sessionId,
      runId: record.runId,
      ownerId: record.ownerId,
      modelEntryId: record.modelEntryId ?? null,
      runKind: record.runKind ?? null,
      runSource: record.runSource ?? null,
      lane: record.lane ?? null,
      state: record.state ?? null,
      startedAt: record.startedAt ?? null,
      currentStepId: record.currentStepId ?? null,
      canResume: record.canResume ?? true,
      recoveryStatus: record.recoveryStatus ?? "interrupted",
      interruptedAt: record.interruptedAt,
      approval: record.approval
    };
    return {
      ...noticeWithoutPrompt,
      recoveryPrompt: buildInterruptedApprovalRecoveryPrompt(
        noticeWithoutPrompt
      )
    };
  }).sort((left, right) => right.interruptedAt - left.interruptedAt);
}
function listInterruptedApprovalGroups(sessionId) {
  const approvals = listInterruptedApprovals(sessionId);
  const grouped = /* @__PURE__ */ new Map();
  for (const approval of approvals) {
    const key = `${approval.sessionId}::${approval.ownerId}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.count += 1;
      existing.latestInterruptedAt = Math.max(
        existing.latestInterruptedAt,
        approval.interruptedAt
      );
      existing.approvals.push(approval);
      existing.approvals.sort(
        (left, right) => right.interruptedAt - left.interruptedAt
      );
      continue;
    }
    grouped.set(key, {
      sessionId: approval.sessionId,
      ownerId: approval.ownerId,
      count: 1,
      latestInterruptedAt: approval.interruptedAt,
      approvals: [approval]
    });
  }
  return [...grouped.values()].sort(
    (left, right) => right.latestInterruptedAt - left.latestInterruptedAt
  );
}
function dismissInterruptedApproval(runId) {
  return harnessRuntime.dismissInterruptedApproval(runId);
}
function resumeInterruptedApproval(runId) {
  return harnessRuntime.resumeInterruptedRun(runId);
}
function resolveApprovalResponse(response) {
  return harnessRuntime.resolvePendingApproval(response);
}
function registerHarnessIpc() {
  handleIpc(
    IPC_CHANNELS.agentConfirmResponse,
    async (_event, response) => resolveApprovalResponse(response)
  );
  handleIpc(
    IPC_CHANNELS.agentListPendingApprovalGroups,
    async (_event, sessionId) => listPendingApprovalGroups(sessionId)
  );
  handleIpc(
    IPC_CHANNELS.agentListInterruptedApprovals,
    async (_event, sessionId) => listInterruptedApprovals(sessionId)
  );
  handleIpc(
    IPC_CHANNELS.agentListInterruptedApprovalGroups,
    async (_event, sessionId) => listInterruptedApprovalGroups(sessionId)
  );
  handleIpc(
    IPC_CHANNELS.agentDismissInterruptedApproval,
    async (_event, runId) => dismissInterruptedApproval(runId)
  );
  handleIpc(
    IPC_CHANNELS.agentResumeInterruptedApproval,
    async (_event, runId) => resumeInterruptedApproval(runId)
  );
}
function registerSettingsIpc() {
  handleIpc(IPC_CHANNELS.settingsGet, async () => getSettings());
  handleIpc(
    IPC_CHANNELS.settingsUpdate,
    async (_event, partial) => updateSettings(partial)
  );
  handleIpc(
    IPC_CHANNELS.settingsGetLogSnapshot,
    async () => getDiagnosticLogSnapshot()
  );
  handleIpc(
    IPC_CHANNELS.settingsOpenLogFolder,
    async (_event, logId) => openDiagnosticLogFolder(logId)
  );
}
function registerWorkspaceIpc() {
  handleIpc(IPC_CHANNELS.workspaceChange, async (_event, path2) => {
    updateSettings({ workspace: path2 });
  });
  handleIpc(IPC_CHANNELS.workspaceGetSoul, async () => {
    const settings = getSettings();
    return getSoulFilesStatus(settings.workspace);
  });
  handleIpc(IPC_CHANNELS.workspacePickFolder, async () => {
    const options = {
      title: "选择默认工作区",
      defaultPath: getSettings().workspace,
      properties: ["openDirectory"]
    };
    const browserWindow = getMainWindow() ?? BrowserWindow.getFocusedWindow();
    const result = browserWindow ? await dialog.showOpenDialog(browserWindow, options) : await dialog.showOpenDialog(options);
    if (result.canceled) {
      return null;
    }
    return result.filePaths[0] ?? null;
  });
  handleIpc(IPC_CHANNELS.workspaceOpenFolder, async () => {
    const { workspace } = getSettings();
    const targetPath = existsSync(workspace) ? workspace : dirname(workspace);
    const result = await shell.openPath(targetPath);
    if (result) {
      throw new Error(result);
    }
  });
}
function registerProvidersIpc() {
  handleIpc(IPC_CHANNELS.providersListSources, async () => listSources());
  handleIpc(
    IPC_CHANNELS.providersGetSource,
    async (_event, sourceId) => getSource(sourceId)
  );
  handleIpc(
    IPC_CHANNELS.providersSaveSource,
    async (_event, draft) => saveSource(draft)
  );
  handleIpc(
    IPC_CHANNELS.providersDeleteSource,
    async (_event, sourceId) => deleteSource(sourceId)
  );
  handleIpc(
    IPC_CHANNELS.providersTestSource,
    async (_event, draft) => testSource(draft)
  );
  handleIpc(
    IPC_CHANNELS.providersGetCredentials,
    async (_event, sourceId) => getCredentials(sourceId)
  );
  handleIpc(
    IPC_CHANNELS.providersSetCredentials,
    async (_event, sourceId, apiKey) => setCredentials(sourceId, apiKey)
  );
  handleIpc(IPC_CHANNELS.modelsListEntries, async () => listEntries());
  handleIpc(
    IPC_CHANNELS.modelsListEntriesBySource,
    async (_event, sourceId) => listEntriesBySource(sourceId)
  );
  handleIpc(
    IPC_CHANNELS.modelsSaveEntry,
    async (_event, draft) => saveEntry(draft)
  );
  handleIpc(
    IPC_CHANNELS.modelsDeleteEntry,
    async (_event, entryId) => deleteEntry(entryId)
  );
  handleIpc(
    IPC_CHANNELS.modelsGetEntry,
    async (_event, entryId) => getEntry(entryId)
  );
}
const terminals = /* @__PURE__ */ new Map();
let mainWindow = null;
function setTerminalWindow(window) {
  mainWindow = window;
}
function createTerminal(options) {
  const id = crypto.randomUUID();
  const settings = getSettings();
  const cwd = options?.cwd ?? settings.workspace;
  const shell2 = resolveShell(settings.terminal.shell);
  const ptyProcess = pty.spawn(shell2.command, shell2.args, {
    name: "xterm-256color",
    cols: 80,
    rows: 24,
    cwd,
    env: process.env
  });
  ptyProcess.onData((data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.terminalData, id, data);
    }
  });
  ptyProcess.onExit(({ exitCode }) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.terminalExit, id, exitCode);
    }
    terminals.delete(id);
  });
  terminals.set(id, { id, ptyProcess, cwd });
  return id;
}
function writeTerminal(id, data) {
  const term = terminals.get(id);
  if (term) term.ptyProcess.write(data);
}
function resizeTerminal(id, cols, rows) {
  const term = terminals.get(id);
  if (term) term.ptyProcess.resize(cols, rows);
}
function destroyTerminal(id) {
  const term = terminals.get(id);
  if (term) {
    term.ptyProcess.kill();
    terminals.delete(id);
  }
}
function destroyAllTerminals() {
  for (const [id] of terminals) {
    destroyTerminal(id);
  }
}
function registerWorkbenchIpc() {
  handleIpc(
    IPC_CHANNELS.terminalCreate,
    async (_event, options) => createTerminal(options)
  );
  handleIpc(
    IPC_CHANNELS.terminalWrite,
    async (_event, id, data) => writeTerminal(id, data)
  );
  handleIpc(
    IPC_CHANNELS.terminalResize,
    async (_event, id, cols, rows) => resizeTerminal(id, cols, rows)
  );
  handleIpc(
    IPC_CHANNELS.terminalDestroy,
    async (_event, id) => destroyTerminal(id)
  );
  handleIpc(
    IPC_CHANNELS.gitSummary,
    async () => getGitBranchSummary(getSettings().workspace)
  );
  handleIpc(
    IPC_CHANNELS.gitStatus,
    async () => getGitDiffSnapshot(getSettings().workspace)
  );
  handleIpc(
    IPC_CHANNELS.gitListBranches,
    async () => listGitBranches(getSettings().workspace)
  );
  handleIpc(
    IPC_CHANNELS.gitSwitchBranch,
    async (_event, branchName) => switchGitBranch(getSettings().workspace, branchName)
  );
  handleIpc(
    IPC_CHANNELS.gitCreateBranch,
    async (_event, branchName) => createAndSwitchGitBranch(getSettings().workspace, branchName)
  );
  handleIpc(
    IPC_CHANNELS.gitStageFiles,
    async (_event, paths) => stageGitFiles(getSettings().workspace, paths)
  );
  handleIpc(
    IPC_CHANNELS.gitUnstageFiles,
    async (_event, paths) => unstageGitFiles(getSettings().workspace, paths)
  );
  handleIpc(
    IPC_CHANNELS.gitCommit,
    async (_event, message) => commitGitChanges(getSettings().workspace, message)
  );
  handleIpc(
    IPC_CHANNELS.gitPush,
    async () => pushGitChanges(getSettings().workspace)
  );
  handleIpc(IPC_CHANNELS.uiGetState, async () => getUiState());
  handleIpc(
    IPC_CHANNELS.uiSetDiffPanelOpen,
    async (_event, open) => setDiffPanelOpen(open)
  );
}
function registerWindowIpc() {
  handleIpc(IPC_CHANNELS.windowGetState, async () => {
    return computeWindowFrameState();
  });
  ipcMain.on(IPC_CHANNELS.windowMinimize, () => requireMainWindow().minimize());
  ipcMain.handle(IPC_CHANNELS.windowToggleMaximize, async () => {
    const window = requireMainWindow();
    if (window.isMaximized()) {
      window.unmaximize();
    } else {
      window.maximize();
    }
    return computeWindowFrameState();
  });
  ipcMain.on(IPC_CHANNELS.windowClose, () => requireMainWindow().close());
}
function registerWorkerIpc() {
  handleIpc(
    IPC_CHANNELS.workerGenerateCommitMessage,
    async (_event, request) => {
      const workspacePath = getSettings().workspace;
      let diffContent = request.diffContent;
      if (!diffContent || diffContent.trim().length === 0) {
        const filePaths = request.selectedFiles.map((f) => f.path);
        if (filePaths.length > 0) {
          diffContent = await getDiffForFiles(workspacePath, filePaths);
        }
      }
      const [branchSummary, latestCommitSubject] = await Promise.all([
        getGitBranchSummary(workspacePath),
        getLatestCommitSubject(workspacePath)
      ]);
      return WorkerService.generateCommitMessage({
        selectedFiles: request.selectedFiles,
        diffContent,
        branchName: branchSummary.branchName,
        latestCommitSubject
      });
    }
  );
}
class Scheduler {
  jobs = /* @__PURE__ */ new Map();
  started = false;
  dailyCheckTimer = null;
  register(def, callback) {
    if (this.jobs.has(def.id)) {
      this.unregister(def.id);
    }
    const job = { def, callback, timerId: null };
    this.jobs.set(def.id, job);
    if (this.started && def.enabled) {
      this.startJob(job);
    }
    appLogger.info({
      scope: "scheduler",
      message: `注册调度任务：${def.name} (${def.id})`
    });
  }
  unregister(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) return;
    this.stopJob(job);
    this.jobs.delete(jobId);
  }
  start() {
    if (this.started) return;
    this.started = true;
    for (const job of this.jobs.values()) {
      if (job.def.enabled) {
        this.startJob(job);
      }
    }
    this.dailyCheckTimer = setInterval(() => this.checkDailyJobs(), 6e4);
    appLogger.info({
      scope: "scheduler",
      message: `Scheduler 启动，${this.jobs.size} 个任务已注册`
    });
  }
  stop() {
    if (!this.started) return;
    this.started = false;
    for (const job of this.jobs.values()) {
      this.stopJob(job);
    }
    if (this.dailyCheckTimer) {
      clearInterval(this.dailyCheckTimer);
      this.dailyCheckTimer = null;
    }
  }
  getJobs() {
    return Array.from(this.jobs.values()).map((j) => j.def);
  }
  setEnabled(jobId, enabled) {
    const job = this.jobs.get(jobId);
    if (!job) return;
    job.def.enabled = enabled;
    if (this.started) {
      if (enabled) {
        this.startJob(job);
      } else {
        this.stopJob(job);
      }
    }
  }
  // ── private ────────────────────────────────────────
  startJob(job) {
    if (job.timerId) return;
    if (job.def.type === "interval") {
      job.timerId = setInterval(() => {
        this.executeJob(job);
      }, job.def.intervalMs);
    }
  }
  stopJob(job) {
    if (job.timerId) {
      clearInterval(job.timerId);
      clearTimeout(job.timerId);
      job.timerId = null;
    }
  }
  checkDailyJobs() {
    const now = /* @__PURE__ */ new Date();
    const timeZone = resolveConfiguredTimeZone(getSettings().timeZone);
    const hhmm = getClockTimeInTimeZone(now, timeZone);
    for (const job of this.jobs.values()) {
      if (job.def.type === "daily" && job.def.enabled && job.def.time === hhmm) {
        this.executeJob(job);
      }
    }
  }
  executeJob(job) {
    const cronExpr = job.def.type === "interval" ? `every ${job.def.intervalMs}ms` : `daily@${job.def.time}`;
    bus.emit("schedule:triggered", {
      jobId: job.def.id,
      cronExpr
    });
    try {
      const result = job.callback(job.def.id);
      if (result && typeof result.catch === "function") {
        result.catch((err) => {
          appLogger.warn({
            scope: "scheduler",
            message: `调度任务 ${job.def.id} 异步执行失败`,
            error: err instanceof Error ? err : new Error(String(err))
          });
        });
      }
    } catch (err) {
      appLogger.warn({
        scope: "scheduler",
        message: `调度任务 ${job.def.id} 执行失败`,
        error: err instanceof Error ? err : new Error(String(err))
      });
    }
  }
}
const scheduler = new Scheduler();
const MAX_FILE_SIZE = 10 * 1024 * 1024;
let auditPath = "";
let initialized$1 = false;
function getAuditPath() {
  if (!auditPath) {
    auditPath = join(app.getPath("userData"), "logs", "bus-audit.jsonl");
  }
  return auditPath;
}
function ensureDir$1(filePath) {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}
function rotateIfNeeded(filePath) {
  try {
    if (existsSync(filePath) && statSync(filePath).size > MAX_FILE_SIZE) {
      const rotated = filePath.replace(/\.jsonl$/, `.${Date.now()}.jsonl`);
      renameSync(filePath, rotated);
    }
  } catch {
  }
}
function writeAuditLine(event, data) {
  const filePath = getAuditPath();
  ensureDir$1(filePath);
  rotateIfNeeded(filePath);
  const line = JSON.stringify({
    ts: Date.now(),
    event,
    data
  });
  try {
    appendFileSync(filePath, line + "\n", "utf-8");
  } catch (err) {
    appLogger.warn({
      scope: "bus-audit",
      message: "写入审计日志失败",
      error: err instanceof Error ? err : new Error(String(err))
    });
  }
}
function initBusAuditLog() {
  if (initialized$1) return;
  initialized$1 = true;
  bus.onAny((event, data) => {
    writeAuditLine(event, data);
  });
  appLogger.info({
    scope: "bus-audit",
    message: "Event Bus 审计日志已启用",
    data: { path: getAuditPath() }
  });
}
function getMemoryDir() {
  return join(app.getPath("userData"), "data", "memory");
}
const memoryIntegrityCheck = {
  id: "memory-integrity",
  name: "记忆文件完整性",
  intervalMs: 30 * 6e4,
  async check() {
    const memDir = getMemoryDir();
    const indexPath = join(memDir, "MEMORY.md");
    const topicsDir = join(memDir, "topics");
    if (!existsSync(indexPath)) {
      return {
        healthy: false,
        message: "MEMORY.md 索引文件不存在",
        severity: "warning"
      };
    }
    const indexContent = readFileSync(indexPath, "utf-8");
    if (!existsSync(topicsDir)) {
      if (indexContent.includes("## ")) {
        return {
          healthy: false,
          message: "索引引用了主题，但 topics/ 目录不存在",
          severity: "warning"
        };
      }
      return { healthy: true, message: "记忆系统为空但结构正常", severity: "info" };
    }
    const topicFiles = readdirSync(topicsDir).filter((f) => f.endsWith(".md"));
    const indexTopics = (indexContent.match(/\[([^\]]+)\]/g) || []).map(
      (m) => m.slice(1, -1)
    );
    const missing = indexTopics.filter(
      (t) => !topicFiles.some((f) => f.replace(".md", "") === t.replace(/[^a-zA-Z0-9_\-\u4e00-\u9fff]/g, "_"))
    );
    if (missing.length > 0) {
      return {
        healthy: false,
        message: `索引引用了 ${missing.length} 个不存在的 topic: ${missing.slice(0, 3).join(", ")}`,
        severity: "warning"
      };
    }
    return { healthy: true, message: `记忆系统正常 (${topicFiles.length} 个 topic)`, severity: "info" };
  },
  async repair() {
    const memDir = getMemoryDir();
    const topicsDir = join(memDir, "topics");
    const indexPath = join(memDir, "MEMORY.md");
    if (!existsSync(topicsDir)) return false;
    const topicFiles = readdirSync(topicsDir).filter((f) => f.endsWith(".md"));
    const lines = ["# Memory Index\n"];
    for (const file of topicFiles) {
      const topic = file.replace(".md", "");
      const content = readFileSync(join(topicsDir, file), "utf-8");
      const firstLine = content.split("\n").find((l) => l.trim())?.replace(/^#+\s*/, "") || topic;
      lines.push(`- [${topic}](topics/${file}) — ${firstLine}`);
    }
    writeFileSync(indexPath, lines.join("\n") + "\n", "utf-8");
    return true;
  }
};
const contextBudgetCheck = {
  id: "context-budget",
  name: "上下文预算健康",
  intervalMs: 10 * 6e4,
  async check() {
    return { healthy: true, message: "上下文预算正常", severity: "info" };
  }
};
const diskSpaceCheck = {
  id: "disk-space",
  name: "数据目录容量",
  intervalMs: 60 * 6e4,
  async check() {
    const dataDir = join(app.getPath("userData"), "data");
    if (!existsSync(dataDir)) {
      return { healthy: true, message: "数据目录尚未创建", severity: "info" };
    }
    try {
      let totalSize = 0;
      const countDir = (dir) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const fullPath = join(dir, entry.name);
          if (entry.isFile()) {
            try {
              const { size } = require2("node:fs").statSync(fullPath);
              totalSize += size;
            } catch {
            }
          } else if (entry.isDirectory()) {
            countDir(fullPath);
          }
        }
      };
      countDir(dataDir);
      const sizeMb = totalSize / (1024 * 1024);
      if (sizeMb > 500) {
        return {
          healthy: false,
          message: `数据目录占用 ${sizeMb.toFixed(0)} MB，建议清理`,
          severity: "warning"
        };
      }
      return {
        healthy: true,
        message: `数据目录占用 ${sizeMb.toFixed(1)} MB`,
        severity: "info"
      };
    } catch {
      return { healthy: true, message: "无法计算数据目录大小", severity: "info" };
    }
  }
};
const builtinChecks = [
  memoryIntegrityCheck,
  contextBudgetCheck,
  diskSpaceCheck
];
const customChecks = [];
let lastReport = null;
async function runAllChecks() {
  const allChecks = [...builtinChecks, ...customChecks];
  const results = [];
  for (const check of allChecks) {
    try {
      const status = await check.check();
      let repaired = false;
      if (!status.healthy && check.repair) {
        try {
          repaired = await check.repair();
          if (repaired) {
            bus.emit("diagnosis:repaired", {
              checkId: check.id,
              message: `${check.name} 已自动修复`
            });
          }
        } catch {
        }
      }
      if (status.healthy) {
        bus.emit("diagnosis:healthy", { checkId: check.id });
      } else {
        bus.emit("diagnosis:alert", {
          checkId: check.id,
          message: status.message,
          severity: status.severity
        });
      }
      results.push({ id: check.id, name: check.name, status, repaired });
    } catch (err) {
      results.push({
        id: check.id,
        name: check.name,
        status: {
          healthy: false,
          message: `检查本身出错: ${err instanceof Error ? err.message : String(err)}`,
          severity: "warning"
        },
        repaired: false
      });
    }
  }
  lastReport = { timestamp: Date.now(), checks: results };
  return lastReport;
}
const diagnosisCallback = async () => {
  const report = await runAllChecks();
  const unhealthy = report.checks.filter((c) => !c.status.healthy);
  if (unhealthy.length > 0) {
    appLogger.warn({
      scope: "self-diagnosis",
      message: `诊断发现 ${unhealthy.length} 个问题`,
      data: { checks: unhealthy.map((c) => `${c.name}: ${c.status.message}`) }
    });
  } else {
    appLogger.info({
      scope: "self-diagnosis",
      message: `诊断完成，所有 ${report.checks.length} 项检查通过`
    });
  }
};
function initSelfDiagnosis() {
  scheduler.register(
    {
      id: "self-diagnosis",
      name: "系统自我诊断",
      enabled: true,
      type: "interval",
      intervalMs: 15 * 6e4
      // 15 分钟
    },
    diagnosisCallback
  );
  void runAllChecks();
}
const activeRuns = /* @__PURE__ */ new Map();
let metricsPath = "";
let initialized = false;
function getMetricsPath() {
  if (!metricsPath) {
    metricsPath = join(app.getPath("userData"), "data", "metrics.jsonl");
  }
  return metricsPath;
}
function ensureDir(filePath) {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}
function appendMetric(metric) {
  const filePath = getMetricsPath();
  ensureDir(filePath);
  try {
    appendFileSync(filePath, JSON.stringify(metric) + "\n", "utf-8");
  } catch (err) {
    appLogger.warn({
      scope: "metrics",
      message: "写入指标失败",
      error: err instanceof Error ? err : new Error(String(err))
    });
  }
}
function initMetrics() {
  if (initialized) return;
  initialized = true;
  bus.on("run:started", ({ runId, sessionId, modelEntryId }) => {
    activeRuns.set(runId, {
      sessionId,
      modelEntryId,
      startedAt: Date.now(),
      toolCalls: 0,
      toolFails: 0
    });
  });
  bus.on("tool:completed", ({ runId }) => {
    const tracker = activeRuns.get(runId);
    if (tracker) tracker.toolCalls++;
  });
  bus.on("tool:failed", ({ runId }) => {
    const tracker = activeRuns.get(runId);
    if (tracker) {
      tracker.toolCalls++;
      tracker.toolFails++;
    }
  });
  bus.on("run:completed", ({ runId, finalState }) => {
    const tracker = activeRuns.get(runId);
    if (!tracker) return;
    const endedAt = Date.now();
    const metric = {
      runId,
      sessionId: tracker.sessionId,
      modelEntryId: tracker.modelEntryId,
      startedAt: tracker.startedAt,
      endedAt,
      durationMs: endedAt - tracker.startedAt,
      toolCallCount: tracker.toolCalls,
      toolFailCount: tracker.toolFails,
      finalState
    };
    appendMetric(metric);
    activeRuns.delete(runId);
  });
  appLogger.info({
    scope: "metrics",
    message: "性能指标采集已启用",
    data: { path: getMetricsPath() }
  });
}
const SIGNAL_THRESHOLD = 3;
const MAX_SAMPLES_PER_SIGNAL = 5;
const SIGNAL_DECAY_MS = 7 * 24 * 60 * 60 * 1e3;
const failureAccum = /* @__PURE__ */ new Map();
const rejectionAccum = /* @__PURE__ */ new Map();
const producedLearnings = /* @__PURE__ */ new Set();
function onToolFailed$1(data) {
  const key = data.toolName;
  const accum = failureAccum.get(key) ?? { count: 0, lastSeen: 0, samples: [] };
  accum.count++;
  accum.lastSeen = Date.now();
  if (accum.samples.length < MAX_SAMPLES_PER_SIGNAL) {
    accum.samples.push(data.error.slice(0, 200));
  }
  failureAccum.set(key, accum);
  if (accum.count >= SIGNAL_THRESHOLD && !producedLearnings.has(`failure:${key}`)) {
    void processSignal({
      type: "tool_repeated_failure",
      toolName: key,
      message: `工具 ${key} 连续失败 ${accum.count} 次。常见错误: ${accum.samples[0]}`,
      sessionId: data.sessionId,
      timestamp: Date.now()
    });
  }
}
function onApprovalResolved(data) {
  if (data.allowed) return;
  const toolName = data.requestId.split("-")[0] || "unknown";
  const key = toolName;
  const accum = rejectionAccum.get(key) ?? { count: 0, lastSeen: 0, samples: [] };
  accum.count++;
  accum.lastSeen = Date.now();
  rejectionAccum.set(key, accum);
  if (accum.count >= SIGNAL_THRESHOLD && !producedLearnings.has(`reject:${key}`)) {
    void processSignal({
      type: "retry_after_reject",
      toolName: key,
      message: `工具 ${key} 被用户拒绝 ${accum.count} 次，Agent 应考虑替代方案或减少使用`,
      sessionId: data.sessionId,
      timestamp: Date.now()
    });
  }
}
async function processSignal(signal) {
  const learningKey = `${signal.type}:${signal.toolName}`;
  if (producedLearnings.has(learningKey)) return;
  try {
    const store = getMemdirStore();
    let summary;
    let detail;
    switch (signal.type) {
      case "tool_repeated_failure":
        summary = `[学习] 工具 ${signal.toolName} 频繁失败，需注意参数校验`;
        detail = [
          `信号类型: ${signal.type}`,
          `工具: ${signal.toolName}`,
          `描述: ${signal.message}`,
          `建议: 使用该工具前先验证参数有效性，或考虑替代工具`
        ].join("\n");
        break;
      case "retry_after_reject":
        summary = `[学习] 工具 ${signal.toolName} 常被用户拒绝，优先尝试其他方案`;
        detail = [
          `信号类型: ${signal.type}`,
          `工具: ${signal.toolName}`,
          `描述: ${signal.message}`,
          `建议: 减少使用该工具，或在使用前先征求用户意见`
        ].join("\n");
        break;
      case "tool_discovery_opportunity":
        summary = `[学习] 用户可能不知道工具 ${signal.toolName} 的存在`;
        detail = signal.message;
        break;
      case "tool_misuse_pattern":
        summary = `[学习] 工具 ${signal.toolName} 的参数使用存在常见错误模式`;
        detail = signal.message;
        break;
      default:
        summary = `[学习] ${signal.message}`;
        detail = `信号类型: ${signal.type}, 工具: ${signal.toolName}`;
    }
    store.save({
      summary,
      detail,
      topic: "learnings",
      source: "system:active-learning"
    });
    producedLearnings.add(learningKey);
    bus.emit("learning:applied", {
      type: signal.type,
      target: signal.toolName,
      message: summary
    });
    appLogger.info({
      scope: "active-learning",
      message: `生成学习条目: ${summary.slice(0, 60)}`
    });
  } catch (err) {
    appLogger.error({
      scope: "active-learning",
      message: "学习条目写入失败",
      error: err instanceof Error ? err : new Error(String(err))
    });
  }
}
function decaySignals() {
  const now = Date.now();
  for (const [key, accum] of failureAccum) {
    if (now - accum.lastSeen > SIGNAL_DECAY_MS) {
      failureAccum.delete(key);
      producedLearnings.delete(`failure:${key}`);
    }
  }
  for (const [key, accum] of rejectionAccum) {
    if (now - accum.lastSeen > SIGNAL_DECAY_MS) {
      rejectionAccum.delete(key);
      producedLearnings.delete(`reject:${key}`);
    }
  }
}
function initActiveLearning() {
  bus.on("tool:failed", onToolFailed$1);
  bus.on("approval:resolved", onApprovalResolved);
  scheduler.register(
    {
      id: "active-learning-decay",
      name: "主动学习信号衰减",
      type: "interval",
      intervalMs: 60 * 60 * 1e3,
      // 每小时
      enabled: true
    },
    decaySignals
  );
  appLogger.info({
    scope: "active-learning",
    message: "主动学习引擎已启动"
  });
}
const COOLDOWN_MS = 5 * 60 * 1e3;
const DEFAULT_STATE = {
  currentMode: "focused",
  confidence: 0.5,
  since: Date.now(),
  signals: [],
  locked: false
};
let state = { ...DEFAULT_STATE };
let recentMessageTimestamps = [];
let recentErrorCount = 0;
let lastMessageLength = 0;
function getStatePath() {
  return join(app.getPath("userData"), "data", "emotional-state.json");
}
function loadState() {
  try {
    const raw = readFileSync(getStatePath(), "utf-8");
    return { ...DEFAULT_STATE, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_STATE };
  }
}
function saveState() {
  try {
    const dir = join(app.getPath("userData"), "data");
    mkdirSync(dir, { recursive: true });
    writeFileSync(getStatePath(), JSON.stringify(state, null, 2), "utf-8");
  } catch (err) {
    appLogger.error({
      scope: "emotional",
      message: "情感状态保存失败",
      error: err instanceof Error ? err : new Error(String(err))
    });
  }
}
function collectSignals() {
  const signals = [];
  const now = Date.now();
  const hour = (/* @__PURE__ */ new Date()).getHours();
  if (hour >= 0 && hour < 6) {
    signals.push({ type: "time_of_day", value: -0.5, weight: 0.3 });
  } else if (hour >= 6 && hour < 9) {
    signals.push({ type: "time_of_day", value: 0.3, weight: 0.2 });
  } else if (hour >= 9 && hour < 18) {
    signals.push({ type: "time_of_day", value: 0.5, weight: 0.2 });
  } else {
    signals.push({ type: "time_of_day", value: 0, weight: 0.1 });
  }
  const recentWindow = recentMessageTimestamps.filter((t) => now - t < 5 * 60 * 1e3);
  if (recentWindow.length >= 5) {
    signals.push({ type: "reply_frequency", value: 0.7, weight: 0.3 });
  } else if (recentWindow.length <= 1) {
    signals.push({ type: "reply_frequency", value: -0.3, weight: 0.2 });
  }
  if (lastMessageLength > 200) {
    signals.push({ type: "message_length", value: 0.5, weight: 0.2 });
  } else if (lastMessageLength < 20 && lastMessageLength > 0) {
    signals.push({ type: "message_length", value: -0.3, weight: 0.15 });
  }
  if (recentErrorCount >= 3) {
    signals.push({ type: "error_streak", value: -0.8, weight: 0.4 });
  }
  return signals;
}
function computeNextMode(signals) {
  let totalWeight = 0;
  let weightedSum = 0;
  for (const sig of signals) {
    totalWeight += sig.weight;
    weightedSum += sig.value * sig.weight;
  }
  const avgSignal = totalWeight > 0 ? weightedSum / totalWeight : 0;
  const hasErrorStreak = signals.some((s) => s.type === "error_streak" && s.value < -0.5);
  if (hasErrorStreak) {
    return { mode: "encouraging", confidence: 0.8 };
  }
  const hasCreativeCue = signals.some((s) => s.type === "explicit_cue" && s.value > 0.5);
  if (hasCreativeCue) {
    return { mode: "creative", confidence: 0.9 };
  }
  if (avgSignal > 0.4) {
    return { mode: "focused", confidence: Math.min(0.9, 0.5 + avgSignal) };
  }
  if (avgSignal > 0.1) {
    return { mode: "companion", confidence: 0.6 };
  }
  if (avgSignal < -0.3) {
    return { mode: "quiet", confidence: Math.min(0.8, 0.5 + Math.abs(avgSignal)) };
  }
  return { mode: "companion", confidence: 0.5 };
}
function evaluateAndTransition() {
  if (state.locked) return state;
  if (Date.now() - state.since < COOLDOWN_MS) return state;
  const signals = collectSignals();
  const next = computeNextMode(signals);
  if (next.mode !== state.currentMode && next.confidence > 0.6) {
    const from = state.currentMode;
    state = {
      currentMode: next.mode,
      confidence: next.confidence,
      since: Date.now(),
      signals,
      locked: false
    };
    bus.emit("emotion:changed", {
      from,
      to: next.mode,
      trigger: signals.map((s) => s.type).join(", ")
    });
    appLogger.info({
      scope: "emotional",
      message: `情感模式切换: ${from} → ${next.mode} (confidence: ${next.confidence.toFixed(2)})`
    });
    saveState();
  } else {
    state.signals = signals;
  }
  return state;
}
function onUserMessage(data) {
  recentMessageTimestamps.push(Date.now());
  const cutoff = Date.now() - 10 * 60 * 1e3;
  recentMessageTimestamps = recentMessageTimestamps.filter((t) => t > cutoff);
  lastMessageLength = data.text.length;
  const text = data.text.toLowerCase();
  if (text.includes("头脑风暴") || text.includes("想想办法") || text.includes("brainstorm")) {
    state.signals.push({ type: "explicit_cue", value: 0.8, weight: 0.9 });
  }
  if (text.includes("安静") || text.includes("别说了") || text.includes("quiet")) {
    state.signals.push({ type: "explicit_cue", value: -0.8, weight: 0.9 });
  }
  recentErrorCount = 0;
}
function onToolFailed() {
  recentErrorCount++;
}
function onRunCompleted() {
  evaluateAndTransition();
}
function initEmotionalStateMachine() {
  state = loadState();
  bus.on("message:user", onUserMessage);
  bus.on("tool:failed", onToolFailed);
  bus.on("run:completed", onRunCompleted);
  appLogger.info({
    scope: "emotional",
    message: `情感状态机已启动 — 当前模式: ${state.currentMode}`
  });
}
const DECAY_DAYS = 30;
const DECAY_MS = DECAY_DAYS * 24 * 60 * 60 * 1e3;
const MAX_ACTIVE_TRAITS = 20;
const INITIAL_STRENGTH = 0.3;
const REINFORCE_BOOST = 0.15;
const DECAY_AMOUNT = 0.1;
let drift = {
  traits: [],
  lastUpdated: Date.now(),
  generation: 0
};
function getDriftPath() {
  return join(app.getPath("userData"), "data", "personality-drift.json");
}
function loadDrift() {
  const path2 = getDriftPath();
  if (!existsSync(path2)) {
    return { traits: [], lastUpdated: Date.now(), generation: 0 };
  }
  try {
    return JSON.parse(readFileSync(path2, "utf-8"));
  } catch {
    return { traits: [], lastUpdated: Date.now(), generation: 0 };
  }
}
function saveDrift() {
  try {
    const dir = join(app.getPath("userData"), "data");
    mkdirSync(dir, { recursive: true });
    drift.lastUpdated = Date.now();
    writeFileSync(getDriftPath(), JSON.stringify(drift, null, 2), "utf-8");
  } catch (err) {
    appLogger.error({
      scope: "personality-drift",
      message: "性格漂移数据保存失败",
      error: err instanceof Error ? err : new Error(String(err))
    });
  }
}
function processPersonalityDrift(candidates, source) {
  const now = Date.now();
  for (const candidate of candidates) {
    const normalized = candidate.trim();
    if (!normalized) continue;
    const existing = drift.traits.find(
      (t) => t.trait === normalized || isSimilarTrait(t.trait, normalized)
    );
    if (existing) {
      existing.mentionCount++;
      existing.lastReinforced = now;
      existing.strength = Math.min(1, existing.strength + REINFORCE_BOOST);
      existing.source = `${existing.source}; ${source}`;
    } else {
      drift.traits.push({
        trait: normalized,
        source,
        strength: INITIAL_STRENGTH,
        firstSeen: now,
        lastReinforced: now,
        mentionCount: 1,
        locked: false
      });
    }
  }
  decayTraits();
  pruneTraits();
  drift.generation++;
  saveDrift();
}
function isSimilarTrait(a, b) {
  const la = a.toLowerCase();
  const lb = b.toLowerCase();
  return la.includes(lb) || lb.includes(la);
}
function decayTraits() {
  const now = Date.now();
  for (const trait of drift.traits) {
    if (trait.locked) continue;
    if (now - trait.lastReinforced > DECAY_MS) {
      trait.strength = Math.max(0, trait.strength - DECAY_AMOUNT);
    }
  }
  drift.traits = drift.traits.filter((t) => t.strength > 0 || t.locked);
}
function pruneTraits() {
  if (drift.traits.length <= MAX_ACTIVE_TRAITS) return;
  drift.traits.sort((a, b) => {
    if (a.locked && !b.locked) return -1;
    if (!a.locked && b.locked) return 1;
    return b.strength - a.strength;
  });
  drift.traits = drift.traits.slice(0, MAX_ACTIVE_TRAITS);
}
function initPersonalityDrift() {
  drift = loadDrift();
  appLogger.info({
    scope: "personality-drift",
    message: `性格漂移层已加载 — ${drift.traits.length} 个 trait, 第 ${drift.generation} 代`
  });
}
const DAILY_REFLECTION_TIME = "02:00";
function getTodaySessions() {
  const timeZone = resolveConfiguredTimeZone(getSettings().timeZone);
  const todayStr = getDateKeyInTimeZone(/* @__PURE__ */ new Date(), timeZone);
  const summaries = listSessions();
  const result = [];
  for (const summary of summaries) {
    if (getDateKeyInTimeZone(summary.updatedAt, timeZone) !== todayStr) continue;
    const session = loadSession(summary.id);
    if (!session || session.messages.length === 0) continue;
    const msgs = [];
    for (const msg of session.messages) {
      if (msg.role === "user" || msg.role === "assistant") {
        const text = msg.content?.slice(0, 300) || "";
        if (text) msgs.push(`[${msg.role}]: ${text}`);
      }
    }
    if (msgs.length > 0) {
      result.push({
        sessionId: summary.id,
        title: session.title,
        messageCount: session.messages.length,
        messages: msgs
      });
    }
  }
  return result;
}
function generateLocalReflection(sessions) {
  const timeZone = resolveConfiguredTimeZone(getSettings().timeZone);
  const today = getDateKeyInTimeZone(/* @__PURE__ */ new Date(), timeZone);
  if (sessions.length === 0) {
    return {
      date: today,
      userMoodSummary: "今天没有对话活动",
      whatWorked: [],
      whatDidnt: [],
      patterns: [],
      tomorrowSuggestions: [],
      actionableInsights: [],
      personalityDrift: []
    };
  }
  const totalMessages = sessions.reduce((sum, s) => sum + s.messageCount, 0);
  const allUserMessages = sessions.flatMap(
    (s) => s.messages.filter((m) => m.startsWith("[user]:")).map((m) => m.slice(8))
  );
  const positiveKeywords = ["谢谢", "不错", "好的", "可以", "厉害", "nice", "good", "thanks", "完美", "赞"];
  const negativeKeywords = ["不对", "错了", "不行", "重来", "bug", "问题", "烦", "崩"];
  let positiveCount = 0;
  let negativeCount = 0;
  for (const msg of allUserMessages) {
    const lower = msg.toLowerCase();
    if (positiveKeywords.some((kw) => lower.includes(kw))) positiveCount++;
    if (negativeKeywords.some((kw) => lower.includes(kw))) negativeCount++;
  }
  let userMoodSummary;
  if (positiveCount > negativeCount * 2) {
    userMoodSummary = "用户今天整体心情不错，对互动比较满意";
  } else if (negativeCount > positiveCount * 2) {
    userMoodSummary = "用户今天遇到了一些困难，可能有些沮丧";
  } else {
    userMoodSummary = "用户今天状态正常，有积极也有挫折";
  }
  const wordFreq = /* @__PURE__ */ new Map();
  for (const msg of allUserMessages) {
    const words = msg.split(/[\s,，。！？、；：""''()（）\[\]{}<>]+/).filter((w) => w.length >= 2);
    for (const w of words) {
      wordFreq.set(w, (wordFreq.get(w) ?? 0) + 1);
    }
  }
  const patterns = [...wordFreq.entries()].filter(([, count]) => count >= 3).sort(([, a], [, b]) => b - a).slice(0, 5).map(([word, count]) => `"${word}" 出现 ${count} 次`);
  return {
    date: today,
    userMoodSummary,
    whatWorked: [`今天共 ${sessions.length} 个对话，${totalMessages} 条消息`],
    whatDidnt: negativeCount > 0 ? [`用户反馈了 ${negativeCount} 次负面信息`] : [],
    patterns,
    tomorrowSuggestions: [],
    actionableInsights: positiveCount > negativeCount ? [`用户对今天的互动较满意，继续保持当前风格`] : negativeCount > positiveCount ? [`用户遇到较多困难，明天尝试更主动地提供帮助`] : [],
    personalityDrift: []
  };
}
function getReflectionDir() {
  return join(app.getPath("userData"), "data", "reflections");
}
function saveDailyReflection(report) {
  const dir = getReflectionDir();
  mkdirSync(dir, { recursive: true });
  const filepath = join(dir, `${report.date}.json`);
  writeFileSync(filepath, JSON.stringify(report, null, 2), "utf-8");
}
async function runDailyReflection() {
  const sessions = getTodaySessions();
  appLogger.info({
    scope: "reflection",
    message: `开始每日反思 — 今天有 ${sessions.length} 个对话`
  });
  const report = generateLocalReflection(sessions);
  saveDailyReflection(report);
  const store = getMemdirStore();
  for (const insight of report.actionableInsights) {
    store.save({
      summary: insight,
      topic: "reflections",
      source: "system:reflection"
    });
  }
  if (report.personalityDrift.length > 0) {
    processPersonalityDrift(report.personalityDrift, report.date);
  }
  bus.emit("reflection:completed", {
    date: report.date,
    sessionCount: sessions.length,
    insightCount: report.actionableInsights.length
  });
  appLogger.info({
    scope: "reflection",
    message: `每日反思完成 — ${report.actionableInsights.length} 条可执行洞察`
  });
  return report;
}
function initReflectionService() {
  scheduler.register(
    {
      id: "daily-reflection",
      name: "每日反思",
      type: "daily",
      time: DAILY_REFLECTION_TIME,
      enabled: true
    },
    async () => {
      try {
        await runDailyReflection();
      } catch (err) {
        appLogger.error({
          scope: "reflection",
          message: "每日反思执行失败",
          error: err instanceof Error ? err : new Error(String(err))
        });
      }
    }
  );
  appLogger.info({
    scope: "reflection",
    message: `反思服务已启动 — 每日 ${DAILY_REFLECTION_TIME} 自动执行`
  });
}
const DEFAULT_CONFIG = {
  port: 17433,
  enabled: false,
  secret: ""
};
let server = null;
let currentConfig = { ...DEFAULT_CONFIG };
function verifySignature(body, signature, secret) {
  if (!secret) return true;
  const expected = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
  return expected === signature;
}
function handleRequest(req, res) {
  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Method Not Allowed" }));
    return;
  }
  const chunks = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", () => {
    const body = Buffer.concat(chunks).toString("utf-8");
    if (currentConfig.secret) {
      const sig = req.headers["x-webhook-signature"] || "";
      if (!verifySignature(body, sig, currentConfig.secret)) {
        appLogger.warn({
          scope: "webhook",
          message: "签名验证失败",
          data: { ip: req.socket.remoteAddress }
        });
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized" }));
        return;
      }
    }
    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON" }));
      return;
    }
    const source = req.headers["x-webhook-source"] || "unknown";
    const event = req.headers["x-webhook-event"] || "generic";
    bus.emit("webhook:received", { source, event, payload });
    appLogger.info({
      scope: "webhook",
      message: `收到 webhook: ${source}/${event}`
    });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });
  req.on("error", (err) => {
    appLogger.error({
      scope: "webhook",
      message: "请求读取失败",
      error: err
    });
    res.writeHead(500);
    res.end();
  });
}
function startWebhookServer(config) {
  if (server) return;
  currentConfig = { ...DEFAULT_CONFIG, ...config };
  if (!currentConfig.enabled) return;
  server = createServer(handleRequest);
  server.listen(currentConfig.port, "127.0.0.1", () => {
    appLogger.info({
      scope: "webhook",
      message: `Webhook 服务已启动 → 127.0.0.1:${currentConfig.port}`
    });
  });
  server.on("error", (err) => {
    appLogger.error({
      scope: "webhook",
      message: "Webhook 服务启动失败",
      error: err
    });
    server = null;
  });
}
function stopWebhookServer() {
  if (!server) return;
  server.close(() => {
    appLogger.info({ scope: "webhook", message: "Webhook 服务已停止" });
  });
  server = null;
}
function startBackgroundServices() {
  initBusAuditLog();
  initMetrics();
  initSelfDiagnosis();
  initActiveLearning();
  initPersonalityDrift();
  initEmotionalStateMachine();
  initReflectionService();
  scheduler.start();
  startWebhookServer();
}
function stopBackgroundServices() {
  stopWebhookServer();
  scheduler.stop();
}
const SHORTCUT = "Alt+Space";
function registerQuickInvoke(getWindow) {
  const ok = globalShortcut.register(SHORTCUT, () => {
    const win = getWindow();
    if (!win) return;
    if (win.isMinimized()) win.restore();
    if (!win.isVisible()) win.show();
    win.focus();
    win.webContents.send("quick-invoke:focus-composer");
  });
  if (ok) {
    appLogger.info({
      scope: "quick-invoke",
      message: `全局快捷键 ${SHORTCUT} 注册成功`
    });
  } else {
    appLogger.warn({
      scope: "quick-invoke",
      message: `全局快捷键 ${SHORTCUT} 注册失败（可能被其他应用占用）`
    });
  }
}
function unregisterQuickInvoke() {
  globalShortcut.unregister(SHORTCUT);
}
configureAppIdentity();
function registerIpcHandlers() {
  registerFilesIpc();
  registerSessionsIpc();
  registerChatIpc();
  registerHarnessIpc();
  registerSettingsIpc();
  registerProvidersIpc();
  registerWorkspaceIpc();
  registerWorkbenchIpc();
  registerWorkerIpc();
  registerWindowIpc();
}
registerProcessLogging();
app.whenReady().then(() => {
  migrateLegacyUserData();
  appLogger.info({
    scope: "app.lifecycle",
    message: "应用启动完成"
  });
  const recoveredRuns = harnessRuntime.hydrateFromDisk();
  recoverInterruptedRuns(recoveredRuns);
  startBackgroundServices();
  registerIpcHandlers();
  const window = createMainWindow();
  setTerminalWindow(window);
  registerQuickInvoke(getMainWindow);
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const window2 = createMainWindow();
      setTerminalWindow(window2);
    }
  });
}).catch((error) => {
  appLogger.error({
    scope: "app.lifecycle",
    message: "应用启动失败",
    error
  });
  throw error;
});
app.on("window-all-closed", () => {
  appLogger.info({
    scope: "app.lifecycle",
    message: "所有窗口已关闭"
  });
  void destroyAllAgents();
  destroyAllTerminals();
  unregisterQuickInvoke();
  stopBackgroundServices();
  if (process.platform !== "darwin") {
    app.quit();
  }
});
