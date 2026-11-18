import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { FolderOpen, RefreshCw } from "lucide-react";
import { Button } from "../../ui/button";
import { IconButton } from "../../ui/icon-button";
import { Input, Textarea } from "../../ui/text-field";
import { Select } from "../../ui/select";
import { Sidebar, SidebarGroup, SidebarToggle } from "../../ui/sidebar";
import { terminalApi, type TerminalInfo, type TerminalProgram } from "./api";
import type { WorkTask } from "../../data/work";
import { refreshWorkTasks, saveWorkTask, useWorkTasks } from "../../state/work-task-actions";
import "@xterm/xterm/css/xterm.css";
import "./terminal.css";
import { ExecutionResults } from "./execution-results";
import * as ContextMenu from "@radix-ui/react-context-menu";
import { routeTitle } from "../../ui/route-title";
import { PaneSplit, initialPanes, prunePanes, splitPane, type PaneLayout } from "./pane-layout";

const assets = import.meta.glob<string>("./assets/*.svg", { eager: true, query: "?url", import: "default" });
function Icon({ name }: { name: string }) { return <img src={assets[`./assets/${name}.svg`]} alt="" draggable={false} />; }
const programs: Record<TerminalProgram, string> = { pwsh: "PowerShell", codex: "Codex CLI", opencode: "OpenCode" };
const message = (error: unknown) => error instanceof Error ? error.message : String(error);
const directoryName = (directory: string) => directory.split(/[\\/]/).filter(Boolean).at(-1) || directory;
function routeTask() {
  if (location.hash.startsWith("#terminal/session/")) return "";
  try { return decodeURIComponent(location.hash.split("/").slice(1).join("/")); }
  catch { return ""; }
}
function routeTerminal() { return location.hash.startsWith("#terminal/session/") ? location.hash.slice("#terminal/session/".length).split("?")[0] : ""; }

// Keyboard input and explicit task submission share one ordered write stream per process.
const writes = new Map<string, Promise<void>>();
const screens = new Map<string, Terminal>();
function writeInput(id: string, input: string) {
  const pending = (writes.get(id) ?? Promise.resolve()).catch(() => {}).then(() => terminalApi.write(id, input));
  writes.set(id, pending);
  void pending.finally(() => { if (writes.get(id) === pending) writes.delete(id); }).catch(() => {});
  return pending;
}

function TerminalOutput({ session, onEnded }: { session: TerminalInfo; onEnded: (id: string) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const id = session.id;
  useEffect(() => {
    const element = container.current;
    if (!element || !terminalApi.available) return;
    let disposed = false;
    let offset = 0;
    let timer = 0;
    let frame = 0;
    let size = "";
    let resizes = Promise.resolve();
    setError("");
    const terminal = new Terminal({ fontFamily: '"JetBrains Mono", Consolas, monospace', fontSize: 12, lineHeight: 1.5,
      cursorBlink: session.mode!=="observed", disableStdin:session.mode==="observed", scrollback: 5000, allowProposedApi: false, screenReaderMode: true });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(element);
    screens.set(id, terminal);
    const theme = () => {
      const style = getComputedStyle(element);
      terminal.options.fontFamily = style.getPropertyValue("--chela-type-family-terminal").trim() || '"JetBrains Mono", Consolas, monospace';
      terminal.options.fontSize = Number.parseFloat(style.getPropertyValue("--chela-type-terminal-size")) || 13;
      terminal.options.theme = { background: style.getPropertyValue("--chela-color-bg-surface").trim(),
        foreground: style.getPropertyValue("--chela-color-text-primary").trim(),
        cursor: style.getPropertyValue("--chela-color-text-primary").trim(),
        selectionBackground: style.getPropertyValue("--chela-color-accent-subtle").trim() };
      resize();
    }
    theme();
    const appearance = new MutationObserver(theme);
    appearance.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "style"] });
    function resize() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (disposed || !element!.clientWidth || !element!.clientHeight) return;
        fit.fit();
        const next = `${terminal.cols}:${terminal.rows}`;
        if (next === size) return;
        size = next;
        const { cols, rows } = terminal;
        resizes = resizes.catch(() => {}).then(async () => {
          if (!disposed && !session.ended) await terminalApi.resize(id, cols, rows);
        }).catch(reason => { if (!disposed) setError(message(reason)); });
      });
    }
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    const input = terminal.onData(data => {
      void writeInput(id, data).catch(reason => { if (!disposed) setError(message(reason)); });
    });
    async function read() {
      if (disposed) return;
      if (document.hidden || !element!.getClientRects().length) { timer = window.setTimeout(read, 1500); return; }
      try {
        const output = await terminalApi.read(id, offset);
        if (disposed) return;
        if (output.reset) terminal.reset();
        if (output.data) {
          const bytes = Uint8Array.from(atob(output.data), character => character.charCodeAt(0));
          await new Promise<void>(resolve => terminal.write(bytes, resolve));
        }
        if (disposed) return;
        offset = output.next;
        if (output.persistenceError) setError(output.persistenceError);
        if (output.ended) { terminal.options.disableStdin = true; onEnded(id); return; }
        timer = window.setTimeout(read, output.data ? 80 : 500);
      } catch (reason) { if (!disposed) setError(message(reason)); }
    }
    void read();
    return () => {
      disposed = true;
      clearTimeout(timer); cancelAnimationFrame(frame);
      observer.disconnect(); appearance.disconnect(); input.dispose(); terminal.dispose();
      if (screens.get(id) === terminal) screens.delete(id);
    };
  }, [id, session.generation, session.mode, retry, onEnded]);
  return <div className="terminal-output-wrap">
    <div ref={container} className="terminal-output" aria-label={`${programs[session.program]} 终端输入输出`} />
    {error && <div className="terminal-error" role="alert">{error}<Button onClick={() => setRetry(value => value + 1)}>重新连接</Button></div>}
  </div>;
}

