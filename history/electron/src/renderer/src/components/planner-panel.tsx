import { memo, useEffect, useMemo, useState } from "react";
import { Bell, CalendarDays, Check, ChevronLeft, ChevronRight, Plus, Terminal, Trash2 } from "lucide-react";
import { buildCodexTaskPrompt, PLANNER_MANUAL_EXECUTION_STATES, PLANNER_STATUSES } from "@shared/planner";
import type { PlannerDraft, PlannerExecution, PlannerExecutionUpdate, PlannerItem, PlannerStatus } from "@shared/planner";
import { findTerminalAgent, TERMINAL_AGENTS, type TerminalAgentId } from "@shared/terminal-agents";
import { Surface } from "@renderer/components/assistant-ui/surface";
import { Button } from "@renderer/components/ui/button";
import { RepositoryChanges } from "@renderer/components/repository-changes";
import { cn, directoryKey } from "@renderer/lib/utils";

export type PlannerView = "board" | "calendar" | "upcoming" | "note";
type Draft = Omit<PlannerDraft, "remindAt"> & { remindAt: string };
const muted = "text-[color:var(--color-text-muted)]";
const inputClass = "chela-field w-full min-w-0 text-sm placeholder:text-muted-foreground";
const views: Record<PlannerView, string> = {
  board: "看板",
  calendar: "日历",
  upcoming: "近期事项",
  note: "备忘录",
};
const statusLabels: Record<PlannerStatus, string> = { todo: "待办", doing: "进行中", review: "待验收", done: "已完成" };
const executionLabels: Record<PlannerExecution["state"], string> = {
  unknown: "状态未知",
  running: "执行中",
  waiting: "待输入",
  failed: "失败",
  finished: "已结束",
  exited: "终端已退出",
  interrupted: "执行已中断",
};
const overviewLabels = { today: "今日未完成", overdue: "逾期", review: "待处理" };

function localDate(date: Date): string {
  return `${String(date.getFullYear()).padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function useToday(): string {
  const [today, setToday] = useState(() => localDate(new Date()));
  useEffect(() => {
    const refresh = () => setToday(localDate(new Date()));
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  return today;
}

function localReminder(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  return `${localDate(date)}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function toDraft(item: PlannerItem): Draft {
  return { id: item.id, title: item.title, content: item.content, kind: item.kind, date: item.date,
    remindAt: localReminder(item.remindAt), completed: item.completed, status: item.status, projectDirectory: item.projectDirectory,
    executor: item.executor, sourceUrl: item.sourceUrl, acceptance: item.acceptance, result: item.result };
}

function newDraft(kind: PlannerDraft["kind"], date: string | null): Draft {
  return { title: "", content: "", kind, date, remindAt: "", completed: false, status: "todo" };
}

function calendarDates(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, index) => new Date(first.getFullYear(), first.getMonth(), index - offset + 1));
}

function dateOrder(a: PlannerItem, b: PlannerItem): number {
  return (a.date ?? "9999").localeCompare(b.date ?? "9999") || b.updatedAt.localeCompare(a.updatedAt);
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "操作失败，请重试。";
}

