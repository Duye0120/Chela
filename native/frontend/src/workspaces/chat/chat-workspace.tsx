import { useEffect, useId, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { Archive, ArchiveRestore, ArrowDown, ArrowUp, Code2, Ellipsis, FolderClosed, FolderOpen, MessageSquarePlus, PanelRight, Square, Copy, ChevronDown, Folder, FolderPlus, Paperclip, Pin, RotateCcw, Search, ShieldAlert, SquarePen, Upload, Trash2, X } from "lucide-react";
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
import { chatApi, isActiveRun, type ChatAttachment, type ChatProgress, type ChatSession, type ChatSnapshot, type RuntimeSettings } from "./data";
import { ContextChips } from "./context-chips";
import { ToolActivities } from "./tool-activity";
import { PreviewWorkspace } from "../preview/preview-workspace";
import { previewApi } from "../preview/api";
import { matchesShortcut, readShortcuts } from "../../ui/shortcuts";
import { workApi } from "../../data/work";
import { ContextControl } from "./context-control";
import { Thought } from "./thought";
import { ProjectControls } from "./project-controls";
import { useReadingPosition } from "./use-reading-position";
import { MarkdownNote } from "../notes/note-editor";
import "../notes/notes.css";
import "./chat.css";

type Props = { sidebarOpen: boolean; onToggleSidebar: () => void };
let workspaceDrafts: Record<string, string> = {};
let contextDrafts: Record<string, ChatAttachment[]> = {};
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
function setContexts(key: string, update: ChatAttachment[] | ((items: ChatAttachment[]) => ChatAttachment[])) {
  contextDrafts = { ...contextDrafts, [key]: typeof update === "function" ? update(contextDrafts[key] || []) : update };
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

function folderKey(item: ChatSession) { return item.group ? item.project || `group:${item.group}` : ""; }

export function ChatWorkspace({ sidebarOpen, onToggleSidebar }: Props) {
  const [snapshot, setSnapshot] = useState<ChatSnapshot>({ sessions: [], model: "" });
  const [runtime,setRuntime]=useState<RuntimeSettings|null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const drafts = useSyncExternalStore(subscribeDrafts, () => workspaceDrafts);
  const contexts = useSyncExternalStore(subscribeDrafts, () => contextDrafts);
  const fileInput=useRef<HTMLInputElement>(null);
  const [groupName,setGroupName]=useState<string|null>(null);
  const [groupTarget,setGroupTarget]=useState<string|null>(null);
  const [choice,setChoice]=useState<{modelId:string;effort:string|null}|null>(null);
  const [edit,setEdit]=useState<{session:string;message:string;previousDraft:string;previousContexts:ChatAttachment[]}|null>(null);
  const [dragging, setDragging] = useState(false), [suggestions, setSuggestions] = useState<{id:string;name:string;text?:string;path?:string;detail?:string;browser?:string;kind?:string}[]>([]), [suggestionIndex,setSuggestionIndex] = useState(0);
  const [suggestionsOpen,setSuggestionsOpen] = useState(true);
  const [panel,setPanel]=useState(false);
  const [previewOpen,setPreviewOpen]=useState(()=>sessionStorage.getItem("chela.preview.open")==="true"),[changeRequest,setChangeRequest]=useState<{path:string;key:number}|null>(null);
  const [requestedTab,setRequestedTab]=useState("");
  useEffect(()=>{sessionStorage.setItem("chela.preview.open",String(previewOpen))},[previewOpen]);
  function openDiff(path:string){setChangeRequest({path,key:performance.now()});setPreviewOpen(true)}
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
  const confirmDelete = useRef<HTMLDialogElement>(null);
  const dialogTitle = useId();
  const dialogDescription = useId();
  const session = snapshot.sessions.find(item => item.id === selectedId);
  useEffect(()=>{let active=true;setRuntime(null);const update=()=>void chatApi.runtimeSettings(selectedId||"").then(value=>{if(active)setRuntime(value)}).catch(cause=>{if(active)setError(errorMessage(cause))});update();window.addEventListener("chela-runtime-settings-changed",update);return()=>{active=false;window.removeEventListener("chela-runtime-settings-changed",update)}},[selectedId]);
  function changeRuntime(patch:Partial<RuntimeSettings>){if(!runtime)return;void run(async()=>{const current=session??await chatApi.create();if(!session){replaceSession(current);setSelectedId(current.id)}const value={...runtime,...patch};await chatApi.setRuntimeSettings(current.id,value);setRuntime(value)})}
  useEffect(()=>{const key=(event:KeyboardEvent)=>{if(event.defaultPrevented||event.isComposing||document.querySelector("dialog[open]"))return;const keys=readShortcuts();if(matchesShortcut(event,keys.togglePreview)){event.preventDefault();setPreviewOpen(value=>!value)}else if(matchesShortcut(event,keys.newTab)){event.preventDefault();if(!previewApi.native){setError("请在 Chela 桌面端新建浏览器标签页");return;}void previewApi.create(crypto.randomUUID()).then(tab=>{setPreviewOpen(true);setRequestedTab(tab.id)}).catch(cause=>setError(errorMessage(cause)))}else if(matchesShortcut(event,keys.openEditor)){event.preventDefault();if(session?.project&&!busy)void chatApi.openEditor(session.id,localStorage.getItem("chela.workspace.editor")||"system").catch(cause=>setError(errorMessage(cause)))}};window.addEventListener("keydown",key);return()=>window.removeEventListener("keydown",key)},[session,busy]);
  const draftKey = selectedId ?? "new";
  const draft = drafts[draftKey] ?? "";
  const attachments = contexts[draftKey] || [];
  const mention = draft.match(/(?:^|\s)@([^\s@]*)$/), slash = draft.match(/^\/([^\s]*)$/);
  useEffect(() => {
    setSuggestionIndex(0);if(!mention)return;let active=true;const query=mention[1];
    const timer=setTimeout(()=>void Promise.all([workApi.notes(),workApi.tasks(),selectedId?chatApi.references(selectedId,query):Promise.resolve([]),previewApi.tabs()]).then(([notes,tasks,files,tabs])=>{if(active)setSuggestions([...files.map(file=>({id:`file:${file.path}`,name:file.name,path:file.path,detail:file.path,kind:file.kind})),...tabs.filter(tab=>tab.url!=="about:blank").map(tab=>({id:`browser:${tab.id}`,name:"当前浏览器预览页",browser:tab.id,detail:tab.url,kind:"browser"})),...notes.filter(note=>!note.folder&&!note.archived).map(note=>({id:note.id,name:note.title,text:note.content,detail:"笔记",kind:"note"})),...tasks.filter(task=>task.status!=="已归档").map(task=>({id:task.id,name:task.title,text:`${task.title}\n状态：${task.status}\n${task.description}`,detail:task.status,kind:"task"}))])}).catch(cause=>{if(active)setError(errorMessage(cause))}),120);
    return()=>{active=false;clearTimeout(timer)};
  },[mention?.[1],selectedId]);
  const references = mention ? suggestions.filter(item=>`${item.name} ${item.detail||""}`.toLocaleLowerCase().includes(mention[1].toLocaleLowerCase())).slice(0,8) : [];
  const commands = slash ? [{id:"compact",name:"整理当前对话上下文"},{id:"clear",name:"清空当前输入与引用"},{id:"memory",name:"整理当前对话记忆"}].filter(item=>item.id.startsWith(slash[1])) : [];
  function chooseSuggestion(index:number) {
    if(mention) {const item=references[index];if(!item)return;const key=draftKey,text=draft.slice(0,draft.lastIndexOf("@"));void run(async()=>{const content=item.browser?await previewApi.text(item.browser):item.path&&selectedId?await chatApi.referenceContent(selectedId,item.path):item.text||"";if(addContext({id:crypto.randomUUID(),name:item.path||item.name,mime:"text/plain",text:content},key)){setDrafts(values=>({...values,[key]:text}));setSuggestionsOpen(false)}});}
    else if(slash) { const command=commands[index];if(!command)return; if(command.id==="clear"){setContexts(draftKey,[]);setDrafts(values=>({...values,[draftKey]:""}));}else if(session&&!running&&!busy)void run(async()=>{if(command.id==="compact")await chatApi.compact(session.id,crypto.randomUUID());else await chatApi.consolidateMemories(session.id);setDrafts(values=>({...values,[draftKey]:""}));setSnapshot(await chatApi.load())}); }
    input.current?.focus();
  }
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
  const question = session?.messages.filter(message => message.role === "user" && message.delivery !== "queued").at(-1);
  const { history, latestHidden, viewLatest } = useReadingPosition(selectedId || "new", session?.branchId || "main", question?.id, empty);
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
        if (update.events.length) {
          const value = await chatApi.load();
          if (active) setSnapshot(current => BigInt(value.snapshot_cursor || "0") >= BigInt(current.snapshot_cursor || "0") ? value : current);
        }
        if (active) setProgress(update.progress);
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
    const refresh = () => { void chatApi.load().then(value => { if (active) { setSnapshot(current => BigInt(value.snapshot_cursor || "0") >= BigInt(current.snapshot_cursor || "0") ? value : current); setChoice(null); } }).catch(cause => { if (active) setError(errorMessage(cause)); }); };
    window.addEventListener("chela-models-changed", refresh);
    return () => { active = false; window.removeEventListener("chela-models-changed", refresh); };
  }, []);
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

  function create(group?: ChatSession) {
    void run(async () => {
      let value = await chatApi.create();
      if (group) value = await chatApi.selectProject(value.id, group.project || "");
      if (group?.group) value = await chatApi.group(value.id, group.group);
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
    if ((!text && !attachments.length) || loading || busy || !currentModel || session?.archived || attachments.some(item=>item.uploading)) return;
    if(attachments.some(item=>item.mime.startsWith("image/"))&&!snapshot.models?.find(item=>item.id===currentModel)?.vision){setError("当前模型不支持图片，请切换支持视觉的模型或移除图片。");return;}
    void run(async () => {
      const current = session ?? await chatApi.create();
      if (!session) {
        replaceSession(current); setSelectedId(current.id);
        setDrafts(values => ({ ...values, new: "", [current.id]: text }));
        setContexts(current.id, attachments); setContexts("new", []);
      }
      const key = JSON.stringify([current.id, text, currentModel, effort,editing?.message, attachments]);
      const command = submissionCommands.get(key) || crypto.randomUUID();
      submissionCommands.set(key, command);
      if(attachments.length) await chatApi.submitContext(current.id,text,attachments,currentModel,effort,command,editing?.message);
      else if(editing) await chatApi.edit(current.id,editing.message,text,currentModel,effort,command);
      else await chatApi.submit(current.id, text, currentModel, effort, command);
      submissionCommands.delete(key);
      setDrafts(values => values[current.id]?.trim() === text ? { ...values, [current.id]: editing?.previousDraft || "" } : values);
      setContexts(current.id, editing?.previousContexts || []);
      if(editing){setEdit(null);delete branchCache.current[current.id];}
      setSnapshot(await chatApi.load());
    });
  }

  function addContext(item:ChatAttachment,key=draftKey) {
    if(item.text&&new TextEncoder().encode(item.text).length>128*1024){setError("引用超过 128 KiB，请选择较小的内容");return false;}
    const items=contextDrafts[key]||[],size=(value:ChatAttachment)=>value.data?value.data.length*.75:value.size||new TextEncoder().encode(value.text||"").length;
    if(items.length>=8||items.reduce((sum,value)=>sum+size(value),size(item))>40*1024*1024){setError("最多 8 个附件，合计不超过 40 MiB");return false;}
    setContexts(key,[...items,item]);return true;
  }
  async function attach(file:File) {
    const key=draftKey,image=["image/png","image/jpeg","image/gif"].includes(file.type),document=/\.docx$/i.test(file.name);
    if(file.size>20*1024*1024){setError(`附件 ${file.name} 超出 20 MB 限制，请移除后重试。`);return;}
    if(!image&&!document&&!file.type.startsWith("text/")&&!/\.(txt|md|json|xml|csv|log|yaml|yml|tsx?|jsx?|go|py|css|html)$/i.test(file.name)){setError("支持文本、DOCX 文档和 PNG / JPEG / GIF 图片");return;}
    const item:ChatAttachment={id:crypto.randomUUID(),name:file.name,mime:image?file.type:"text/plain",size:file.size,uploading:true,progress:0};if(!addContext(item,key))return;
    try {
      const content=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onprogress=event=>{if(event.lengthComputable)setContexts(key,items=>items.map(value=>value.id===item.id?{...value,progress:event.loaded/event.total*100}:value))};reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(reader.error||Error("无法读取附件"));if(image||document)reader.readAsDataURL(file);else reader.readAsText(file)});
      if(image)item.data=content.slice(content.indexOf(",")+1);else if(document)item.text=await chatApi.extractDocument(file.name,content.slice(content.indexOf(",")+1));else item.text=content;
      if(item.text&&new TextEncoder().encode(item.text).length>128*1024)throw Error("文本内容超过 128 KiB，请拆分后添加");
      item.uploading=false;item.progress=100;setContexts(key,items=>items.map(value=>value.id===item.id?item:value));input.current?.focus();
    }catch(cause){setContexts(key,items=>items.filter(value=>value.id!==item.id));setError(errorMessage(cause))}
  }
  async function saveGroup(){
    if(groupName===null||!groupName.trim())return;
    await run(async()=>{
      if(groupTarget!==null){for(const item of snapshot.sessions.filter(item=>folderKey(item)===groupTarget))replaceSession(await chatApi.group(item.id,groupName.trim()));}
      else {const item=session??await chatApi.create();replaceSession(item);setSelectedId(item.id);replaceSession(await chatApi.group(item.id,groupName.trim()));}
      setGroupName(null);setGroupTarget(null);
    });
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
    return <SessionRow key={item.id} title={item.title} query={query} pinned={item.pinned} current={item.id === selectedId}
      meta={<>{item.pinned && <Pin size={11} aria-label="已置顶" />}{snapshot.approvals?.some(approval=>approval.sessionId===item.id)?<span className="chat-needs-approval">需批准</span>:updatedLabel(item.updatedAt)}</>}
      onSelect={() => select(item)} onRename={title => rename(item, title)}
      onPinnedChange={pinned => void run(async () => { await update(item, { pinned }); })}
      onArchive={() => archive(item)} onDelete={() => { setDeleteError(""); setDeleteTarget(item); }} />;
  }

  function regenerate(messageId: string) {
    if (!session || running || busy || queuedRuns.length) return;
    const index = session.messages.findIndex(item => item.id === messageId);
    const message = session.messages.slice(0, index).filter(item => item.role === "user").at(-1);
    if (!message) return;
    if (message.attachments?.some(item=>item.mime.startsWith("image/"))&&!snapshot.models?.find(item=>item.id===currentModel)?.vision) { setError("当前模型不支持图片，请切换支持视觉的模型或移除图片。"); return; }
    void run(async () => {
      const items = await Promise.all((message.attachments || []).map(item => chatApi.attachment(session.id, message.id, item.id)));
      if (items.length) await chatApi.submitContext(session.id, message.content, items, currentModel, effort, crypto.randomUUID(), message.id);
      else await chatApi.edit(session.id, message.id, message.content, currentModel, effort, crypto.randomUUID());
      delete branchCache.current[session.id];
      setSnapshot(await chatApi.load());
    });
  }

  const composer = <div className="chat-compose-area">
    {editing && <div className="chat-archived-notice" role="status"><span>编辑后会从这里建立新分支，原对话保留。</span><Button disabled={busy} onClick={()=>{setDrafts(values=>({...values,[draftKey]:editing.previousDraft}));setContexts(draftKey,editing.previousContexts);setEdit(null)}}>取消编辑</Button></div>}
    {session?.archived ? <div className="chat-archived-notice"><Archive size={16} /><span>这条对话已归档</span>
      <Button disabled={busy} onClick={() => void run(async () => { await update(session, { archived: false }); setArchived(false); })}>恢复对话</Button>
    </div> : <form className="chat-composer" data-dragging={dragging} data-invalid={Boolean(error)} onSubmit={send} aria-label={editing ? "编辑历史消息" : "发送消息"} aria-busy={busy}
      onDragOver={event=>{if(event.dataTransfer.types.includes("Files")){event.preventDefault();setDragging(true)}}} onDragLeave={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node))setDragging(false)}} onDrop={event=>{event.preventDefault();setDragging(false);if(!busy&&!loading)for(const file of event.dataTransfer.files)void attach(file)}}>
      {!!attachments.length && <ContextChips items={attachments} onRemove={busy?undefined:id=>setContexts(draftKey,items=>items.filter(item=>item.id!==id))} />}
      {dragging && <span className="chat-drop-hint" role="status"><Upload size={20}/><span>松手将文件、代码片段或截图添加到对话</span></span>}
      <Textarea ref={input} rows={empty ? 3 : 1} aria-label="消息" aria-invalid={Boolean(error)} aria-autocomplete="list" aria-controls={suggestionsOpen&&(mention||slash)?"chat-suggestions":undefined} aria-activedescendant={suggestionsOpen&&(references.length+commands.length)?`chat-suggestion-${suggestionIndex}`:undefined} placeholder={approvals.length?"请先处理上方审批，或补充下一步修改要求…":running?"正在生成回复，可提前输入下一条问题…":"输入消息，开始这次对话…"}
        value={draft} readOnly={busy || loading} onChange={event => {setDrafts(values => ({ ...values, [draftKey]: event.target.value }));setSuggestionIndex(0);setSuggestionsOpen(true)}}
        onPaste={event=>{const images=[...event.clipboardData.files].filter(file=>file.type.startsWith("image/"));if(images.length&&!busy&&!loading){event.preventDefault();images.forEach(file=>void attach(file))}}}
        onKeyDown={event => {
          const total = references.length + commands.length;
          if(suggestionsOpen && total && !event.nativeEvent.isComposing) {
            if(event.key==="Escape"){event.preventDefault();setSuggestionsOpen(false);return;}
            if(event.key==="ArrowDown"||event.key==="ArrowUp"){event.preventDefault();setSuggestionIndex(value=>(value+(event.key==="ArrowDown"?1:total-1))%total);return;}
            if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();chooseSuggestion(suggestionIndex%total);return;}
          }
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) {
            event.preventDefault(); event.currentTarget.form?.requestSubmit();
          }
        }} />
      {suggestionsOpen && (mention || slash) && <div id="chat-suggestions" className="chat-composer-suggestions" role="listbox" aria-label={mention?"引用页面或任务":"对话指令"}><small className="chat-suggestions-heading">{mention?"引用工作区文件、目录或上下文":"对话指令"}</small>{(mention?references:commands).map((item,index)=><button id={`chat-suggestion-${index}`} type="button" role="option" aria-selected={index===suggestionIndex} key={item.id} disabled={Boolean(slash&&item.id!=="clear"&&(!session||running||busy))} onMouseDown={event=>event.preventDefault()} onClick={()=>chooseSuggestion(index)}>{mention?<Folder size={14}/>:<Code2 size={14}/>}<span>{slash&&<code>/{item.id} </code>}{item.name}</span>{"detail" in item&&<small>{String(item.detail||"")}</small>}</button>)}{!(references.length+commands.length)&&<small>没有匹配项</small>}</div>}
      <div className="chat-composer-actions">
        <input ref={fileInput} type="file" multiple accept="image/png,image/jpeg,image/gif,text/*,.md,.json,.xml,.docx,.yaml,.yml,.log,.ts,.tsx,.js,.jsx,.go,.py" hidden onChange={event=>{const files=[...event.target.files||[]];event.target.value="";files.forEach(file=>void attach(file))}}/>
        <IconButton aria-label="添加附件" tooltip="添加文件或图片" disabled={busy || loading} onClick={()=>fileInput.current?.click()}><Paperclip size={20}/></IconButton>
        <div className="chat-composer-spacer" />
        {options.length ? <ModelSelect models={options} value={{modelId:currentModel,effort}} onChange={setChoice} fastMode={{enabled:Boolean(snapshot.models?.find(item=>item.id===currentModel)?.fast&&runtime?.fastMode),disabled:busy||!runtime||!snapshot.models?.find(item=>item.id===currentModel)?.fast,onChange:fastMode=>changeRuntime({fastMode})}} permission={{value:runtime?.permission||"ask",disabled:busy||!runtime,onChange:permission=>changeRuntime({permission}),onLearnMore:()=>{location.hash="settings/assistant"}}}
          onFavoriteChange={(id,on)=>{const next=on?[...favorites.filter(v=>v!==id),id]:favorites.filter(v=>v!==id);setFavorites(next);localStorage.setItem("chela.chat.favorites",JSON.stringify(next))}}/> :
          loading ? <span className="chat-model-missing">正在连接…</span> : <ModelSettings onSaved={reload}/>}

        {activeRun?<IconButton className="chat-send chat-stop" aria-label="停止生成" tooltip="停止生成" onClick={()=>void chatApi.cancel(activeRun.run_id).catch(e=>setError(errorMessage(e)))}><Square size={14} fill="currentColor"/></IconButton>:<IconButton type="submit" className="chat-send" aria-label={editing ? "创建分支并发送" : "发送消息"} tooltip="发送消息（Enter）" disabled={attachments.some(item=>item.uploading)||(!draft.trim()&&!attachments.length)||busy||loading||!currentModel||(!!editing&&(running||!!queuedRuns.length))}><ArrowUp size={20}/></IconButton>}
      </div>
    </form>}
    {error && <div className="chat-error" role="alert"><span>{error}</span>
      <Button variant="ghost" disabled={busy} onClick={() => void reload()}>重新加载</Button>
      <IconButton aria-label="关闭错误提示" onClick={() => setError("")}><X size={14} /></IconButton>
    </div>}
    {activeRun&&draft.trim()&&<div className="chat-active-actions">{activeRun && !editing && <Button type="button" title={attachments.length?"附件可通过发送按钮排队发送":undefined} disabled={!draft.trim()||busy||!!attachments.length||!["running","waiting_approval"].includes(activeRun.state)} onClick={()=>void run(async()=>{
          const text=draft.trim(),key=JSON.stringify(["steer",activeRun.run_id,text]);const command=submissionCommands.get(key)||crypto.randomUUID();submissionCommands.set(key,command);
          await chatApi.steer(activeRun.run_id,text,command);submissionCommands.delete(key);setDrafts(values=>values[draftKey]?.trim()===text?{...values,[draftKey]:""}:values);setSnapshot(await chatApi.load());
        })}>补充本轮</Button>}<Button disabled={busy||loading} onClick={()=>input.current?.form?.requestSubmit()}>排队发送</Button></div>}
    {queuedRuns.map(run => <div className="chat-archived-notice" key={run.run_id}><span>排队中：{run.text}</span><Button onClick={() => void chatApi.cancel(run.run_id).catch(e => setError(errorMessage(e)))}>取消</Button></div>)}
    {selectedId&&<ExtensionRequests key={selectedId} session={selectedId}/>}
    {latestRun && ["failed", "interrupted", "cancelled"].includes(latestRun.state) && <div className="chat-delete-error" role="status">{latestRun.terminal_reason}
      <Button disabled={busy || running || !!queuedRuns.length} onClick={() => void run(async () => { await chatApi.recover(latestRun.run_id, crypto.randomUUID()); setSnapshot(await chatApi.load()); })}>从安全位置继续</Button>
    </div>}
    <div className="chat-composer-meta"><ProjectControls session={session} sessions={snapshot.sessions} busy={busy||running||!!queuedRuns.length} onChooseProject={chooseProject} onProject={path=>void run(async()=>{const current=session??await chatApi.create();replaceSession(await chatApi.selectProject(current.id,path));setSelectedId(current.id)})} onBranch={id=>session&&void run(async()=>{replaceSession(await chatApi.switchBranch(session.id,id));branchCache.current[session.id]=await chatApi.branches(session.id);setSnapshot(await chatApi.load())})}/>
      <ContextControl tokens={last?.tokens} limit={last?.limit} model={options.find(item=>item.id===currentModel)?.label||"未配置模型"} busy={!session||busy||running||!!queuedRuns.length} onDetails={()=>setPanel(true)} onCompact={()=>session&&void run(async()=>{await chatApi.compact(session.id,crypto.randomUUID());setSnapshot(await chatApi.load())})}/>

    </div>
  </div>;

  return <>
    <Sidebar id="chat-sidebar" title="对话" open={sidebarOpen} actions={<>
      <span className="chat-sidebar-close"><SidebarToggle controls="chat-sidebar" open={sidebarOpen} onToggle={onToggleSidebar} /></span>
      <IconButton aria-label="添加文件夹" tooltip="添加文件夹" disabled={busy||loading||!window.chelaDesktop} onClick={()=>void run(async()=>{const current=await chatApi.create();const value=await chatApi.chooseProject(current.id);replaceSession(value);setSelectedId(value.id);setArchived(false);setQuery("")})}><FolderPlus size={14} /></IconButton>
      <IconButton aria-label="新建对话" tooltip="新建对话" onClick={()=>create(session)} disabled={loading || busy}><SquarePen size={14} /></IconButton>
    </>} toolbar={<>
      {groupName!==null && <form className="chat-group-form" onSubmit={e=>{e.preventDefault();void saveGroup()}}>
        <input className="ui-field" autoFocus aria-label="文件夹名称" placeholder="输入文件夹名称" maxLength={100} required value={groupName} onChange={e=>setGroupName(e.target.value)}/>
        <Button type="submit" disabled={busy}>保存</Button><IconButton aria-label="取消分组" onClick={()=>{setGroupName(null);setGroupTarget(null)}}><X size={14}/></IconButton></form>}
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
            : <><p>{archived ? "暂无归档对话" : "未分组"}</p>{!archived && <Button variant="ghost" onClick={()=>create(session)}>新建对话</Button>}</>}
        </div> : archived ? visible.map(item => <div className="chat-archive-row" key={item.id}>
          <SidebarItem aria-current={item.id === selectedId ? "page" : undefined} onClick={() => select(item)}>{item.title}</SidebarItem>
          <IconButton aria-label={`恢复 ${item.title}`} title="恢复对话" onClick={() => void run(async () => { await update(item, { archived: false }); })}><ArchiveRestore size={14} /></IconButton>
          <IconButton aria-label={`删除 ${item.title}`} title="删除对话" onClick={() => { setDeleteError(""); setDeleteTarget(item); }}><Trash2 size={14} /></IconButton>
        </div>) : <>
          {[...new Set(visible.map(folderKey))].map((key,index)=>{
            const items=visible.filter(item=>folderKey(item)===key),group=items[0];
            return <div className="chat-folder" key={key} id={`chat-folder-${index}`} title={group.project||undefined}>
              <SidebarGroup label={group.group||"未分组"} icon={key?<><FolderOpen className="chat-folder-open"/><FolderClosed className="chat-folder-closed"/></>:undefined} defaultOpen>{items.map(row)}</SidebarGroup>
              {key&&<div className="chat-folder-actions"><Menu.Root><Menu.Trigger asChild><IconButton aria-label={`${group.group}文件夹操作`}><Ellipsis size={14}/></IconButton></Menu.Trigger><Menu.Content className="chat-folder-menu" aria-label={`${group.group}文件夹操作`}>
                <Menu.Item onSelect={()=>create(group)}><MessageSquarePlus/>新增聊天</Menu.Item>
                <Menu.Item onSelect={()=>document.getElementById(`chat-folder-${index}`)?.querySelector("details")?.removeAttribute("open")}><FolderClosed/>折叠该组会话</Menu.Item>
                <Menu.Item disabled={!window.chelaDesktop||!group.project} onSelect={()=>void run(()=>chatApi.openProject(group.id))}><FolderOpen/>在文件管理器打开</Menu.Item>
                <Menu.Item onSelect={()=>{setGroupTarget(key);setGroupName(group.group||"")}}><SquarePen/>重命名文件夹</Menu.Item><Menu.Separator/>
                <Menu.Item className="ui-session-delete" onSelect={()=>void run(async()=>{for(const item of snapshot.sessions.filter(item=>folderKey(item)===key))replaceSession(await chatApi.group(item.id,""))})}><Trash2/>从列表移除</Menu.Item>
              </Menu.Content></Menu.Root><IconButton aria-label={`在 ${group.group} 新增聊天`} tooltip={`在 ${group.group} 新增聊天`} onClick={()=>create(group)}><MessageSquarePlus size={14}/></IconButton></div>}
            </div>;
          })}
        </>}
      </fieldset>
    </Sidebar>
    <main className="chat-workspace" aria-label="对话工作区" data-empty={empty}>
      <header className="chat-toolbar"><SidebarToggle controls="chat-sidebar" open={sidebarOpen} onToggle={onToggleSidebar} />{approvals.length>0&&<span className="chat-pending-badge">待批准 {approvals.length}</span>}
        <div className="chat-toolbar-end"><div className="chat-open-split"><Button className="chat-open" disabled={!window.chelaDesktop||busy} title={window.chelaDesktop?"打开项目目录":"在桌面端打开本机项目"} onClick={()=>session?.project?void run(()=>chatApi.openEditor(session.id,localStorage.getItem("chela.workspace.editor")||"system")):chooseProject()}><Code2 size={12}/>打开</Button>
        <Menu.Root><Menu.Trigger asChild><IconButton className="chat-open-menu" aria-label="项目操作"><ChevronDown size={10}/></IconButton></Menu.Trigger>
        <Menu.Content><Menu.Item disabled={!window.chelaDesktop||busy} onSelect={chooseProject}>选择项目目录</Menu.Item><Menu.Item disabled={!window.chelaDesktop||!session?.project} onSelect={()=>session&&void run(()=>chatApi.openProject(session.id))}>在文件管理器中打开</Menu.Item></Menu.Content></Menu.Root></div><IconButton aria-label="切换右侧工作区" aria-expanded={previewOpen} onClick={()=>setPreviewOpen(value=>!value)}><PanelRight size={14}/></IconButton></div>
      </header>
      {panel && <aside className="chat-info" aria-label="对话信息"><header><strong>对话信息</strong><IconButton aria-label="关闭对话信息" onClick={()=>setPanel(false)}><X size={14}/></IconButton></header>
        <dl><dt>当前模型</dt><dd>{options.find(m=>m.id===currentModel)?.label||"未配置"}</dd><dt>上下文</dt><dd>{last?.tokens ? `${last.tokens.toLocaleString()} / ${last.limit?.toLocaleString()} tokens` : "尚无用量记录"}</dd><dt>消息</dt><dd>{session?.messages.length||0} 条</dd></dl>
        <Button disabled={!session || busy || running || !!queuedRuns.length} onClick={() => session && void run(async () => { await chatApi.compact(session.id, crypto.randomUUID()); setSnapshot(await chatApi.load()); })}>整理上下文</Button>
        {branches.length>1 && <label>对话分支<select className="ui-field" value={branches.find(branch => branch.current)?.id} disabled={busy || running || !!queuedRuns.length} onChange={event => session && void run(async () => { replaceSession(await chatApi.switchBranch(session.id,event.target.value)); setSnapshot(await chatApi.load()); })}>
          {branches.map((branch,index) => <option key={branch.id} value={branch.id}>{branch.parent ? `分支 ${index}` : "原始分支"}</option>)}
        </select></label>}
        {session&&<MemoryPanel key={session.id} session={session}/>}<ModelSettings onSaved={async()=>{await reload();setChoice(null)}}/></aside>}
      {empty ? <div className="chat-welcome"><div className="chat-welcome-content"><h2>想在 Chela 中构建什么？</h2><p>也可以不选择项目，直接开始</p>{composer}</div></div>
        : <><div className="chat-reading"><div className="chat-history" ref={history} role="log" aria-label="对话消息" aria-live="polite">
          <div className="chat-message-list">{session?.messages.filter(message => message.content || message.thinking || message.tools?.length).map((message, index) => <article className="chat-message" data-role={message.role} key={message.id || index}
            data-message-id={message.id} aria-label={message.role === "user" ? "你" : "Chela"}>{message.thinking && <Thought text={message.thinking}/>}{!!message.tools?.length&&<ToolActivities items={message.tools}/>} {message.role === "assistant" ? <MarkdownNote content={message.content} notes={[]} onOpen={() => {}} onDiff={openDiff} /> : <div className="chat-user-text">{message.content}</div>}
            {message.delivery==="queued" && <small role="status">等待补充到本轮</small>}{message.delivery==="cancelled" && <small role="status">本轮结束前未处理，请重新发送</small>}
            {!!message.attachments?.length && selectedId && <ContextChips items={message.attachments} session={selectedId} message={message.id} />}
            <div className="chat-message-actions">{message.role==="user" && <IconButton aria-label="编辑消息并建立分支" tooltip="编辑重发" disabled={busy||running||!!queuedRuns.length||!!edit} onClick={()=>{if(!session)return;void run(async()=>{const items=await Promise.all((message.attachments||[]).map(item=>chatApi.attachment(session.id,message.id,item.id)));setEdit({session:session.id,message:message.id,previousDraft:draft,previousContexts:attachments});setDrafts(values=>({...values,[session.id]:message.content}));setContexts(session.id,items);input.current?.focus()})}}><SquarePen size={14}/></IconButton>}
            <IconButton aria-label={message.role==="assistant"?"复制回复":"复制消息"} tooltip="复制" onClick={()=>void navigator.clipboard.writeText(message.content).catch(e=>setError(errorMessage(e)))}><Copy size={14}/></IconButton>
            {message.role==="assistant"&&<IconButton aria-label="重新生成回复" tooltip="重新生成" disabled={busy||running||!!queuedRuns.length||!!edit||!currentModel} onClick={()=>regenerate(message.id)}><RotateCcw size={14}/></IconButton>}</div></article>)}
            {running && <><article className="chat-message" data-role="assistant">{pending?.thinking && <Thought running text={pending.thinking}/>}{pending?.text ? <MarkdownNote content={pending.text} notes={[]} onOpen={() => {}} onDiff={openDiff} /> : <span className="chat-sending">{activeRun?.state === "waiting_approval" ? "等待你的确认…" : "正在回复…"}</span>}</article></>}
            {approvals.map(approval => <section className="chat-approval" key={approval.id} aria-label="工具执行确认">
              <header><ShieldAlert size={16}/><strong>{approval.title}</strong><small>等待批准</small></header>{approval.preview.length<1000?<pre className="chat-approval-preview">{approval.preview}</pre>:<details><summary>查看操作内容</summary><pre className="chat-approval-preview">{approval.preview}</pre></details>}<footer><small title={approval.description}>来自权限策略：请求批准</small>
              <Button disabled={busy} onClick={() => void run(async () => { await chatApi.resolveApproval(approval.id, false); setSnapshot(await chatApi.load()); })}>拒绝</Button>
              {approval.canAllowSession && <Button disabled={busy} title="本次启动期间，仅此会话的当前工作区文件写入；不包含外部服务" onClick={()=>void run(async()=>{await chatApi.allowSessionApproval(approval.id);setSnapshot(await chatApi.load())})}>本会话允许</Button>}
              <Button variant="primary" disabled={busy} onClick={() => void run(async () => { await chatApi.resolveApproval(approval.id, true); setSnapshot(await chatApi.load()); })}>批准执行</Button>
            </footer></section>)}
          </div><div className="chat-reading-space" aria-hidden="true"/>
        </div>{latestHidden&&<Button className="chat-view-latest" onClick={viewLatest}><ArrowDown size={14}/>{running?"有新回复内容":"查看最新回复"}</Button>}</div>{composer}</>}
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
    </main>{previewOpen&&<PreviewWorkspace session={selectedId||""} onClose={()=>setPreviewOpen(false)} onContext={item=>addContext(item)} changeRequest={changeRequest} requestedTab={requestedTab}/ >}
  </>;
}
