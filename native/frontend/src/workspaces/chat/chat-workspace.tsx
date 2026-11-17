import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useStore } from "zustand";
import { Trash2, X } from "lucide-react";
import { Button } from "../../ui/button";
import { IconButton } from "../../ui/icon-button";
import type { ModelValue } from "../../ui/model-select";
import { chatApi, isActiveRun, type ChatSession, type ChatMessage, type RuntimeSettings } from "../../data/chat";
import { previewApi } from "../../data/preview";
import { chatDrafts, setDrafts, setContexts, clearDraft, type ChatEdit } from "../../state/chat-drafts";
import { chatState, setSnapshot, setLoading, setError } from "../../state/chat";
import { observeChat, refreshChat, replaceSession, invalidateBranches, useRuntimeSettings, saveRuntimeSettings, errorMessage } from "../../state/chat-actions";
import { previewState, setPreviewOpen, openDiff, openBrowserTab } from "../../state/preview";
import { readEditor, usePreferences } from "../../state/preferences";
import { matchesShortcut, readShortcuts } from "../../ui/shortcuts";
import { PreviewWorkspace } from "../preview/preview-workspace";
import { useReadingPosition } from "./use-reading-position";
import { addContext } from "./composer-actions";
import { submitMessage, steerMessage, regenerateMessage } from "./submission-actions";
import { ChatSidebar, folderKey } from "./chat-sidebar";
import { ChatToolbar } from "./chat-toolbar";
import { ChatInfoPanel } from "./chat-info-panel";
import { ChatTranscript } from "./chat-transcript";
import { ChatComposer } from "./chat-composer";
import "./chat.css";

type Props = { sidebarOpen: boolean; onToggleSidebar: () => void };

