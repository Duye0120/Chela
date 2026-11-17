import { desktop } from "../platform/bridge";

export type ChatMessage = {
  tools?: {id:string;name:string;arguments:string;state:string;result?:string;milliseconds?:number}[];
  attachments?: ChatAttachment[];
	id: string;
  role: "user" | "assistant";
  content: string;
  delivery?: "queued" | "consumed" | "cancelled";
  thinking?: string;
  tokens?: number;
  limit?: number;
};
export type RuntimeSettings={permission:"ask"|"auto"|"full";projectRules:boolean;memoryEnabled:boolean;fastMode:boolean};
export type ChatAttachment = { id: string; name: string; mime: string; text?: string; data?: string; size?:number;uploading?:boolean;progress?:number };
export type ChatSession = {
  id: string;
  branchId?: string;
  title: string;
  pinned: boolean;
  archived: boolean;
  updatedAt: string;
  project?: string;
  group?: string;
  modelId?: string;
  effort?: string;
  messages: ChatMessage[];
};
export type ChatSnapshot = {
  sessions: ChatSession[];
  model: string;
  effort?: string;
  snapshot_cursor?: string;
  runtimeError?: string;
  runs?: ChatRun[];
  approvals?: {id: string; sessionId: string; runId: string; title: string; description: string; preview: string;canAllowSession?:boolean}[];
  models?: {
    id: string;
    label: string;
    provider: string;
    reasoning: boolean;
    vision?: boolean;
    fast?: boolean;
    efforts?:string[];
    contextWindow?:number;
    source?:string;
    fetchedAt?:string;
    stale?:boolean;
  }[];
};
export type ChatRun = {run_id: string; session_id: string; state: string; terminal_reason?: string; text?: string};
export type MemoryItem = {id:string;revision:number;slot_revision:number;scope:{type:"assistant"|"project"|"session";id:string};subject:string;slot:string;kind:string;status:string;content:string;source_class:string;source_id:string;recorded_at:string;valid_until?:string};
export type ChatProgress = Record<string, {run_id: string; text: string; thinking: string}>;
export type Capability = {id:string;name:string;version:string;hash:string;root:string;source:string;project:string;namespace:string;compatibility:string;trust:string;permissions:string[];requires:string[];resources:{extensions:string[];skills:string[];prompts:string[]};enabled:boolean;health:string;problem:string};
export type ExtensionRequest = {id:string;session:string;run:string;kind:string;state:string;payload:{title?:string;message?:string;options?:string[];placeholder?:string;prefill?:string}};
export type MCPConfig={id:string;revision:number;project:string;description:string;url?:string;command?:string;args?:string[];cwd?:string;autoApprove:boolean};
export type MCPStatus={config:MCPConfig;enabled:boolean;health:string;problem:string;tools:number;credentials:boolean};
export function isActiveRun(run: ChatRun) { return !["succeeded", "failed", "cancelled", "interrupted"].includes(run.state); }
type SessionPatch =
  { title: string } | { pinned: boolean } | { archived: boolean };

