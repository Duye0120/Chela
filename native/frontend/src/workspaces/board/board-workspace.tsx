import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Archive, ArrowUpDown, Bot, Circle, CircleCheck, CircleDot, Clock, Folder, Layers, ListFilter, ListTodo, Plus, SquareTerminal, Trash2, X } from "lucide-react";
import { Button } from "../../ui/button";
import { IconButton } from "../../ui/icon-button";
import { Input, SearchField, Textarea } from "../../ui/text-field";
import { Select } from "../../ui/select";
import { TaskScheduleFields } from "../../ui/task-schedule-fields";
import { TaskReminders } from "../../ui/task-reminders";
import { Sidebar, SidebarItem, SidebarToggle } from "../../ui/sidebar";
import * as Menu from "../../ui/menu";
import { taskStatuses as statuses, taskPriorities as priorities, type WorkTask } from "../../data/work";
import { deleteWorkTask, refreshWorkTasks, saveWorkTask, useWorkTasks } from "../../state/work-task-actions";
import "./board.css";
import { routeTitle } from "../../ui/route-title";
import { TaskDetails } from "./task-details";

const views = ["状态看板", "优先级看板", "任务列表"];
const statusIcons = [Circle, CircleDot, Clock, CircleCheck];
const blankTask = (): WorkTask => ({ id: "", title: "", description: "", status: "待办", priority: "不重要不紧急", project: "", date: "", endDate: "", parentId: "" });
const needsAttention = (task: WorkTask) => task.replyPending || task.status === "待查看" || task.status === "等我确认" || task.status === "等我处理";
const message = (error: unknown) => error instanceof Error ? error.message : String(error);
const priorityRank = (task: WorkTask) => priorities.includes(task.priority) ? priorities.indexOf(task.priority) : priorities.length;

function routeTask() {
  try { return decodeURIComponent(location.hash.split("/").slice(1).join("/")); }
  catch { return ""; }
}

function statusTone(status: string) {
  if (status === "进行中" || status === "已完成") return "success";
  if (status === "等我确认" || status === "等我处理") return "warning";
  return status === "待查看" ? "info" : "neutral";
}

function TaskStatus({ task }: { task: WorkTask }) {
  return <><span className="board-badge" data-tone={statusTone(task.status)}>{task.status}</span>{task.replyPending&&<span className="board-badge" data-tone="info">有新回复</span>}</>;
}

