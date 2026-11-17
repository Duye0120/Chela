import { useEffect, useId, useRef, useState } from "react";
import { chatApi, type Capability } from "../workspaces/chat/data";
import { Button } from "../ui/button";
import { Input } from "../ui/text-field";
import "./capabilities.css";

export function CapabilitiesPanel({open=false,onClose,embedded=false,initialItem="",importing=false}:{open?:boolean;onClose?:()=>void;embedded?:boolean;initialItem?:string;importing?:boolean}){
  const dialog=useRef<HTMLDialogElement>(null),id=useId();
  const [items,setItems]=useState<Capability[]>([]),[source,setSource]=useState(""),[project,setProject]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
  useEffect(()=>{if(open||embedded){if(!embedded)dialog.current?.showModal();void chatApi.capabilities().then(setItems).catch(e=>setError(String(e)))}else dialog.current?.close()},[open,embedded]);
  async function act(action:()=>Promise<unknown>){setBusy(true);setError("");try{await action();setItems(await chatApi.capabilities())}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}}
  const content=<>
    {!embedded&&<header><h2 id={`${id}-title`}>应用与扩展</h2><Button type="button" autoFocus onClick={()=>dialog.current?.close()}>关闭</Button></header>}
    <p>从本机安装 Pi 资源包。安装后默认停用；启停与重载需等正在运行的会话结束。</p>
    <details open={!embedded||importing}><summary>导入技能或扩展</summary><form aria-label="安装扩展" onSubmit={e=>{e.preventDefault();void act(async()=>{await chatApi.installCapability(source,project);setSource("")})}}>
      <label htmlFor={`${id}-source`}>扩展包目录（必填）</label><Input id={`${id}-source`} name="source" value={source} onChange={e=>setSource(e.target.value)} required spellCheck={false}/>
      <label htmlFor={`${id}-project`}>仅在此项目使用（可选，留空为用户范围）</label><Input id={`${id}-project`} name="project" value={project} onChange={e=>setProject(e.target.value)} spellCheck={false}/>
      <Button type="submit" disabled={busy}>安装到 Chela</Button>
    </form></details>
    {error&&<p role="alert">{error}</p>}
    {!items.length&&<p>尚未安装扩展。</p>}
    {items.filter(item=>!initialItem||item.id===initialItem).map(item=><article key={item.id}>
      <h3>{item.name} <small>{item.version}</small></h3>
      <p>{item.compatibility} 级 · {item.enabled?"已启用":"已停用"} · {{loaded:"已加载",ready:"待下轮加载",failed:"加载失败",disabled:"未加载",unsupported:"需要适配"}[item.health]||item.health}</p>
      <p>{item.trust==="trusted-native"?"原生扩展：可直接访问本机文件、网络和进程，权限不受 Go 工具网关限制。":"文档资源：按需读取说明；不会因说明内容增加工具权限。"}</p>
      <p>作用域：{item.project||"当前用户"}</p>
      {item.problem&&<p role="status">{item.problem}</p>}
      <details><summary>来源与能力</summary><dl><dt>来源</dt><dd>{item.source}</dd><dt>内容校验</dt><dd>{item.hash}</dd><dt>声明权限</dt><dd>{item.permissions?.join("、")||"未声明"}</dd><dt>依赖</dt><dd>{item.requires?.join("、")||"无"}</dd><dt>资源</dt><dd>{Object.values(item.resources).flat().filter(Boolean).join("、")}</dd></dl></details>
      <div className="capabilities-actions">
        <Button type="button" disabled={busy||item.health==="unsupported"} onClick={()=>void act(()=>chatApi.changeCapability(item.id,item.enabled?"disable":"enable"))}>{item.enabled?"停用":item.trust==="trusted-native"?"信任并启用":"启用"}</Button>
        {item.enabled&&<Button type="button" disabled={busy} onClick={()=>void act(()=>chatApi.changeCapability(item.id,"reload"))}>重新加载</Button>}
        {!item.enabled&&<Button type="button" disabled={busy} onClick={()=>void act(()=>chatApi.changeCapability(item.id,"remove"))}>移除登记</Button>}
      </div>
    </article>)}
  </>;
  return embedded?<section className="capabilities-content">{content}</section>:<dialog ref={dialog} className="capabilities-panel" aria-labelledby={`${id}-title`} onClose={onClose}>{content}</dialog>;
}
