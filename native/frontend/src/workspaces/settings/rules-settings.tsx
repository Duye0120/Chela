import { useEffect, useId, useState } from "react";
import { chatApi } from "../../data/chat";
import { Button } from "../../ui/button";
import { Textarea } from "../../ui/text-field";
import { serviceCall } from "../../platform/bridge";
import { SettingsDialog } from "./settings-dialog";

export function RulesSettings(){
 const [editing,setEditing]=useState(false);
 const [rules,setRules]=useState<Awaited<ReturnType<typeof chatApi.globalRules>>|null>(null),[text,setText]=useState(""),[error,setError]=useState(""),[status,setStatus]=useState(""),[busy,setBusy]=useState(false),id=useId();
 async function load(){const value=await chatApi.globalRules();setRules(value);setText(value.text)}
 useEffect(()=>{void load().catch(cause=>setError(String(cause)))},[]);
 async function act(action:()=>Promise<void>){setBusy(true);setError("");try{await action()}catch(cause){setError(String(cause))}finally{setBusy(false)}}
 return <><div className="settings-row"><div><strong>全局规则（AGENTS.md）</strong><p>{rules?.path||"正在读取规则路径…"} · 所有工作区生效</p></div><div className="settings-row-control"><Button size="small" variant="ghost" className="settings-secondary-entry" onClick={()=>setEditing(true)}>在此编辑</Button><Button size="small" disabled={busy||!rules||!window.chelaDesktop} onClick={()=>void act(async()=>{await serviceCall("Chat.OpenGlobalRules");setStatus("已用本机编辑器打开")})}>用编辑器打开</Button></div></div>{editing&&<SettingsDialog title="编辑全局规则" busy={busy} onClose={()=>setEditing(false)}><form className="settings-form-card" aria-label="编辑全局规则" onSubmit={event=>{event.preventDefault();if(rules)void act(async()=>{const value=await chatApi.saveGlobalRules(text,rules.hash);setRules(value);setText(value.text);setStatus("规则已保存，下次运行生效")})}}><label htmlFor={`${id}-rules`}>规则正文（UTF-8，最多 64 KiB）</label><Textarea id={`${id}-rules`} name="rules" rows={8} value={text} disabled={!rules||busy} onChange={event=>setText(event.target.value)}/>{error&&<p className="settings-error" role="alert">{error}</p>}{status&&<p role="status">{status}</p>}<footer><Button type="submit" disabled={busy||!rules}>保存规则</Button><Button disabled={busy} onClick={()=>void act(load)}>重新读取</Button></footer></form></SettingsDialog>}{!editing&&error&&<p className="settings-inline-status settings-error" role="alert">{error}</p>}{!editing&&status&&<p className="settings-inline-status" role="status">{status}</p>}</>;
}