function ExecutionHistory({ executions, busy, editing, setEditing, onSave }: {
  executions: PlannerExecution[];
  busy: boolean;
  editing: PlannerExecutionUpdate | null;
  setEditing: (update: PlannerExecutionUpdate | null) => void;
  onSave: (update: PlannerExecutionUpdate) => Promise<boolean>;
}) {
  return (
    <section className="space-y-2" aria-label="执行记录">
      <h3 className="text-sm font-medium">执行记录</h3>
      {executions.map((execution) => {
        const update = editing?.terminalId === execution.terminalId && "result" in editing ? editing : null;
        return <details key={execution.terminalId} className="rounded-[var(--radius-control)] bg-shell-panel-muted p-2 text-xs">
          <summary className="cursor-pointer break-words">
            {execution.executor || "终端"} · {executionLabels[execution.state]} · {execution.source === "codex" ? "Codex 事件" : execution.source === "manual" ? "人工记录" : "终端记录"}
          </summary>
          <div className={cn("mt-2 space-y-1 break-words", muted)}>
            <p>{execution.directory}</p>
            <p>开始 {new Date(execution.startedAt).toLocaleString("zh-CN")}</p>
            {execution.endedAt && <p>{execution.source === "codex" && execution.state === "unknown" ? "跟踪结束" : "执行结束"} {new Date(execution.endedAt).toLocaleString("zh-CN")}</p>}
            {execution.result && <p className="whitespace-pre-wrap">{execution.result}</p>}
          </div>
          {execution.source === "codex" ? null : update ? <div className="mt-2 space-y-2">
            <label className="block space-y-1"><span>执行状态</span><select className={inputClass} disabled={busy} value={update.state} onChange={(event) => setEditing({ ...update, state: event.target.value as typeof update.state })}>
              {PLANNER_MANUAL_EXECUTION_STATES.map((state) => <option key={state} value={state} disabled={!!execution.endedAt && (state === "running" || state === "waiting")}>{executionLabels[state]}</option>)}
            </select></label>
            <label className="block space-y-1"><span>执行结果</span><textarea className={cn(inputClass, "resize-y py-2")} rows={3} maxLength={50000} value={update.result} disabled={busy} onChange={(event) => setEditing({ ...update, result: event.target.value })} /></label>
            <div className="flex flex-wrap gap-1">
              <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => void onSave(update).then((saved) => { if (saved) setEditing(null); })}>保存记录</Button>
              <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setEditing(null)}>取消</Button>
            </div>
          </div> : <Button type="button" size="sm" variant="ghost" className="mt-1" disabled={busy || editing !== null} onClick={() => setEditing({
            terminalId: execution.terminalId,
            state: execution.state === "interrupted" || execution.state === "exited" ? "unknown" : execution.state,
            result: execution.result,
          })}>人工记录</Button>}
        </details>;
      })}
    </section>
  );
}

function usePlannerItems() {
  const [items, setItems] = useState<PlannerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let disposed = false;
    let changed = false;
    setLoading(true);
    setError(null);
    const unsubscribe = window.desktopApi.planner.onChange((next) => {
      changed = true;
      if (!disposed) { setItems(next); setError(null); setLoading(false); }
    });
    void window.desktopApi.planner.list().then((next) => {
      if (!disposed && !changed) setItems(next);
    }).catch((cause: unknown) => {
      if (!disposed && !changed) setError(errorText(cause));
    }).finally(() => { if (!disposed) setLoading(false); });
    return () => { disposed = true; unsubscribe(); };
  }, [reload]);
  return { items, setItems, loading, error, retry: () => setReload((value) => value + 1) };
}

export function PlannerUpcoming() {
  const { items, loading, error, retry } = usePlannerItems();
  const [openError, setOpenError] = useState<string | null>(null);
  function openPlanner(taskId?: string) {
    setOpenError(null);
    void window.desktopApi.planner.show(taskId).catch((cause: unknown) => setOpenError(errorText(cause)));
  }
  const upcoming = items.filter((item) => item.kind === "todo" && !item.completed && item.date).sort(dateOrder).slice(0, 5);
  const today = useToday();
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">近期待办</h2>
        <span className={cn("text-xs", muted)}>最多 5 项</span>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto" aria-live="polite">
        {loading && <p className={cn("py-6 text-center text-xs", muted)}>正在加载…</p>}
        {error && <Surface tone="danger" padding="sm" role="alert"><p className="text-xs">{error}</p><Button variant="ghost" size="sm" onClick={retry}>重试</Button></Surface>}
        {!loading && !error && upcoming.length === 0 && <p className={cn("py-8 text-center text-xs leading-6", muted)}>暂无已安排日期的待办。<br />打开日历，记录下一件要做的事。</p>}
        {upcoming.map((item) => <Surface key={item.id} tone="control">
          <Button type="button" variant="ghost" className="h-auto w-full justify-start p-3 text-left" aria-label={`打开任务：${item.title}`} onClick={() => openPlanner(item.id)}>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium" title={item.title}>{item.title}</span>
              <span className={cn("mt-1 block text-xs", muted)}>{item.date}{item.date! < today ? " · 已逾期" : item.date === today ? " · 今天" : ""}{item.remindAt ? " · 已设提醒" : ""}</span>
            </span>
          </Button>
        </Surface>)}
      </div>
      {openError && <p role="alert" className="text-xs text-[color:var(--color-status-error)]">{openError}</p>}
      <Button variant="secondary" onClick={() => openPlanner()}><CalendarDays />打开日历</Button>
    </div>
  );
}

