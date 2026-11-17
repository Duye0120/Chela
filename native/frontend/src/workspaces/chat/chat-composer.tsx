import { useEffect, useRef, useState, type RefObject, type FormEvent } from "react";
import { useStore } from "zustand";
import { Archive, ArrowUp, Code2, Folder, Paperclip, Square, Upload, X } from "lucide-react";
import { Button } from "../../ui/button";
import { IconButton } from "../../ui/icon-button";
import { Textarea } from "../../ui/text-field";
import { ModelSelect, type ModelOption, type ModelValue } from "../../ui/model-select";
import type { ChatSession, ChatSnapshot, ChatRun, RuntimeSettings } from "../../data/chat";
import { chatDrafts, setDrafts, setContexts, emptyAttachments, type ChatEdit } from "../../state/chat-drafts";
import { chatState, setError } from "../../state/chat";
import { errorMessage } from "../../state/chat-actions";
import { setFavorite } from "../../state/preferences";
import { attachFile, readSuggestions, chooseReference, executeComposerCommand, type Suggestion } from "./composer-actions";
import { ContextChips } from "./context-chips";
import { ContextControl } from "./context-control";
import { ProjectControls } from "./project-controls";
import { ModelSettings } from "./model-settings";
import { ExtensionRequests } from "./extension-requests";

type Props = {
  selectedId: string | null; session?: ChatSession; snapshot: ChatSnapshot; options: ModelOption[];
  currentModel: string; effort: string; runtime: RuntimeSettings | null;
  editing: ChatEdit | null; empty: boolean; busy: boolean; running: boolean;
  activeRun?: ChatRun; queuedRuns: ChatRun[]; latestRun?: ChatRun; approvals: NonNullable<ChatSnapshot["approvals"]>;
  input: RefObject<HTMLTextAreaElement | null>; onModelChange: (value: ModelValue) => void;
  onRuntimeChange: (patch: Partial<RuntimeSettings>) => void; onCancelEdit: () => void; onRestore: () => void;
  onSubmit: (event: FormEvent) => void; onReload: () => Promise<void>; onCancelRun: (id: string) => void;
  onSteer: (text: string) => void; onRecover: (id: string) => void;
  onChooseProject: () => void; onProject: (path: string) => void; onBranch: (id: string) => void;
  onInfo: () => void; onCompact: () => void; run: (action: () => Promise<void>) => Promise<boolean>;
};

