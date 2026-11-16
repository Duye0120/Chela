import { useEffect, useState } from "react";
import { workApi, type Reminder, type WorkTask } from "../data/work";
import { Button } from "./button";
import { Input } from "./text-field";
import { Select } from "./select";

export function TaskReminders({task}:{task:WorkTask}){
  const [items,setItems]=useState<Reminder[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const [draft,setDraft]=useState<Reminder>(()=>({id:crypto.randomUUID(),itemId:task.id,revision:0,kind:"once",local:"",timezone:task.timezone||Intl.DateTimeFormat().resolvedOptions().timeZone,enabled:true,catchUp:"within_grace",next:""}));
  useEffect(()=>{let active=true;workApi.reminders(task.id).then(items=>{if(active)setItems(items)}).catch(e=>{if(active)setError(String(e))});return()=>{active=false}},[task.id]);
  async function save(r:Reminder){setBusy(true);setError("");try{await workApi.saveReminder(r);setItems(await workApi.reminders(task.id));setDraft(previous=>({...previous,id:crypto.randomUUID(),revision:0,local:""}))}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}}
  return <details><summary>提醒 · {items.filter(r=>r.enabled&&r.next).length}</summary>
    {items.map(r=><p key={r.id}>{r.local.replace("T"," ")} · {r.timezone} · {{once:"一次",daily:"每天",weekly:"每周"}[r.kind]} · {r.enabled?(r.next?"已安排":"已触发"):"已暂停"} {r.enabled&&<Button disabled={busy} onClick={()=>void save({...r,enabled:false})}>暂停</Button>}</p>)}
    <label>提醒时间<Input type="datetime-local" value={draft.local} onChange={e=>setDraft({...draft,local:e.target.value})}/></label>
    <label>提醒时区<Input value={draft.timezone} onChange={e=>setDraft({...draft,timezone:e.target.value})}/></label>
    <label>重复<Select value={draft.kind} onChange={e=>setDraft({...draft,kind:e.target.value as Reminder["kind"]})}><option value="once">仅一次</option><option value="daily">每天</option><option value="weekly">每周同一天</option></Select></label>
    <label>错过时<Select value={draft.catchUp} onChange={e=>setDraft({...draft,catchUp:e.target.value as Reminder["catchUp"]})}><option value="within_grace">15 分钟内补提醒</option><option value="current_day_once">当天补一次</option><option value="skip">跳过</option></Select></label>
    <Button disabled={busy||!draft.local||!draft.timezone||task.status==="已完成"} onClick={()=>void save(draft)}>添加提醒</Button>
    <p>提醒独立于排期和截止时间。Chela 退出期间不会触发；重新打开后按所选规则处理。</p>
    {error&&<p role="alert">{error}</p>}
  </details>
}
