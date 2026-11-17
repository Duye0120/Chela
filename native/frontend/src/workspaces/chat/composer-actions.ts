import { chatApi, type ChatAttachment } from "../../data/chat";
import { workApi } from "../../data/work";
import { previewApi } from "../../data/preview";
import { chatDrafts, setContexts, setDrafts } from "../../state/chat-drafts";
import { setError } from "../../state/chat";
import { errorMessage, refreshChat } from "../../state/chat-actions";

export type Suggestion = { id: string; name: string; text?: string; path?: string; detail?: string; browser?: string; kind?: string };
export async function readSuggestions(session: string | null, query: string): Promise<Suggestion[]> {
  const [notes,tasks,files,tabs] = await Promise.all([workApi.notes(), workApi.tasks(), session ? chatApi.references(session,query) : Promise.resolve([]), previewApi.tabs()]);
  return [...files.map(file=>({id:`file:${file.path}`,name:file.name,path:file.path,detail:file.path,kind:file.kind})),
    ...tabs.filter(tab=>tab.url!=="about:blank").map(tab=>({id:`browser:${tab.id}`,name:"当前浏览器预览页",browser:tab.id,detail:tab.url,kind:"browser"})),
    ...notes.filter(note=>!note.folder&&!note.archived).map(note=>({id:note.id,name:note.title,text:note.content,detail:"笔记",kind:"note"})),
    ...tasks.filter(task=>task.status!=="已归档").map(task=>({id:task.id,name:task.title,text:`${task.title}\n状态：${task.status}\n${task.description}`,detail:task.status,kind:"task"}))];
}
export async function chooseReference(item: Suggestion, session: string | null, key: string, text: string) {
  const content = item.browser ? await previewApi.text(item.browser) : item.path && session ? await chatApi.referenceContent(session,item.path) : item.text || "";
  if (!addContext({id:crypto.randomUUID(),name:item.path||item.name,mime:"text/plain",text:content},key)) return false;
  setDrafts(values=>({...values,[key]:text}));
  return true;
}
export async function executeComposerCommand(command: string, session: string, key: string) {
  if(command==="compact")await chatApi.compact(session,crypto.randomUUID());else await chatApi.consolidateMemories(session);
  setDrafts(values=>({...values,[key]:""}));await refreshChat();
}

export function addContext(item:ChatAttachment,key:string) {
    if(item.text&&new TextEncoder().encode(item.text).length>128*1024){setError("引用超过 128 KiB，请选择较小的内容");return false;}
    const items=chatDrafts.getState().contexts[key]||[],size=(value:ChatAttachment)=>value.data?value.data.length*.75:value.size||new TextEncoder().encode(value.text||"").length;
    if(items.length>=8||items.reduce((sum,value)=>sum+size(value),size(item))>40*1024*1024){setError("最多 8 个附件，合计不超过 40 MiB");return false;}
    setContexts(key,[...items,item]);return true;
  }
export async function attachFile(file:File,key:string) {
    const image=["image/png","image/jpeg","image/gif"].includes(file.type),document=/\.docx$/i.test(file.name);
    if(file.size>20*1024*1024){setError(`附件 ${file.name} 超出 20 MB 限制，请移除后重试。`);return;}
    if(!image&&!document&&!file.type.startsWith("text/")&&!/\.(txt|md|json|xml|csv|log|yaml|yml|tsx?|jsx?|go|py|css|html)$/i.test(file.name)){setError("支持文本、DOCX 文档和 PNG / JPEG / GIF 图片");return;}
    const item:ChatAttachment={id:crypto.randomUUID(),name:file.name,mime:image?file.type:"text/plain",size:file.size,uploading:true,progress:0};if(!addContext(item,key))return;
    try {
      const content=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onprogress=event=>{if(event.lengthComputable)setContexts(key,items=>items.map(value=>value.id===item.id?{...value,progress:event.loaded/event.total*100}:value))};reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(reader.error||Error("无法读取附件"));if(image||document)reader.readAsDataURL(file);else reader.readAsText(file)});
      const completed = { ...item, uploading: false, progress: 100 };
      if(image)completed.data=content.slice(content.indexOf(",")+1);else if(document)completed.text=await chatApi.extractDocument(file.name,content.slice(content.indexOf(",")+1));else completed.text=content;
      if(completed.text&&new TextEncoder().encode(completed.text).length>128*1024)throw Error("文本内容超过 128 KiB，请拆分后添加");
      setContexts(key,items=>items.map(value=>value.id===item.id?completed:value));return true;
    }catch(cause){setContexts(key,items=>items.filter(value=>value.id!==item.id));setError(errorMessage(cause));return false;}
  }