export function ChatComposer({selectedId,session,snapshot,options,currentModel,effort,runtime,editing,empty,busy,running,activeRun,queuedRuns,latestRun,approvals,input,
  onModelChange:setChoice,onRuntimeChange:changeRuntime,onCancelEdit,onRestore,onSubmit:send,onReload:reload,onCancelRun,onSteer,onRecover,
  onChooseProject:chooseProject,onProject,onBranch,onInfo,onCompact,run}: Props) {
  const draftKey = selectedId ?? "new";
  const draft = useStore(chatDrafts, state => state.drafts[draftKey] ?? "");
  const attachments = useStore(chatDrafts, state => state.contexts[draftKey] || emptyAttachments);
  const loading = useStore(chatState, state => state.loading), error = useStore(chatState, state => state.error);
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragging,setDragging]=useState(false),[suggestions,setSuggestions]=useState<Suggestion[]>([]),[suggestionIndex,setSuggestionIndex]=useState(0);
  const [suggestionsOpen,setSuggestionsOpen]=useState(true);
  const last=session?.messages.filter(message=>message.role==="assistant").at(-1);
  function attach(file: File) { const key=draftKey; return attachFile(file,key).then(added=>{if(added)input.current?.focus()}); }
  const mention = draft.match(/(?:^|\s)@([^\s@]*)$/), slash = draft.match(/^\/([^\s]*)$/);
  useEffect(() => {
    setSuggestionIndex(0);if(!mention)return;let active=true;const query=mention[1];
    const timer=setTimeout(()=>void readSuggestions(selectedId,query).then(items=>{if(active)setSuggestions(items)}).catch(cause=>{if(active)setError(errorMessage(cause))}),120);
    return()=>{active=false;clearTimeout(timer)};
  },[mention?.[1],selectedId]);
  const references = mention ? suggestions.filter(item=>`${item.name} ${item.detail||""}`.toLocaleLowerCase().includes(mention[1].toLocaleLowerCase())).slice(0,8) : [];
  const commands = slash ? [{id:"compact",name:"整理当前对话上下文"},{id:"clear",name:"清空当前输入与引用"},{id:"memory",name:"整理当前对话记忆"}].filter(item=>item.id.startsWith(slash[1])) : [];
  function chooseSuggestion(index:number) {
    if(mention) {const item=references[index];if(!item)return;const key=draftKey,text=draft.slice(0,draft.lastIndexOf("@"));void run(async()=>{if(await chooseReference(item,selectedId,key,text))setSuggestionsOpen(false)});}
    else if(slash) {const command=commands[index];if(!command)return;if(command.id==="clear"){setContexts(draftKey,[]);setDrafts(values=>({...values,[draftKey]:""}));}else if(session&&!running&&!busy)void run(()=>executeComposerCommand(command.id,session.id,draftKey));}
    input.current?.focus();
  }
  return <div className="chat-compose-area">
    {editing && <div className="chat-archived-notice" role="status"><span>编辑后会从这里建立新分支，原对话保留。</span><Button disabled={busy} onClick={onCancelEdit}>取消编辑</Button></div>}
    {session?.archived ? <div className="chat-archived-notice"><Archive size={16} /><span>这条对话已归档</span>
      <Button disabled={busy} onClick={onRestore}>恢复对话</Button>
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
          onFavoriteChange={setFavorite}/> :
          loading ? <span className="chat-model-missing">正在连接…</span> : <ModelSettings onSaved={reload}/>}

        {activeRun?<IconButton className="chat-send chat-stop" aria-label="停止生成" tooltip="停止生成" onClick={()=>onCancelRun(activeRun.run_id)}><Square size={14} fill="currentColor"/></IconButton>:<IconButton type="submit" className="chat-send" aria-label={editing ? "创建分支并发送" : "发送消息"} tooltip="发送消息（Enter）" disabled={attachments.some(item=>item.uploading)||(!draft.trim()&&!attachments.length)||busy||loading||!currentModel||(!!editing&&(running||!!queuedRuns.length))}><ArrowUp size={20}/></IconButton>}
      </div>
    </form>}
    {error && <div className="chat-error" role="alert"><span>{error}</span>
      <Button variant="ghost" disabled={busy} onClick={() => void reload()}>重新加载</Button>
      <IconButton aria-label="关闭错误提示" onClick={() => setError("")}><X size={14} /></IconButton>
    </div>}
    {activeRun&&draft.trim()&&<div className="chat-active-actions">{activeRun && !editing && <Button type="button" title={attachments.length?"附件可通过发送按钮排队发送":undefined} disabled={!draft.trim()||busy||!!attachments.length||!["running","waiting_approval"].includes(activeRun.state)} onClick={()=>onSteer(draft.trim())}>补充本轮</Button>}<Button disabled={busy||loading} onClick={()=>input.current?.form?.requestSubmit()}>排队发送</Button></div>}
    {queuedRuns.map(run => <div className="chat-archived-notice" key={run.run_id}><span>排队中：{run.text}</span><Button onClick={() => onCancelRun(run.run_id)}>取消</Button></div>)}
    {selectedId&&<ExtensionRequests key={selectedId} session={selectedId}/>}
    {latestRun && ["failed", "interrupted", "cancelled"].includes(latestRun.state) && <div className="chat-delete-error" role="status">{latestRun.terminal_reason}
      <Button disabled={busy || running || !!queuedRuns.length} onClick={() => onRecover(latestRun.run_id)}>从安全位置继续</Button>
    </div>}
    <div className="chat-composer-meta"><ProjectControls session={session} sessions={snapshot.sessions} busy={busy||running||!!queuedRuns.length} onChooseProject={chooseProject} onProject={onProject} onBranch={onBranch}/>
      <ContextControl tokens={last?.tokens} limit={last?.limit} model={options.find(item=>item.id===currentModel)?.label||"未配置模型"} busy={!session||busy||running||!!queuedRuns.length} onDetails={onInfo} onCompact={onCompact}/>

    </div>
  </div>;
}
