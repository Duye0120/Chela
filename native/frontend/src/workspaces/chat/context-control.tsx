import { useId, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Button } from "../../ui/button";

export function ContextControl({ tokens=0,limit=0,model,busy,onCompact,onDetails }: {tokens?:number;limit?:number;model:string;busy:boolean;onCompact:()=>void;onDetails:()=>void}) {
  const [open,setOpen]=useState(false),[dismissed,setDismissed]=useState(false),id=useId(),percent=limit?Math.min(100,Math.round(tokens/limit*100)):0;
  const label=limit?`${tokens.toLocaleString()} / ${limit.toLocaleString()} tokens` : "尚无模型用量记录";
  return <Popover.Root open={open} onOpenChange={setOpen}><div className="chat-context-control" data-open={open} data-dismissed={dismissed} onPointerLeave={()=>setDismissed(false)} onBlur={()=>setDismissed(false)} onKeyDown={event=>{if(event.key==="Escape")setDismissed(true)}}>
    <Popover.Trigger asChild><button className="chat-context" type="button" aria-label={`上下文 ${percent}%`} aria-describedby={!open?`${id}-summary`:undefined}><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="5.8" fill="none" stroke="var(--chela-color-border-default)" strokeWidth="2.2"/>{percent>0&&<circle cx="7" cy="7" r="5.8" fill="none" stroke="var(--chela-color-accent-default)" strokeWidth="2.2" pathLength="100" strokeDasharray={`${percent} 100`} transform="rotate(-90 7 7)"/>}</svg>{percent}%</button></Popover.Trigger>
    {!open&&<span id={`${id}-summary`} role="tooltip" className="chat-context-hover"><strong>上下文用量</strong><span>{label} ({percent}%)</span><small>点击查看详情与整理上下文</small></span>}
  </div><Popover.Portal><Popover.Content className="chat-context-popover" side="top" align="end" sideOffset={8} collisionPadding={12} aria-label="上下文用量"><header><strong>上下文用量</strong><span>{label} ({percent}%)</span></header><progress max={100} value={percent} aria-label="上下文使用比例"/><p>{model}{!limit&&" · 首次回复后显示用量"}</p><footer><Button disabled={busy||!limit} onClick={onCompact}>立即压缩上下文</Button><Button variant="ghost" onClick={()=>{setOpen(false);onDetails()}}>对话信息与记忆</Button></footer></Popover.Content></Popover.Portal></Popover.Root>;
}
