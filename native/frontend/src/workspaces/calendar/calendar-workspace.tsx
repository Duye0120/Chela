import { useEffect, useId, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { ArrowUpRight, CalendarDays, SquareTerminal, Trash2, X } from "lucide-react";
import { Button } from "../../ui/button";
import { IconButton } from "../../ui/icon-button";
import { Input, Textarea } from "../../ui/text-field";
import { Select } from "../../ui/select";
import { TaskScheduleFields } from "../../ui/task-schedule-fields";
import { TaskReminders } from "../../ui/task-reminders";
import { PlanDrafts } from "./plan-drafts";
import * as Menu from "../../ui/menu";
import { workApi, taskStatuses as statuses, taskPriorities as priorities, type WorkTask, type ScheduleBlock } from "../../data/work";
import { NoteEditor } from "../notes/note-editor";
import "../notes/notes.css";
import "./calendar.css";
import { routeTitle } from "../../ui/route-title";

const weekdays = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const views = ["月视图", "周视图", "按状态分组", "近期安排"];
const assets = import.meta.glob<string>("./assets/*.svg", { eager: true, query: "?url", import: "default" });
function CalIcon({ name }: { name: string }) { return <img src={assets[`./assets/${name}.svg`]} alt="" draggable={false} />; }
const message = (error: unknown) => error instanceof Error ? error.message : String(error);

// Calendar dates stay local; never round-trip a date-only value through UTC ISO strings.
export function localDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function dateValue(value: string) { const [y, m, d] = value.split("-").map(Number); return new Date(y, m - 1, d, 12); }
function addDays(date: Date, days: number) { return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days, 12); }
function weekStart(date: Date) { return addDays(date, -((date.getDay() + 6) % 7)); }
export function monthDays(date: Date) {
  const start = weekStart(new Date(date.getFullYear(), date.getMonth(), 1, 12));
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 12);
  const days: Date[] = [];
  for (let day = start; day <= end || days.length % 7; day = addDays(day, 1)) days.push(day);
  return days;
}
type CalendarEntry=WorkTask&{calendarKey?:string;block?:ScheduleBlock};
function calendarEntries(tasks:WorkTask[]):CalendarEntry[]{
  return tasks.flatMap(task=>[
    ...(task.date?[{...task,calendarKey:"primary-"+task.id}]:[]),
    ...(task.blocks||[]).map(block=>{
      const date=block.localStart.slice(0,10), end=block.localEnd.slice(0,10);
      const exclusive=block.allDay||block.localEnd.endsWith("T00:00");
      const endDate=exclusive?localDate(addDays(dateValue(end),-1)):end;
      return {...task,date,endDate,calendarKey:block.id,block};
    }),
  ]);
}
function taskEnd(task: WorkTask) { return task.endDate && task.endDate > task.date ? task.endDate : task.date; }
function onDate(task: WorkTask, date: string) { return Boolean(task.date && task.date <= date && taskEnd(task) >= date); }
const blankTask = (date: string): WorkTask => ({ id: "", title: "", description: "", status: "待办", priority: priorities[3], project: "", date, endDate: "", parentId: "" });
function routedId() {
  try { return decodeURIComponent(location.hash.split("/").slice(1).join("/")); } catch { return ""; }
}

export function weekSegments(tasks: CalendarEntry[], days: Date[]) {
  const keys = days.map(localDate);
  const lanes: number[] = [];
  return tasks.filter(task => task.date && task.date <= keys[6] && taskEnd(task) >= keys[0]).map(task => {
    const start = task.date < keys[0] ? 0 : keys.indexOf(task.date);
    const end = taskEnd(task) > keys[6] ? 6 : keys.indexOf(taskEnd(task));
    let lane = lanes.findIndex(last => last < start);
    if (lane < 0) lane = lanes.length;
    lanes[lane] = end;
    return { task, start, end, lane };
  });
}