function CreateTerminal({ tasks, taskId, initialDirectory, initialProgram, busy, error, onStart, onCancel }: {
  tasks: WorkTask[]; taskId: string; initialDirectory: string; initialProgram: TerminalProgram; busy: boolean; error: string;
  onStart: (program: TerminalProgram, directory: string, task: string,prompt:string,command:string) => Promise<void>; onCancel: () => void;
}) {
  const id = useId();
  const [directory, setDirectory] = useState(initialDirectory);
  const [task, setTask] = useState(taskId);
  const [program, setProgram] = useState<TerminalProgram | "custom">(initialProgram), [command,setCommand] = useState("");
  const label = program === "custom" ? "其他命令" : programs[program];
  const [localError, setLocalError] = useState("");
  const [observed,setObserved]=useState(false),[initialPrompt,setInitialPrompt]=useState("");
  async function chooseDirectory() {
    setLocalError("");
    try { const value = await terminalApi.chooseDirectory(); if (value) setDirectory(value); }
    catch (reason) { setLocalError(message(reason)); }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!directory.trim()) { setLocalError("请选择或输入工作目录。"); return; }
    if(program==="custom"&&!command.trim()){setLocalError("请输入要在 PowerShell 中执行的命令。");return;}
    setLocalError(""); void onStart(program==="custom"?"pwsh":program, directory.trim(), task,observed&&program!=="pwsh"&&program!=="custom"?initialPrompt:"",program==="custom"?command:"");
  }
  return <form className="terminal-create" onSubmit={submit} aria-label="新建终端会话">
    <header><h2>新建终端会话</h2><IconButton aria-label="取消新建终端" onClick={onCancel} disabled={busy}><Icon name="close" /></IconButton></header>
    <label htmlFor={id + "directory"}>1. 项目或工作目录</label>
    <div className="terminal-directory"><Input id={id + "directory"} value={directory} onChange={event => setDirectory(event.target.value)} placeholder="输入本机工作目录" required autoFocus disabled={busy} />
      <IconButton aria-label="选择工作目录" disabled={busy} onClick={() => void chooseDirectory()}><FolderOpen size={14} /></IconButton></div>
    <label htmlFor={id + "task"}>2. 关联看板任务（可选）</label>
    <Select id={id + "task"} value={task} disabled={busy} onChange={event => setTask(event.target.value)}>
      <option value="">不关联任务，创建临时终端</option>
      {task && !tasks.some(item => item.id === task) && <option value={task}>{task}</option>}
      {tasks.filter(item => item.status !== "已归档" || item.id === task).map(item => <option key={item.id} value={item.id}>{item.id} · {item.title}</option>)}
    </Select>
    <fieldset disabled={busy}><legend>3. 选择启动工具</legend>
      {(["codex", "opencode", "pwsh", "custom"] as const).map(value => <label key={value} className="terminal-program" data-selected={program === value}>
        <input type="radio" name={id + "program"} checked={program === value} onChange={() => setProgram(value)} />
        <Icon name={value==="custom"?"terminal":value} /><strong>{value==="custom"?"其他命令":programs[value]}</strong><small>{value==="custom"?"在 PowerShell 中执行自定义命令":value === "pwsh" ? "普通 PowerShell 命令行" : `在工作目录启动 ${value}`}</small>
      </label>)}
    </fieldset>
    {program==="custom"&&<label>启动命令<Input aria-label="启动命令" value={command} maxLength={4000} required onChange={event=>setCommand(event.target.value)} placeholder="例如 pnpm dev" /><small>使用所选目录中的 PowerShell 环境。</small></label>}
    {program!=="pwsh"&&program!=="custom"&&<><label><input type="checkbox" checked={observed} onChange={e=>setObserved(e.target.checked)}/>保存可定位的回复</label>{observed&&<><label>执行内容<Textarea required maxLength={64000} value={initialPrompt} onChange={e=>setInitialPrompt(e.target.value)} rows={5}/></label><small>按已核验的 CLI 版本接收回复，结束后可继续原会话。交互授权不会自动批准；需要手动授权时请使用普通终端。</small></>}</>}
    {!terminalApi.available && <p className="terminal-preview">浏览器预览未连接本机终端。请在 Chela 桌面端启动；此处不会运行命令。</p>}
    {(error || localError) && <p className="terminal-error" role="alert">{localError || error}</p>}
    <footer><Button onClick={onCancel} disabled={busy}>取消</Button><Button variant="primary" type="submit" disabled={busy}>{busy ? "启动中…" : program==="custom"?"启动并执行命令":`启动 ${label} 终端`}</Button></footer>
  </form>;
}