function linkedSession() {
  const match = location.hash.match(/^#chat\/(.+)$/);
  try { return match ? decodeURIComponent(match[1]) : null; }
  catch { return null; }
}

export function ChatWorkspace({ sidebarOpen, onToggleSidebar }: Props) {
  const snapshot = useStore(chatState, state => state.snapshot);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const draftKey = selectedId ?? "new";
  const { value: runtime, error: runtimeError } = useRuntimeSettings(selectedId || "");
  useEffect(() => { if (runtimeError) setError(runtimeError); }, [runtimeError]);
  const [choice,setChoice]=useState<ModelValue|null>(null);
  const [edit,setEdit]=useState<ChatEdit|null>(null);
  const [panel,setPanel]=useState(false);
  const previewOpen = useStore(previewState, state => state.open);
  const favorites = usePreferences(state => state.favorites);
  const progress = useStore(chatState, state => selectedId ? state.progress[selectedId] : undefined);
  const [query, setQuery] = useState("");
  const [archived, setArchived] = useState(false);
  const loading = useStore(chatState, state => state.loading);
  const [busy, setBusy] = useState(false);
  const [archiveUndo, setArchiveUndo] = useState<ChatSession | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ChatSession | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const operation = useRef(false);
  const instance = useRef(0);
  const input = useRef<HTMLTextAreaElement>(null);
  const confirmDelete = useRef<HTMLDialogElement>(null);
  const dialogTitle = useId();
  const dialogDescription = useId();
  const session = snapshot.sessions.find(item => item.id === selectedId);
  function changeRuntime(patch: Partial<RuntimeSettings>) {
    if (!runtime) return;
    const target = selectedId, value = { ...runtime, ...patch };
    void run(async () => {
      const current = session ?? await chatApi.create();
      if (!session) { replaceSession(current); setSelectedId(id => id === target ? current.id : id); }
      await saveRuntimeSettings(current.id, value);
    });
  }
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || document.querySelector("dialog[open]")) return;
      const keys = readShortcuts();
      if (matchesShortcut(event, keys.togglePreview)) {
        event.preventDefault(); setPreviewOpen(value => !value);
      } else if (matchesShortcut(event, keys.newTab)) {
        event.preventDefault();
        if (!previewApi.native) { setError("请在 Chela 桌面端新建浏览器标签页"); return; }
        const current = instance.current;
        void previewApi.create(crypto.randomUUID()).then(tab => {
          if (current === instance.current) openBrowserTab(tab.id);
        }).catch(cause => { if (current === instance.current) setError(errorMessage(cause)); });
      } else if (matchesShortcut(event, keys.openEditor)) {
        event.preventDefault();
        if (session?.project && !busy) void chatApi.openEditor(session.id, readEditor()).catch(cause => setError(errorMessage(cause)));
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [session, busy]);
  const editing=edit?.session===selectedId ? edit : null;
  const sessionRuns = (snapshot.runs || []).filter(run => run.session_id === selectedId);
  const activeRun = sessionRuns.find(run => isActiveRun(run) && run.state !== "queued");
  const queuedRuns = sessionRuns.filter(run => run.state === "queued");
  const running = !!activeRun;
  const sending = running;
  const pending = progress?.run_id === activeRun?.run_id ? progress || null : null;
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
  const modelRevision = useStore(chatState, state => state.modelRevision);
  useEffect(() => { setChoice(null); }, [selectedId, modelRevision]);
  useEffect(()=>{const title=[session?.group, session?.title || "新对话"].filter(Boolean).join(" / ");window.dispatchEvent(new CustomEvent("chela-chat-title",{detail:title}))},[session?.title,session?.group]);

  useEffect(() => {
    let active = true;
    const observer = observeChat();
    void observer.ready.then(value => {
      if (!active) return;
      const target = linkedSession();
      const item = target ? value.sessions.find(session => session.id === target) : value.sessions.find(session => !session.archived);
      setSelectedId(item?.id ?? null);
      setArchived(item?.archived ?? false);
      if (target && !item) setError("引用的对话已不存在");
    }).catch(() => {});
    return () => { active = false; instance.current++; observer.release(); previewState.setState({ changeRequest: null, requestedTab: "" }); };
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

  async function run(action: () => Promise<void>) {
    if (operation.current) return false;
    operation.current = true;
    setBusy(true);
    setError("");
    try { await action(); return true; }
    catch (cause) { setError(errorMessage(cause)); return false; }
    finally { operation.current = false; setBusy(false); }
  }

  async function reload() {
    await run(async () => {
      setLoading(true);
      try {
        const value = await refreshChat();
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
      setSelectedId(current => current === item.id ? snapshot.sessions.find(other => other.id !== item.id && !other.archived)?.id ?? null : current);
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
    const values=chatDrafts.getState(),attachments=values.contexts[draftKey]||[];
    const text = (values.drafts[draftKey]||"").trim();
    if ((!text && !attachments.length) || loading || busy || !currentModel || session?.archived || attachments.some(item=>item.uploading)) return;
    if(attachments.some(item=>item.mime.startsWith("image/"))&&!snapshot.models?.find(item=>item.id===currentModel)?.vision){setError("当前模型不支持图片，请切换支持视觉的模型或移除图片。");return;}
    const target = selectedId;
    void run(()=>submitMessage({ session,text,attachments,model:currentModel,effort,editing,
      onCreated:current=>setSelectedId(id=>id===target?current.id:id),
      onSubmitted:()=>{if(editing)setEdit(current=>current===editing?null:current)},
    }));
  }

  async function saveGroup(target: string | null, name: string) {
    return run(async()=>{
      if(target!==null){for(const item of snapshot.sessions.filter(item=>folderKey(item)===target))replaceSession(await chatApi.group(item.id,name));}
      else {const item=session??await chatApi.create();replaceSession(item);setSelectedId(item.id);replaceSession(await chatApi.group(item.id,name));}
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
        setSelectedId(current => current === target.id ? snapshot.sessions.find(item => item.id !== target.id && !item.archived)?.id ?? null : current);
        clearDraft(target.id);
        invalidateBranches(target.id);
        if (archiveUndo?.id === target.id) setArchiveUndo(null);
        confirmDelete.current?.close();
      } catch (cause) { setDeleteError(errorMessage(cause)); }
    });
  }

  function compact() { if(session)void run(async()=>{await chatApi.compact(session.id,crypto.randomUUID());await refreshChat()}); }
  function switchBranch(id: string) { if(session)void run(async()=>{replaceSession(await chatApi.switchBranch(session.id,id));await refreshChat()}); }
  function editMessage(message: ChatMessage) {
    if (!session) return;
    const target = session, previousDraft = chatDrafts.getState().drafts[target.id] || "", previousContexts = chatDrafts.getState().contexts[target.id] || [];
    void run(async()=>{
      const items=await Promise.all((message.attachments||[]).map(item=>chatApi.attachment(target.id,message.id,item.id)));
      setEdit({session:target.id,message:message.id,previousDraft,previousContexts});
      setDrafts(values=>({...values,[target.id]:message.content}));setContexts(target.id,items);input.current?.focus();
    });
  }

  function regenerate(messageId: string) {
    if (!session || running || busy || queuedRuns.length) return;
    const index = session.messages.findIndex(item => item.id === messageId);
    const message = session.messages.slice(0, index).filter(item => item.role === "user").at(-1);
    if (!message) return;
    if (message.attachments?.some(item=>item.mime.startsWith("image/"))&&!snapshot.models?.find(item=>item.id===currentModel)?.vision) { setError("当前模型不支持图片，请切换支持视觉的模型或移除图片。"); return; }
    void run(()=>regenerateMessage(session,message,currentModel,effort));
  }

  const composer = <ChatComposer selectedId={selectedId} session={session} snapshot={snapshot} options={options} currentModel={currentModel} effort={effort}
    runtime={runtime} editing={editing} empty={empty} busy={busy} running={running} activeRun={activeRun} queuedRuns={queuedRuns} latestRun={latestRun} approvals={approvals}
    input={input} onModelChange={setChoice} onRuntimeChange={changeRuntime} onCancelEdit={()=>{if(editing){setDrafts(values=>({...values,[draftKey]:editing.previousDraft}));setContexts(draftKey,editing.previousContexts);setEdit(null)}}}
    onRestore={()=>session&&void run(async()=>{await update(session,{archived:false});setArchived(false)})} onSubmit={send} onReload={reload}
    onCancelRun={id=>void chatApi.cancel(id).catch(cause=>setError(errorMessage(cause)))}
    onSteer={text=>activeRun&&void run(()=>steerMessage(activeRun.run_id,text,draftKey))}
    onRecover={id=>void run(async()=>{await chatApi.recover(id,crypto.randomUUID());await refreshChat()})}
    onChooseProject={chooseProject} onProject={path=>void run(async()=>{const current=session??await chatApi.create();replaceSession(await chatApi.selectProject(current.id,path));setSelectedId(current.id)})}
    onBranch={switchBranch} onInfo={()=>setPanel(true)} onCompact={compact} run={run}/>;

  return <>
    <ChatSidebar sidebarOpen={sidebarOpen} onToggleSidebar={onToggleSidebar} sessions={snapshot.sessions} approvals={snapshot.approvals} selectedId={selectedId} session={session}
      busy={busy} loading={loading} query={query} setQuery={setQuery} archived={archived} setArchived={setArchived}
      onCreate={create} onSelect={select} onRename={rename} onArchive={archive}
      onPin={(item,pinned)=>void run(async()=>{await update(item,{pinned})})}
      onRestore={item=>void run(async()=>{await update(item,{archived:false})})}
      onDelete={item=>{setDeleteError("");setDeleteTarget(item)}}
      onAddFolder={()=>void run(async()=>{const current=await chatApi.create();const value=await chatApi.chooseProject(current.id);replaceSession(value);setSelectedId(value.id);setArchived(false);setQuery("")})}
      onOpenProject={group=>void run(()=>chatApi.openProject(group.id))} onSaveGroup={saveGroup}
      onRemoveGroup={key=>void run(async()=>{for(const item of snapshot.sessions.filter(item=>folderKey(item)===key))replaceSession(await chatApi.group(item.id,""))})}/>
    <main className="chat-workspace" aria-label="对话工作区" data-empty={empty}>
      <ChatToolbar sidebarOpen={sidebarOpen} onToggleSidebar={onToggleSidebar} approvalCount={approvals.length} busy={busy} project={session?.project}
        onChooseProject={chooseProject} onOpenEditor={()=>session?.project?void run(()=>chatApi.openEditor(session.id,readEditor())):chooseProject()}
        onOpenProject={()=>session&&void run(()=>chatApi.openProject(session.id))}/>
      {panel && <ChatInfoPanel session={session} modelLabel={options.find(m=>m.id===currentModel)?.label} last={last}
        blocked={!session||busy||running||!!queuedRuns.length} onClose={()=>setPanel(false)} onCompact={compact}
        onBranch={switchBranch} onModelsSaved={async()=>{await reload();setChoice(null)}}/>}
      {empty ? <div className="chat-welcome"><div className="chat-welcome-content"><h2>想在 Chela 中构建什么？</h2><p>也可以不选择项目，直接开始</p>{composer}</div></div>
        : <><ChatTranscript session={session} selectedId={selectedId} running={running} activeRun={activeRun} pending={pending} approvals={approvals}
          busy={busy} queuedRuns={queuedRuns} editing={!!edit} hasModel={!!currentModel} history={history} latestHidden={latestHidden} viewLatest={viewLatest}
          openDiff={openDiff} onEdit={editMessage} onCopy={text=>void navigator.clipboard.writeText(text).catch(e=>setError(errorMessage(e)))} onRegenerate={regenerate}
          onApproval={(id,approved)=>void run(async()=>{await chatApi.resolveApproval(id,approved);await refreshChat()})}
          onAllowSession={id=>void run(async()=>{await chatApi.allowSessionApproval(id);await refreshChat()})}/ >{composer}</>}
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
    </main>{previewOpen&&<PreviewWorkspace session={selectedId||""} onClose={()=>setPreviewOpen(false)} onContext={item=>addContext(item,draftKey)} project={session?.project || ""}/ >}
  </>;
}