function CalendarEditor({ task, tasks, busy, onSave, onDelete, onClose }: {
  task: WorkTask; tasks: WorkTask[]; busy: boolean;
  onSave: (task: WorkTask) => Promise<WorkTask>; onDelete: (task: WorkTask) => Promise<void>; onClose: () => void;
}) {
  const [draft, setDraft] = useState(task), [error, setError] = useState(""), [saving, setSaving] = useState(false), [confirmDelete, setConfirmDelete] = useState(false);
  const latest = useRef(task), saved = useRef(task), queue = useRef(Promise.resolve(task));
  const [recovered, setRecovered] = useState<WorkTask | null>(null);
  useEffect(() => {
    if (!task.id) return;
    try { const value = JSON.parse(sessionStorage.getItem(`chela.calendar.draft.${task.id}`) || "null"); if (value?.id === task.id && typeof value.title === "string" && typeof value.description === "string" && Number.isInteger(value.revision)) setRecovered(value); }
    catch { setError("无法读取本机草稿，原文档已保留。"); }
  }, []);
  const signature = (value: WorkTask) => JSON.stringify({ ...value, revision: 0 });
  function change(value: WorkTask) { latest.current = value; setDraft(value); if (task.id) { try { sessionStorage.setItem(`chela.calendar.draft.${task.id}`, JSON.stringify(value)); } catch { setError("本机草稿缓存失败，请完成保存后再关闭。"); } } }
  const field = (key: keyof WorkTask, value: string) => change({ ...latest.current, [key]: value });
  function persist() {
    const value = latest.current;
    const pending = queue.current.catch(() => saved.current).then(async () => {
      if (signature(value) === signature(saved.current)) return saved.current;
      if (!value.title.trim()) throw Error("请输入日程名称。");
      setSaving(true); setError("");
      const result = await onSave({ ...value, title: value.title.trim(), revision: saved.current.revision });
      saved.current = result;
      if (latest.current === value) { latest.current = result; setDraft(result); if (task.id) { try { sessionStorage.removeItem(`chela.calendar.draft.${task.id}`); } catch { setError("文档已保存，本机草稿缓存暂未清除。"); } } }
      else latest.current = { ...latest.current, revision: result.revision };
      return result;
    });
    queue.current = pending;
    void pending.catch(cause => setError(message(cause))).finally(() => { if (queue.current === pending) setSaving(false); });
    return pending;
  }
  useEffect(() => {
    if (!task.id || signature(draft) === signature(saved.current)) return;
    const timer = setTimeout(() => { void persist().catch(() => {}); }, 500);
    return () => clearTimeout(timer);
  }, [draft]);
  useEffect(() => () => { if (task.id) void persist().catch(() => {}); }, []);
  async function back() {
    try { if (task.id) await persist(); onClose(); } catch { /* Keep the unsaved document open. */ }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    try { if (task.id) await persist(); else { if (!draft.title.trim()) throw Error("请输入日程名称。"); await onSave(draft); } }
    catch (cause) { setError(message(cause)); }
  }
  return <section className="calendar-editor" data-new={!task.id} aria-label={task.id ? "日程文档" : "新建日程"}>
    <header><Button onClick={() => void back()}>← 返回日历</Button><span className="calendar-document-route">日历 / {draft.date || "无日期"} / {draft.title || "新建日程"}</span>
      <span className="calendar-document-status" role="status">{error ? "保存失败 · 草稿保留" : saving ? "正在保存…" : signature(draft) !== signature(saved.current) ? "待保存" : task.id ? "✓ 已保存 · 文档格式" : "新建文档"}</span>
      {task.id && <a className="ui-button" href={`#board/${encodeURIComponent(task.id)}`}>打开关联任务</a>}
    </header>
    <form onSubmit={submit}>
      <div className="calendar-document-scroll"><article className="calendar-document">
        {recovered && <div className="notes-recovery" role="status"><span>有一份未保存的本机草稿，原文档已保留。</span><Button onClick={() => { change({ ...recovered, revision: saved.current.revision }); setRecovered(null); }}>恢复草稿</Button><Button onClick={() => { sessionStorage.removeItem(`chela.calendar.draft.${task.id}`); setRecovered(null); }}>丢弃本机草稿</Button></div>}
        <div className="calendar-document-additions">日程文档</div>
        <Input className="calendar-document-title" aria-label="日程名称" placeholder="未命名日程" value={draft.title} onChange={event => field("title", event.target.value)} required autoFocus={!task.id} />
        <div className="calendar-document-properties">
          <label><span>日期</span><Input type="date" aria-label="日程日期" value={draft.date} onChange={event => field("date", event.target.value)} /><span className="calendar-hint">可拖动跨天或改为无日期</span></label>
          <label><span>状态</span><Select aria-label="日程状态" value={draft.status} onChange={event => field("status", event.target.value)}>{[...new Set([...statuses, draft.status])].filter(Boolean).map(status => <option key={status}>{status}</option>)}</Select></label>
          <label><span>关联项目</span><Input aria-label="日程所属项目" value={draft.project} onChange={event => field("project", event.target.value)} placeholder="未关联项目" /></label>
          <div><span>关联任务</span>{task.id ? <a href={`#board/${encodeURIComponent(task.id)}`}>{task.parentId ? "父任务与当前事项" : "在看板查看"} ↗</a> : <span>创建后可在看板查看</span>}</div>
        </div>
        <NoteEditor content={draft.description} onChange={description => field("description", description)} notes={[]} targets={tasks.map(item => ({ id: item.id, title: item.title, kind: "task" as const, detail: item.status }))} onOpen={value => { location.hash = `board/${encodeURIComponent(value)}`; }}
          onError={setError} onCreateTask={text => { void workApi.saveTask({ ...blankTask(""), title: text, parentId: task.id }).then(value => { location.hash = `board/${encodeURIComponent(value.id)}`; }).catch(cause => setError(message(cause))); }} />
        <details className="calendar-document-advanced"><summary>排期、优先级与提醒</summary><TaskScheduleFields task={draft} onChange={change} className="calendar-field-pair" />
          <label>优先级<Select aria-label="日程优先级" value={draft.priority} onChange={event => field("priority", event.target.value)}>{priorities.map(priority => <option key={priority}>{priority}</option>)}</Select></label>
          {task.id && <TaskReminders task={draft} />}
        </details>
        {error && <p role="alert" className="calendar-error">{error}</p>}
        {confirmDelete && <div className="calendar-delete-confirm" role="alert"><p>删除“{draft.title}”？此操作无法撤销。</p><Button disabled={busy || saving} onClick={() => void onDelete(saved.current).catch(cause => setError(message(cause)))}>确认删除</Button><Button onClick={() => setConfirmDelete(false)}>取消</Button></div>}
        <footer><Button type="submit" variant="primary" disabled={busy || saving}>{saving ? "保存中…" : task.id ? "保存文档" : "创建并打开文档"}</Button>
          {task.id && <IconButton aria-label="删除日程" disabled={busy || saving} onClick={() => setConfirmDelete(true)}><Trash2 size={14} /></IconButton>}
        </footer>
      </article></div>
    </form>
  </section>;
}