export function TerminalWorkspace({ sidebarOpen, onToggleSidebar }: { sidebarOpen: boolean; onToggleSidebar: () => void }) {
  const [sessions, setSessions] = useState<TerminalInfo[]>([]);
  const { tasks, error: taskError } = useWorkTasks();
  const [selectedId, setSelectedId] = useState("");
  const [paneIds, setPaneIds] = useState<string[]>([]);
  const [taskId, setTaskId] = useState(routeTask);
  const [creating, setCreating] = useState(false);
  const [program, setProgram] = useState<TerminalProgram>("codex");
  const [maximized, setMaximized] = useState("");
  const [layout, setLayout] = useState<PaneLayout | null>(null);
  const splitting = useRef<{ target: string; direction: "rows" | "columns" } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [renaming, setRenaming] = useState<TerminalInfo | null>(null), [renameValue, setRenameValue] = useState("");
  const [closeTarget,setCloseTarget]=useState<TerminalInfo | null>(null), closeDialog=useRef<HTMLDialogElement>(null), closeTitle=useId();
  useEffect(()=>{if(closeTarget&&!closeDialog.current?.open)closeDialog.current?.showModal()},[closeTarget]);
  const mounted = useRef(true);
  const selected = sessions.find(item => item.id === selectedId);
  const task = tasks.find(item => item.id === (selected?.taskId || taskId));
  const panes = paneIds.map(id => sessions.find(item => item.id === id)).filter((item): item is TerminalInfo => Boolean(item));
  useEffect(() => { setLayout(current => prunePanes(current || "", paneIds) || initialPanes(paneIds)); }, [paneIds]);
  const directories = [...new Set(sessions.map(item => item.directory))];
  const entries = sessions.filter((item, index) => !item.taskId || sessions.findIndex(other => other.taskId === item.taskId && other.directory === item.directory) === index);
  const title = (session: TerminalInfo) => {
    if (session.name) return session.name;
    const linked = tasks.find(item => item.id === session.taskId);
    return linked ? linked.title : session.taskId ? `任务 ${session.taskId.slice(0, 8)}` : `临时 ${programs[session.program]}`;
  };
  useEffect(() => { routeTitle(selected ? `${directoryName(selected.directory)} / ${title(selected)}${panes.length > 1 ? `（${panes.length} 窗格）` : ""}` : creating ? "新建终端" : "终端会话"); }, [selected, tasks, panes.length, creating]);
  function beginRename(session: TerminalInfo) { setRenaming(session); setRenameValue(title(session)); }
  async function renameSession(event: FormEvent) {
    event.preventDefault(); if (!renaming || busy) return;
    setBusy(true); setError("");
    try { await terminalApi.rename(renaming.id, renameValue); setSessions(await terminalApi.list()); setRenaming(null); }
    catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  }
  const ended = useCallback((_id: string) => {void terminalApi.list().then(setSessions).catch(e=>setError(message(e)))}, []);
  useEffect(() => {
    mounted.current = true;
    let request = 0;
    async function load() {
      const current = ++request;
      setLoading(true);
      try {
        const items = await terminalApi.list();
        if (!mounted.current || current !== request) return;
        setSessions(items);
        const linkedId = routeTask();
        setTaskId(linkedId);
        const active = routeTerminal() ? items.find(item => item.id === routeTerminal()) : linkedId ? items.find(item => item.taskId === linkedId && !item.ended) || [...items].reverse().find(item => item.taskId === linkedId) : items.find(item => item.id === sessionStorage.getItem("chela.terminal.selected"));
        setSelectedId(active?.id || "");
        setPaneIds(active ? (active.taskId ? items.filter(item => item.taskId === active.taskId).map(item => item.id) : [active.id]) : []);
        setCreating(Boolean(linkedId && !active));
        setMaximized(""); setError("");
      } catch (reason) { if (mounted.current && current === request) setError(message(reason)); }
      finally { if (mounted.current && current === request) setLoading(false); }
    }
    const hash = () => {
      if (!location.hash.startsWith("#terminal")) return;
      void refreshWorkTasks();
      void load();
    };
    void load(); window.addEventListener("hashchange", hash);
    return () => { mounted.current = false; window.removeEventListener("hashchange", hash); };
  }, []);

  function select(session: TerminalInfo) {
    setSelectedId(session.id); setTaskId(session.taskId); setCreating(false); setMaximized(""); setError(""); setNotice("");
    setPaneIds(session.taskId ? sessions.filter(item => item.taskId === session.taskId).map(item => item.id) : [session.id]);
    sessionStorage.setItem("chela.terminal.selected", session.id);
    const hash = `#terminal/session/${session.id}`;
    history.replaceState(null, "", hash);
  }
  function newTerminal(value: TerminalProgram = "codex") { setProgram(value); setCreating(true); setError(""); setNotice(""); }
  async function start(value: TerminalProgram, directory: string, linkedId: string, split = false,initialPrompt="",command="") {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const session = initialPrompt?await terminalApi.startObserved(value,directory,linkedId,initialPrompt):await terminalApi.start(value, directory, linkedId);
      if (!mounted.current) return;
      setSessions(previous => [...previous, session]); setSelectedId(session.id); setTaskId(linkedId);
      if (split && splitting.current) {
        const { target, direction } = splitting.current;
        setLayout(current => current ? splitPane(current, target, session.id, direction) : session.id);
      } else setLayout(session.id);
      setPaneIds(previous => split ? [...previous, session.id] : [session.id]);
      setCreating(false); setMaximized("");
      sessionStorage.setItem("chela.terminal.selected", session.id);
      history.replaceState(null, "", `#terminal/session/${session.id}`);
      if(command) { try{await terminalApi.write(session.id,command+"\r")}catch(cause){setError(`终端已启动，但命令发送失败：${message(cause)}`)} }
    } catch (reason) { if (mounted.current) setError(message(reason)); }
    finally { if (mounted.current) setBusy(false); }
  }
  async function close(session: TerminalInfo, confirmed=false) {
    if (busy) return;
    if (!session.ended && !confirmed) {setCloseTarget(session);return;}
    setBusy(true); setError("");
    try {
      await terminalApi.close(session.id);
      if (!mounted.current) return;
      setSessions(await terminalApi.list());
      closeDialog.current?.close();
    } catch (reason) { if (mounted.current) setError(message(reason)); }
    finally { if (mounted.current) setBusy(false); }
  }
  function hidePane(id: string) {
    setPaneIds(previous => previous.filter(value => value !== id));
    if (selectedId === id) setSelectedId(paneIds.find(value => value !== id) || "");
    if (maximized === id) setMaximized("");
  }
  function split(session: TerminalInfo, direction: "rows" | "columns") { splitting.current = { target: session.id, direction }; void start("pwsh", session.directory, session.taskId, true); }
  const prompt = task ? `${task.title}${task.description ? "\n\n" + task.description : ""}` : "";
  const agent = panes.find(item => item.id === selectedId && item.program !== "pwsh" && item.mode!=="observed" && !item.ended) || panes.find(item => item.program !== "pwsh" && item.mode!=="observed" && !item.ended);
  async function sendTask() {
    if (!agent || busy) return;
    setBusy(true); setError("");
    try {
      const screen = screens.get(agent.id);
      if (!screen) throw new Error("终端尚未连接，请稍后重试。");
      screen.paste(prompt);
      await writes.get(agent.id);
      await writeInput(agent.id, "\r");
      if (mounted.current) setNotice(`任务要求已发送到 ${programs[agent.program]}。`);
    }
    catch (reason) { if (mounted.current) setError(message(reason)); }
    finally { if (mounted.current) setBusy(false); }
  }
  async function completeTask() {
    if (!task || busy) return;
    setBusy(true); setError("");
    try { await saveWorkTask({ ...task, status: "已完成" }); }
    catch (reason) { if (mounted.current) setError(message(reason)); }
    finally { if (mounted.current) setBusy(false); }
  }
  return <>
    <Sidebar id="terminal-sidebar" title="终端会话" open={sidebarOpen} actions={<Button onClick={() => newTerminal()}><Icon name="plus" />新建终端</Button>}>
      {directories.map(directory => <SidebarGroup key={directory} label={`${directoryName(directory)} · ${entries.filter(item => item.directory === directory).length}`} defaultOpen>
        {entries.filter(item => item.directory === directory).map(session => <ContextMenu.Root key={session.id}><ContextMenu.Trigger asChild><div className="terminal-session-row">
          {renaming?.id === session.id ? <form onSubmit={event => void renameSession(event)}><Input aria-label="终端会话名称" autoFocus value={renameValue} onChange={event => setRenameValue(event.target.value)} maxLength={80} required onKeyDown={event => { if (event.key === "Escape") setRenaming(null); }} /><small>Enter 保存 · Esc 取消</small></form> : <Button variant="ghost" className="terminal-session" aria-current={paneIds.includes(session.id) ? "page" : undefined} onClick={() => select(session)} onDoubleClick={() => beginRename(session)}>
            <Icon name={session.program} /><span><strong>{title(session)}</strong><small>{session.program} · {session.state === "interrupted" ? "上次运行中断" : session.ended ? "已退出" : "运行中"}{session.taskId && sessions.filter(item => item.taskId === session.taskId).length > 1 ? ` · ${sessions.filter(item => item.taskId === session.taskId).length} 窗格` : ""}</small></span>
          </Button>}
        </div></ContextMenu.Trigger><ContextMenu.Portal><ContextMenu.Content className="ui-menu"><ContextMenu.Item onSelect={() => beginRename(session)}>重命名</ContextMenu.Item><ContextMenu.Item onSelect={() => select(session)}>打开会话</ContextMenu.Item><ContextMenu.Item disabled={session.ended} onSelect={() => void close(session)}>结束主终端</ContextMenu.Item></ContextMenu.Content></ContextMenu.Portal></ContextMenu.Root>)}
      </SidebarGroup>)}
      {!loading && !sessions.length && <p className="terminal-side-empty">暂无终端会话</p>}
    </Sidebar>
    <main className="terminal-workspace" aria-label="终端工作区" aria-busy={loading}>
      <header className="terminal-toolbar"><SidebarToggle controls="terminal-sidebar" open={sidebarOpen} onToggle={onToggleSidebar} />
        {(selected?.taskId || taskId) && <a className="terminal-back ui-button" href={`#board/${encodeURIComponent(selected?.taskId || taskId)}`}><Icon name="back" />返回 {selected?.taskId || taskId}</a>}
        <span className="terminal-workspace-title">{creating ? "新建终端会话" : task?.title || (selected ? title(selected) : "尚未打开活动终端会话")}</span>
        {selected && <span className="terminal-status" data-ended={selected.ended}>{programs[selected.program]} · {selected.ended ? "已退出" : "运行中"}</span>}
        {!creating && task && task.kind !== "calendar_event" && <Button onClick={() => void completeTask()} disabled={busy || task.status === "已完成"}>{task.status === "已完成" ? "已完成" : "标记完成"}</Button>}
        {!creating && selected && <Button className="terminal-close" onClick={() => void close(selected)} disabled={busy || selected.ended}>结束终端</Button>}
      </header>
      {!creating && error && <div className="terminal-error" role="alert">{error}</div>}
      {taskError && <div className="terminal-error" role="alert">任务列表读取失败：{taskError}<Button variant="ghost" onClick={refreshWorkTasks}>重新加载</Button></div>}
      {notice && <p className="terminal-notice" role="status">{notice}</p>}
      <div className="terminal-body" data-empty={creating || !panes.length}>
        {creating ? <CreateTerminal key={`${taskId}:${program}`} tasks={tasks} taskId={taskId} initialDirectory={selected?.directory || ""} initialProgram={program} busy={busy} error={error}
          onStart={(value, directory, linkedId,initialPrompt,command) => start(value, directory, linkedId,false,initialPrompt,command)} onCancel={() => { setCreating(false); setError(""); }} />
          : loading ? <p className="terminal-side-empty">正在读取终端会话…</p>
          : !panes.length ? <section className="terminal-empty"><Icon name="terminal" /><h2>选择一个已有会话，或新建终端开始工作</h2>
            <p>支持为同一看板任务组合 Codex / OpenCode 与多个 PowerShell 窗格，也支持直接开临时命令行。</p>
            {!terminalApi.available && <p>浏览器预览未连接本机终端，请在 Chela 桌面端使用。</p>}
            <div><Button variant="primary" onClick={() => newTerminal()}><Icon name="plus" />新建终端</Button><Button onClick={() => newTerminal("pwsh")}>直接开一个 PowerShell</Button></div>
          </section> : <>
            {task && <div className="terminal-task-prompt"><span>待发要求</span><details><summary>{task.title}</summary><p>{prompt}</p></details>
              <Button onClick={() => { void navigator.clipboard.writeText(prompt).then(() => setNotice("任务要求已复制。")).catch(reason => setError(message(reason))); }}><Icon name="copy" />复制要求</Button>
              <Button variant="primary" onClick={() => void sendTask()} disabled={busy || !agent}>发送到 {agent ? programs[agent.program] : "CLI"}</Button></div>}
            <div className="terminal-panes" data-layout="split" data-count={panes.length}>
              {layout && <PaneSplit tree={layout} maximized={maximized} render={id => { const session = panes.find(pane => pane.id === id); return session && <section key={session.id} className="terminal-pane" data-active={selectedId === session.id} onFocusCapture={() => setSelectedId(session.id)} onPointerDown={() => setSelectedId(session.id)} aria-label={`${programs[session.program]} 窗格`}>
                <header><i data-ended={session.ended} /><strong>{session.program}</strong><span>{session.directory}</span>
                  <IconButton aria-label="向右分屏" disabled={busy} onClick={() => split(session, "columns")}><Icon name="columns" /></IconButton>
                  <IconButton aria-label="向下分屏" disabled={busy} onClick={() => split(session, "rows")}><Icon name="rows" /></IconButton>
                  <IconButton aria-label={maximized === session.id ? "还原窗格" : "放大窗格"} aria-pressed={maximized === session.id} onClick={() => setMaximized(previous => previous === session.id ? "" : session.id)}><Icon name="maximize" /></IconButton>
                  <IconButton aria-label="隐藏窗格，保留终端进程" disabled={busy} onClick={() => hidePane(session.id)}><Icon name="close" /></IconButton>
                </header>
                <TerminalOutput session={session} onEnded={ended} />
                {session.mode==="observed"&&<ExecutionResults session={session} onResumed={value=>setSessions(previous=>previous.map(s=>s.id===value.id?value:s))}/>}
                {session.ended && <footer>进程已退出<IconButton aria-label="在相同目录新建终端" disabled={busy} onClick={() => void start(session.program, session.directory, session.taskId)}><RefreshCw size={12} /></IconButton></footer>}
              </section>; }} />}
            </div>
          </>}
      </div>
      <dialog ref={closeDialog} className="terminal-close-dialog" aria-labelledby={closeTitle} onClose={()=>{setCloseTarget(null);if(closeDialog.current)closeDialog.current.returnValue=""}}>
        <header><h2 id={closeTitle}>关闭将结束正在运行的 {closeTarget?programs[closeTarget.program]:"终端"}</h2><IconButton aria-label="取消关闭终端" disabled={busy} autoFocus onClick={()=>closeDialog.current?.close()}><Icon name="close" /></IconButton></header>
        <p>先回看板不会关掉它；确认不用了再结束。</p>
        {error&&<p className="terminal-error" role="alert">{error}</p>}
        <footer><Button disabled={busy} onClick={()=>{closeDialog.current?.close();if(closeTarget?.taskId)location.hash=`board/${encodeURIComponent(closeTarget.taskId)}`}}>先回看板</Button><Button disabled={busy||!closeTarget} onClick={()=>closeTarget&&void close(closeTarget,true)}>结束 {closeTarget?programs[closeTarget.program]:"终端"}</Button></footer>
      </dialog>
    </main>
  </>;
}
