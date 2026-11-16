import { useRef, useState } from "react";
import { Button } from "../../ui/button";
import { Input, Textarea } from "../../ui/text-field";
import { chatApi, type ChatSession, type MemoryItem } from "./data";

const scopes = {assistant:"所有会话",project:"当前项目",session:"当前会话"};
const kinds = {preference:"偏好",fact:"事实主张",decision:"决定",procedure:"操作经验",episode:"经历"};
export function MemoryPanel({session}:{session:ChatSession}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const [items,setItems]=useState<MemoryItem[]>([]),[query,setQuery]=useState("");
  const [edit,setEdit]=useState<MemoryItem|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const [notice,setNotice]=useState(""),[forget,setForget]=useState("");
  const [jobs,setJobs]=useState<Awaited<ReturnType<typeof chatApi.memoryJobs>>>([]);
  const [index,setIndex]=useState<Awaited<ReturnType<typeof chatApi.memoryIndexStatus>>|null>(null);
  const [legacy,setLegacy]=useState<Awaited<ReturnType<typeof chatApi.legacyMemories>>>([]);
  async function refresh(){const [items,jobs,index,legacy]=await Promise.all([chatApi.memories(session.id,query),chatApi.memoryJobs(session.id),chatApi.memoryIndexStatus(),chatApi.legacyMemories()]);setItems(items);setJobs(jobs);setIndex(index);setLegacy(legacy)}
  async function act(action:()=>Promise<void>){setBusy(true);setError("");try{await action()}catch(e){setError(e instanceof Error?e.message:"操作失败")}finally{setBusy(false)}}
  function open(){dialog.current?.showModal();setNotice("");void act(refresh)}
  return <><Button onClick={open}>记忆</Button><dialog ref={dialog} className="chat-delete-dialog chat-settings chat-memory" aria-label="适用记忆">
    <header><h2>记忆</h2><Button onClick={()=>dialog.current?.close()}>关闭</Button></header>
    <p>这里只显示当前会话可使用的记忆。项目记忆仅用于同一项目，待确认内容不会提供给模型。</p>
    <div><Button disabled={busy} onClick={()=>void act(async()=>{await chatApi.consolidateMemories(session.id);await refresh();setNotice("已加入整理队列，前台对话结束后执行")})}>整理记忆</Button><Button disabled={busy} onClick={()=>void act(refresh)}>刷新状态</Button></div>
    {jobs[0]&&<p role="status">最近整理：{({queued:"排队中",running:"进行中",succeeded:"已完成",failed:"失败，可重新整理",cancelled:"已暂停，可重新整理"} as Record<string,string>)[jobs[0].state]}{jobs[0].error&&` · ${jobs[0].error}`}</p>}
    {index&&<p role="status">检索：{index.model?`${index.model} · ${index.state==="building"?"重建中":"已启用"} · 待索引 ${index.pending} 条`:"中文词法搜索"}{index.error&&` · ${index.error}`}</p>}
    <search><form aria-label="查询记忆" onSubmit={event=>{event.preventDefault();void act(refresh)}}><label>搜索<Input autoFocus type="search" name="query" value={query} onChange={event=>setQuery(event.target.value)}/></label><Button type="submit" disabled={busy}>搜索</Button></form></search>
    {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
    <div className="chat-memory-list">{items.map(item=><article key={item.id}><strong>{item.slot}</strong><small>{scopes[item.scope.type]} · {item.status==="candidate"?"待确认":item.status==="disputed"?"存在冲突":"已生效"}</small><p>{item.content}</p>
      <details><summary>来源与版本</summary><p>{item.source_class==="explicit_user"?"用户确认":"模型推断"} · 版本 {item.revision} · {new Date(item.recorded_at).toLocaleString()}</p><p>来源记录：{item.source_id}</p>{item.valid_until&&<p>有效至 {new Date(item.valid_until).toLocaleString()}</p>}</details>
      <Button disabled={busy} onClick={()=>{setEdit(item);setForget("")}}>{item.status==="candidate"?"确认或修改":"纠正"}</Button>
      {forget!==item.id?<Button disabled={busy} onClick={()=>setForget(item.id)}>遗忘</Button>:<div role="group" aria-label="确认遗忘"><p>从记忆中移除并阻止旧来源再次提取；原聊天保留。当前回复将停止并在下轮重建上下文。</p><Button onClick={()=>setForget("")}>保留</Button><Button disabled={busy} onClick={()=>void act(async()=>{await chatApi.forgetMemory(session.id,item.id,item.revision);setForget("");if(edit?.id===item.id)setEdit(null);await refresh();setNotice("已遗忘。已发送给模型的历史请求无法撤回。")})}>确认遗忘</Button></div>}
    </article>)}</div>{!items.length&&!busy&&<p>暂无匹配的记忆</p>}
    <form key={edit?`${edit.id}:${edit.revision}`:"new"} aria-label={edit?"纠正记忆":"添加记忆"} onSubmit={event=>{
      event.preventDefault();const form=event.currentTarget,data=new FormData(form);
      void act(async()=>{await chatApi.saveMemory({command_id:crypto.randomUUID(),session_id:session.id,id:edit?.id||"",subject:edit?.subject||"user",slot:edit?.slot||String(data.get("slot")).trim(),kind:edit?.kind||String(data.get("kind")),scope_type:edit?.scope.type||String(data.get("scope")),content:String(data.get("content")).trim(),expected_revision:edit?.revision||0,expected_slot_revision:edit?.slot_revision||0,valid_until:edit?.valid_until||""});setEdit(null);form.reset();await refresh();setNotice("记忆已保存")})
    }}><h3>{edit?"纠正记忆":"添加记忆"}</h3>
      <label>主题（必填）<Input name="slot" required maxLength={200} defaultValue={edit?.slot||""} readOnly={!!edit} placeholder="例如：称呼、部署工具"/></label>
      <label>类型<select name="kind" className="ui-field" defaultValue={edit?.kind||"fact"} disabled={!!edit}>{Object.entries(kinds).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
      <fieldset><legend>适用范围</legend>{Object.entries(scopes).filter(([key])=>key!=="project"||session.project).map(([value,label])=><label key={value}><input type="radio" name="scope" value={value} defaultChecked={value===(edit?.scope.type||(session.project?"project":"session"))} disabled={!!edit}/> {label}</label>)}</fieldset>
      <label>记忆内容（必填）<Textarea name="content" required maxLength={2000} rows={3} defaultValue={edit?.content||""}/></label>
      <footer>{edit&&<Button onClick={()=>setEdit(null)}>取消修改</Button>}<Button type="submit" variant="primary" disabled={busy}>保存记忆</Button></footer>
    </form>
    {!!legacy.length&&<section aria-label="旧记忆待分类"><h3>旧记忆待分类</h3><p>这些旧记录尚未进入模型上下文。请核对内容并指定范围；一次显示最多 50 条，处理后继续刷新。原文件与旧向量保留在本机。</p>
      {legacy.map(item=><details key={item.id}><summary>{item.state==="sensitive"?"旧记录包含疑似凭据，未复制正文":item.content.split("\n")[0].slice(0,90)}</summary>
        <p>旧来源：{item.sources.map(source=>`${source.system} / ${source.id}`).join("、")}</p>
        {item.state==="pending"&&<form aria-label="确认旧记忆范围" onSubmit={event=>{event.preventDefault();const data=new FormData(event.currentTarget);void act(async()=>{await chatApi.classifyLegacyMemory({id:item.id,session:session.id,scope:String(data.get("scope")),slot:String(data.get("slot")),kind:String(data.get("kind")),content:String(data.get("content"))});await refresh();setNotice("已按所选范围确认旧记忆")})}}>
          <label>记忆内容（必填，最多 2000 字）<Textarea name="content" required maxLength={2000} rows={3} defaultValue={item.content}/></label>
          <label>主题（必填）<Input name="slot" required maxLength={200}/></label>
          <label>类型<select name="kind" className="ui-field" defaultValue="fact">{Object.entries(kinds).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
          <fieldset><legend>适用范围</legend>{Object.entries(scopes).filter(([key])=>key!=="project"||session.project).map(([value,label])=><label key={value}><input type="radio" name="scope" value={value} defaultChecked={value===(session.project?"project":"session")}/> {label}</label>)}</fieldset>
          <Button type="submit" disabled={busy}>确认导入</Button>
        </form>}
        <Button type="button" disabled={busy} onClick={()=>void act(async()=>{await chatApi.classifyLegacyMemory({id:item.id,dismiss:true});await refresh()})}>不导入此记录</Button>
      </details>)}
    </section>}
  </dialog></>
}
