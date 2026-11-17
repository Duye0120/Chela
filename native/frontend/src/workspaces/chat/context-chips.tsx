import { useEffect, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import documentIcon from "./assets/document.svg";
import { FileText, Image, X } from "lucide-react";
import { IconButton } from "../../ui/icon-button";
import { chatApi, type ChatAttachment } from "./data";

export function ContextChips({ items, onRemove, session, message }: { items: ChatAttachment[]; onRemove?: (id: string) => void; session?: string; message?: string }) {
  return <div className="chat-context-chips" aria-label="附件与引用">{items.map(item => <ContextChip key={item.id} item={item} onRemove={onRemove} session={session} message={message} />)}</div>;
}
function ContextChip({ item, onRemove, session, message }: { item: ChatAttachment; onRemove?: (id: string) => void; session?: string; message?: string }) {
  const [loaded, setLoaded] = useState<ChatAttachment | null>(null), [error, setError] = useState(""),[open,setOpen]=useState(false),[expanded,setExpanded]=useState(false);
  const timer=useRef<ReturnType<typeof setTimeout>>(undefined),loading=useRef(false);
  useEffect(()=>()=>clearTimeout(timer.current),[]);
  const value = loaded || item, image = value.mime.startsWith("image/"),file=image||item.size!==undefined;
  const extension=item.name.split(".").at(-1)?.toUpperCase().slice(0,5)||"FILE";
  async function load(){if(loading.current||loaded||item.text!==undefined||item.data||!session||!message)return;loading.current=true;try{setLoaded(await chatApi.attachment(session,message,item.id));setError("")}catch(cause){setError(String(cause))}finally{loading.current=false}}
  function show(){clearTimeout(timer.current);setOpen(true);if(image)void load()}
  function hide(){clearTimeout(timer.current);if(!expanded)timer.current=setTimeout(()=>setOpen(false),150)}
  const compact=file&&!image&&!expanded;
  return <Popover.Root open={open} onOpenChange={value=>{setOpen(value);if(!value)setExpanded(false);if(value)void load()}}><div className={file?"chat-attachment-card":"chat-context-chip"} data-extension={extension} onPointerEnter={show} onPointerLeave={hide} onFocus={show} onBlur={hide}>
    <Popover.Trigger asChild><button type="button" className="chat-attachment-trigger" aria-label={`预览 ${item.name}`} onClick={event=>{event.preventDefault();clearTimeout(timer.current);setExpanded(true);setOpen(true);void load()}}>{file?image?(value.data?<img className="chat-attachment-image" src={`data:${value.mime};base64,${value.data}`} alt={value.name}/>:<Image size={20}/>):<><img className="chat-document-silhouette" src={documentIcon} alt="" width={30} height={34}/><b className="chat-extension-badge">{extension}</b></>:<><FileText size={12}/><span>{item.name}</span></>}
    {item.uploading&&<span className="chat-attachment-progress"><progress max={100} value={item.progress||0} aria-label={`正在读取 ${item.name}`}/><span>{Math.round(item.progress||0)}%</span></span>}</button></Popover.Trigger>
    {onRemove&&<IconButton className="chat-attachment-remove" aria-label={`移除 ${item.name}`} onClick={event=>{event.stopPropagation();onRemove(item.id)}}><X size={10}/></IconButton>}
  </div><Popover.Portal><Popover.Content className={`chat-attachment-popover${compact?" chat-file-tooltip":""}`} role={compact?"tooltip":"dialog"} side="top" align="start" sideOffset={8} collisionPadding={12} onPointerEnter={()=>clearTimeout(timer.current)} onPointerLeave={hide} onFocus={()=>clearTimeout(timer.current)} onBlur={hide} onOpenAutoFocus={event=>event.preventDefault()} aria-label={item.name}>
    {error?<p role="alert">{error}</p>:image?(value.data?<img src={`data:${value.mime};base64,${value.data}`} alt={value.name}/>:<p>正在读取图片…</p>):null}<footer><span>{item.name}</span>{item.size!==undefined&&<small>{item.size>=1024*1024?`${(item.size/1024/1024).toFixed(1)} MB`:`${Math.max(1,Math.round(item.size/1024))} KB`}</small>}</footer>{!compact&&!image&&value.text!==undefined&&<pre>{value.text}</pre>}
  </Popover.Content></Popover.Portal></Popover.Root>;
}
