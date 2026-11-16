import { useEffect, useId, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { Archive, ArchiveRestore, ArrowUp, Code2, PanelRight, Square, Copy, ChevronDown, Folder, FolderPlus, Paperclip, Pin, Search, SquarePen, Trash2, X } from "lucide-react";
import { Button } from "../../ui/button";
import { IconButton } from "../../ui/icon-button";
import { ModelSelect } from "../../ui/model-select";
import * as Menu from "../../ui/menu";
import { ModelSettings } from "./model-settings";
import { MemoryPanel } from "./memory-panel";
import { ExtensionRequests } from "./extension-requests";
import { SessionRow } from "../../ui/session-row";
import { Sidebar, SidebarGroup, SidebarItem, SidebarToggle } from "../../ui/sidebar";
import { SearchField, Textarea } from "../../ui/text-field";
import { chatApi, isActiveRun, type ChatProgress, type ChatSession, type ChatSnapshot } from "./data";
import contextEmpty from "./context-empty.svg";
import "./chat.css";

type Props = { sidebarOpen: boolean; onToggleSidebar: () => void };
let workspaceDrafts: Record<string, string> = {};
const submissionCommands = new Map<string, string>();
const draftListeners = new Set<() => void>();
function subscribeDrafts(listener: () => void) {
  draftListeners.add(listener);
  return () => { draftListeners.delete(listener); };
}
function setDrafts(update: (values: Record<string, string>) => Record<string, string>) {
  workspaceDrafts = update(workspaceDrafts);
  draftListeners.forEach(listener => listener());
}

function linkedSession() {
  const match = location.hash.match(/^#chat\/(.+)$/);
  try { return match ? decodeURIComponent(match[1]) : null; }
  catch { return null; }
}

function errorMessage(cause: unknown) {
  return cause instanceof Error && cause.message ? cause.message : "操作失败，请重试";
}

function updatedLabel(value: string) {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "";
  const minutes = Math.max(0, Math.floor((Date.now() - time) / 60_000));
  return minutes < 1 ? "刚刚" : minutes < 60 ? `${minutes}m` : minutes < 1440 ? `${Math.floor(minutes / 60)}h` : `${Math.floor(minutes / 1440)}d`;
}

export function ChatWorkspace({ sidebarOpen, onToggleSidebar }: Props) {
  const [snapshot, setSnapshot] = useState<ChatSnapshot>({ sessions: [], model: "" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const drafts = useSyncExternalStore(subscribeDrafts, () => workspaceDrafts);
  const fileInput=useRef<HTMLInputElement>(null);
  const [groupName,setGroupName]=useState<string|null>(null);
  const [choice,setChoice]=useState<{modelId:string;effort:string|null}|null>(null);
  const [edit,setEdit]=useState<{session:string;message:string;previousDraft:string}|null>(null);
  const [panel,setPanel]=useState(false);
  const [branches,setBranches]=useState<Awaited<ReturnType<typeof chatApi.branches>>>([]);
  const branchCache=useRef<Record<string, Awaited<ReturnType<typeof chatApi.branches>>>>({});
  const [favorites,setFavorites]=useState<string[]>(()=>JSON.parse(localStorage.getItem("chela.chat.favorites")||"[]"));
  const [progress,setProgress]=useState<ChatProgress>({});
  const cursor = useRef("0");
  const [query, setQuery] = useState("");
  const [archived, setArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [archiveUndo, setArchiveUndo] = useState<ChatSession | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ChatSession | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const operation = useRef(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const history = useRef<HTMLDivElement>(null);
  const confirmDelete = useRef<HTMLDialogElement>(null);
  const dialogTitle = useId();
  const dialogDescription = useId();
  const session = snapshot.sessions.find(item => item.id === selectedId);
  const draftKey = selectedId ?? "new";
  const draft = drafts[draftKey] ?? "";
  const editing=edit?.session===selectedId ? edit : null;
  const sessionRuns = (snapshot.runs || []).filter(run => run.session_id === selectedId);
  const activeRun = sessionRuns.find(run => isActiveRun(run) && run.state !== "queued");
  const queuedRuns = sessionRuns.filter(run => run.state === "queued");
  const running = !!activeRun;
  const sending = running;
  const pending = selectedId && progress[selectedId]?.run_id === activeRun?.run_id ? progress[selectedId] : null;
  const latestRun = sessionRuns[0];
  const approvals = (snapshot.approvals || []).filter(approval => approval.sessionId === selectedId);
  const empty = !session?.messages.length && !running;
  const preferred=choice?.modelId || session?.modelId;
  const currentModel=snapshot.models?.some(m=>m.id===preferred)?preferred!:snapshot.model;
  const effort=choice?.effort ?? session?.effort ?? snapshot.effort ?? "off";
  const options=(snapshot.models || []).map(m=>({...m,efforts:m.efforts || (m.reasoning?["off","low","medium","high"]:[]),favorite:favorites.includes(m.id)}));
  const last=session?.messages.filter(m=>m.role==="assistant").at(-1);
  const usage=last?.limit?Math.min(100,Math.round(100*(last.tokens||0)/last.limit)):0;
  useEffect(() => { cursor.current = snapshot.snapshot_cursor || "0"; }, [snapshot.snapshot_cursor]);
  useEffect(() => {
    if (loading) return;
    let active = true, timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const update = await chatApi.observe(cursor.current);
        if (!active) return;
        setProgress(update.progress);
        if (update.events.length) {
          const value = await chatApi.load();
          if (active) setSnapshot(current => BigInt(value.snapshot_cursor || "0") >= BigInt(current.snapshot_cursor || "0") ? value : current);
        }
        if (update.runtimeError) setError(update.runtimeError);
      } catch (cause) { if (active) setError(errorMessage(cause)); }
      finally { if (active) timer = setTimeout(poll, 200); }
    }
    void poll();
    return () => { active = false; clearTimeout(timer); };
  }, [loading]);
  useEffect(()=>{setChoice(null)},[selectedId]);
  useEffect(() => {
    let active = true;
    setBranches([]);
    const cached=selectedId ? branchCache.current[selectedId] : undefined;
    if(cached?.some(branch=>branch.id===session?.branchId)){setBranches(cached.map(branch=>({...branch,current:branch.id===session?.branchId})));return;}
    if (selectedId && panel) void chatApi.branches(selectedId).then(value => { branchCache.current[selectedId]=value; if (active) setBranches(value); }).catch(cause => { if (active) setError(errorMessage(cause)); });
    return () => { active = false; };
  }, [selectedId, panel, session?.branchId]);
  useEffect(()=>{const title=[session?.group, session?.title || "新对话"].filter(Boolean).join(" / ");window.dispatchEvent(new CustomEvent("chela-chat-title",{detail:title}))},[session?.title,session?.group]);

  const filter = query.trim().toLocaleLowerCase();
  const visible = snapshot.sessions.filter(item => item.archived === archived
    && (!filter || (item.title + " " + item.messages.map(message => message.content).join(" ")).toLocaleLowerCase().includes(filter)))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt));

  useEffect(() => {
    let active = true;
    chatApi.load().then(value => {
      if (!active) return;
      setSnapshot(value);
      const target = linkedSession();
      const item = target ? value.sessions.find(session => session.id === target) : value.sessions.find(session => !session.archived);
      setSelectedId(item?.id ?? null);
      setArchived(item?.archived ?? false);
      if (target && !item) setError("引用的对话已不存在");
    }).catch(cause => { if (active) setError(errorMessage(cause)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    function followLink() {
      const id = linkedSession();
      if (!id) return;
      const target = snapshot.sessions.find(item => item.id === id);
      if (target) { setSelectedId(id); setArchived(target.archived); setQuery(""); }
      else setError("引用的对话已不存在");
    }
    window.addEventListener("hashchange", followLink);
    return () => window.removeEventListener("hashchange", followLink);
  }, [snapshot.sessions]);

  useEffect(() => {
    const node = history.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [selectedId, session?.messages.length, pending?.text, sending]);

  useEffect(() => {
    if (deleteTarget) confirmDelete.current?.showModal();
  }, [deleteTarget]);

  function replaceSession(value: ChatSession) {
    setSnapshot(current => ({ ...current, sessions: [value, ...current.sessions.filter(item => item.id !== value.id)] }));
  }

  async function run(action: () => Promise<void>) {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setError("");
    try { await action(); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { operation.current = false; setBusy(false); }
  }

  async function reload() {
    await run(async () => {
      setLoading(true);
      try {
        const value = await chatApi.load();
        setSnapshot(value);
        setSelectedId(current => value.sessions.some(item => item.id === current && !item.archived) ? current
          : value.sessions.find(item => !item.archived)?.id ?? null);
      } finally { setLoading(false); }
    });
  }

  function create() {
    void run(async () => {
      const value = await chatApi.create();
      replaceSession(value);
      setSelectedId(value.id);
      setArchived(false);
      setQuery("");
      requestAnimationFrame(() => input.current?.focus());
    });
  }

  async function update(item: ChatSession, patch: Parameters<typeof chatApi.update>[1]) {
    const value = await chatApi.update(item.id, patch);
    replaceSession(value);
    if ("archived" in patch && patch.archived && selectedId === item.id) {
      setSelectedId(snapshot.sessions.find(other => other.id !== item.id && !other.archived)?.id ?? null);
    }
    return value;
  }

  function archive(item: ChatSession) {
    void run(async () => {
      await update(item, { archived: true });
      setArchiveUndo(item);
    });
  }

  async function rename(item: ChatSession, title: string) {
    if (operation.current) throw new Error("请等待当前操作完成");
    operation.current = true;
    setBusy(true);
    try { await update(item, { title }); }
    finally { operation.current = false; setBusy(false); }
  }

  function select(item: ChatSession) {
    setSelectedId(item.id);
    if (linkedSession() && linkedSession() !== item.id) {
      window.history.replaceState(null, "", "#chat/" + encodeURIComponent(item.id));
    }
    setError("");
    requestAnimationFrame(() => input.current?.focus());
  }

  function chooseProject(){
    void run(async()=>{const current=session??await chatApi.create();replaceSession(current);setSelectedId(current.id);replaceSession(await chatApi.chooseProject(current.id))});
  }
  function send(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || loading || busy || !currentModel || session?.archived) return;
    void run(async () => {
      const current = session ?? await chatApi.create();
      if (!session) {
        replaceSession(current); setSelectedId(current.id);
        setDrafts(values => ({ ...values, new: "", [current.id]: text }));
      }
      const key = JSON.stringify([current.id, text, currentModel, effort,editing?.message]);
      const command = submissionCommands.get(key) || crypto.randomUUID();
      submissionCommands.set(key, command);
      if(editing) await chatApi.edit(current.id,editing.message,text,currentModel,effort,command);
      else await chatApi.submit(current.id, text, currentModel, effort, command);
      submissionCommands.delete(key);
      setDrafts(values => values[current.id]?.trim() === text ? { ...values, [current.id]: editing?.previousDraft || "" } : values);
      if(editing){setEdit(null);delete branchCache.current[current.id];}
      setSnapshot(await chatApi.load());
    });
  }

  async function attach(file:File) {
    if(file.size>128*1024 || (!file.type.startsWith("text/") && !/\.(txt|md|json|csv|log|yaml|yml|tsx?|jsx?|go|py|css|html)$/i.test(file.name))){setError("请选择 128 KB 以内的文本文件");return}
    try{const contents=await file.text();setDrafts(values=>({...values,[draftKey]:[values[draftKey],`【附件：${file.name}】\n${contents}`].filter(Boolean).join("\n\n")}));input.current?.focus()}catch(e){setError(errorMessage(e))}
  }
  async function saveGroup(){
    if(groupName===null||!groupName.trim())return;
    await run(async()=>{const item=session??await chatApi.create();replaceSession(item);setSelectedId(item.id);replaceSession(await chatApi.group(item.id,groupName.trim()));setGroupName(null)});
  }
  async function remove() {
    if (!deleteTarget || operation.current) return;
    const target = deleteTarget;
    setDeleteError("");
    await run(async () => {
      try {
        await chatApi.remove(target.id);
        setSnapshot(current => ({ ...current, sessions: current.sessions.filter(item => item.id !== target.id) }));
        if (selectedId === target.id) setSelectedId(snapshot.sessions.find(item => item.id !== target.id && !item.archived)?.id ?? null);
        setDrafts(values => { const next = { ...values }; delete next[target.id]; return next; });
        if (archiveUndo?.id === target.id) setArchiveUndo(null);
        confirmDelete.current?.close();
      } catch (cause) { setDeleteError(errorMessage(cause)); }
    });
  }

  function row(item: ChatSession) {
    return <SessionRow key={item.id} title={item.title} pinned={item.pinned} current={item.id === selectedId}
      meta={<>{item.pinned && <Pin size={11} aria-label="已置顶" />}{updatedLabel(item.updatedAt)}</>}
      onSelect={() => select(item)} onRename={title => rename(item, title)}
      onPinnedChange={pinned => void run(async () => { await update(item, { pinned }); })}
      onArchive={() => archive(item)} onDelete={() => { setDeleteError(""); setDeleteTarget(item); }} />;
  }

  const composer = <div className="chat-compose-area">
    {editing && <div className="chat-archived-notice" role="status"><span>编辑后会从这里建立新分支，原对话保留。</span><Button disabled={busy} onClick={()=>{setDrafts(values=>({...values,[draftKey]:editing.previousDraft}));setEdit(null)}}>取消编辑</Button></div>}
    {error && <div className="chat-error" role="alert"><span>{error}</span>
      <Button variant="ghost" disabled={busy} onClick={() => void reload()}>重新加载</Button>
      <IconButton aria-label="关闭错误提示" onClick={() => setError("")}><X size={14} /></IconButton>
    </div>}
    {session?.archived ? <div className="chat-archived-notice"><Archive size={16} /><span>这条对话已归档</span>
      <Button disabled={busy} onClick={() => void run(async () => { await update(session, { archived: false }); setArchived(false); })}>恢复对话</Button>
    </div> : <form className="chat-composer" onSubmit={send} aria-label={editing ? "编辑历史消息" : "发送消息"} aria-busy={busy}>
      <Textarea ref={input} rows={empty ? 3 : 2} aria-label="消息" placeholder={running ? "继续输入，消息会排队发送…" : "输入消息，开始这次对话…"}
        value={draft} readOnly={busy || loading} onChange={event => setDrafts(values => ({ ...values, [draftKey]: event.target.value }))}
        onKeyDown={event => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) {
            event.preventDefault(); event.currentTarget.form?.requestSubmit();
          }
        }} />
      <div className="chat-composer-actions">
        <input ref={fileInput} type="file" accept="text/*,.md,.json,.yaml,.yml,.log,.ts,.tsx,.js,.jsx,.go,.py" hidden onChange={e=>{const f=e.target.files?.[0];e.target.value="";if(f)void attach(f)}}/>
        <IconButton aria-label="添加文本附件" title="添加文本附件" disabled={busy} onClick={()=>fileInput.current?.click()}><Paperclip size={20}/></IconButton>
        <div className="chat-composer-spacer" />
        {options.length ? <ModelSelect models={options} value={{modelId:currentModel,effort}} onChange={setChoice}
          onFavoriteChange={(id,on)=>{const next=on?[...favorites.filter(v=>v!==id),id]:favorites.filter(v=>v!==id);setFavorites(next);localStorage.setItem("chela.chat.favorites",JSON.stringify(next))}}/> :
          loading ? <span className="chat-model-missing">正在连接…</span> : <ModelSettings onSaved={reload}/>}
        {activeRun && <IconButton aria-label="停止生成" onClick={()=>void chatApi.cancel(activeRun.run_id).catch(e=>setError(errorMessage(e)))}><Square size={15}/></IconButton>}
        {activeRun && !editing && <Button type="button" disabled={!draft.trim()||busy||!["running","waiting_approval"].includes(activeRun.state)} onClick={()=>void run(async()=>{
          const text=draft.trim(),key=JSON.stringify(["steer",activeRun.run_id,text]);const command=submissionCommands.get(key)||crypto.randomUUID();submissionCommands.set(key,command);
          await chatApi.steer(activeRun.run_id,text,command);submissionCommands.delete(key);setDrafts(values=>values[draftKey]?.trim()===text?{...values,[draftKey]:""}:values);setSnapshot(await chatApi.load());
        })}>补充本轮</Button>}
        <IconButton type="submit" className="chat-send" aria-label={editing ? "创建分支并发送" : "发送消息"} disabled={!draft.trim()||busy||loading||!currentModel||(!!editing&&(running||!!queuedRuns.length))}><ArrowUp size={20}/></IconButton>
      </div>
    </form>}
    {queuedRuns.map(run => <div className="chat-archived-notice" key={run.run_id}><span>排队中：{run.text}</span><Button onClick={() => void chatApi.cancel(run.run_id).catch(e => setError(errorMessage(e)))}>取消</Button></div>)}
    {approvals.map(approval => <section className="chat-approval" key={approval.id} aria-label="工具执行确认">
      <strong>{approval.title}</strong><p>{approval.description}</p><details><summary>查看将写入的内容</summary><pre>{approval.preview}</pre></details>
      <Button disabled={busy} onClick={() => void run(async () => { await chatApi.resolveApproval(approval.id, false); setSnapshot(await chatApi.load()); })}>拒绝</Button>
      <Button disabled={busy} onClick={() => void run(async () => { await chatApi.resolveApproval(approval.id, true); setSnapshot(await chatApi.load()); })}>允许此次操作</Button>
    </section>)}
    {selectedId&&<ExtensionRequests key={selectedId} session={selectedId}/>}
    {latestRun && ["failed", "interrupted", "cancelled"].includes(latestRun.state) && <div className="chat-delete-error" role="status">{latestRun.terminal_reason}
      <Button disabled={busy || running || !!queuedRuns.length} onClick={() => void run(async () => { await chatApi.recover(latestRun.run_id, crypto.randomUUID()); setSnapshot(await chatApi.load()); })}>从安全位置继续</Button>
    </div>}
    <div className="chat-composer-meta"><span title={session?.project}><Folder size={14}/>{session?.project?.split(/[\\/]/).pop()||"未选择项目"}</span>
      <button className="chat-context" type="button" onClick={()=>setPanel(v=>!v)} title={last?.tokens ? `${last.tokens} / ${last.limit} tokens` : "尚无模型用量记录"} aria-expanded={panel}><img src={contextEmpty} alt="" />{usage}%</button>
    </div>
  </div>;

  return <>
    <Sidebar id="chat-sidebar" title="对话" open={sidebarOpen} actions={<>
      <span className="chat-sidebar-close"><SidebarToggle controls="chat-sidebar" open={sidebarOpen} onToggle={onToggleSidebar} /></span>
      <IconButton aria-label="将对话放入文件夹" title="将对话放入文件夹" disabled={busy||loading} onClick={()=>setGroupName(session?.group||"")}><FolderPlus size={14} /></IconButton>
      <IconButton aria-label="新建对话" title="新建对话" onClick={create} disabled={loading || busy}><SquarePen size={14} /></IconButton>
    </>} toolbar={<>
      {groupName!==null && <form className="chat-group-form" onSubmit={e=>{e.preventDefault();void saveGroup()}}>
        <input className="ui-field" autoFocus aria-label="文件夹名称" placeholder="输入文件夹名称" maxLength={100} required value={groupName} onChange={e=>setGroupName(e.target.value)}/>
        <Button type="submit" disabled={busy}>保存</Button><IconButton aria-label="取消分组" onClick={()=>setGroupName(null)}><X size={14}/></IconButton></form>}
      <div className="chat-search"><SearchField aria-label="搜索对话" placeholder="搜索对话…" value={query} onChange={event => setQuery(event.target.value)} />
        {query && <IconButton aria-label="清空搜索条件" onClick={() => setQuery("")}><X size={14} /></IconButton>}
      </div>
      <Button className="chat-list-heading" variant="ghost" aria-pressed={archived} disabled={busy}
        onClick={() => { setArchived(value => !value); setQuery(""); }}>
        {archived ? "已归档" : "文件夹"}<Archive size={13} /><ChevronDown size={12} />
      </Button>
    </>}>
      <fieldset className="chat-session-list" disabled={busy || loading} inert={busy || loading}>
        {loading ? <p className="chat-list-empty" role="status">正在加载对话…</p> : !visible.length ? <div className="chat-list-empty" role="status">
          {filter ? <><Search size={18} /><p>未找到包含“{query}”的对话</p><Button variant="ghost" onClick={() => setQuery("")}>清空搜索条件</Button></>
            : <><p>{archived ? "暂无归档对话" : "未分组"}</p>{!archived && <Button variant="ghost" onClick={create}>新建对话</Button>}</>}
        </div> : archived ? visible.map(item => <div className="chat-archive-row" key={item.id}>
          <SidebarItem aria-current={item.id === selectedId ? "page" : undefined} onClick={() => select(item)}>{item.title}</SidebarItem>
          <IconButton aria-label={`恢复 ${item.title}`} title="恢复对话" onClick={() => void run(async () => { await update(item, { archived: false }); })}><ArchiveRestore size={14} /></IconButton>
          <IconButton aria-label={`删除 ${item.title}`} title="删除对话" onClick={() => { setDeleteError(""); setDeleteTarget(item); }}><Trash2 size={14} /></IconButton>
        </div>) : <>
          {visible.some(item => item.pinned) && <SidebarGroup label="置顶" icon={<Pin />} defaultOpen>{visible.filter(item => item.pinned).map(row)}</SidebarGroup>}
          {[...new Set(visible.filter(item=>!item.pinned).map(item=>item.group||""))].map(group=><SidebarGroup key={group} label={group||"未分组"} icon={group?<Folder/>:undefined} defaultOpen>{visible.filter(item=>!item.pinned && (item.group||"")===group).map(row)}</SidebarGroup>)}
        </>}
      </fieldset>
    </Sidebar>
    <main className="chat-workspace" aria-label="对话工作区" data-empty={empty}>
      <header className="chat-toolbar"><SidebarToggle controls="chat-sidebar" open={sidebarOpen} onToggle={onToggleSidebar} />
        <div className="chat-toolbar-end"><div className="chat-open-split"><Button className="chat-open" disabled={!window.mygo||busy} title={window.mygo?"打开项目目录":"在桌面端打开本机项目"} onClick={()=>session?.project?void run(()=>chatApi.openProject(session.id)):chooseProject()}><Code2 size={12}/>打开</Button>
        <Menu.Root><Menu.Trigger asChild><IconButton className="chat-open-menu" aria-label="项目操作"><ChevronDown size={10}/></IconButton></Menu.Trigger>
        <Menu.Content><Menu.Item disabled={!window.mygo||busy} onSelect={chooseProject}>选择项目目录</Menu.Item><Menu.Item disabled={!window.mygo||!session?.project} onSelect={()=>session&&void run(()=>chatApi.openProject(session.id))}>在文件管理器中打开</Menu.Item></Menu.Content></Menu.Root></div><IconButton aria-label="对话信息" aria-expanded={panel} onClick={()=>setPanel(v=>!v)}><PanelRight size={14}/></IconButton></div>
      </header>
      {panel && <aside className="chat-info" aria-label="对话信息"><header><strong>对话信息</strong><IconButton aria-label="关闭对话信息" onClick={()=>setPanel(false)}><X size={14}/></IconButton></header>
        <dl><dt>当前模型</dt><dd>{options.find(m=>m.id===currentModel)?.label||"未配置"}</dd><dt>上下文</dt><dd>{last?.tokens ? `${last.tokens.toLocaleString()} / ${last.limit?.toLocaleString()} tokens` : "尚无用量记录"}</dd><dt>消息</dt><dd>{session?.messages.length||0} 条</dd></dl>
        <Button disabled={!session || busy || running || !!queuedRuns.length} onClick={() => session && void run(async () => { await chatApi.compact(session.id, crypto.randomUUID()); setSnapshot(await chatApi.load()); })}>整理上下文</Button>
        {branches.length>1 && <label>对话分支<select className="ui-field" value={branches.find(branch => branch.current)?.id} disabled={busy || running || !!queuedRuns.length} onChange={event => session && void run(async () => { replaceSession(await chatApi.switchBranch(session.id,event.target.value)); setSnapshot(await chatApi.load()); })}>
          {branches.map((branch,index) => <option key={branch.id} value={branch.id}>{branch.parent ? `分支 ${index}` : "原始分支"}</option>)}
        </select></label>}
        {session&&<MemoryPanel key={session.id} session={session}/>}<ModelSettings onSaved={async()=>{await reload();setChoice(null)}}/></aside>}
      {empty ? <div className="chat-welcome"><div className="chat-welcome-content"><h2>想在 Chela 中构建什么？</h2><p>也可以不选择项目，直接开始</p>{composer}</div></div>
        : <><div className="chat-history" ref={history} role="log" aria-label="对话消息" aria-live="polite">
          <div className="chat-message-list">{session?.messages.filter(message => message.content || message.thinking).map((message, index) => <article className="chat-message" data-role={message.role} key={message.id || index}
            aria-label={message.role === "user" ? "你" : "Chela"}>{message.thinking && <details className="chat-thought"><summary>已思考</summary>{message.thinking}</details>}<div>{message.content}</div>
            {message.delivery==="queued" && <small role="status">等待补充到本轮</small>}{message.delivery==="cancelled" && <small role="status">本轮结束前未处理，请重新发送</small>}
            {message.role==="user" && <IconButton aria-label="编辑消息并建立分支" disabled={busy||running||!!queuedRuns.length||!!edit} onClick={()=>{if(!session)return;setEdit({session:session.id,message:message.id,previousDraft:draft});setDrafts(values=>({...values,[session.id]:message.content}));input.current?.focus()}}><SquarePen size={13}/></IconButton>}
            {message.role==="assistant" && <IconButton aria-label="复制回复" onClick={()=>void navigator.clipboard.writeText(message.content).catch(e=>setError(errorMessage(e)))}><Copy size={13}/></IconButton>}</article>)}
            {running && <><article className="chat-message" data-role="assistant">{pending?.thinking && <details className="chat-thought"><summary>正在思考</summary>{pending.thinking}</details>}{pending?.text || <span className="chat-sending">{activeRun?.state === "waiting_approval" ? "等待你的确认…" : "正在回复…"}</span>}</article></>}
          </div>
        </div>{composer}</>}
      {sending && empty && <p className="chat-empty-sending" role="status">正在回复…</p>}
      {archiveUndo && <div className="chat-archive-feedback" role="status"><span>已归档「{archiveUndo.title}」</span>
        <Button variant="ghost" disabled={busy} onClick={() => void run(async () => { await update(archiveUndo, { archived: false }); setArchiveUndo(null); })}>撤销</Button>
        <IconButton aria-label="关闭归档提示" onClick={() => setArchiveUndo(null)}><X size={14} /></IconButton>
      </div>}
      <dialog ref={confirmDelete} className="chat-delete-dialog" aria-labelledby={dialogTitle} aria-describedby={dialogDescription}
        onClose={() => { setDeleteTarget(null); setDeleteError(""); }}>
        <h2 id={dialogTitle}><Trash2 size={16} />删除对话「{deleteTarget?.title}」？</h2>
        <p id={dialogDescription}>删除后记录将立即清除，无法从归档中找回；若只是想收起列表，建议改为归档。</p>
        {deleteError && <p className="chat-delete-error" role="alert">{deleteError}</p>}
        <form method="dialog"><Button type="submit" autoFocus disabled={busy}>取消</Button>
          <Button className="chat-delete-confirm" disabled={busy} onClick={() => void remove()}>确认删除</Button></form>
      </dialog>
    </main>
  </>;
}
