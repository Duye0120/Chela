import * as pty from "node-pty";
import type { BrowserWindow } from "electron";
import { statSync } from "node:fs";
import { extname, isAbsolute } from "node:path";
import { IPC_CHANNELS } from "../shared/ipc.ts";
import { isTerminalAgentId, TERMINAL_AGENTS, type TerminalAgentId } from "../shared/terminal-agents.ts";
import { appLogger } from "./logger.ts";
import { findExecutableOnPath, resolveShell } from "./shell.ts";
import { getSettings } from "./settings.ts";

type TerminalInstance = {
  ptyProcess: pty.IPty;
  cwd: string;
  output: string;
  attached: boolean;
  exitCode?: number;
};

// shortcut: reload replays the latest 64K characters, use a persistent buffer if full history is needed.
const REPLAY_OUTPUT_LIMIT = 64 * 1024;
const terminals = new Map<string, TerminalInstance>();
let mainWindow: BrowserWindow | null = null;
let terminalEndListener: ((id: string, state: "exited" | "interrupted") => void) | undefined;

export function setTerminalEndListener(listener: typeof terminalEndListener): void {
  terminalEndListener = listener;
}

function notifyTerminalEnd(id: string, state: "exited" | "interrupted"): void {
  try { terminalEndListener?.(id, state); } catch (error) {
    appLogger.warn({ scope: "terminal", message: "保存终端结束状态失败", data: { terminalId: id }, error });
  }
}

function safeSendToRenderer(channel: string, terminalId: string, payload: string | number): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  try {
    mainWindow.webContents.send(channel, terminalId, payload);
  } catch (error) {
    appLogger.warn({
      scope: "terminal",
      message: "向渲染进程发送终端事件失败",
      data: {
        channel,
        terminalId,
      },
      error,
    });
  }
}

export function setTerminalWindow(window: BrowserWindow): void {
  if (mainWindow === window) return;
  mainWindow = window;
  const suspendDelivery = () => {
    if (mainWindow !== window) return;
    for (const terminal of terminals.values()) terminal.attached = false;
  };
  window.webContents.on("did-start-navigation", ({ isSameDocument, isMainFrame }) => {
    if (isMainFrame && !isSameDocument) suspendDelivery();
  });
  window.webContents.on("render-process-gone", suspendDelivery);
  suspendDelivery();
}

function resolveTerminalAgent(agent: TerminalAgentId) {
  const windows = process.platform === "win32";
  const command = findExecutableOnPath(windows
    ? [`${agent}.exe`, `${agent}.cmd`, `${agent}.bat`, `${agent}.ps1`]
    : [agent]);
  if (!command || !isAbsolute(command)) {
    throw new Error(`未在 PATH 中找到 ${TERMINAL_AGENTS[agent]}，安装后重新打开 Chela 再试`);
  }
  if (windows && extname(command).toLowerCase() !== ".exe") {
    return {
      command: resolveShell("powershell").command,
      // PowerShell receives a literal path through the environment, never source text.
      args: ["-NoLogo", "-NoProfile", "-Command", "$ErrorActionPreference='Stop'; & $env:CHELA_TERMINAL_AGENT_PATH; exit $LASTEXITCODE"],
      env: { ...process.env, CHELA_TERMINAL_AGENT_PATH: command },
    };
  }
  return { command, args: [], env: process.env };
}

export function createTerminal(options?: { cwd?: string; agent?: TerminalAgentId }): string {
  const id = crypto.randomUUID();
  const settings = getSettings();
  const cwd = options?.cwd ?? settings.workspace;
  if (options?.cwd !== undefined &&
      (typeof cwd !== "string" || !isAbsolute(cwd) || !statSync(cwd, { throwIfNoEntry: false })?.isDirectory())) {
    throw new Error("终端工作目录必须是存在的绝对目录");
  }
  const agent = options?.agent;
  if (agent !== undefined && !isTerminalAgentId(agent)) throw new Error("不支持该终端执行者");
  const launch = agent ? resolveTerminalAgent(agent) : { ...resolveShell(settings.terminal.shell), env: process.env };

  const ptyProcess = pty.spawn(launch.command, launch.args, {
    name: "xterm-256color",
    cols: 80,
    rows: 24,
    cwd,
    env: launch.env as Record<string, string>,
  });

  const terminal: TerminalInstance = { ptyProcess, cwd, output: "", attached: false };
  terminals.set(id, terminal);

  ptyProcess.onData((data: string) => {
    if (!terminals.has(id)) return;
    terminal.output = (terminal.output + data).slice(-REPLAY_OUTPUT_LIMIT);
    if (terminal.attached) safeSendToRenderer(IPC_CHANNELS.terminalData, id, data);
  });
  ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
    if (!terminals.has(id)) return;
    terminal.exitCode = exitCode;
    notifyTerminalEnd(id, "exited");
    if (terminal.attached) {
      safeSendToRenderer(IPC_CHANNELS.terminalExit, id, exitCode);
      terminals.delete(id);
    }
  });

  return id;
}

export function attachTerminal(id: string): void {
  const terminal = terminals.get(id);
  if (!terminal || terminal.attached) return;
  terminal.attached = true;
  if (terminal.output) safeSendToRenderer(IPC_CHANNELS.terminalData, id, terminal.output);
  if (terminal.exitCode !== undefined) {
    safeSendToRenderer(IPC_CHANNELS.terminalExit, id, terminal.exitCode);
    terminals.delete(id);
  }
}

export function listTerminals(): Array<{ id: string; cwd: string; exitCode?: number }> {
  return Array.from(terminals, ([id, terminal]) => ({
    id, cwd: terminal.cwd, exitCode: terminal.exitCode,
  }));
}

export function getTerminalState(id: string): { cwd: string; exitCode?: number } | undefined {
  const terminal = terminals.get(id);
  return terminal && { cwd: terminal.cwd, exitCode: terminal.exitCode };
}

export function writeTerminal(id: string, data: string): void {
  const term = terminals.get(id);
  if (term && term.exitCode === undefined) term.ptyProcess.write(data);
}

export function resizeTerminal(id: string, cols: number, rows: number): void {
  const term = terminals.get(id);
  if (term && term.exitCode === undefined) term.ptyProcess.resize(cols, rows);
}

export function destroyTerminal(id: string): void {
  const term = terminals.get(id);
  if (term) {
    terminals.delete(id);
    if (term.exitCode !== undefined) return;
    try {
      term.ptyProcess.kill();
    } catch (error) {
      terminals.set(id, term);
      throw error;
    }
    notifyTerminalEnd(id, "interrupted");
  }
}

export function destroyAllTerminals(): void {
  // Failed kills reinsert entries; iterating the live Map would retry them forever.
  for (const id of [...terminals.keys()]) {
    try { destroyTerminal(id); } catch (error) {
      appLogger.warn({ scope: "terminal", message: "关闭终端会话失败", data: { terminalId: id }, error });
    }
  }
}