const PlannerPanel = memo(function PlannerPanel({
  view,
  onViewChange,
  onOpenTaskTerminal,
  focusedTaskId,
  onFocusedTask,
}: {
  view: PlannerView;
  onViewChange: (view: PlannerView) => void;
  onOpenTaskTerminal?: (item: PlannerItem, agent?: TerminalAgentId) => void | Promise<void>;
  focusedTaskId?: string | null;
  onFocusedTask?: () => void;
}) {
  const { items, setItems, loading, error: loadError, retry } = usePlannerItems();
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(() => localDate(new Date()));
  const [draft, setDraft] = useState<Draft | null>(null);
  const [baseline, setBaseline] = useState("");
  const [baselineUpdatedAt, setBaselineUpdatedAt] = useState<string | null>(null);
  const [pendingDraft, setPendingDraft] = useState<Draft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmCodex, setConfirmCodex] = useState<PlannerItem | null>(null);
  const [executionDraft, setExecutionDraft] = useState<PlannerExecutionUpdate | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [overview, setOverview] = useState<keyof typeof overviewLabels | null>(null);
  const today = useToday();
  const taskDirty = draft !== null && JSON.stringify(draft) !== baseline;
  const dirty = taskDirty || executionDraft !== null;
  useEffect(() => {
    if (!dirty) return;
    const preventClose = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = false;
    };
    window.addEventListener("beforeunload", preventClose);
    return () => window.removeEventListener("beforeunload", preventClose);
  }, [dirty]);
  const currentItem = draft?.id ? items.find((item) => item.id === draft.id) : undefined;
  const changedElsewhere = !!draft?.id && (!currentItem || currentItem.updatedAt !== baselineUpdatedAt);
  const hasOpenExecution = currentItem?.executions.some((entry) => !entry.endedAt) ?? false;
  const managedExecution = currentItem?.executions.find((entry) => !entry.endedAt && entry.source === "codex");
  const lastManagedExecution = currentItem?.executions.find((entry) => entry.source === "codex");
  const terminalAgent = currentItem ? findTerminalAgent(currentItem.executor) : undefined;
  const taskTerminalDisabled = busy || dirty || changedElsewhere || !!managedExecution || (!hasOpenExecution && !currentItem?.projectDirectory);
  useEffect(() => {
    if (!currentItem || taskDirty || busy || currentItem.updatedAt === baselineUpdatedAt) return;
    const latest = toDraft(currentItem);
    setDraft(latest);
    setBaseline(JSON.stringify(latest));
    setBaselineUpdatedAt(currentItem.updatedAt);
  }, [currentItem, taskDirty, busy, baselineUpdatedAt]);
  const dates = useMemo(() => calendarDates(month), [month]);
  const byDate = useMemo(() => {
    const grouped = new Map<string, PlannerItem[]>();
    for (const item of items) {
      if (item.date) grouped.set(item.date, [...(grouped.get(item.date) ?? []), item]);
    }
    return grouped;
  }, [items]);
  const openTasks = items.filter((item) => item.kind === "todo" && !item.completed);
  const overviewItems = {
    today: openTasks.filter((item) => item.date === today),
    overdue: openTasks.filter((item) => item.date && item.date < today),
    review: openTasks.filter((item) => item.status === "review" || ["waiting", "failed"].includes(item.executions[0]?.state ?? "")),
  };
  const visibleItems = items.filter((item) => {
    if (view === "calendar") return item.date === selectedDate;
    if (view === "upcoming") return !!item.date && !item.completed;
    if (view === "board") return item.kind === "todo" && (!overview || overviewItems[overview].includes(item));
    return item.kind === "note";
  }).sort(dateOrder);

  function openDraft(next: Draft) {
    if (busy) return;
    if (dirty) { setPendingDraft(next); return; }
    replaceDraft(next);
  }

  function replaceDraft(next: Draft | null) {
    const id = next?.id;
    const latest = id ? items.find((item) => item.id === id) : undefined;
    if (latest) next = toDraft(latest);
    setDraft(next);
    setBaseline(next ? JSON.stringify(next) : "");
    setBaselineUpdatedAt(latest?.updatedAt ?? null);
    setPendingDraft(null);
    setConfirmDelete(null);
    setConfirmCodex(null);
    setExecutionDraft(null);
    setError(null);
    setNotice(null);
  }

  useEffect(() => {
    if (!focusedTaskId || busy || loading || loadError) return;
    const item = items.find((entry) => entry.id === focusedTaskId);
    if (item) {
      if (item.kind === "note") onViewChange("note");
      else setOverview(null);
      if (draft?.id !== item.id) openDraft(toDraft(item));
    } else {
      setError("提醒关联的事项已不存在。");
    }
    onFocusedTask?.();
  }, [focusedTaskId, busy, loading, loadError, items]);

  async function saveDraft() {
    if (!draft || busy) return;
    if (!taskDirty && changedElsewhere) return;
    if (!draft.title.trim()) { setError("请填写标题。"); return; }
    const reminder = draft.remindAt ? new Date(draft.remindAt) : null;
    if (reminder && (!Number.isFinite(reminder.getTime()) || localReminder(reminder.toISOString()) !== draft.remindAt)) {
      setError("请选择有效的本地提醒时间。"); return;
    }
    const remindAt = currentItem && draft.remindAt === localReminder(currentItem.remindAt)
      ? currentItem.remindAt : reminder?.toISOString() ?? null;
    setBusy(true); setError(null); setNotice(null);
    try {
      const next = await window.desktopApi.planner.save({ ...draft, title: draft.title.trim(), remindAt }, currentItem?.updatedAt);
      setItems(next);
      const saved = draft.id ? next.find((item) => item.id === draft.id) : null;
      const nextDraft = saved ? toDraft(saved) : null;
      setDraft(nextDraft); setBaseline(nextDraft ? JSON.stringify(nextDraft) : "");
      setBaselineUpdatedAt(saved?.updatedAt ?? null); setPendingDraft(null); setConfirmDelete(null);
      setNotice(executionDraft ? "任务已保存，执行记录仍未保存" : "已保存");
    } catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  }

  async function deleteDraft() {
    if (!draft?.id || busy || !confirmDelete) return;
    setBusy(true); setError(null);
    try {
      setItems(await window.desktopApi.planner.remove(draft.id, confirmDelete));
      replaceDraft(null); setNotice("已删除");
    } catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  }

  async function runTaskAction(action: () => void | Promise<void>, success?: string) {
    setBusy(true); setError(null); setNotice(null);
    try {
      await action();
      setNotice(success ?? null);
      return true;
    } catch (cause) {
      setError(errorText(cause));
      return false;
    }
    finally { setBusy(false); }
  }

  function createItem() {
    openDraft(newDraft(view === "note" ? "note" : "todo", view === "calendar" ? selectedDate : null));
  }

  function selectDate(date: Date) {
    if (date.getFullYear() !== month.getFullYear() || date.getMonth() !== month.getMonth()) {
      setMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    }
    setSelectedDate(localDate(date));
  }

  function renderItem(item: PlannerItem) {
    return (
      <button
        type="button"
        key={item.id}
        disabled={busy}
        onClick={() => openDraft(toDraft(item))}
        aria-current={draft?.id === item.id ? "true" : undefined}
        className={cn(
          "flex w-full items-start gap-2 rounded-[var(--radius-control)] px-3 py-2.5 text-left",
          draft?.id === item.id ? "bg-selection-bg text-selection-fg" : "hover:bg-[color:var(--color-control-bg-hover)]",
        )}
      >
        {item.completed ? <Check className="mt-0.5 size-4 shrink-0" /> : <span className={cn("mt-0.5 w-4 shrink-0 text-xs", muted)}>{item.kind === "todo" ? "○" : "记"}</span>}
        <span className="min-w-0 flex-1">
          <span className={cn("block truncate text-sm", item.completed && "line-through opacity-60")} title={item.title}>{item.title}</span>
          <span className={cn("mt-1 block break-words text-xs", muted)}>{item.date ?? "未安排日期"}{item.kind === "todo" && !item.completed && item.date && item.date < today ? " · 已逾期" : ""}{item.remindAt ? ` · ${new Date(item.remindAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} 提醒` : ""}</span>
          {item.kind === "todo" && <span className={cn("mt-1 block break-words text-xs", muted)}>{[
            view !== "board" && statusLabels[item.status],
            item.executor,
            item.executions[0] && executionLabels[item.executions[0].state],
          ].filter(Boolean).join(" · ")}</span>}
        </span>
      </button>
    );
  }

  return (
    <div className="@container flex h-full min-h-0 flex-col bg-[color:var(--color-bg-primary)] text-foreground">
      <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-5 sm:px-6">
        <div><h1 className="text-2xl font-semibold tracking-tight">{views[view]}</h1><p className={cn("mt-1 text-sm", muted)}>安排任务，跟进执行与验收。</p></div>
        <Button onClick={createItem} disabled={busy || loading || !!loadError}><Plus />新建{view === "note" ? "备忘录" : "事项"}</Button>
      </header>
      <div className="grid min-h-0 flex-1 auto-rows-max gap-3 overflow-y-auto px-4 pb-4 @min-[680px]:auto-rows-fr @min-[680px]:grid-cols-[minmax(0,1fr)_minmax(15rem,29%)] @min-[680px]:overflow-hidden">
        <section className="flex min-h-0 min-w-0 flex-col gap-4 rounded-[var(--radius-panel)] bg-shell-panel p-3 sm:p-4 @min-[680px]:overflow-y-auto" aria-label="计划列表">
          <nav className="flex flex-wrap gap-1 border-b border-[color:var(--color-control-border)] pb-2" aria-label="计划视图">
            {(Object.keys(views) as PlannerView[]).map((value) => <Button key={value} variant="ghost" size="sm" aria-pressed={view === value} onClick={() => onViewChange(value)}>{views[value]}</Button>)}
          </nav>
          {loading && <p role="status" className={cn("p-4 text-sm", muted)}>正在加载计划…</p>}
          {loadError && <Surface tone="danger" padding="sm" role="alert"><p className="text-sm">{loadError}</p><Button variant="ghost" size="sm" onClick={retry}>重新加载</Button></Surface>}
          {view === "calendar" && <>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold">{month.getFullYear()} 年 {month.getMonth() + 1} 月</h2>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon-sm" aria-label="上个月" onClick={() => selectDate(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft /></Button>
                <Button variant="ghost" size="sm" onClick={() => selectDate(new Date())}>今天</Button>
                <Button variant="ghost" size="icon-sm" aria-label="下个月" onClick={() => selectDate(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight /></Button>
              </div>
            </div>
            <div>
              <div className={cn("mb-1 grid grid-cols-7 text-center text-xs", muted)}>{["一", "二", "三", "四", "五", "六", "日"].map((day) => <span key={day} className="py-1">{day}</span>)}</div>
              <div className="grid grid-cols-7 gap-1">
                {dates.map((date) => {
                  const key = localDate(date);
                  const dayItems = byDate.get(key) ?? [];
                  return <button key={key} type="button" aria-label={`${key}，${dayItems.length} 个事项`} aria-pressed={selectedDate === key} aria-current={key === today ? "date" : undefined} onClick={() => selectDate(date)} className={cn("flex min-h-16 min-w-0 flex-col items-start rounded-[var(--radius-control)] p-1 text-left text-xs transition-colors sm:p-1.5", selectedDate === key ? "bg-[color:var(--color-selection-bg)] text-[color:var(--color-selection-fg)]" : "bg-[color:var(--color-control-bg)] hover:bg-[color:var(--color-control-bg-hover)]", date.getMonth() !== month.getMonth() && selectedDate !== key && "text-muted-foreground")}>
                    <span className={cn("mb-1 block", key === today && "font-bold underline underline-offset-4")}>{date.getDate()}{key === today ? " · 今" : ""}</span>
                    {dayItems.slice(0, 2).map((item) => <span key={item.id} className={cn("block w-full truncate leading-4", item.completed && "line-through opacity-60")} title={item.title}>{item.kind === "todo" ? "· " : ""}{item.title}</span>)}
                    {dayItems.length > 2 && <span className="block opacity-70">+{dayItems.length - 2} 项</span>}
                  </button>;
                })}
              </div>
            </div>
          </>}
          {view === "board" ? (
            <>
            <div className="flex flex-wrap gap-2" aria-label="任务概览">
              {(Object.keys(overviewLabels) as (keyof typeof overviewLabels)[]).map((key) => (
                <Button key={key} variant={overview === key ? "secondary" : "ghost"} size="sm" aria-pressed={overview === key} onClick={() => setOverview(overview === key ? null : key)}>
                  {overviewLabels[key]} <span className="tabular-nums">{overviewItems[key].length}</span>
                </Button>
              ))}
            </div>
            <div className="grid grid-cols-1 items-start gap-2 @min-[400px]:grid-cols-2 @min-[1040px]:grid-cols-4">
              {PLANNER_STATUSES.map((status) => {
                const label = statusLabels[status];
                const columnItems = visibleItems.filter((item) => item.status === status);
                return (
                  <section key={label} aria-label={label} className="min-w-0 rounded-[var(--radius-panel)] bg-shell-panel-muted p-2">
                    <h2 className="flex items-center justify-between gap-1 px-2 pb-2 pt-1 text-sm font-medium">
                      {label} <span className={cn("text-xs tabular-nums", muted)}>{columnItems.length}</span>
                    </h2>
                    {columnItems.map(renderItem)}
                    {!loading && !loadError && !columnItems.length && <p className={cn("px-2 py-3 text-xs", muted)}>暂无事项</p>}
                  </section>
                );
              })}
            </div>
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-medium">{view === "calendar" ? selectedDate : views[view]} <span className={cn("ml-1 font-normal", muted)}>{visibleItems.length} 项</span></h2>
                {view === "calendar" && <Button variant="ghost" size="sm" disabled={busy || loading || !!loadError} onClick={createItem}><Plus />安排到这天</Button>}
              </div>
              <div className="space-y-1 pb-2">
                {!loading && !loadError && visibleItems.length === 0 && <p className={cn("px-3 py-4 text-sm", muted)}>{view === "note" ? "随手记下一个想法，不必先安排日期。" : "这里还没有事项，试试新建一条。"}</p>}
                {visibleItems.map(renderItem)}
              </div>
            </>
          )}
        </section>
        <Surface tone="panel" padding="md" className={cn("min-h-0 min-w-0 @min-[680px]:overflow-y-auto", draft && "order-first @min-[680px]:order-none")}>
          <div aria-live="polite">{notice && <p className={cn("mb-3 text-xs", muted)}>{notice}</p>}</div>
          {error && <Surface tone="danger" padding="sm" role="alert" className="mb-3 text-xs">{error}</Surface>}
          {pendingDraft && <Surface tone="control" padding="sm" className="mb-3 text-xs" role="alert"><p>当前内容尚未保存。要放弃修改并切换吗？</p><div className="mt-2 flex flex-wrap gap-1"><Button variant="secondary" size="sm" disabled={busy} onClick={() => replaceDraft(pendingDraft)}>放弃并切换</Button><Button variant="ghost" size="sm" disabled={busy} onClick={() => setPendingDraft(null)}>继续编辑</Button></div></Surface>}
          {draft ? <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void saveDraft(); }}>
            <div className="flex items-center justify-between"><h2 className="text-sm font-medium">{draft.id ? "编辑" : "新建"}{draft.kind === "todo" ? "待办" : "备忘录"}</h2>{dirty && <span className={cn("text-xs", muted)}>未保存</span>}</div>
            {draft.kind === "todo" && currentItem && onOpenTaskTerminal && <div className="space-y-1">
              <div className="flex flex-wrap gap-1">
                {!managedExecution && <Button type="button" size="sm" variant="secondary" disabled={taskTerminalDisabled} onClick={() => void runTaskAction(() => onOpenTaskTerminal(currentItem, hasOpenExecution ? undefined : terminalAgent))}>
                  <Terminal />{hasOpenExecution ? "返回关联终端" : terminalAgent ? `启动 ${TERMINAL_AGENTS[terminalAgent]}` : "打开任务终端"}
                </Button>}
                {managedExecution && <Button type="button" size="sm" variant="secondary" disabled={busy}
                  onClick={() => void runTaskAction(() => window.desktopApi.planner.cancelCodex(currentItem.id, managedExecution.terminalId), "本次执行已结束")}>停止本次 Codex 执行</Button>}
                {!hasOpenExecution && terminalAgent === "codex" && <Button type="button" size="sm" variant="secondary" disabled={taskTerminalDisabled || currentItem.completed}
                  onClick={() => setConfirmCodex(currentItem)}>交给 Codex 执行…</Button>}
                {!hasOpenExecution && terminalAgent && <Button type="button" size="sm" variant="ghost" disabled={taskTerminalDisabled} onClick={() => void runTaskAction(() => onOpenTaskTerminal(currentItem))}>仅打开终端</Button>}
                <Button type="button" size="sm" variant="ghost" disabled={busy || dirty || changedElsewhere}
                  title="将已保存的标题、日期、状态、正文与验收要求发给当前模型；超长正文和验收要求会截断。"
                  onClick={() => void runTaskAction(() => window.desktopApi.planner.discuss(currentItem.id, currentItem.updatedAt), "已交给桌面助手梳理")}>请助手梳理</Button>
              </div>
              {(dirty || (!hasOpenExecution && !currentItem.projectDirectory)) && <p className={cn("text-xs", muted)}>保存任务和项目目录后可打开任务终端。</p>}
              {managedExecution && <p role="status" className={cn("text-xs", muted)}>{managedExecution.state === "running" ? "Codex 正在执行" : "Codex 正在启动，尚未收到开始事件"}，结果将保存在下方执行记录中。</p>}
            </div>}
            {confirmCodex?.id === currentItem?.id && confirmCodex && <Surface tone="control" padding="sm" className="space-y-2 text-xs" role="region" aria-label="确认 Codex 执行">
              <p className="font-medium">确认任务说明与工作目录</p>
              <p className="break-all">{confirmCodex.projectDirectory}</p>
              <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words font-sans">{buildCodexTaskPrompt(confirmCodex)}</pre>
              <p className={cn("leading-5", muted)}>使用本机 Codex 的模型与登录配置，可能产生模型费用。目录需为 Git 仓库，允许在工作目录内修改文件；不在此处交互审批，需要额外权限时由 Codex 拒绝。执行成功后进入待验收。</p>
              {lastManagedExecution?.state === "unknown" && lastManagedExecution.endedAt
                && <p role="status" className="text-[color:var(--chela-status-warning-text)]">上次 Codex 执行已失去跟踪，进程可能仍在运行。请核对原目录和进程后再确认新执行。</p>}
              {items.some((item) => item.id !== confirmCodex.id && item.executions.some((execution) => !execution.endedAt
                && directoryKey(execution.directory) === directoryKey(confirmCodex.projectDirectory)))
                && <p role="status" className="text-[color:var(--chela-status-warning-text)]">另一任务正在同一目录执行。确认两边改动不会冲突后再继续。</p>}
              <div className="flex flex-wrap gap-1">
                <Button type="button" size="sm" disabled={busy || dirty || changedElsewhere || hasOpenExecution || currentItem?.updatedAt !== confirmCodex.updatedAt}
                  onClick={() => void runTaskAction(async () => {
                    setItems(await window.desktopApi.planner.startCodex(confirmCodex.id, confirmCodex.updatedAt));
                    setConfirmCodex(null);
                  }, "已启动 Codex，执行结果将在看板更新")}>确认并执行</Button>
                <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setConfirmCodex(null)}>取消</Button>
              </div>
            </Surface>}
            {changedElsewhere && <Surface tone="control" padding="sm" role="status" className="text-xs leading-5">{currentItem ? "此项已更新。草稿已保留，保存将覆盖该项内容。" : "此项已被删除。草稿仍保留，可复制内容后新建。"}{currentItem && <Button type="button" variant="ghost" size="sm" onClick={() => openDraft(toDraft(currentItem))}>载入最新内容</Button>}</Surface>}
            <label className="block space-y-1.5 text-xs"><span>标题</span><input className={inputClass} required maxLength={200} value={draft.title} disabled={busy} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="想做什么，或想记住什么？" /></label>
            <label className="block space-y-1.5 text-xs"><span>类型</span><select className={inputClass} value={draft.kind} disabled={busy || executionDraft !== null} onChange={(event) => setDraft({ ...draft, kind: event.target.value as Draft["kind"], ...(event.target.value === "note" ? { completed: false, status: "todo" } : {}) })}><option value="todo">Todo · 待办</option><option value="note">备忘录</option></select></label>
            <label className="block space-y-1.5 text-xs"><span>内容</span><textarea className={cn(inputClass, "min-h-32 resize-y py-2 leading-6")} rows={5} maxLength={50000} value={draft.content} disabled={busy} onChange={(event) => setDraft({ ...draft, content: event.target.value })} placeholder="补充说明、想法或下一步…" /></label>
            <label className="block space-y-1.5 text-xs"><span>安排日期 <span className={muted}>（可选）</span></span><input type="date" className={inputClass} value={draft.date ?? ""} disabled={busy} onChange={(event) => setDraft({ ...draft, date: event.target.value || null })} /></label>
            <label className="block space-y-1.5 text-xs"><span className="flex items-center gap-1"><Bell className="size-3" />提醒时间 <span className={muted}>（本地时间，可选）</span></span><input type="datetime-local" className={inputClass} value={draft.remindAt} disabled={busy} onChange={(event) => setDraft({ ...draft, remindAt: event.target.value })} /></label>
            {draft.remindAt && <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setDraft({ ...draft, remindAt: "" })}>取消提醒</Button>}
            {draft.kind === "todo" && <>
              <label className="block space-y-1.5 text-xs"><span>任务状态</span><select className={inputClass} value={draft.status} disabled={busy} onChange={(event) => setDraft({ ...draft, status: event.target.value as PlannerStatus, completed: event.target.value === "done" })}>{PLANNER_STATUSES.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}</select></label>
              <div className="space-y-1.5 text-xs">
                <label className="block space-y-1.5"><span>项目目录</span><input className={inputClass} value={draft.projectDirectory ?? ""} disabled={busy} maxLength={4096} onChange={(event) => setDraft({ ...draft, projectDirectory: event.target.value })} /></label>
                <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void runTaskAction(async () => {
                  const folder = await window.desktopApi.workspace.pickFolder();
                  if (folder) setDraft({ ...draft, projectDirectory: folder });
                })}>选择目录</Button>
              </div>
              <label className="block space-y-1.5 text-xs"><span>执行者</span><input className={inputClass} list="planner-terminal-agents" value={draft.executor ?? ""} disabled={busy} maxLength={200} onChange={(event) => setDraft({ ...draft, executor: event.target.value })} placeholder="选择 CLI 或输入名称" /></label>
              <datalist id="planner-terminal-agents">{Object.values(TERMINAL_AGENTS).map((label) => <option key={label} value={label} />)}</datalist>
              <div className="space-y-1.5 text-xs">
                <label className="block space-y-1.5"><span>来源链接</span><input className={inputClass} type="url" value={draft.sourceUrl ?? ""} disabled={busy} maxLength={2048} onChange={(event) => setDraft({ ...draft, sourceUrl: event.target.value })} placeholder="https://…" /></label>
                {draft.sourceUrl && <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void runTaskAction(() => navigator.clipboard.writeText(draft.sourceUrl!), "已复制来源链接")}>复制来源链接</Button>}
              </div>
              <label className="block space-y-1.5 text-xs"><span>验收要求</span><textarea className={cn(inputClass, "resize-y py-2")} rows={3} maxLength={50000} value={draft.acceptance ?? ""} disabled={busy} onChange={(event) => setDraft({ ...draft, acceptance: event.target.value })} /></label>
              <label className="block space-y-1.5 text-xs"><span>验收结果</span><textarea className={cn(inputClass, "resize-y py-2")} rows={3} maxLength={50000} value={draft.result ?? ""} disabled={busy} onChange={(event) => setDraft({ ...draft, result: event.target.value })} /></label>
            </>}
            <div className="flex items-center gap-2"><Button type="submit" disabled={busy || (changedElsewhere && !currentItem)} className="flex-1">{busy ? "处理中…" : "保存"}</Button>{draft.id && <Button type="button" variant="ghost" size="icon" aria-label="删除此项" disabled={busy || changedElsewhere} onClick={() => setConfirmDelete(baselineUpdatedAt)}><Trash2 /></Button>}</div>
            {confirmDelete && <Surface tone="danger" padding="sm" role="alert" className="text-xs"><p>确定删除这条记录？删除后无法恢复。</p><div className="mt-2 flex gap-1"><Button type="button" variant="destructive" size="sm" disabled={busy || currentItem?.updatedAt !== confirmDelete} onClick={() => void deleteDraft()}>确认删除</Button><Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setConfirmDelete(null)}>保留</Button></div></Surface>}
          </form> : <div className="flex flex-col items-center gap-3 py-12 text-center"><CalendarDays className={cn("size-7", muted)} /><h2 className="text-sm font-medium">给想法留个位置</h2><p className={cn("text-xs leading-6", muted)}>选中一条记录查看详情，<br />或新建待办与备忘录。</p><Button variant="secondary" size="sm" disabled={busy || loading || !!loadError} onClick={createItem}><Plus />新建</Button></div>}
          {draft?.kind === "todo" && currentItem && !!currentItem.executions.length && <div className="mt-4">
            <ExecutionHistory key={currentItem.id} executions={currentItem.executions} busy={busy} editing={executionDraft} setEditing={setExecutionDraft} onSave={(update) => runTaskAction(async () => {
              setItems(await window.desktopApi.planner.recordExecution(currentItem.id, update));
            }, "已保存执行记录")} />
          </div>}
          {draft?.kind === "todo" && currentItem?.projectDirectory && <div className="mt-4">
            <RepositoryChanges key={currentItem.projectDirectory} directory={currentItem.projectDirectory} />
          </div>}
          <p className={cn("mt-5 text-xs leading-5", muted)}>计划存储在本机；请助手梳理会将所选任务资料发给当前模型。提醒需 Chela 运行，关闭期间到期的提醒会在下次启动时补发。</p>
        </Surface>
      </div>
    </div>
  );
});

export default PlannerPanel;
