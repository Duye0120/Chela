import { useEffect, useState, useRef, type FormEvent } from "react";
import { terminalApi,type TerminalInfo,type ExecutionResult } from "./api";
import { Button } from "../../ui/button";
import { Textarea } from "../../ui/text-field";

export function ExecutionResults({session,onResumed}:{session:TerminalInfo;onResumed:(session:TerminalInfo)=>void}){
  const [results,setResults]=useState<ExecutionResult[]>([]),[error,setError]=useState(""),[prompt,setPrompt]=useState(""),[busy,setBusy]=useState(false);
  const located=useRef("");
  useEffect(()=>{let active=true;let timer=0;async function load(){try{const list=await terminalApi.results(session.id);if(active)setResults(list)}catch(e){if(active)setError(String(e))}finally{if(active&&!session.ended)timer=window.setTimeout(load,1500)}}void load();return()=>{active=false;clearTimeout(timer)}},[session.id,session.ended,session.generation]);
  useEffect(()=>{const ref=new URLSearchParams(location.hash.split("?")[1]||"").get("result");const target=ref&&document.getElementById("cli-result-"+encodeURIComponent(ref));if(target&&located.current!==ref){target.scrollIntoView({block:"nearest"});located.current=ref}},[results]);
  async function resume(e:FormEvent){e.preventDefault();setBusy(true);setError("");try{onResumed(await terminalApi.resume(session.id,prompt));setPrompt("")}catch(e){setError(String(e))}finally{setBusy(false)}}
  return <div className="execution-results"><small>{session.observable||results.length>0?"官方结构化结果":"尚未确认结构化结果"}{session.externalSessionId?` · 原会话 ${session.externalSessionId}`:""}</small>
    {results.map(result=><details key={result.ref} id={"cli-result-"+encodeURIComponent(result.ref)} open={new URLSearchParams(location.hash.split("?")[1]||"").get("result")===result.ref}><summary>{result.seen?"已读回复":"新回复"}</summary><p>{result.text}</p><Button disabled={result.seen} onClick={()=>void terminalApi.seenResult(session.id,result.ref,result.version).then(()=>setResults(previous=>previous.map(r=>r.ref===result.ref?{...r,seen:true}:r))).catch(e=>setError(String(e)))}>标为已读</Button></details>)}
    {session.ended&&session.resumable&&<form onSubmit={resume}><label>继续原会话<Textarea required value={prompt} onChange={e=>setPrompt(e.target.value)} rows={2} placeholder="输入接下来的要求"/></label><Button type="submit" disabled={busy}>继续这个 CLI 会话</Button></form>}
    {error&&<p role="alert">{error}</p>}
  </div>;
}