function TaskEditor({ task, projects, tasks, busy, onSave, onClose, onDelete }: {
  task: WorkTask; projects: string[]; tasks: WorkTask[]; busy: boolean;
  onSave: (task: WorkTask, openTerminal: boolean) => Promise<void>;
  onClose: () => void; onDelete: (task: WorkTask) => void;
}) {
  const [draft, setDraft] = useState(task);
  const [error, setError] = useState("");
  const [terminal, setTerminal] = useState(false);
  const id = useId();
  const field = (name: keyof WorkTask, value: string) => setDraft(previous => ({ ...previous, [name]: value }));
  const children = tasks.filter(item => item.parentId === task.id && task.id);
  const parent = tasks.find(item => item.id === draft.parentId);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.title.trim()) { setError("请输入任务目标。"); return; }
    if (draft.date && draft.endDate && draft.endDate < draft.date) { setError("结束日期不能早于开始日期。"); return; }
    setError("");
    try { await onSave({ ...draft, title: draft.title.trim(), project: draft.project.trim() }, terminal); }
    catch (reason) { setError(message(reason)); }
  }
  return <section className="board-detail" aria-label={task.id ? "任务详情" : "新建任务"}>
    <header><span className="board-id">{task.id || "新建任务"}</span>{task.id && <TaskStatus task={task} />}
      <IconButton aria-label="关闭任务详情" onClick={onClose}><X size={14} /></IconButton>
    </header>
    <form onSubmit={submit}>
      <div className="board-detail-fields">
        {parent && <a className="board-parent" href={`#board/${encodeURIComponent(parent.id)}`}>父任务：{parent.title}</a>}
        <label htmlFor={id + "title"}>任务目标（必填）</label>
        <Input id={id + "title"} value={draft.title} onChange={event => field("title", event.target.value)} required autoFocus />
        <div className="board-form-pair">
          <label>状态<Select value={draft.status} onChange={event => field("status", event.target.value)}>
            {[...new Set([...statuses, "等我确认", "已归档", draft.status])].map(status => <option key={status}>{status}</option>)}
          </Select></label>
          <label>优先级<Select value={draft.priority} onChange={event => field("priority", event.target.value)}>
            {[...new Set([...priorities, draft.priority])].filter(Boolean).map(priority => <option key={priority}>{priority}</option>)}
          </Select></label>
        </div>
        <label htmlFor={id + "project"}>所属项目（可选）</label>
        <Input id={id + "project"} list={id + "projects"} value={draft.project} onChange={event => field("project", event.target.value)} placeholder="选择或输入项目名称" />
        <datalist id={id + "projects"}>{projects.map(project => <option key={project} value={project} />)}</datalist>
        <TaskScheduleFields task={draft} onChange={setDraft} className="board-form-pair" />
        {task.id&&<TaskReminders task={task}/>}
        <label htmlFor={id + "description"}>补充说明（可选）</label>
        <Textarea id={id + "description"} rows={6} value={draft.description} onChange={event => field("description", event.target.value)} placeholder="记录背景和补充要求…" />
        {children.length > 0 && <div className="board-subtasks"><h3>子任务 · {children.length}</h3>{children.map(child =>
          <a key={child.id} href={`#board/${encodeURIComponent(child.id)}`}><TaskStatus task={child} /><span>{child.title}</span></a>)}</div>}
        {error && <p className="board-error" role="alert">{error}</p>}
      </div>
      <footer>
        {task.id ? <>
          <Button type="submit" variant="primary" disabled={busy} onClick={() => setTerminal(false)}>{busy ? "保存中…" : "保存任务"}</Button>
          <Button onClick={() => { location.hash = `terminal/${encodeURIComponent(task.id)}`; }}><SquareTerminal size={14} />打开关联终端</Button>
          <div className="board-detail-actions"><Button variant="ghost" disabled={busy} onClick={() => onSave({ ...draft, status: "已归档" }, false).catch(reason => setError(message(reason)))}><Archive size={13} />归档</Button>
            <Button variant="ghost" className="board-danger" disabled={busy} onClick={() => onDelete(task)}><Trash2 size={13} />删除</Button></div>
        </> : <>
          <Button type="submit" variant="primary" disabled={busy} onClick={() => setTerminal(false)}>{busy ? "创建中…" : "创建任务"}</Button>
          <Button type="submit" disabled={busy} onClick={() => setTerminal(true)}>创建并打开终端</Button>
        </>}
      </footer>
    </form>
  </section>;
}

