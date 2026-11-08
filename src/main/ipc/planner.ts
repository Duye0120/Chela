import { app, Notification, powerMonitor, type BrowserWindow, type IpcMainInvokeEvent } from "electron";
import { join } from "node:path";
import { IPC_CHANNELS } from "../../shared/ipc.ts";
import { buildCodexTaskPrompt } from "../../shared/planner.ts";
import type { PlannerDraft, PlannerItem } from "../../shared/planner.ts";
import { cancelCodexTask, startCodexTask, type CodexTaskUpdate } from "../codex-task.ts";
import { appLogger } from "../logger.ts";
import { PlannerStore } from "../planner.ts";
import { getTerminalState, setTerminalEndListener } from "../terminal.ts";
import { handleIpc } from "./handle.ts";

let stopReminders: (() => void) | null = null;
let checkRemindersNow: (() => void) | null = null;
let savePlannerDraft: ((input: unknown) => PlannerItem[]) | null = null;
let plannerChanged: (() => void) | undefined;
let plannerNotice: ((item: PlannerItem, reason: "reminder" | "review" | "waiting" | "failed") => boolean) | undefined;
// shortcut: failed writes retry in memory; add a durable journal if crash recovery is required.
const pendingExecutionUpdates = new Map<string, () => void>();
let executionRetryTimer: ReturnType<typeof setTimeout> | undefined;
let flushingExecutionUpdates = false;

export function hasPendingPlannerExecutionUpdates(): boolean {
  return pendingExecutionUpdates.size > 0;
}

export function flushPendingPlannerExecutionUpdates(): void {
  if (flushingExecutionUpdates) return;
  flushingExecutionUpdates = true;
  const errors: unknown[] = [];
  try {
    for (const [id, save] of pendingExecutionUpdates) {
      try {
        save();
        if (pendingExecutionUpdates.get(id) === save) pendingExecutionUpdates.delete(id);
      } catch (error) { errors.push(error); }
    }
  } finally {
    flushingExecutionUpdates = false;
  }
  clearTimeout(executionRetryTimer);
  executionRetryTimer = undefined;
  if (pendingExecutionUpdates.size) {
    executionRetryTimer = setTimeout(() => {
      try { flushPendingPlannerExecutionUpdates(); }
      catch { /* Already reported; retain the result and retry until storage recovers. */ }
    }, 5_000);
    executionRetryTimer.unref();
  }
  if (errors.length) throw new Error("任务执行状态暂未保存，更新已保留在内存中。请恢复计划文件可写后重试，暂勿强制退出。", { cause: errors });
}

function saveExecutionUpdate(id: string, save: () => void): void {
  pendingExecutionUpdates.set(id, save);
  try { flushPendingPlannerExecutionUpdates(); }
  catch (error) { appLogger.error({ scope: "planner", message: "任务执行状态保存失败，将重试", error }); }
}

export function setPlannerNoticeListener(listener: typeof plannerNotice): void {
  plannerNotice = listener;
}

export function setPlannerChangedListener(listener: (() => void) | undefined): void {
  plannerChanged = listener;
}

export function listPlannerItems(): PlannerItem[] {
  flushPendingPlannerExecutionUpdates();
  return new PlannerStore(join(app.getPath("userData"), "planner.json")).list();
}

export function createPlannerTodo(input: PlannerDraft): PlannerItem {
  if (!savePlannerDraft) throw new Error("个人计划服务尚未就绪。");
  return savePlannerDraft({
    title: input.title,
    content: input.content,
    date: input.date,
    remindAt: input.remindAt,
    kind: "todo",
    completed: false,
  })[0];
}

export function stopPlannerReminders(): void {
  stopReminders?.();
  stopReminders = null;
  checkRemindersNow = null;
  savePlannerDraft = null;
}

export function checkPlannerReminders(): void {
  checkRemindersNow?.();
}

