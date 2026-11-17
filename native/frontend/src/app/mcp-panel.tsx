import { useEffect, useId, useRef, useState } from "react";
import { chatApi, type MCPConfig, type MCPStatus } from "../workspaces/chat/data";
import { Button } from "../ui/button";
import { Input, Textarea } from "../ui/text-field";
import { Select } from "../ui/select";

const empty:MCPConfig={id:"",revision:0,project:"",description:"",autoApprove:false};
export function MCPPanel({open=false,onClose,embedded=false,initialConfig}:{open?:boolean;onClose?:()=>void;embedded?:boolean;initialConfig?:MCPConfig}){
  const dialog=useRef<HTMLDialogElement>(null),id=useId();
  const [items,setItems]=useState<MCPStatus[]>([]),[config,setConfig]=useState<MCPConfig>(initialConfig||empty),[kind,setKind]=useState(initialConfig?.command?"stdio":"http"),[args,setArgs]=useState(initialConfig?.args?.join("\n")||""),[credentials,setCredentials]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
  useEffect(()=>{if(open||embedded){if(!embedded)dialog.current?.showModal();void chatApi.mcpServers().then(setItems).catch(e=>setError(String(e)))}else dialog.current?.close()},[open,embedded]);
  async function act(fn:()=>Promise<unknown>){setBusy(true);setError("");try{await fn();setItems(await chatApi.mcpServers())}catch(e){setError(e instanceof Error?e.message:String(e));try{setItems(await chatApi.mcpServers())}catch{}}finally{setBusy(false)}}
  function edit(value:MCPConfig){setConfig(value);setKind(value.command?"stdio":"http");setArgs(value.args?.join("\n")||"");setCredentials("")}
  const field=(key:"id"|"description"|"project"|"cwd"|"command"|"url",label:string,required=false)=><><label htmlFor={`${id}-${key}`}>{label}</label><Input id={`${id}-${key}`} name={key} type={key==="url"?"url":"text"} value={config[key]||""} onChange={e=>setConfig({...config,[key]:e.target.value})} required={required} readOnly={key==="id"&&config.revision>0} spellCheck={false}/></>;
  const content=<>
    {!embedded&&<header><h2 id={`${id}-title`}>MCP 连接</h2><Button type="button" autoFocus onClick={()=>dialog.current?.close()}>关闭</Button></header>}
    <p>连接由 Chela 统一管理。服务自身的系统权限由该服务决定；凭据保存在本机加密存储中。</p>
    <details open={!embedded||Boolean(initialConfig)||config.revision>0}><summary>添加或编辑连接</summary><form aria-label="MCP 连接配置" onSubmit={e=>{e.preventDefault();void act(async()=>{
      const secret=credentials.trim()?JSON.parse(credentials):undefined;
      if(secret&&(!Object.values(secret).every(v=>typeof v==="string")||Array.isArray(secret)))throw Error("凭据需为名称到文本值的 JSON 对象");
      await chatApi.saveMCP({...config,url:kind==="http"?config.url:undefined,command:kind==="stdio"?config.command:undefined,args:kind==="stdio"?args.split("\n").filter(Boolean):undefined,...(kind==="http"?{headers:secret}:{env:secret})});edit(empty);
    })}}>
      <h3>{config.revision?"编辑连接":"添加连接"}</h3>
      {field("id","连接 ID（必填，小写字母、数字及下划线）",true)}
      {field("description","用途说明（可选）")}
      <label htmlFor={`${id}-kind`}>连接方式</label><Select id={`${id}-kind`} name="kind" value={kind} onChange={e=>setKind(e.target.value)}><option value="http">HTTP</option><option value="stdio">本机命令（stdio）</option></Select>
      {kind==="http"?field("url","服务地址（必填）",true):<>{field("command","程序或命令（必填）",true)}<label htmlFor={`${id}-args`}>参数（可选，每行一项）</label><Textarea id={`${id}-args`} name="args" value={args} onChange={e=>setArgs(e.target.value)} spellCheck={false}/>{field("cwd","工作目录（可选）")}</>}
      {field("project","仅在此项目使用（可选）")}
      <details><summary>{kind==="http"?"请求头与凭据":"环境变量与凭据"}（可选）</summary><label htmlFor={`${id}-credentials`}>JSON 对象；留空保留原值，填 {'{}'} 清空</label><Textarea id={`${id}-credentials`} name="credentials" value={credentials} onChange={e=>setCredentials(e.target.value)} spellCheck={false} autoComplete="off"/></details>
      <span className="companion-check"><input id={`${id}-approve`} name="autoApprove" type="checkbox" checked={config.autoApprove} onChange={e=>setConfig({...config,autoApprove:e.target.checked})}/><label htmlFor={`${id}-approve`}>信任此服务，允许其工具无需逐次确认</label></span>
      <div className="capabilities-actions"><Button type="submit" disabled={busy}>保存连接</Button>{config.revision>0&&<Button type="button" onClick={()=>edit(empty)}>取消编辑</Button>}</div>
    </form></details>
    {error&&<p role="alert">{error}</p>}
    {items.filter(item=>!initialConfig?.id||item.config.id===initialConfig.id).map(item=><article key={item.config.id}><h3>{item.config.description||item.config.id}</h3><p>{item.config.id} · {{connected:"已连接",connecting:"连接中",disabled:"已停用",failed:"连接失败"}[item.health]||item.health} · {item.tools} 项能力</p><p>范围：{item.config.project||"当前用户"}{item.credentials?" · 已保存凭据":""}</p>{item.problem&&<p role="status">{item.problem}</p>}<div className="capabilities-actions">
      <Button type="button" disabled={busy} onClick={()=>void act(()=>chatApi.changeMCP(item.config.id,item.enabled?"disable":"enable"))}>{item.enabled?"断开并停用":"连接并启用"}</Button>
      {item.enabled&&<Button type="button" disabled={busy} onClick={()=>void act(()=>chatApi.changeMCP(item.config.id,"reconnect"))}>重新连接</Button>}
      <Button type="button" disabled={busy} onClick={()=>edit(item.config)}>编辑</Button>
      {!item.enabled&&<Button type="button" disabled={busy} onClick={()=>void act(()=>chatApi.changeMCP(item.config.id,"remove"))}>移除连接</Button>}
    </div></article>)}
  </>;
  return embedded?<section className="capabilities-content">{content}</section>:<dialog ref={dialog} className="capabilities-panel" aria-labelledby={`${id}-title`} onClose={onClose}>{content}</dialog>;
}