export function BoardWorkspace({ sidebarOpen, onToggleSidebar }: { sidebarOpen: boolean; onToggleSidebar: () => void }) {
  const { tasks, loaded, error: taskError } = useWorkTasks();
  const loading = !loaded && !taskError && !tasks.length;
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState(() => sessionStorage.getItem("chela.board.view") || views[0]);
  useEffect(() => { routeTitle(view === "状态看板" ? "我的任务" : view); }, [view]);
  const [filter, setFilter] = useState("all");
  const [project, setProject] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("原始顺序");
  const [selectedId, setSelectedId] = useState(routeTask);
  const [editing, setEditing] = useState(false);
  useEffect(() => setEditing(false), [selectedId]);
  const [creating, setCreating] = useState(false);
  const [newDraft, setNewDraft] = useState(blankTask);
  const [draggedId, setDraggedId] = useState("");
  const [dropColumn, setDropColumn] = useState("");
  const [deleting, setDeleting] = useState<WorkTask | null>(null);
  const deleteDialog = useRef<HTMLDialogElement>(null);
  const dialogTitle = useId();

  function load() {
    setError("");
    void refreshWorkTasks();
  }
  useEffect(() => {
    const hash = () => { setSelectedId(routeTask()); setCreating(false); };
    window.addEventListener("hashchange", hash);
    return () => window.removeEventListener("hashchange", hash);
  }, []);
  useEffect(() => { if (deleting) deleteDialog.current?.showModal(); }, [deleting]);

  const activeTasks = tasks.filter(task => task.status !== "已归档");
  const projects = [...new Set(tasks.map(task => task.project).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const matchesFilter = (task: WorkTask) => filter === "all" || (filter === "attention" ? needsAttention(task) : task.status === filter);
  const filtered = tasks.filter(task => (filter === "已归档" || task.status !== "已归档") && matchesFilter(task)
    && (!project || task.project === project) && (!query || `${task.title} ${task.id} ${task.description}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())));
  if (sort === "按截止日期最近") filtered.sort((a, b) => (a.dueDate || a.dueAt || "9999").localeCompare(b.dueDate || b.dueAt || "9999"));
  if (sort === "按优先级从高到低") filtered.sort((a, b) => priorityRank(a) - priorityRank(b));
  if (sort === "按任务名称") filtered.sort((a, b) => a.title.localeCompare(b.title));
  const selected = tasks.find(task => task.id === selectedId);
  const grouping = view === "优先级看板" ? "priority" : "status";
  const groups = view === "优先级看板" ? [...priorities, ...new Set(filtered.map(task => task.priority).filter(value => !priorities.includes(value)))]
    : [...statuses, ...new Set(filtered.map(task => task.status).filter(value => !statuses.includes(value)))];
  const attention = filtered.filter(needsAttention);

  async function saveTask(task: WorkTask, openTerminal = false) {
    setBusy(true); setError("");
    try {
      const saved = await saveWorkTask(task);
      setCreating(false);
      setEditing(false);
      if (openTerminal) location.hash = `terminal/${encodeURIComponent(saved.id)}`;
      else { setSelectedId(saved.id); location.hash = `board/${encodeURIComponent(saved.id)}`; }
    } finally { setBusy(false); }
  }
  async function moveTask(id: string, column: string) {
    const task = tasks.find(item => item.id === id);
    setDraggedId(""); setDropColumn("");
    if (!task || busy || task[grouping] === column) return;
    setBusy(true); setError("");
    try {
      await saveWorkTask({ ...task, [grouping]: column });
    } catch (reason) { setError(message(reason)); }
    finally { setBusy(false); }
  }
  async function removeTask() {
    if (!deleting || busy) return;
    setBusy(true); setError("");
    try {
      await deleteWorkTask(deleting.id);
      deleteDialog.current?.close();
      if (selectedId === deleting.id) { setSelectedId(""); location.hash = "board"; }
    } catch (reason) { setError(message(reason)); }
    finally { setBusy(false); }
  }
  function switchView(value: string) { setView(value); sessionStorage.setItem("chela.board.view", value); }
  function closeDetail() { setCreating(false); setSelectedId(""); location.hash = "board"; }
  function newTask() { setNewDraft({ ...blankTask(), project }); setSelectedId(""); setCreating(true); }
  function clearFilters() { setFilter("all"); setProject(""); setQuery(""); }

  function card(task: WorkTask) {
    return <article key={task.id} className="board-card" data-selected={selectedId === task.id} data-dragging={draggedId === task.id}
      draggable={!busy} onDragStart={event => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", task.id); setDraggedId(task.id); }}
      onDragEnd={() => { setDraggedId(""); setDropColumn(""); }}>
      <div className="board-card-meta"><span className="board-id" title={task.id}>{task.id.length > 14 ? task.id.slice(0, 8) : task.id}</span>{task.status !== "待办" ? <TaskStatus task={task} /> : task.priority === priorities[0] && <span className="board-badge" data-tone="error">{task.priority}</span>}</div>
      <a className="board-card-title" href={`#board/${encodeURIComponent(task.id)}`}>{task.title}</a>
      {task.replyPending&&task.status==="待办"&&<span className="board-badge" data-tone="info">有新回复</span>}
      {task.description && <p className="board-card-description">{task.description}</p>}
      <div className="board-card-bottom"><Folder size={12} /><span>{task.project || "无所属项目"}</span><time>{task.dueDate ? `截止 ${task.dueDate.slice(5)}` : task.dueAt ? new Date(task.dueAt).toLocaleString() : "无截止日"}</time></div>
      {needsAttention(task) && <a className="board-card-link" href={`#terminal/${encodeURIComponent(task.id)}`}>打开关联终端 ↗</a>}
    </article>;
  }

  return <>
    <Sidebar id="board-sidebar" title="任务看板" open={sidebarOpen}>
      <p className="board-side-caption">视图 · {activeTasks.length} 个任务</p>
      {[["all", "我的任务", ListTodo], ["进行中", "执行中", Bot], ["attention", "等我处理", Layers], ["待查看", "待查看", Clock], ["已完成", "已完成", CircleCheck]].map(([value, label, Icon]) => {
        const key = value as string;
        const ItemIcon = Icon as typeof ListTodo;
        const count = activeTasks.filter(task => key === "all" || (key === "attention" ? needsAttention(task) : task.status === key)).length;
        return <SidebarItem key={key} aria-current={filter === key && !project ? "page" : undefined} meta={String(count)} onClick={() => { setFilter(key); setProject(""); }}>
          <ItemIcon size={14} /><span>{label as string}</span>
        </SidebarItem>;
      })}
      <p className="board-side-caption">按项目（Projects）</p>
      {projects.map(name => <SidebarItem key={name} aria-current={project === name ? "page" : undefined} meta={String(activeTasks.filter(task => task.project === name).length)}
        onClick={() => { setProject(name); setFilter("all"); }}><Folder size={14} /><span>{name}</span></SidebarItem>)}
      <div className="board-side-bottom"><SidebarItem aria-current={filter === "已归档" ? "page" : undefined} meta={String(tasks.filter(task => task.status === "已归档").length)}
        onClick={() => { setFilter("已归档"); setProject(""); }}><Archive size={14} /><span>已归档</span></SidebarItem></div>
    </Sidebar>
    <main className="board-workspace" data-detail={creating || Boolean(selected)} aria-label="看板工作区" aria-busy={loading || busy}>
      <div className="board-toolbar">
        <SidebarToggle controls="board-sidebar" open={sidebarOpen} onToggle={onToggleSidebar} />
        <div className="board-view-switch" aria-label="看板视图">{views.map(name => <Button key={name} variant="ghost" aria-pressed={view === name} onClick={() => switchView(name)}>{name}</Button>)}</div>
        <div className="board-toolbar-spacer" />
        {(filter !== "all" || project || query) && <Button className="board-filter-chip" variant="ghost" onClick={clearFilters}>清除筛选<X size={12} /></Button>}
        <Menu.Root><Menu.Trigger asChild><Button><ListFilter size={13} />筛选</Button></Menu.Trigger><Menu.Content>
          <Menu.Choices label="任务状态" value={filter} onChange={setFilter} options={[{ value: "all", label: "全部任务" }, { value: "attention", label: "只看等我处理" }, ...statuses.map(value => ({ value, label: value }))]} />
          <Menu.Separator />
          <Menu.Sub><Menu.SubTrigger>项目{project ? `：${project}` : ""}</Menu.SubTrigger><Menu.SubContent><Menu.Choices label="所属项目" value={project} onChange={setProject} options={[{ value: "", label: "全部项目" }, ...projects.map(value => ({ value, label: value }))]} /></Menu.SubContent></Menu.Sub>
          <Menu.Separator /><Menu.Item onSelect={clearFilters}>清除全部筛选</Menu.Item>
        </Menu.Content></Menu.Root>
        <Menu.Root><Menu.Trigger asChild><Button><ArrowUpDown size={13} />排序</Button></Menu.Trigger><Menu.Content><Menu.Choices label="任务排序" value={sort} onChange={setSort} options={["原始顺序", "按截止日期最近", "按优先级从高到低", "按任务名称"].map(value => ({ value, label: value }))} /></Menu.Content></Menu.Root>
        <Button variant="primary" onClick={newTask}><Plus size={13} />新建任务</Button>
      </div>
      {(error || taskError) && <div className="board-error-bar" role="alert">{error || `任务列表读取失败：${taskError}`}<Button variant="ghost" onClick={load}>重新加载</Button></div>}
      <div className="board-body">
        <div className="board-content">
          {loading ? <div className="board-empty" role="status">正在读取任务…</div> : view === "任务列表" ? <div className="board-list">
            <SearchField aria-label="搜索任务" placeholder="搜索任务标题、编号或描述" value={query} onChange={event => setQuery(event.target.value)} />
            {attention.length > 0 && <section className="board-attention"><h2>等我处理（{attention.length}）</h2><p>打开任务详情或关联终端，继续处理。</p>{attention.map(task => <div key={task.id}><span className="board-id">{task.id}</span><TaskStatus task={task} /><a href={`#board/${encodeURIComponent(task.id)}`}>{task.title}</a><a className="board-card-link" href={`#terminal/${encodeURIComponent(task.id)}`}>打开终端 ↗</a></div>)}</section>}
            <div className="board-table-wrap"><table><thead><tr><th>编号</th><th>任务目标</th><th>项目</th><th>优先级</th><th>状态</th><th>截止日期</th><th>操作</th></tr></thead><tbody>{filtered.map(task => <tr key={task.id} data-selected={selectedId === task.id}>
              <td className="board-id">{task.id}</td><td><a href={`#board/${encodeURIComponent(task.id)}`}>{task.title}</a></td><td>{task.project || "—"}</td><td>{task.priority || "—"}</td><td><TaskStatus task={task} /></td><td>{task.dueDate || (task.dueAt ? new Date(task.dueAt).toLocaleString() : "未设置")}</td><td><a className="board-card-link" href={`#board/${encodeURIComponent(task.id)}`}>详情</a></td>
            </tr>)}</tbody></table></div>
            {!filtered.length && <div className="board-empty">{tasks.length ? "没有符合条件的任务" : "还没有任务，创建第一个任务吧"}<Button onClick={tasks.length ? clearFilters : newTask}>{tasks.length ? "清除筛选" : "新建任务"}</Button></div>}
          </div> : <div className="board-columns">
            {groups.map((column, index) => {
              const items = filtered.filter(task => task[grouping] === column);
              const ColumnIcon = view === "优先级看板" ? null : statusIcons[index] || Circle;
              return <section key={column} className="board-column" data-drop={dropColumn === column} data-column={index}
                onDragOver={event => { if (draggedId && !busy) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDropColumn(column); } }}
                onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropColumn(""); }}
                onDrop={event => { event.preventDefault(); void moveTask(event.dataTransfer.getData("text/plain"), column); }}>
                <h2>{ColumnIcon && <ColumnIcon size={14} />}<span>{column || "未设置"}</span><small>{items.length}</small></h2>
                {items.map(card)}
                {!items.length && <div className="board-column-empty">{draggedId ? "拖到这里" : "暂无任务"}</div>}
              </section>;
            })}
            {!tasks.length && <div className="board-first-task"><span>从一个任务开始</span><Button onClick={newTask}><Plus size={14} />新建任务</Button></div>}
          </div>}
        </div>
        {(creating || selected) && (creating || editing ? <TaskEditor key={creating ? "new" : selected!.id} task={creating ? newDraft : selected!} projects={projects} tasks={tasks} busy={busy} onSave={saveTask} onClose={closeDetail} onDelete={setDeleting} /> : <TaskDetails task={selected!} busy={busy} onClose={closeDetail} onEdit={() => setEditing(true)} onComplete={() => void saveTask({ ...selected!, status: "已完成" }).catch(cause => setError(message(cause)))} />)}
        {selectedId && !selected && !loading && !creating && <section className="board-detail"><header>任务不存在<IconButton aria-label="关闭任务详情" onClick={closeDetail}><X size={14} /></IconButton></header><p className="board-empty">任务可能已删除。</p></section>}
      </div>
    </main>
    <dialog className="board-delete-dialog" ref={deleteDialog} aria-labelledby={dialogTitle} onClose={() => setDeleting(null)}>
      <h2 id={dialogTitle}>删除任务？</h2><p>「{deleting?.title}」将被永久删除。</p>
      {error && <p className="board-error" role="alert">{error}</p>}
      <div><Button autoFocus disabled={busy} onClick={() => deleteDialog.current?.close()}>取消</Button><Button className="board-danger" disabled={busy} onClick={() => void removeTask()}>{busy ? "删除中…" : "删除任务"}</Button></div>
    </dialog>
  </>;
}