export function registerPlannerIpc(
  showPlanner: (taskId?: string) => Promise<void>,
  getWindow: () => BrowserWindow | null,
  assertSender: (event: IpcMainInvokeEvent) => void,
): void {
  const store = new PlannerStore(join(app.getPath("userData"), "planner.json"));
  const notifications = new Map<string, { notification: Notification; remindAt: string }>();
  let stopped = false;
  let locked = false;
  const logError = (error: unknown) => appLogger.error({ scope: "planner", message: "备忘录提醒失败", error });
  const isLocked = () => locked || powerMonitor.getSystemIdleState(1) === "locked";
  const closeNotifications = () => {
    const pending = [...notifications.values()];
    notifications.clear();
    for (const { notification } of pending) {
      try { notification.close(); } catch (error) { logError(error); }
    }
  };
  const notifyCompanion = (item: PlannerItem, reason: Parameters<NonNullable<typeof plannerNotice>>[1]) => {
    try { return plannerNotice?.(item, reason) === true; }
    catch (error) { logError(error); return false; }
  };
  const broadcast = (items: PlannerItem[]) => {
    try { plannerChanged?.(); } catch (error) { logError(error); }
    try {
      getWindow()?.webContents.send(IPC_CHANNELS.plannerChanged, items);
    } catch (error) {
      logError(error);
    }
    for (const [id, pending] of notifications) {
      if (!items.some((item) => item.id === id && !item.completed && item.remindAt === pending.remindAt)) {
        notifications.delete(id);
        try { pending.notification.close(); } catch (error) { logError(error); }
      }
    }
  };
  const checkReminders = () => {
    if (stopped || isLocked()) return;
    try {
      const nativeSupported = Notification.isSupported();
      for (const item of store.due()) {
        const remindAt = item.remindAt;
        if (!remindAt || notifications.has(item.id)) continue;
        const companionDelivered = notifyCompanion(item, "reminder");
        const markDelivered = () => {
          if (stopped || isLocked()) return false;
          try {
            if (store.markReminded(item.id, remindAt)) broadcast(store.list());
            return true;
          } catch (error) {
            logError(error);
            return false;
          }
        };
        if (companionDelivered) markDelivered();
        if (!nativeSupported) continue;
        try {
          const notification = new Notification({ title: `Chela · ${item.title}`, body: item.content.slice(0, 250) || "安排的提醒时间已到。" });
          notifications.set(item.id, { notification, remindAt });
          const release = () => {
            if (notifications.get(item.id)?.notification === notification) notifications.delete(item.id);
          };
          notification.once("show", () => {
            if (stopped || notifications.get(item.id)?.notification !== notification) return;
            if (!markDelivered()) release();
          });
          notification.once("failed", (_event, error) => {
            release();
            logError(error);
          });
          notification.once("close", release);
          notification.once("click", () => {
            if (stopped || isLocked()) return;
            try {
              const current = store.list().find((entry) => entry.id === item.id);
              if (current && !current.completed && current.remindAt === remindAt) {
                void showPlanner(item.id).catch(logError);
              }
            } catch (error) { logError(error); }
          });
          notification.show();
        } catch (error) {
          notifications.delete(item.id);
          logError(error);
        }
      }
    } catch (error) {
      logError(error);
    }
  };
  const onLock = () => {
    locked = true;
    closeNotifications();
  };
  const onUnlock = () => {
    locked = false;
    checkReminders();
  };

  handleIpc(IPC_CHANNELS.plannerList, (event) => {
    assertSender(event);
    flushPendingPlannerExecutionUpdates();
    return store.list();
  });
  handleIpc(IPC_CHANNELS.plannerStartCodex, (event, taskId: unknown, updatedAt: unknown) => {
    assertSender(event);
    const { item, items, execution } = store.reserveCodex(taskId, updatedAt);
    broadcast(items);
    const applyUpdate = (update: CodexTaskUpdate) => {
      saveExecutionUpdate(execution.terminalId, () => {
        const changed = store.recordCodexUpdate(item.id, execution.terminalId, update);
        if (!changed) return;
        broadcast(changed.items);
        if (changed.needsReview) notifyCompanion(changed.item, "review");
        if (update.state === "failed") notifyCompanion(changed.item, "failed");
        checkReminders();
      });
    };
    try {
      startCodexTask({
        id: execution.terminalId,
        cwd: execution.directory,
        prompt: buildCodexTaskPrompt(item),
        onUpdate: applyUpdate,
      });
    } catch (error) {
      applyUpdate({ state: "failed", result: error instanceof Error ? error.message : "无法启动 Codex。" });
      throw error;
    }
    return store.list();
  });
  handleIpc(IPC_CHANNELS.plannerCancelCodex, async (event, taskId: unknown, executionId: unknown) => {
    assertSender(event);
    flushPendingPlannerExecutionUpdates();
    await cancelCodexTask(store.requireActiveCodexId(taskId, executionId));
  });
  handleIpc(IPC_CHANNELS.plannerRecordExecution, (event, taskId, update) => {
    assertSender(event);
    const previous = store.list().find((item) => item.id === taskId);
    const terminal = typeof update?.terminalId === "string" ? getTerminalState(update.terminalId) : undefined;
    if ((update?.state === "exited" || update?.state === "interrupted") && terminal && terminal.exitCode === undefined) {
      throw new Error("终端仍在运行，请先关闭关联终端，再更新结束状态。");
    }
    if (update?.state === "linked" && !terminal
      && !previous?.executions.some((entry) => entry.terminalId === update.terminalId)) {
      throw new Error("关联的终端已不存在。");
    }
    const items = store.recordExecution(taskId, update, terminal);
    broadcast(items);
    const current = items.find((item) => item.id === taskId);
    if (current?.executions.some((entry) => entry.state === "waiting"
      && !previous?.executions.some((old) => old.terminalId === entry.terminalId && old.state === "waiting"))) {
      notifyCompanion(current, "waiting");
    }
    return items;
  });
  const save = (input: unknown, expectedUpdatedAt?: unknown) => {
    const previous = store.list();
    const items = store.save(input, expectedUpdatedAt);
    broadcast(items);
    for (const item of items) {
      if (item.kind === "todo" && item.status === "review" && previous.find((old) => old.id === item.id && old.kind === "todo")?.status !== "review") {
        notifyCompanion(item, "review");
      }
    }
    try {
      checkReminders();
      return store.list();
    } catch (error) {
      appLogger.warn({ scope: "planner", message: "事项已保存，但刷新计划失败，返回已提交的记录", error });
      return items;
    }
  };
  handleIpc(IPC_CHANNELS.plannerSave, (event, input, expectedUpdatedAt) => {
    assertSender(event);
    return save(input, expectedUpdatedAt);
  });
  handleIpc(IPC_CHANNELS.plannerRemove, (event, id, expectedUpdatedAt) => {
    assertSender(event);
    const items = store.remove(id, expectedUpdatedAt);
    broadcast(items);
    return items;
  });
  handleIpc(IPC_CHANNELS.plannerShow, (event, taskId: unknown) => {
    assertSender(event);
    if (taskId !== undefined && (typeof taskId !== "string" || !store.list().some((item) => item.id === taskId))) {
      throw new Error("事项已不存在，请刷新后重试。");
    }
    return showPlanner(taskId);
  });

  stopPlannerReminders();
  try { store.interruptOpenExecutions(); } catch (error) { logError(error); }
  setTerminalEndListener((terminalId, state) => {
    saveExecutionUpdate(terminalId, () => {
      const items = store.endTerminal(terminalId, state);
      if (items) broadcast(items);
    });
  });
  checkRemindersNow = checkReminders;
  savePlannerDraft = save;
  powerMonitor.on("lock-screen", onLock);
  powerMonitor.on("unlock-screen", onUnlock);
  powerMonitor.on("resume", checkReminders);
  const timer = setInterval(checkReminders, 60_000);
  timer.unref();
  stopReminders = () => {
    stopped = true;
    powerMonitor.off("lock-screen", onLock);
    powerMonitor.off("unlock-screen", onUnlock);
    powerMonitor.off("resume", checkReminders);
    clearInterval(timer);
    closeNotifications();
  };
}
