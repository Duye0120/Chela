import { execFile, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { statSync } from "node:fs";
import { extname, isAbsolute, join } from "node:path";
import { promisify } from "node:util";
import { appLogger } from "./logger.ts";
import { sanitizeLogMessage } from "./log-sanitize.ts";
import { findExecutableOnPath, resolveShell } from "./shell.ts";

export type CodexTaskUpdate = {
  state: "running" | "finished" | "failed" | "interrupted";
  result: string;
};

type StartInput = {
  id: string;
  cwd: string;
  prompt: string;
  onUpdate: (update: CodexTaskUpdate) => void;
};

type ActiveTask = {
  child: ChildProcessWithoutNullStreams;
  closed: Promise<void>;
  cancellation?: Promise<boolean>;
  streamFailure?: string;
};

const tasks = new Map<string, ActiveTask>();
const maxLineLength = 1024 * 1024;
const maxResultLength = 50_000;
const maxPromptLength = 110_000;
const truncation = "\n…（结果已截断）";
const exec = promisify(execFile);
const windows = process.platform === "win32";
let stopping: Promise<void> | undefined;

function launchCommand() {
  const command = findExecutableOnPath(windows ? ["codex.exe", "codex.cmd", "codex.bat", "codex.ps1"] : ["codex"]);
  if (!command || !isAbsolute(command)) throw new Error("未在 PATH 找到可启动的 Codex CLI。");
  const args = ["exec", "--json", "--ephemeral", "--sandbox", "workspace-write", "--color", "never", "-c", 'approval_policy="never"', "-"];
  if (!windows || extname(command).toLowerCase() === ".exe") return { command, args, env: process.env };

  const powershell = resolveShell("powershell").command;
  if (!isAbsolute(powershell)) throw new Error("找不到 PowerShell，无法启动 Codex CLI 脚本。");
  return {
    command: powershell,
    args: [
      "-NoLogo", "-NoProfile", "-NonInteractive", "-Command",
      "$ErrorActionPreference='Stop'; & $env:CHELA_MANAGED_CODEX_PATH exec --json --ephemeral --sandbox workspace-write --color never -c 'approval_policy=\"never\"' '-'; exit $LASTEXITCODE",
    ],
    env: { ...process.env, CHELA_MANAGED_CODEX_PATH: command },
  };
}

function exited(child: ChildProcessWithoutNullStreams): boolean {
  return child.exitCode !== null || child.signalCode !== null;
}

async function terminateTree(child: ChildProcessWithoutNullStreams): Promise<boolean> {
  if (exited(child)) return false;
  const { pid } = child;
  if (!pid || !Number.isSafeInteger(pid) || pid <= 0) throw new Error("Codex 进程尚未启动。");
  try {
    if (windows) {
      const systemRoot = process.env.SystemRoot ?? process.env.WINDIR;
      if (!systemRoot || !isAbsolute(systemRoot)) throw new Error("找不到 Windows 进程管理工具。");
      await exec(join(systemRoot, "System32", "taskkill.exe"), ["/PID", String(pid), "/T", "/F"], {
        windowsHide: true, timeout: 5_000,
      });
    } else {
      // The detached child is the leader of this execution's process group.
      process.kill(-pid, "SIGKILL");
    }
    return true;
  } catch (error) {
    if (exited(child)) return false;
    throw new Error("无法终止此 Codex 进程树。", { cause: error });
  }
}

function requestTermination(task: ActiveTask): Promise<boolean> {
  task.cancellation ??= terminateTree(task.child).catch((error: unknown) => {
    task.cancellation = undefined;
    throw error;
  });
  return task.cancellation;
}

function bounded(text: string): string {
  return text.length <= maxResultLength ? text : text.slice(0, maxResultLength - truncation.length) + truncation;
}

export function startCodexTask({ id, cwd, prompt, onUpdate }: StartInput): void {
  if (stopping) throw new Error("正在停止 Codex 执行，请稍后重试。");
  if (!id.trim() || tasks.has(id)) throw new Error("该 Codex 执行已经启动或标识无效。");
  if (!isAbsolute(cwd) || !statSync(cwd, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error("Codex 执行目录必须是存在的绝对目录。");
  }
  if (!prompt.trim() || prompt.length > maxPromptLength) throw new Error("Codex 任务说明必须在 1 至 110,000 字符内。");
  const launch = launchCommand();
  const child = spawn(launch.command, launch.args, {
    cwd, env: launch.env, stdio: "pipe", windowsHide: true, detached: !windows,
  });
  let resolveClosed!: () => void;
  const closed = new Promise<void>((resolve) => { resolveClosed = resolve; });
  const task: ActiveTask = { child, closed };
  tasks.set(id, task);

  let pending = "";
  let stderr = "";
  let result = "";
  let started = false;
  let completed = false;
  let turnFailure: string | undefined;
  let processFailure: string | undefined;
  const notify = (update: CodexTaskUpdate) => {
    try { onUpdate(update); } catch (error) {
      appLogger.warn({ scope: "codex-task", message: "保存 Codex 执行状态失败", error });
    }
  };
  const rejectStream = (message: string) => {
    if (task.streamFailure) return;
    task.streamFailure = message;
    pending = "";
    void requestTermination(task).catch((error: unknown) => {
      appLogger.warn({ scope: "codex-task", message: "无法停止输出异常的 Codex 执行", error });
    });
  };
  const consumeLine = (line: string) => {
    if (line.length > maxLineLength) return rejectStream("Codex JSONL 单行超过 1 MiB。");
    if (!line.trim()) return;
    let event: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(line);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
      event = parsed as Record<string, unknown>;
      if (typeof event.type !== "string") throw new Error();
    } catch {
      rejectStream("Codex 输出不是有效的 JSONL 事件。");
      return;
    }
    if (event.type === "turn.started" && !started) {
      started = true;
      notify({ state: "running", result: "" });
    } else if (event.type === "turn.completed") {
      completed = true;
    } else if (event.type === "turn.failed") {
      const detail = event.error as { message?: unknown } | undefined;
      turnFailure = typeof detail?.message === "string" ? sanitizeLogMessage(detail.message) : "Codex 报告轮次失败。";
    } else if (event.type === "item.completed") {
      const item = event.item as { type?: unknown; text?: unknown } | undefined;
      if (item?.type === "agent_message" && typeof item.text === "string" && !result.endsWith(truncation)) {
        result = bounded(result ? `${result}\n\n${item.text}` : item.text);
      }
    }
  };
  child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
    if (task.streamFailure) return;
    const lines = (pending + chunk).split("\n");
    pending = lines.pop() ?? "";
    for (const line of lines) {
      consumeLine(line);
      if (task.streamFailure) return;
    }
    if (pending.length > maxLineLength) rejectStream("Codex JSONL 单行超过 1 MiB。");
  });
  child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
    stderr = (stderr + chunk).slice(-4_000);
  });
  child.once("error", (error) => { processFailure = sanitizeLogMessage(error.message); });
  child.stdin.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code !== "EPIPE") processFailure = sanitizeLogMessage(error.message);
  });
  child.once("close", (code, signal) => {
    if (pending && !task.streamFailure) consumeLine(pending);
    void (async () => {
      const cancelled = await task.cancellation?.catch(() => false);
      tasks.delete(id);
      const failure = task.streamFailure ?? turnFailure ?? processFailure;
      if (!failure && completed && code === 0) {
        notify({ state: "finished", result });
      } else if (cancelled && !task.streamFailure) {
        notify({ state: "interrupted", result });
      } else {
        const detail = failure ?? (code === 0
          ? "Codex 已退出，但未收到轮次完成事件。"
          : `Codex 异常退出（${signal ?? code ?? "未知"}）。`);
        const diagnostics = stderr.trim() && sanitizeLogMessage(stderr.trim());
        notify({ state: "failed", result: bounded([detail, diagnostics, result].filter(Boolean).join("\n\n")) });
      }
      resolveClosed();
    })();
  });
  child.stdin.end(prompt, "utf8");
}

export function hasActiveCodexTasks(): boolean {
  return tasks.size > 0;
}

export async function cancelCodexTask(id: string): Promise<void> {
  const task = tasks.get(id);
  if (!task) throw new Error("该 Codex 执行已经结束或不存在。");
  await requestTermination(task);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      task.closed,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("仍在等待 Codex 进程退出。")), 5_000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export function stopAllCodexTasks(): Promise<void> {
  stopping ??= Promise.allSettled([...tasks.keys()].map(cancelCodexTask))
    .then((results) => {
      const failures = results.filter((result) => result.status === "rejected");
      if (failures.length) throw new Error("仍有 Codex 执行未能停止。", { cause: failures.map(({ reason }) => reason) });
    })
    .finally(() => { stopping = undefined; });
  return stopping;
}