async function call<T>(method: string, ...args: unknown[]): Promise<T> {
  if (desktop) return desktop.call("Chat." + method, ...args);
  const response = await fetch("/__chela/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Chela-Chat": "1" },
    body: JSON.stringify({ method, args }),
  });
  if (!response.headers.get("content-type")?.includes("application/json"))
    throw Error("当前页面未连接 Chela 聊天服务");
  const result = await response.json();
  if (!response.ok || result.error)
    throw Error(result.error || "聊天服务不可用");
  return result.value;
}
export const chatApi = {
  mcpServers:()=>call<MCPStatus[]>("MCPServers"),
  saveMCP:(value:MCPConfig&{env?:Record<string,string>;headers?:Record<string,string>})=>call<void>("SaveMCP",JSON.stringify(value)),
  changeMCP:(id:string,action:string)=>call<void>("ChangeMCP",id,action),
  capabilities:()=>call<Capability[]>("Capabilities"),
  installCapability:(source:string,project:string)=>call<Capability>("InstallCapability",JSON.stringify({source,project})),
  changeCapability:(id:string,action:string)=>call<void>("ChangeCapability",id,action),
  extensionUI:(session:string)=>call<ExtensionRequest[]>("ExtensionUI",session),
  resolveExtensionUI:(request:ExtensionRequest,answer:unknown,cancelled=false)=>call<void>("ResolveExtensionUI",JSON.stringify({id:request.id,session:request.session,run:request.run,answer,cancelled})),
  legacyMemories:()=>call<{id:string;content:string;sources:{system:string;id:string;hash:string}[];state:string}[]>("LegacyMemories"),
  classifyLegacyMemory:(value:Record<string,unknown>)=>call<void>("ClassifyLegacyMemory",JSON.stringify(value)),
  memoryIndexStatus:()=>call<{model:string;state:string;pending:number;error:string}>("MemoryIndexStatus"),
  consolidateMemories:(session:string)=>call<string>("ConsolidateMemories",session),
  memoryJobs:(session:string)=>call<{id:string;state:string;error?:string}[]>("MemoryJobs",session),
  memories:(session:string,query="")=>call<MemoryItem[]>("Memories",session,query),
  saveMemory:(proposal:Record<string,unknown>)=>call<MemoryItem>("SaveMemory",JSON.stringify(proposal)),
  forgetMemory:(session:string,id:string,revision:number)=>call<void>("ForgetMemory",session,id,String(revision)),
  runtimeSettings:(session="")=>call<RuntimeSettings>("RuntimeSettings",session),
  setRuntimeSettings:(session:string,value:RuntimeSettings)=>call<void>("SetRuntimeSettings",session,JSON.stringify(value)),
  globalRules:()=>call<{path:string;text:string;hash:string}>("GlobalRules"),
  saveGlobalRules:(text:string,hash:string)=>call<{path:string;text:string;hash:string}>("SaveGlobalRules",text,hash),
  modelRoles:()=>call<Record<string,string>>("ModelRoles"),
  customModel:()=>call<{url:string;model:string;vision:boolean;fast:boolean;hasKey:boolean}>("CustomModel"),
  extractDocument:(name:string,data:string)=>call<string>("ExtractDocument",name,data),
  setModelRole:(role:string,model:string)=>call<void>("SetModelRole",role,model),
  magpie:()=>call<{url:string;fetchedAt:string;count:number;stale:boolean}>("MagpieStatus"),
  connectMagpie:(url:string,key:string)=>call<void>("ConnectMagpie",url,key),
  refreshMagpie:()=>call<void>("RefreshMagpie"),
  load: () => call<ChatSnapshot>("Snapshot"),
  create: () => call<ChatSession>("Create"),
  update: (id: string, p: SessionPatch) =>
    "title" in p
      ? call<ChatSession>("Rename", id, p.title)
      : "pinned" in p
        ? call<ChatSession>("Pin", id, p.pinned)
        : call<ChatSession>("Archive", id, p.archived),
  chooseProject: (id: string) => call<ChatSession>("ChooseProject", id),
  selectProject:(id:string,path:string)=>call<ChatSession>("SelectProject",id,path),
  references:(session:string,query:string)=>call<{path:string;name:string;kind:string}[]>("References",session,query),
  referenceContent:(session:string,path:string)=>call<string>("ReferenceContent",session,path),
  openProject: (id: string) => call<void>("OpenProject", id),
  openEditor:(id:string,editor:string)=>call<void>("OpenEditor",id,editor),
  defaultDirectory:()=>call<string>("DefaultDirectory"),
  setDefaultDirectory:(value:string)=>call<void>("SetDefaultDirectory",value),
  chooseDefaultDirectory:()=>call<string>("ChooseDefaultDirectory"),
  group: (id: string, name: string) => call<ChatSession>("Group", id, name),
  remove: (id: string) => call<void>("Delete", id),
  submit: (id: string, text: string, model: string, effort: string, command: string) =>
    call<{run_id: string; event_cursor: string}>("Submit", id, text, model, effort, command),
  submitContext:(id:string,text:string,attachments:ChatAttachment[],model:string,effort:string,command:string,editOf?:string)=>call<{run_id:string}>("SubmitContext",id,JSON.stringify({text,attachments:attachments.map(({id,name,mime,text,data,size})=>({id,name,mime,text,data,size})),editOf}),model,effort,command),
  attachment:(session:string,message:string,id:string)=>call<ChatAttachment>("Attachment",session,message,id),
  observe: (cursor: string) => call<{events: {seq: string}[]; progress: ChatProgress; runtimeError?: string}>("Observe", cursor),
  cancel: (id: string) => call<void>("Cancel", id),
  compact: (id: string, command: string) => call<{run_id: string}>("Compact", id, command),
  recover: (run: string, command: string) => call<{run_id: string}>("Recover", run, command),
  steer: (run:string,text:string,command:string)=>call<{run_id:string}>("Steer",run,text,command),
  edit: (session:string,message:string,text:string,model:string,effort:string,command:string)=>call<{run_id:string}>("EditMessage",session,message,text,model,effort,command),
  branches: (id: string) => call<{id: string; current: boolean; parent: string; createdAt: string}[]>("Branches", id),
  switchBranch: (id: string, branch: string) => call<ChatSession>("SwitchBranch", id, branch),
  resolveApproval: (id: string, approved: boolean) => call<void>("ResolveApproval", id, approved),
  allowSessionApproval:(id:string)=>call<void>("AllowSessionApproval",id),
  progress: (id: string) =>
    call<{ text: string; thinking: string } | null>("Progress", id),
  stop: (id: string) => call<void>("Stop", id),
  configure: (url: string, model: string, key: string, vision=false, keepKey=false,fast=false) =>
    call<void>("ConfigureModel", JSON.stringify({url,model,key,vision,keepKey,fast})),
};
