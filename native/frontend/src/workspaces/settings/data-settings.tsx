import { useEffect, useState } from "react";
import { serviceCall } from "../../platform/bridge";
import { Button } from "../../ui/button";
import { SectionHeading } from "./settings-controls";
type Info={version:string;revision:string;platform:string;arch:string;dataDirectory:string;logsDirectory:string};
export function DataSettings({about=false}:{about?:boolean}){
 const [info,setInfo]=useState<Info|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[status,setStatus]=useState(""),[release,setRelease]=useState<{latest:string;status:string;url:string}|null>(null);
 useEffect(()=>{void serviceCall<Info>("Chat.AppInformation").then(setInfo).catch(cause=>setError(String(cause)))},[]);
 async function act(action:()=>Promise<void>){setBusy(true);setError("");try{await action()}catch(cause){setError(String(cause))}finally{setBusy(false)}}
 async function health(){const report=await serviceCall<Record<string,unknown>>("Chat.Diagnostics");setStatus(report.databaseHealthy&&!report.runtimeDegraded?"健康检查通过 · 数据完整，运行时正常":"健康检查发现异常，请导出诊断包核对")}
 async function download(){const report=await serviceCall("Chat.Diagnostics"),blob=new Blob([JSON.stringify(report,null,2)],{type:"application/json"}),url=URL.createObjectURL(blob),link=document.createElement("a");link.href=url;link.download=`Chela-diagnostics-${new Date().toISOString().slice(0,10)}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setStatus("诊断包已导出，不含密钥、对话正文或规则正文")}
 return <>
   {!about && <SectionHeading title="诊断与数据" description="脱敏诊断包与本地日志"><Button size="small" disabled={busy} onClick={() => void act(health)}>健康检查</Button></SectionHeading>}
   <div className="settings-card">{about ? <div className="settings-row"><div><strong>Chela Desktop</strong><p>v{info?.version || "…"} · {release ? release.status === "no_release" ? "当前使用源码构建" : release.status === "current" ? "已是当前发行版本" : `发行版本：${release.latest}` : `${info?.platform || ""} / ${info?.arch || ""}`}</p></div><div className="settings-row-control"><a className="ui-button" data-size="small" href="https://github.com/Duye0120/Chela/releases" target="_blank" rel="noreferrer" onClick={event => { if (window.chelaDesktop) { event.preventDefault(); void act(async () => { await serviceCall("Chat.OpenReleaseNotes"); }); } }}>更新日志</a><Button size="small" variant="primary" disabled={busy} onClick={() => void act(async () => setRelease(await serviceCall("Chat.CheckUpdates")))}>检查更新</Button></div></div> : <>
     <div className="settings-row"><div><strong>本地数据目录</strong><p>{info?.dataDirectory || "正在读取…"}</p></div><div className="settings-row-control"><Button size="small" disabled={busy || !window.chelaDesktop} onClick={() => void act(async () => { await serviceCall("Chat.OpenDataLocation", "data"); })}>打开</Button></div></div>
     <div className="settings-row"><div><strong>日志与诊断包</strong><p>不含 API Key 与对话正文</p></div><div className="settings-row-control"><Button size="small" disabled={busy || !window.chelaDesktop} onClick={() => void act(async () => { await serviceCall("Chat.OpenDataLocation", "logs"); })}>打开日志</Button><Button size="small" variant="primary" disabled={busy} onClick={() => void act(download)}>导出诊断包</Button></div></div>
   </>}{status && <p className="settings-inline-status" role="status">{status}</p>}{error && <p className="settings-error settings-inline-status" role="alert">{error}</p>}</div>
 </>;
}