export function CalendarWorkspace({ sidebarOpen, onToggleSidebar }: { sidebarOpen: boolean; onToggleSidebar: () => void }) {
  const [tasks, setTasks] = useState<WorkTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState("月视图");
  const [anchor, setAnchor] = useState(() => new Date());
  const [showUnscheduled, setShowUnscheduled] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [project, setProject] = useState("");
  const [sort, setSort] = useState("date");
  const [editor, setEditor] = useState<WorkTask | null>(null);
  useEffect(() => { routeTitle(editor?.title || view); }, [view, editor?.title]);
  const today = localDate(new Date());
  async function load() {
    setLoading(true); setError("");
    try { setTasks(await workApi.tasks()); } catch (reason) { setError(message(reason)); } finally { setLoading(false); }
  }
  useEffect(() => {
    let active = true;
    workApi.tasks().then(value => { if (active) setTasks(value); }).catch(reason => { if (active) setError(message(reason)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    const openRoute = () => { const task = tasks.find(item => item.id === routedId()); if (task) { setEditor(task); const date=task.date||task.blocks?.[0]?.localStart.slice(0,10);if (date) setAnchor(dateValue(date)); } };
    openRoute(); window.addEventListener("hashchange", openRoute);
    return () => window.removeEventListener("hashchange", openRoute);
  }, [tasks]);
  const visible = tasks.filter(task => task.status !== "已归档" && (!status || task.status === status) && (!project || task.project === project) && (!query || `${task.title} ${task.description} ${task.project}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())))
    .sort((a, b) => sort === "title" ? a.title.localeCompare(b.title, "zh-CN") : sort === "status" ? statuses.indexOf(a.status) - statuses.indexOf(b.status) : (a.date || "9999").localeCompare(b.date || "9999") || a.title.localeCompare(b.title, "zh-CN"));
  const scheduled=calendarEntries(visible).sort((a,b)=>a.date.localeCompare(b.date)||(a.block?.localStart||"").localeCompare(b.block?.localStart||""));
  const unscheduled = visible.filter(task => !task.date&&!task.blocks?.length);
  const days = view === "周视图" ? Array.from({ length: 7 }, (_, i) => addDays(weekStart(anchor), i)) : monthDays(anchor);
  const weeks = Array.from({ length: days.length / 7 }, (_, i) => days.slice(i * 7, i * 7 + 7));
  function changeView(value: string) { setView(value); setShowUnscheduled(value === "周视图"); if (value === "周视图" && !sidebarOpen) onToggleSidebar(); }
  function toggleUnscheduled() { if (showUnscheduled && sidebarOpen) setShowUnscheduled(false); else { setShowUnscheduled(true); if (!sidebarOpen) onToggleSidebar(); } }
  function move(direction: number) { setAnchor(value => view === "周视图" ? addDays(value, direction * 7) : new Date(value.getFullYear(), value.getMonth() + direction, 1, 12)); }
  function closeEditor() { setEditor(null); if (routedId()) location.hash = "calendar"; }
  async function save(task: WorkTask) {
    setBusy(true);
    try { const saved = await workApi.saveTask(task); setTasks(previous => [...previous.filter(item => item.id !== saved.id), saved]); if (!task.id) { setEditor(saved); location.hash = `calendar/${encodeURIComponent(saved.id)}`; } return saved; }
    finally { setBusy(false); }
  }
  async function remove(task: WorkTask) {
    setBusy(true);
    try { await workApi.deleteTask(task.id); setTasks(previous => previous.filter(item => item.id !== task.id)); closeEditor(); }
    finally { setBusy(false); }
  }
  async function dropTask(id: string, date: string, blockId="") {
    const task = tasks.find(item => item.id === id);
    if (!task || busy) return;
    if(blockId){
      const block=task.blocks?.find(b=>b.id===blockId);
      if(!block||block.locked||block.binding==="absolute_instant")return;
      const parts=block.localStart.slice(0,10).split("-").map(Number),target=date.split("-").map(Number);
      const shift=Math.round((Date.UTC(target[0],target[1]-1,target[2])-Date.UTC(parts[0],parts[1]-1,parts[2]))/86400000);
      const moved={...block,localStart:localDate(addDays(dateValue(block.localStart.slice(0,10)),shift))+block.localStart.slice(10),localEnd:localDate(addDays(dateValue(block.localEnd.slice(0,10)),shift))+block.localEnd.slice(10)};
      setBusy(true);setError("");try{const saved=await workApi.saveTask({...task,blocks:task.blocks?.map(b=>b.id===blockId?moved:b)});setTasks(previous=>previous.map(t=>t.id===id?saved:t))}catch(e){setError(message(e))}finally{setBusy(false)};return;
    }
    let endDate = "";
    if (task.date && task.endDate) {
      const start = task.date.split("-").map(Number), end = task.endDate.split("-").map(Number);
      const duration = Math.round((Date.UTC(end[0], end[1] - 1, end[2]) - Date.UTC(start[0], start[1] - 1, start[2])) / 86400000);
      endDate = localDate(addDays(dateValue(date), Math.max(0, duration)));
    }
    setBusy(true); setError("");
    try { const saved = await workApi.saveTask({ ...task, date, endDate }); setTasks(previous => previous.map(item => item.id === id ? saved : item)); }
    catch (reason) { setError(message(reason)); } finally { setBusy(false); }
  }
  function card(task: CalendarEntry, date?: string) {
    return <Button key={task.calendarKey||task.id} className="calendar-task-card" draggable={!busy&&!task.block?.locked&&task.block?.binding!=="absolute_instant"} onDragStart={event => { event.dataTransfer.setData("text/chela-task", task.id);event.dataTransfer.setData("text/chela-block",task.block?.id||""); event.dataTransfer.effectAllowed = "move"; }} onClick={() => setEditor(tasks.find(t=>t.id===task.id)||task)}>
      <span><CalIcon name="file-text" /><strong>{date && task.date < date ? "← " : ""}{task.title}</strong></span>{task.block&&<small>{task.block.allDay?"全天":`${task.block.localStart.slice(11)} — ${task.block.localEnd.slice(11)}`} · {task.block.timezone}{task.block.locked?" · 已锁定":""}</small>}
      <small>{date && task.date < date ? taskEnd(task) === date ? "截止" : "延续" : task.status}{task.project ? ` · ${task.project}` : ""}</small>
    </Button>;
  }
  const periodTitle = `${anchor.getFullYear()} 年 ${anchor.getMonth() + 1} 月`;
  const upcoming = scheduled.filter(task => task.date && taskEnd(task) >= today);
  return <>
    <aside id="calendar-unscheduled" className="calendar-unscheduled" hidden={Boolean(editor) || !showUnscheduled || !sidebarOpen}>
      <header><strong>无日期文档（{unscheduled.length}）</strong><IconButton aria-label="收起无日期列表" onClick={onToggleSidebar}><X size={13} /></IconButton></header>
      <p className="calendar-hint">拖入日历即可排期，也可以打开文档设置日期。</p>
      {unscheduled.map(task => card(task))}{!unscheduled.length && <p className="calendar-hint">暂无无日期事项</p>}
      <Button variant="ghost" onClick={() => setEditor(blankTask(""))}><CalIcon name="plus" />新建无日期文档</Button>
    </aside>
    <main className="calendar-main">
      <div className="calendar-overview" hidden={Boolean(editor)}>
      <header className="calendar-toolbar">
        <div className="calendar-tabs" aria-label="日历视图">{views.map(value => <Button key={value} variant="ghost" aria-pressed={view === value} onClick={() => changeView(value)}>{value}</Button>)}</div>
        <div className="calendar-toolbar-actions">
          <PlanDrafts tasks={tasks} onCommitted={()=>void load()}/>
          <Button aria-expanded={showUnscheduled && sidebarOpen} aria-controls="calendar-unscheduled" onClick={toggleUnscheduled}>无日期 ({unscheduled.length})</Button>
          <Menu.Root><Menu.Trigger asChild><Button aria-label="筛选日程"><CalIcon name="filter" />筛选{status || project ? " ·" : ""}</Button></Menu.Trigger><Menu.Content><Menu.Choices label="按状态筛选" value={status} onChange={setStatus} options={[{ value: "", label: "全部状态" }, ...[...new Set([...statuses, ...tasks.map(task => task.status)])].filter(value => value && value !== "已归档").map(value => ({ value, label: value }))]} /><Menu.Separator /><Menu.Choices label="按项目筛选" value={project} onChange={setProject} options={[{ value: "", label: "全部项目" }, ...[...new Set(tasks.map(task => task.project).filter(Boolean))].map(value => ({ value, label: value }))]} /></Menu.Content></Menu.Root>
          <Menu.Root><Menu.Trigger asChild><Button><CalIcon name="sort" />排序</Button></Menu.Trigger><Menu.Content><Menu.Choices label="日程排序" value={sort} onChange={setSort} options={[{ value: "date", label: "按日期" }, { value: "title", label: "按名称" }, { value: "status", label: "按状态" }]} /></Menu.Content></Menu.Root>
          <Button aria-pressed={showSearch} onClick={() => { setShowSearch(value => !value); setQuery(""); }}><CalIcon name="search" />搜索</Button>
          <Button variant="primary" onClick={() => setEditor(blankTask(today))}><CalIcon name="plus" />新建</Button>
        </div>
      </header>
      {showSearch && <div className="calendar-search"><Input type="search" aria-label="搜索日程" placeholder="搜索名称、项目和文档内容…" autoFocus value={query} onChange={event => setQuery(event.target.value)} /></div>}
      {error && <div role="alert" className="calendar-error">{error}<Button variant="ghost" onClick={() => void load()}>重新加载</Button></div>}
      <div className="calendar-content">
        <div className="calendar-period"><h1>{periodTitle}{view === "周视图" && <small> · {days[0].getMonth() + 1}月{days[0].getDate()}日 – {days[6].getMonth() + 1}月{days[6].getDate()}日</small>}</h1><span className="calendar-summary"><CalIcon name="file-text" />{scheduled.filter(task => task.date && task.date <= localDate(days[days.length - 1]) && taskEnd(task) >= localDate(days[0])).length} 项安排</span><div className="calendar-period-controls"><IconButton aria-label={view === "周视图" ? "上一周" : "上个月"} onClick={() => move(-1)}><CalIcon name="left" /></IconButton><Button onClick={() => setAnchor(new Date())}>今天</Button><IconButton aria-label={view === "周视图" ? "下一周" : "下个月"} onClick={() => move(1)}><CalIcon name="right" /></IconButton></div></div>
        {loading ? <p className="calendar-empty" role="status">正在加载日程…</p> : view === "月视图" ? <div className="calendar-month">
          <div className="calendar-weekdays">{weekdays.map(day => <span key={day}>{day}</span>)}</div>
          {weeks.map(week => { const segments = weekSegments(scheduled, week); return <div className="calendar-month-week" key={localDate(week[0])} style={{ "--calendar-lanes": Math.max(3, ...segments.map(segment => segment.lane + 1)) } as CSSProperties}>
            <div className="calendar-day-backgrounds">{week.map(day => { const key = localDate(day); return <div key={key} className="calendar-month-day" data-outside={day.getMonth() !== anchor.getMonth()} data-today={key === today} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); void dropTask(event.dataTransfer.getData("text/chela-task"), key,event.dataTransfer.getData("text/chela-block")); }}>
              <IconButton aria-label={`${key} 新建日程`} onClick={() => setEditor(blankTask(key))}><CalIcon name="plus" /></IconButton><span>{day.getDate() === 1 ? `${day.getMonth() + 1}月1日` : day.getDate()}</span>
            </div>; })}</div>
            <div className="calendar-month-events">{segments.map(({ task, start, end, lane }) => <Button key={task.calendarKey||task.id} className="calendar-month-event" draggable={!busy&&!task.block?.locked&&task.block?.binding!=="absolute_instant"} onDragStart={event=>{event.dataTransfer.setData("text/chela-task",task.id);event.dataTransfer.setData("text/chela-block",task.block?.id||"")}} title={`${task.title} · ${task.status} · ${task.date}${task.endDate ? ` — ${task.endDate}` : ""}`} style={{ gridColumn: `${start + 1} / ${end + 2}`, gridRow: lane + 1 }} onClick={() => setEditor(tasks.find(t=>t.id===task.id)||task)}><CalIcon name="file-text" /><span>{task.date < localDate(week[0]) ? "← " : ""}{task.block&&!task.block.allDay?`${task.block.localStart.slice(11)} `:""}{task.title}</span></Button>)}</div>
          </div>; })}
        </div> : view === "周视图" ? <div className="calendar-week">{days.map((day, i) => { const key = localDate(day); return <section key={key} data-today={key === today} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); void dropTask(event.dataTransfer.getData("text/chela-task"), key,event.dataTransfer.getData("text/chela-block")); }}><header><span>{weekdays[i]} {day.getDate()}{key === today ? " · 今天" : ""}</span><IconButton aria-label={`${key} 新建日程`} onClick={() => setEditor(blankTask(key))}><CalIcon name="plus" /></IconButton></header>{scheduled.filter(task => onDate(task, key)).map(task => card(task, key))}</section>; })}</div>
          : view === "按状态分组" ? <div className="calendar-status-groups">{[...new Set([...statuses, ...visible.map(task => task.status)])].map(value => <section key={value}><h2>{value} <small>{visible.filter(task => task.status === value).length}</small></h2>{visible.filter(task => task.status === value).map(task => card(task))}<Button variant="ghost" onClick={() => setEditor({ ...blankTask(today), status: value })}><CalIcon name="plus" />新建</Button></section>)}</div>
          : <div className="calendar-upcoming">{upcoming.length ? upcoming.map(task => <section key={task.calendarKey||task.id}><time>{task.date}{task.endDate && task.endDate !== task.date ? ` — ${task.endDate}` : ""}</time>{card(task)}</section>) : <p className="calendar-empty"><CalendarDays size={24} />暂无近期安排</p>}</div>}
      </div>
      </div>
      {editor && <CalendarEditor key={editor.id || "new"} task={editor} tasks={tasks} busy={busy} onSave={save} onDelete={remove} onClose={closeEditor} />}
    </main>
  </>;
}
