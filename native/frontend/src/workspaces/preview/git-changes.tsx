import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, FileDiff, MessageSquarePlus, RefreshCw, Undo2 } from "lucide-react";
import { IconButton } from "../../ui/icon-button";
import { Button } from "../../ui/button";
import { previewApi, type GitFile, type Repository, type Patch, type RestorePlan } from "./api";
import { readRepository, useRepository } from "./repository-selection";
import type { ChatAttachment } from "../chat/data";

export type DiffLine={old?:number;next?:number;prefix:string;text:string};
export function diffLines(text:string):DiffLine[]{
 let old=0,next=0,started=false;const result:DiffLine[]=[];
 for(const line of text.split("\n")){
  const range=line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
  if(range){old=Number(range[1]);next=Number(range[2]);started=true;result.push({prefix:"@",text:line});continue;}
  if(!started||!line||line[0]==="\\")continue;
  if(line[0]==="-")result.push({old:old++,prefix:"-",text:line.slice(1)});
  else if(line[0]==="+")result.push({next:next++,prefix:"+",text:line.slice(1)});
  else if(line[0]===" ")result.push({old:old++,next:next++,prefix:" ",text:line.slice(1)});
 }
 return result;
}
export function splitDiffLines(lines:DiffLine[]){
 const result:{before?:DiffLine;after?:DiffLine}[]=[];
 for(let i=0;i<lines.length;){const line=lines[i];if(line.prefix!=="-"&&line.prefix!=="+"){result.push({before:line,after:line});i++;continue;}const removed:DiffLine[]=[],added:DiffLine[]=[];while(i<lines.length&&["-","+"].includes(lines[i].prefix)){const item=lines[i++];(item.prefix==="-"?removed:added).push(item)};for(let n=0;n<Math.max(removed.length,added.length);n++)result.push({before:removed[n],after:added[n]})};return result;
}
function FileChange({session,repo,file,open,split,onContext,onRestore,busy}:{session:string;repo:Repository;file:GitFile;open:boolean;split:boolean;onContext:(item:ChatAttachment)=>void;onRestore:(repo:Repository,files:GitFile[])=>void;busy:boolean}){
 const [expanded,setExpanded]=useState(open),[patch,setPatch]=useState<Patch|null>(null),[error,setError]=useState(""),[retry,setRetry]=useState(0);
 useEffect(()=>{if(!expanded)return;let active=true;setError("");setPatch(null);void previewApi.diff(session,repo.path,file.path).then(value=>{if(active)setPatch(value)}).catch(cause=>{if(active)setError(String(cause))});return()=>{active=false}},[expanded,session,repo.path,file.path,file.status,retry]);
 const lines=patch?diffLines(patch.text):[],added=lines.filter(line=>line.prefix==="+").length,removed=lines.filter(line=>line.prefix==="-").length;
 function quote(){if(!patch)return;onContext({id:crypto.randomUUID(),name:`${repo.name} / ${file.path}`,mime:"text/plain",text:`仓库：${repo.path}\n文件：${file.path}\n当前未提交差异：\n${patch.text}`})}
 return <details className="preview-file" open={expanded} onToggle={event=>setExpanded(event.currentTarget.open)}><summary><ChevronDown size={12}/><b data-status={file.status.trim()} title={file.status==="??"?"未跟踪":file.status}>{file.status==="??"?"A":file.status.trim()}</b><span title={file.path}>{file.path}</span>{patch&&!patch.binary&&<small><em>+{added}</em><i>−{removed}</i></small>}<IconButton aria-label={`还原 ${file.path}`} title="还原此文件" disabled={busy} onClick={event=>{event.preventDefault();onRestore(repo,[file])}}><Undo2 size={12}/></IconButton><IconButton aria-label={`引用 ${file.path}`} title="引用当前文件差异" disabled={!patch||patch.binary} onClick={event=>{event.preventDefault();quote()}}><MessageSquarePlus size={13}/></IconButton></summary>
  {error?<p role="alert">{error}<Button onClick={()=>setRetry(value=>value+1)}>重试</Button></p>:!patch?<p role="status">正在读取差异…</p>:patch.binary?<p>二进制文件，不显示文本差异。</p>:!lines.length?<pre>{patch.text||"工作目录相对 HEAD 无文本差异，暂存区状态见文件列表。"}</pre>:<div className="preview-diff" data-split={split}>
    {split?splitDiffLines(lines).map((row,index)=><div key={index} className="preview-diff-split-row"><div data-change={row.before?.prefix}><small>{row.before?.old}</small><code>{row.before?.text||" "}</code></div><div data-change={row.after?.prefix}><small>{row.after?.next}</small><code>{row.after?.text||" "}</code></div></div>):<div>{lines.map((line,index)=><div key={index} data-change={line.prefix}><small>{line.old??line.next}</small><code><span>{line.prefix==="@"?"":line.prefix}</span>{line.text||" "}</code></div>)}</div>}
  </div>}
 </details>;
}
export function GitChanges({session,onContext,requestedPath}:{session:string;onContext:(item:ChatAttachment)=>void;requestedPath:string}){
 const [repos,setRepos]=useState<Repository[]>([]),[loading,setLoading]=useState(false),[error,setError]=useState(""),[split,setSplit]=useState(false),[revision,setRevision]=useState(0);
 const [selected,setSelected]=useRepository(session);
 const readDepth=()=>{const value=Number(localStorage.getItem("chela.git.depth")??2);return localStorage.getItem("chela.git.detect")==="false"?0:Number.isInteger(value)&&value>=0&&value<=4?value:2};
 const [depth,setDepth]=useState(readDepth);
 const [plan,setPlan]=useState<RestorePlan|null>(null),[restoring,setRestoring]=useState(false),[backup,setBackup]=useState(""),[notice,setNotice]=useState("");const dialog=useRef<HTMLDialogElement>(null),dialogId=useId();
 useEffect(()=>{if(plan)dialog.current?.showModal()},[plan]);
 async function prepareRestore(repo:Repository,files:GitFile[]){setRestoring(true);setError("");try{setPlan(await previewApi.restorePreview(session,repo.path,files.map(file=>file.path)))}catch(cause){setError(String(cause))}finally{setRestoring(false)}}
 async function restore(){if(!plan)return;setRestoring(true);setError("");try{const result=await previewApi.restore(session,plan);setBackup(result.backup);if(result.problem)setError(result.problem);else setNotice(`已还原 ${result.restored.length} 个文件`);dialog.current?.close();setPlan(null)}catch(cause){setError(String(cause))}finally{setRestoring(false);setRevision(value=>value+1)}}

 useEffect(()=>{const update=()=>setDepth(readDepth());window.addEventListener("chela-workspace-settings",update);return()=>window.removeEventListener("chela-workspace-settings",update)},[]);
 useEffect(()=>{if(!session){setRepos([]);return;}let active=true;setLoading(true);setError("");void previewApi.repositories(session,depth).then(value=>{if(active){setRepos(value);setSelected(value.some(repo=>repo.path===readRepository(session))?readRepository(session):"all")}}).catch(cause=>{if(active)setError(String(cause))}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[session,depth,revision]);
 const visible=selected==="all"?repos:repos.filter(repo=>repo.path===selected),count=visible.reduce((sum,repo)=>sum+repo.files.length,0);
 return <section className="preview-changes" aria-label="Git 变更"><div className="preview-repositories"><button type="button" aria-pressed={selected==="all"} onClick={()=>setSelected("all")}>全部 {repos.reduce((sum,repo)=>sum+repo.files.length,0)}</button>{repos.map(repo=><button key={repo.path} type="button" aria-pressed={selected===repo.path} title={repo.path} onClick={()=>setSelected(repo.path)}>{repo.name} {repo.files.length}</button>)}<IconButton aria-label="刷新变更" disabled={loading} onClick={()=>setRevision(value=>value+1)}><RefreshCw size={13}/></IconButton></div>
  <header><span>{selected==="all"?"全部仓库":visible[0]?.name} · {count} 改动</span><Button disabled={restoring||!count||(selected==="all"&&repos.length>1)} title={selected==="all"&&repos.length>1?"切入单仓后才能全部还原":"还原当前仓库的全部改动"} onClick={()=>visible.length===1&&void prepareRestore(visible[0],visible[0].files)}>全部还原</Button><div className="preview-diff-modes"><Button aria-pressed={!split} onClick={()=>setSplit(false)}>单栏</Button><Button aria-pressed={split} onClick={()=>setSplit(true)}>分栏</Button></div></header>
  {error&&<p className="preview-error" role="alert">{error}</p>}
  <div className="preview-file-list" key={`${session}:${revision}:${selected}:${requestedPath}`}>
    {loading?<p role="status">正在探测项目内的 Git 仓库…</p>:!session?<div className="preview-empty"><FileDiff size={24}/><p>选择对话及项目目录，查看真实文件变更。</p></div>:!count&&!error?<div className="preview-empty"><FileDiff size={24}/><p>{repos.length?"当前仓库没有未提交变更":"当前探测范围没有 Git 仓库"}</p><small>可在设置中调整探测深度。</small></div>:visible.map(repo=><section key={repo.path}>{visible.length>1&&<h3>{repo.name}<small>{repo.branch}</small></h3>}{repo.files.map((file,index)=><FileChange key={file.path} session={session} repo={repo} file={file} open={requestedPath?file.path===requestedPath:index<2} split={split} onContext={onContext} onRestore={(repo,files)=>void prepareRestore(repo,files)} busy={restoring}/>)}</section>)}
  </div>{(notice||backup)&&<div className="preview-restore-notice" role="status"><span>{notice||"还原备份已保留"}</span>{backup&&<Button disabled={!previewApi.native} title={backup} onClick={()=>void previewApi.openRestoreBackup(backup).catch(cause=>setError(String(cause)))}>打开备份</Button>}</div>}<dialog ref={dialog} className="preview-restore-dialog" aria-labelledby={`${dialogId}-title`} onCancel={event=>{if(restoring)event.preventDefault()}} onClose={()=>setPlan(null)}><h2 id={`${dialogId}-title`}>还原 {plan?.files.length} 个文件？</h2><p>将丢弃所选文件的暂存区和工作目录改动，未跟踪文件会被删除。执行前会保存本地备份。</p><strong>{plan?.repository.split(/[\\/]/).pop()}</strong><ul>{plan?.files.slice(0,12).map(file=><li key={file.path}>{file.path}</li>)}</ul>{(plan?.files.length||0)>12&&<p>以及其他 {(plan?.files.length||0)-12} 个文件</p>}{error&&<p role="alert">{error}</p>}<footer><Button autoFocus disabled={restoring} onClick={()=>dialog.current?.close()}>取消</Button><Button disabled={restoring} onClick={()=>void restore()}>{restoring?"正在还原…":"确认还原"}</Button></footer></dialog><footer>仅显示当前项目内的仓库 · {visible.length===1?visible[0].branch:"各仓库当前分支"}</footer>
 </section>;
}
