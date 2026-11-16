import { resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
export const toolContext=new AsyncLocalStorage();
export function invocation(id){const parent=toolContext.getStore();return parent?{tool_call_id:`${parent.id}:${++parent.children}`,parent_tool_call_id:parent.id}:{tool_call_id:id}}

export function capabilityResources(installed,before,after) {
  const owner = path => installed.find(m => resolve(path).toLowerCase().startsWith(resolve(m.root).toLowerCase()+sep));
  const problems = new Map();
  const fail = (path, problem) => { const m=owner(path); if(m) problems.set(m.id,problem); };
  const paths = kind => installed.flatMap(m => (m.resources[kind]||[]).map(p=>resolve(m.root,p)));
  return {
    owner, problems,
    options: {
      additionalExtensionPaths: paths("extensions"), additionalSkillPaths: paths("skills"), additionalPromptTemplatePaths: paths("prompts"),
      extensionsOverride(result) {
        for(const error of result.errors) fail(error.path,error.error);
        const names=new Map();
        for(const extension of result.extensions){
          const m=owner(extension.path);if(!m)continue;
          for(const [kind,entries] of [["tool",extension.tools],["command",extension.commands]]){
            for(const name of entries.keys()){
              if(!name.startsWith(m.namespace+"__"))fail(extension.path,`${kind} ${name} 必须使用 ${m.namespace}__ 命名空间`);
              const key=kind+":"+name;if(names.has(key)){fail(extension.path,`重复注册 ${key}`);fail(names.get(key),`重复注册 ${key}`)}names.set(key,extension.path);
            }
          }
        }
        for(const field of ["pendingProviderRegistrations","pendingNativeProviderRegistrations","pendingVirtualModelRegistrations"]){
          for(const registration of result.runtime[field])fail(registration.extensionPath,"提供商或虚拟模型扩展属于 E 级，需单独适配");
          result.runtime[field]=[];
        }
        for(const server of result.runtime.mcpServers.list()){fail(server.extensionPath,"MCP 连接由 Chela 管理，请改用 MCP 连接设置，不能在 Pi 扩展重复注册");result.runtime.mcpServers.unregister(server.name,server.extensionPath)}
        result.extensions=result.extensions.filter(e=>!problems.has(owner(e.path)?.id));
        for(const extension of result.extensions){
          const m=owner(extension.path);
          for(const [name,registered] of extension.tools){
            if(!m&&name!=="tool_search")continue;
            const execute=registered.definition.execute;
            registered.definition={...registered.definition,execute:async(id,args,...rest)=>{
              const identity=invocation(id);
              const prior=await before({...identity,name,arguments:args});
              if(prior?.result)return prior.result;
              const result=await toolContext.run({id:identity.tool_call_id,children:0},()=>execute(id,args,...rest));
              await after({...identity,name,result});
              return result;
            }};
          }
        }
        return result;
      },
      skillsOverride(result){return {...result,skills:result.skills.map(skill=>({...skill,name:`${owner(skill.filePath)?.namespace||"resource"}__${skill.name}`}))}},
      promptsOverride(result){return {...result,prompts:result.prompts.map(prompt=>({...prompt,name:`${owner(prompt.filePath)?.namespace||"resource"}__${prompt.name}`}))}},
    },
  };
}

export function extensionUI(state,host,pending) {
  const call=async(kind,data={},opts={})=>{
    if(opts.signal?.aborted)return undefined;
    const key=randomUUID();
    const cancel=()=>{const promise=host(state,"extension.ui.cancel",{key});pending.push(promise);promise.catch(()=>{})};
    opts.signal?.addEventListener("abort",cancel,{once:true});
    try{const value=await host(state,"extension.ui",{kind,...data,key,timeout:opts.timeout},6*60*1000);return value===null?undefined:value}
    finally{opts.signal?.removeEventListener("abort",cancel)}
  };
  const notify=(kind,data)=>{const promise=call(kind,data);pending.push(promise);promise.catch(()=>{});};
  const unsupported=()=>{throw new Error("此扩展请求 TUI/自定义绘制能力，需要 WebView 适配（D 级）");};
  const supported={
    select:(title,options,opts)=>call("select",{title,options},opts),
    confirm:async(title,message,opts)=>!!(await call("confirm",{title,message},opts)),
    input:(title,placeholder,opts)=>call("input",{title,placeholder},opts),
    editor:(title,prefill)=>call("editor",{title,prefill}),
    notify:(message,type)=>notify("notify",{message,type}),
    setStatus:(key,message)=>notify("status",{key,message:message||""}),
    setWorkingMessage:message=>notify("status",{key:"working",message:message||""}),
    setTitle:title=>notify("status",{key:"title",message:title}),
  };
  return new Proxy(supported,{get:(target,key)=>key in target?target[key]:unsupported});
}
