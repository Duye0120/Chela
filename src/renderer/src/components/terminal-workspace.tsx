import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from "react";
import { createPortal } from "react-dom";
import { Columns2, Plus, Rows2, X } from "lucide-react";
import type { Settings } from "@shared/contracts";
import type { PlannerItem } from "@shared/planner";
import { findTerminalAgent, TERMINAL_AGENTS, type TerminalAgentId } from "@shared/terminal-agents";
import { Button } from "@renderer/components/assistant-ui/button";
import { TerminalTab } from "@renderer/components/TerminalTab";
import { RepositoryChanges } from "@renderer/components/repository-changes";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@renderer/components/ui/resizable";
import { directoryKey } from "@renderer/lib/utils";

type Tab = {
  id: string;
  label: string;
  directory: string;
  task?: PlannerItem;
  executor?: string;
  exitCode?: number;
};
type Orientation = "horizontal" | "vertical";
type Layout = { active: string | null; other: string | null; orientation: Orientation };
type Slot = "primary" | "secondary" | "hidden";

export type TerminalWorkspaceHandle = {
  openTask(item: PlannerItem, agent?: TerminalAgentId): Promise<boolean>;
};

function TerminalPane({
  tab, visible, focused, settings, slot, slots,
}: {
  tab: Tab;
  visible: boolean;
  focused: boolean;
  settings: Settings | null;
  slot: Slot;
  slots: { current: Record<Slot, HTMLDivElement | null> };
}) {
  const [host] = useState(() => {
    const element = document.createElement("div");
    element.className = "flex h-full min-h-0 min-w-0 flex-col";
    return element;
  });
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const brief = tab.task
    ? [
        tab.task.title,
        tab.task.content,
        tab.task.acceptance && `验收要求\n${tab.task.acceptance}`,
        tab.task.sourceUrl && `来源 ${tab.task.sourceUrl}`,
      ].filter(Boolean).join("\n\n")
    : "";

  useEffect(() => {
    setCopied(false);
    setCopyError(false);
  }, [brief]);

  // Move the host between panes without remounting xterm or losing scrollback.
  useLayoutEffect(() => {
    const target = slots.current[slot];
    if (target && host.parentElement !== target) target.append(host);
  });
  useLayoutEffect(() => () => host.remove(), [host]);

  async function copyBrief() {
    try {
      await navigator.clipboard.writeText(brief);
      setCopied(true);
      setCopyError(false);
    } catch {
      setCopyError(true);
    }
  }

  return createPortal(
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-shell-panel px-3 py-2 text-xs text-muted-foreground">
        {tab.task && <span className="break-all font-medium text-foreground">{tab.task.title}</span>}
        <span className="min-w-0 truncate" title={tab.directory}>{tab.directory}</span>
        {tab.executor && <span>执行者 {tab.executor}</span>}
        {tab.exitCode !== undefined && <span>终端已退出（代码 {tab.exitCode}）</span>}
      </div>
      {tab.task && (
        <div className="max-h-[45%] shrink-0 overflow-y-auto bg-shell-panel px-3 pb-2 text-xs text-muted-foreground">
          <details>
            <summary className="w-fit cursor-pointer">任务说明</summary>
            <div className="whitespace-pre-wrap break-words py-2">{brief}</div>
            <Button size="sm" variant="secondary" onClick={() => void copyBrief()}>复制说明</Button>
            <span role="status" className="ml-2">
              {copyError ? "复制失败" : copied ? "已复制，可手动粘贴到 CLI" : "可复制到 CLI 作为任务输入"}
            </span>
          </details>
          <RepositoryChanges key={tab.directory} directory={tab.directory} />
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-hidden">
        <TerminalTab terminalId={tab.id} visible={visible} focused={focused} settings={settings} />
      </div>
    </>,
    host,
  );
}

export function TerminalWorkspace({
  visible, settings, ref,
}: {
  visible: boolean;
  settings: Settings | null;
  ref: Ref<TerminalWorkspaceHandle>;
}) {
  const api = window.desktopApi;
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [layout, setLayout] = useState<Layout>({ active: null, other: null, orientation: "horizontal" });
  const [error, setError] = useState("");
  const [creatingShell, setCreatingShell] = useState(false);
  const [restoring, setRestoring] = useState(!!api);
  const [recoveryError, setRecoveryError] = useState("");
  const slots = useRef<Record<Slot, HTMLDivElement | null>>({ primary: null, secondary: null, hidden: null });
  const nextLabel = useRef(1);
  const pendingTasks = useRef(new Map<string, { directory: string; launch: Promise<boolean> }>());
  const liveTasks = useRef(new Map<string, { id: string; directory: string }>());
  const exitedTerminals = useRef(new Map<string, number>());
  const closing = useRef(new Set<string>());
  const restoration = useRef<Promise<void> | null>(null);
  const restoreError = useRef<unknown>(null);

  function selectTab(id: string) {
    setLayout((previous) => ({
      ...previous,
      active: id,
      other: previous.other === id ? previous.active : previous.other,
    }));
  }

  useEffect(() => api?.terminal.onExit((terminalId, exitCode) => {
    exitedTerminals.current.set(terminalId, exitCode);
    setTabs((previous) => previous.map((tab) => tab.id === terminalId ? { ...tab, exitCode } : tab));
    if (closing.current.has(terminalId)) return;
    for (const [taskId, terminal] of liveTasks.current) {
      if (terminal.id !== terminalId) continue;
      liveTasks.current.delete(taskId);
      void api.planner.recordExecution(taskId, { terminalId, state: "exited" })
        .catch((reason: unknown) => setError(`记录终端退出失败：${String(reason)}`));
      break;
    }
  }), [api]);

  useEffect(() => api?.planner.onChange((items) => {
    const associated = new Map(items.flatMap((item) => item.executions
      .filter((execution) => execution.source !== "codex")
      .map((execution) => [execution.terminalId, { item, execution }] as const)));
    setTabs((previous) => previous.map((tab) => {
      const task = associated.get(tab.id);
      if (task) return { ...tab, label: task.item.title, task: task.item, executor: task.execution.executor };
      return tab.task ? { ...tab, label: "终端（未关联任务）", task: undefined } : tab;
    }));
  }), [api]);

  function restoreTerminals(existingTabs: Tab[]) {
    if (!api || closing.current.size) return;
    setRestoring(true);
    setRecoveryError("");
    restoreError.current = null;
    restoration.current = (async () => {
      const [plans, terminals] = await Promise.allSettled([api.planner.list(), api.terminal.list()]);
      if (terminals.status === "rejected") throw terminals.reason;
      const sessions = terminals.value.map((session) => ({
        ...session,
        exitCode: exitedTerminals.current.get(session.id) ?? session.exitCode,
      }));
      const byId = new Map(sessions.map((session) => [session.id, session]));
      const associated = new Map((plans.status === "fulfilled" ? plans.value : []).flatMap((item) =>
        item.executions.filter((execution) => execution.source !== "codex")
          .map((execution) => [execution.terminalId, { item, execution }] as const),
      ));
      const existingIds = new Set(existingTabs.map((tab) => tab.id));
      const next = sessions.filter((session) => !existingIds.has(session.id)).map(({ cwd, ...session }) => ({
        ...session, directory: cwd, label: associated.get(session.id)?.item.title ?? `终端 ${nextLabel.current++}`,
      }));
      setTabs((previous) => [...previous, ...next].map((tab) => {
        const exitCode = byId.get(tab.id)?.exitCode;
        if (exitCode !== undefined && tab.exitCode !== exitCode) tab = { ...tab, exitCode };
        const task = associated.get(tab.id);
        return task ? { ...tab, label: task.item.title, task: task.item, executor: task.execution.executor } : tab;
      }));
      if (next.length) setLayout((previous) => previous.active ? previous : { ...previous, active: next[next.length - 1].id });

      if (plans.status === "rejected") {
        throw new Error(`已恢复可用终端，任务关联尚未核对：${String(plans.reason)}`);
      }
      liveTasks.current.clear();
      const reconcile = [];
      for (const [terminalId, { item, execution }] of associated) {
        if (execution.endedAt) continue;
        const session = byId.get(terminalId);
        if (session && session.exitCode === undefined) {
          liveTasks.current.set(item.id, { id: terminalId, directory: directoryKey(session.cwd) });
        } else {
          reconcile.push(api.planner.recordExecution(item.id, {
            terminalId, state: session || exitedTerminals.current.has(terminalId) ? "exited" : "interrupted",
          }));
        }
      }
      await Promise.all(reconcile);
    })().catch((reason: unknown) => {
      restoreError.current = reason;
      setRecoveryError(String(reason));
    }).finally(() => setRestoring(false));
  }

  useEffect(() => {
    if (!restoration.current) restoreTerminals([]);
  }, [api]);

  useImperativeHandle(ref, () => ({
    async openTask(selectedItem, agent) {
      await restoration.current;
      if (restoreError.current) throw new Error("终端状态核对失败，请在终端页重试恢复", { cause: restoreError.current });
      if (!api) throw new Error("桌面终端不可用");
      const items = await api.planner.list();
      const item = items.find((entry) => entry.id === selectedItem.id);
      if (!item || item.kind !== "todo") throw new Error("任务已不存在或已改为备忘，请返回看板核对");
      if (item.executions.some((execution) => !execution.endedAt && execution.source === "codex")) {
        throw new Error("此任务正在由 Codex 受管执行，请在看板查看或停止本次执行");
      }
      const pending = pendingTasks.current.get(item.id);
      if (pending) return pending.launch;
      const live = liveTasks.current.get(item.id);
      if (live) {
        if (closing.current.has(live.id)) throw new Error("正在关闭该任务终端，请稍后重试");
        setTabs((previous) => previous.map((tab) => tab.id === live.id ? { ...tab, label: item.title, task: item } : tab));
        selectTab(live.id);
        return true;
      }

      if (item.updatedAt !== selectedItem.updatedAt) throw new Error("任务已变更，请返回看板核对后再打开终端");
      const directory = item.projectDirectory.trim();
      if (!directory) throw new Error("请先为任务填写项目目录");
      const key = directoryKey(directory);
      const sameDirectory = items.some((entry) => entry.id !== item.id && entry.executions.some(
        (execution) => !execution.endedAt && directoryKey(execution.directory) === key,
      )) || [...liveTasks.current.values(), ...pendingTasks.current.values()]
        .some((terminal) => terminal.directory === key);
      if (sameDirectory && !window.confirm("另一个任务正在同一目录执行。继续前请确认两边的改动不会冲突。继续打开？")) {
        return false;
      }
      const launch = (async () => {
        const terminalId = await api.terminal.create({ cwd: directory, agent });
        const manualExecutor = findTerminalAgent(item.executor) ? "手动" : item.executor.trim() || "手动";
        const executor = agent ? TERMINAL_AGENTS[agent] : manualExecutor;
        liveTasks.current.set(item.id, { id: terminalId, directory: key });
        try {
          await api.planner.recordExecution(item.id, {
            terminalId, state: "linked", directory, executor,
          });
        } catch (reason) {
          liveTasks.current.delete(item.id);
          await api.terminal.destroy(terminalId).catch(console.warn);
          throw reason;
        }
        setTabs((previous) => [...previous, { id: terminalId, label: item.title, directory, task: item, executor }]);
        selectTab(terminalId);
        return true;
      })().finally(() => pendingTasks.current.delete(item.id));
      pendingTasks.current.set(item.id, { directory: key, launch });
      return launch;
    },
  }));

  async function openShell(orientation?: Orientation) {
    if (!api || creatingShell || restoring) return;
    setCreatingShell(true);
    setError("");
    try {
      const directory = settings?.workspace ?? "";
      const id = await api.terminal.create();
      const tab = { id, label: `终端 ${nextLabel.current++}`, directory };
      setTabs((previous) => [...previous, tab]);
      if (orientation) {
        setLayout((previous) => previous.active
          ? { ...previous, other: id, orientation }
          : { active: id, other: null, orientation });
      } else {
        selectTab(id);
      }
    } catch (reason) {
      setError(`打开终端失败：${String(reason)}`);
    } finally {
      setCreatingShell(false);
    }
  }

  function split(orientation: Orientation) {
    const other = layout.other ?? tabs.find((tab) => tab.id !== layout.active)?.id;
    if (layout.active && other) setLayout((previous) => ({ ...previous, other, orientation }));
    else if (layout.active) void openShell(orientation);
  }

  async function closeTab(tab: Tab) {
    if (!api || restoring || closing.current.size > 0) return;
    if (tab.exitCode === undefined && !window.confirm("关闭将终止此终端会话及其中的前台进程。继续关闭？")) return;
    setError("");
    closing.current.add(tab.id);
    try {
      await api.terminal.destroy(tab.id);
      exitedTerminals.current.delete(tab.id);
      setTabs((previous) => previous.filter((entry) => entry.id !== tab.id));
      setLayout((previous) => ({
        ...previous,
        active: previous.active === tab.id
          ? previous.other ?? tabs.find((entry) => entry.id !== tab.id && !closing.current.has(entry.id))?.id ?? null
          : previous.active,
        other: previous.active === tab.id || previous.other === tab.id ? null : previous.other,
      }));
      if (tab.task && liveTasks.current.get(tab.task.id)?.id === tab.id) {
        liveTasks.current.delete(tab.task.id);
        await api.planner.recordExecution(tab.task.id, { terminalId: tab.id, state: "interrupted" });
      }
    } catch (reason) {
      setError(`关闭终端或记录会话状态失败：${String(reason)}`);
    } finally {
      closing.current.delete(tab.id);
    }
  }

  return (
    <section className="flex h-full min-h-0 flex-col" aria-label="终端工作区">
      <header className="flex flex-wrap items-center gap-2 px-3 py-2">
        <h1 className="text-sm font-semibold">终端</h1>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" title="新终端" aria-label="新终端" disabled={!api || creatingShell || restoring} onClick={() => void openShell()}><Plus /></Button>
          <Button variant="ghost" size="icon-sm" title="左右分屏" aria-label="左右分屏" aria-pressed={!!layout.other && layout.orientation === "horizontal"} disabled={!layout.active || creatingShell} onClick={() => split("horizontal")}><Columns2 /></Button>
          <Button variant="ghost" size="icon-sm" title="上下分屏" aria-label="上下分屏" aria-pressed={!!layout.other && layout.orientation === "vertical"} disabled={!layout.active || creatingShell} onClick={() => split("vertical")}><Rows2 /></Button>
          {layout.other && <Button variant="ghost" size="sm" onClick={() => setLayout((previous) => ({ ...previous, other: null }))}>取消分屏</Button>}
        </div>
      </header>
      {error && <p role="alert" className="px-3 py-2 text-xs text-[color:var(--chela-status-error-text)]">{error}</p>}
      {recoveryError && <div className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs">
        <p role="alert" className="text-[color:var(--chela-status-error-text)]">恢复终端状态失败：{recoveryError}</p>
        <Button size="sm" variant="secondary" onClick={() => restoreTerminals(tabs)}>重试恢复</Button>
      </div>}
      {tabs.length ? (
        <div className="flex shrink-0 gap-1 overflow-x-auto px-3 pb-2" aria-label="终端会话">
          {tabs.map((tab) => (
            <div key={tab.id} className="flex shrink-0 items-center gap-0.5">
              <Button size="sm" variant="ghost" aria-pressed={tab.id === layout.active} onClick={() => selectTab(tab.id)} className="aria-pressed:bg-selection-bg aria-pressed:text-selection-fg">
                <span className="max-w-40 truncate">{tab.label}</span>
                {tab.exitCode !== undefined && <span className="text-xs text-muted-foreground">已退出</span>}
              </Button>
              <Button size="icon-sm" variant="ghost" title="关闭终端" aria-label={`关闭 ${tab.label}`} disabled={restoring} onClick={() => void closeTab(tab)}><X /></Button>
            </div>
          ))}
        </div>
      ) : (
        <p className="px-3 pb-2 text-xs text-muted-foreground">{restoring ? "正在恢复终端…" : "新建终端，或从看板打开任务对应的目录。"}</p>
      )}
      <div className="min-h-0 flex-1">
        <ResizablePanelGroup orientation={layout.orientation} className="overflow-hidden">
          <ResizablePanel id="terminal-primary" minSize="15%" className="min-w-0 overflow-hidden">
            <div className="h-full" ref={(node) => { slots.current.primary = node; }} />
          </ResizablePanel>
          {layout.other && (
            <>
              <ResizableHandle className="bg-border/60" />
              <ResizablePanel id="terminal-secondary" minSize="15%" className="min-w-0 overflow-hidden">
                <div className="h-full" ref={(node) => { slots.current.secondary = node; }} />
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </div>
      <div className="hidden" ref={(node) => { slots.current.hidden = node; }} />
      {tabs.map((tab) => {
        const slot = tab.id === layout.active ? "primary" : tab.id === layout.other ? "secondary" : "hidden";
        return <TerminalPane key={tab.id} tab={tab} slot={slot} slots={slots} settings={settings} visible={visible && slot !== "hidden"} focused={visible && slot === "primary"} />;
      })}
    </section>
  );
}
