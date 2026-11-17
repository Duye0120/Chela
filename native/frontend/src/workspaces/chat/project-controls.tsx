import { useEffect, useRef, useState } from "react";
import { Check, Folder, GitBranch, Plus, X } from "lucide-react";
import * as Menu from "../../ui/menu";
import { Button } from "../../ui/button";
import { chatApi, type ChatSession } from "./data";
import { previewApi, type Repository } from "../preview/api";
import { useRepository } from "../preview/repository-selection";

export function ProjectControls({session,sessions,busy,onProject,onChooseProject,onBranch}:{session?:ChatSession;sessions:ChatSession[];busy:boolean;onProject:(path:string)=>void;onChooseProject:()=>void;onBranch:(id:string)=>void}) {
 const [repos,setRepos]=useState<Repository[]>([]),[branches,setBranches]=useState<Awaited<ReturnType<typeof chatApi.branches>>>([]),[error,setError]=useState("");
 const branchCache=useRef<Record<string,Awaited<ReturnType<typeof chatApi.branches>>>>({});
 const [repo,setRepo]=useRepository(session?.id||"new");
 const projects=[...new Set(sessions.map(item=>item.project).filter((value):value is string=>Boolean(value)))];
 useEffect(()=>{let active=true;setRepos([]);if(session?.project)void previewApi.repositories(session.id,Number(localStorage.getItem("chela.git.depth")||2)).then(value=>{if(active)setRepos(value)}).catch(()=>{});return()=>{active=false}},[session?.id,session?.project]);
 const selected=repos.find(item=>item.path===repo),branch=selected?.branch||(repos.length===1?repos[0].branch:repos.length?`${repos.length} 个仓库`:"");
 return <><Menu.Root><Menu.Trigger asChild><Button variant="ghost" className="chat-project-trigger" disabled={busy} title={session?.project}><Folder size={14}/><span>{session?.group||session?.project?.split(/[\\/]/).pop()||"当前工作区"}</span></Button></Menu.Trigger><Menu.Content className="chat-project-menu" aria-label="选择工作区"><Menu.Item onSelect={()=>onProject("")}><X size={13}/>不选择项目（归入未分组）{!session?.project&&<Check className="ui-menu-check"/>}</Menu.Item>{projects.map(path=><Menu.Item key={path} onSelect={()=>onProject(path)} title={path}><Folder size={13}/>{path.split(/[\\/]/).pop()}{session?.project===path&&<Check className="ui-menu-check"/>}</Menu.Item>)}<Menu.Separator/><Menu.Item disabled={!window.chelaDesktop} onSelect={onChooseProject}><Plus size={13}/>选择本地其他目录…</Menu.Item></Menu.Content></Menu.Root>
 {session?.project&&<Menu.Root onOpenChange={open=>{if(!open)return;const key=`${session.id}:${session.branchId}`;setError("");const cached=branchCache.current[key];if(cached){setBranches(cached);return;}setBranches([]);void chatApi.branches(session.id).then(value=>{branchCache.current[key]=value;setBranches(value)}).catch(cause=>setError(String(cause)))}}><Menu.Trigger asChild><Button className="chat-branch-trigger" variant="ghost" disabled={busy}><GitBranch size={14}/>{branch||"对话分支"}</Button></Menu.Trigger><Menu.Content aria-label="仓库与对话分支">{repos.length>1&&<><Menu.Choices label="当前仓库" value={repo} onChange={setRepo} options={[{value:"all",label:"全部仓库"},...repos.map(item=>({value:item.path,label:`${item.name} · ${item.branch}`}))]}/><Menu.Separator/></>}<span className="chat-menu-caption">对话分支</span>{branches.map((item,index)=><Menu.Item key={item.id} onSelect={()=>onBranch(item.id)} disabled={item.current}>{item.parent?`分支 ${index}`:"原始分支"}{item.current&&<Check className="ui-menu-check"/>}</Menu.Item>)}{error&&<span role="alert">{error}</span>}</Menu.Content></Menu.Root>}</>;
}
