import { desktop, serviceCall } from "../../platform/bridge";
export type BrowserTab={id:string;url:string;title:string;error:string;loading:boolean;back:boolean;forward:boolean};
export type GitFile={path:string;oldPath?:string;status:string};
export type Repository={path:string;name:string;branch:string;files:GitFile[]};
export type Patch={text:string;binary:boolean};
export type RestorePlan={repository:string;files:GitFile[];token:string};
export const previewApi={
  native:Boolean(desktop),
  tabs:()=>desktop?desktop.call<BrowserTab[]>("Browser.Snapshot"):Promise.resolve([] as BrowserTab[]),
  create:(id:string,url="")=>serviceCall<BrowserTab>("Browser.Create",id,url),
  action:(id:string,action:string,url="")=>serviceCall<void>("Browser.Action",id,action,url),
  layout:(id:string,bounds:unknown={})=>serviceCall<void>("Browser.Layout",id,JSON.stringify(bounds)),
  close:(id:string)=>serviceCall<void>("Browser.Close",id),
  pick:(id:string,enabled:boolean)=>serviceCall<void>("Browser.Pick",id,enabled),
  pickResult:(id:string)=>serviceCall<string>("Browser.PickResult",id),
  text:(id:string)=>serviceCall<string>("Browser.Text",id),
  repositories:(session:string,depth:number)=>serviceCall<Repository[]>("Chat.GitRepositories",session,String(depth)),
  diff:(session:string,repo:string,path:string)=>serviceCall<Patch>("Chat.GitDiff",session,repo,path),
  restorePreview:(session:string,repo:string,paths:string[])=>serviceCall<RestorePlan>("Chat.GitRestorePreview",session,repo,JSON.stringify(paths)),
  restore:(session:string,plan:RestorePlan)=>serviceCall<{backup:string;restored:string[];problem?:string}>("Chat.GitRestore",session,plan.repository,JSON.stringify(plan.files.map(file=>file.path)),plan.token),
  openRestoreBackup:(path:string)=>serviceCall<void>("Chat.OpenRestoreBackup",path),
};
