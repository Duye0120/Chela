import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { workApi, type Delivery } from "../data/work";
import { Button } from "../ui/button";
import { IconButton } from "../ui/icon-button";
import { CompanionPanel } from "./companion-panel";
import "./notifications.css";

export function Notifications(){
  const dialog=useRef<HTMLDialogElement>(null),[items,setItems]=useState<Delivery[]>([]),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  const [settings,setSettings]=useState(false);
  useEffect(()=>{const open=()=>{if(location.hash==="#notifications"){setSettings(true);if(!dialog.current?.open)dialog.current?.showModal()}};open();window.addEventListener("hashchange",open);return()=>window.removeEventListener("hashchange",open)},[]);
  useEffect(()=>{let active=true;async function refresh(){try{const next=await workApi.notifications();if(active){setItems(next);setError("")}}catch(e){if(active)setError(e instanceof Error?e.message:String(e))}}void refresh();const timer=setInterval(()=>void refresh(),5000);return()=>{active=false;clearInterval(timer)}},[]);
  async function respond(item:Delivery,action:string){setBusy(true);setError("");try{await workApi.respondNotification(item.id,action,crypto.randomUUID());setItems(await workApi.notifications())}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}}
  const unread=items.filter(i=>["pending","deferred","presented"].includes(i.status)).length;
  return <><IconButton aria-label={`提醒与进展，${unread} 条未读`} title="提醒与进展" onClick={()=>dialog.current?.showModal()}><Bell size={15}/>{unread>0&&<span>{unread}</span>}</IconButton>
    <dialog ref={dialog} className="notifications" aria-label="提醒与进展"><header><h2>提醒与进展</h2><Button onClick={()=>dialog.current?.close()}>关闭</Button></header>
      <Button type="button" aria-expanded={settings} onClick={()=>setSettings(!settings)}>关注与陪伴设置</Button>{settings&&<CompanionPanel/>}
      {error&&<p role="alert">{error}</p>}{!items.length&&<p>暂时没有提醒。</p>}
      {items.map(item=><article key={item.id}><p>{item.text}</p><small>{new Date(item.created).toLocaleString()} · {{pending:"未读",deferred:"等待合适时机",presented:"未读",seen:"已读",dismissed:"已收起"}[item.status]||item.status}</small><div>
        {item.actions.map(action=><Button key={action.action_id} disabled={busy} onClick={()=>{const route=action.route;if(route.type==="attention"){setSettings(true)}else{location.hash=route.type==="terminal"?`terminal/session/${encodeURIComponent(route.terminal_session_id||"")}${route.result_ref?`?result=${encodeURIComponent(route.result_ref)}`:""}`:route.type==="chat"?`chat/${encodeURIComponent(route.session_id||"")}`:route.type==="calendar"?"calendar":`board/${encodeURIComponent(route.item_id||"")}`;dialog.current?.close()}void respond(item,"seen")}}>{action.label}</Button>)}
        {!["seen","dismissed"].includes(item.status)&&<><Button disabled={busy} onClick={()=>void respond(item,"dismissed")}>收起</Button>{item.purpose==="reminder"&&<Button disabled={busy} onClick={()=>void respond(item,"snooze")}>10 分钟后提醒</Button>}</>}
      </div></article>)}
    </dialog></>;
}
