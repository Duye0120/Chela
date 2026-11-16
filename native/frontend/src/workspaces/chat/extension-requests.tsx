import { useEffect, useId, useState } from "react";
import { chatApi, type ExtensionRequest } from "./data";
import { Button } from "../../ui/button";
import { Input, Textarea } from "../../ui/text-field";
import { Select } from "../../ui/select";

function Request({item,onAnswered}:{item:ExtensionRequest;onAnswered:()=>void}){
  const id=useId(),[value,setValue]=useState(item.payload.prefill||""),[busy,setBusy]=useState(false),[error,setError]=useState("");
  async function answer(value:unknown,cancelled=false){setBusy(true);setError("");try{await chatApi.resolveExtensionUI(item,value,cancelled);onAnswered()}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}}
  return <section className="chat-approval extension-request" aria-label="扩展交互">
    <strong>{item.payload.title||"扩展消息"}</strong>{item.payload.message&&<p>{item.payload.message}</p>}
    {item.state==="notified"?<Button type="button" disabled={busy} onClick={()=>void answer(null)}>已查看</Button>:item.kind==="confirm"?<div><Button type="button" disabled={busy} onClick={()=>void answer(false)}>取消</Button><Button type="button" disabled={busy} onClick={()=>void answer(true)}>确认</Button></div>:<form aria-label={item.payload.title||"扩展回答"} onSubmit={e=>{e.preventDefault();void answer(value)}}>
      <label htmlFor={id}>{item.kind==="select"?"选择一项":"你的回答"}</label>
      {item.kind==="select"?<Select id={id} name="answer" value={value} onChange={e=>setValue(e.target.value)} required><option value="" disabled>请选择</option>{item.payload.options?.map(v=><option key={v} value={v}>{v}</option>)}</Select>:item.kind==="editor"?<Textarea id={id} name="answer" value={value} onChange={e=>setValue(e.target.value)} maxLength={65536}/>:<Input id={id} name="answer" value={value} onChange={e=>setValue(e.target.value)} placeholder={item.payload.placeholder} maxLength={65536}/>}
      <div><Button type="button" disabled={busy} onClick={()=>void answer(null,true)}>取消</Button><Button type="submit" disabled={busy}>提交回答</Button></div>
    </form>}{error&&<p role="alert">{error}</p>}
  </section>;
}
export function ExtensionRequests({session}:{session:string}){
  const [items,setItems]=useState<ExtensionRequest[]>([]),[version,setVersion]=useState(0),[error,setError]=useState("");
  useEffect(()=>{let active=true;const refresh=()=>void chatApi.extensionUI(session).then(next=>{if(active){setItems(next);setError("")}}).catch(e=>{if(active)setError(String(e))});refresh();const timer=setInterval(refresh,1000);return()=>{active=false;clearInterval(timer)}},[session,version]);
  return <>{error&&<p role="status">{error}</p>}{items.map(item=><Request key={item.id} item={item} onAnswered={()=>{setItems(values=>values.filter(v=>v.id!==item.id));setVersion(v=>v+1)}}/>)}</>;
}
