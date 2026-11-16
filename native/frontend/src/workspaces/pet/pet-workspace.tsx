import { useEffect, useRef, useState } from "react";
import { EyeOff, Grip, MoveHorizontal, Pause, Play, X } from "lucide-react";
import { desktop } from "../../platform/bridge";
import { Button } from "../../ui/button";
import { IconButton } from "../../ui/icon-button";
import type { Delivery } from "../../data/work";
import logo from "../../assets/icons/Chela24Px.svg";
import "./pet.css";

type Presentation={id:string;acknowledged:boolean;items:Pick<Delivery,"id"|"text"|"purpose"|"actions">[]};
type Snapshot={state:string;side:string;emotion:string;motion:boolean;presentation:Presentation|null};
const call=<T,>(method:string,...args:unknown[])=>desktop?desktop.call<T>(`Pet.${method}`,...args):Promise.reject(new Error("桌宠需要 Chela 桌面窗口"));
const states:Record<string,string>={hidden:"已隐藏",peeking:"在这里",idle:"在这里",thinking:"正在处理",listening:"等待你的确认",speaking:"有新的进展"};
const emotions:Record<string,string>={joy:"轻松",pride:"有成就感",playful_irritation:"有点调皮",concern:"有点担心",curiosity:"好奇",disappointment:"有点失落",attentive:"专注",neutral:"平静"};

export function PetWorkspace(){
  const [snapshot,setSnapshot]=useState<Snapshot>({state:"idle",side:"right",emotion:"neutral",motion:false,presentation:null}),[error,setError]=useState(""),[busy,setBusy]=useState(false),[hover,setHover]=useState(false);
  const root=useRef<HTMLDivElement>(null),ack=useRef("");
  useEffect(()=>{
    document.documentElement.classList.add("pet-window");let disposed=false;let timer:ReturnType<typeof setTimeout>;
    async function refresh(){try{const next=await call<Snapshot>("Snapshot");if(!disposed){setSnapshot(next);setError("")}}catch(e){if(!disposed)setError(String(e))}finally{if(!disposed)timer=setTimeout(()=>void refresh(),1000)}}
    void refresh();return()=>{disposed=true;clearTimeout(timer);document.documentElement.classList.remove("pet-window")};
  },[]);
  const presentation=snapshot.presentation;
  useEffect(()=>{
    if(!presentation||snapshot.state==="hidden"||document.visibilityState!=="visible"||ack.current===presentation.id)return;
    // An acknowledgement follows a painted frame; reloads keep the same presentation ID.
    let second=0;const frame=requestAnimationFrame(()=>{second=requestAnimationFrame(()=>{
      if(document.visibilityState!=="visible")return;
      void call("Acknowledge",presentation.id).then(()=>{ack.current=presentation.id}).catch(e=>setError(String(e)));
    })});return()=>{cancelAnimationFrame(frame);cancelAnimationFrame(second)};
  },[presentation,snapshot.state]);
  useEffect(()=>{
    if(!root.current)return;
    const update=()=>{const rects=Array.from(root.current!.querySelectorAll<HTMLElement>("[data-pet-hit]")).map(el=>{const r=el.getBoundingClientRect(),X=Math.max(0,Math.min(360,Math.floor(r.left))),Y=Math.max(0,Math.min(360,Math.floor(r.top)));return {X,Y,Width:Math.max(0,Math.min(360,Math.ceil(r.right))-X),Height:Math.max(0,Math.min(360,Math.ceil(r.bottom))-Y)}});void call("SetRegions",JSON.stringify(rects)).catch(e=>setError(String(e)))};
    const observer=new ResizeObserver(update);observer.observe(root.current);for(const child of root.current.children)observer.observe(child);update();return()=>observer.disconnect();
  },[presentation?.id,error,snapshot.state,snapshot.side,hover]);
  async function act(method:string,...args:unknown[]){setBusy(true);setError("");try{await call(method,...args);setSnapshot(await call<Snapshot>("Snapshot"))}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}}
  return <main ref={root} className="pet" data-state={snapshot.state} data-side={snapshot.side} data-expanded={hover} data-motion={snapshot.motion} data-emotion={snapshot.emotion} aria-label="Chela 陪伴" onPointerEnter={()=>setHover(true)} onPointerLeave={()=>setHover(false)} onFocus={()=>setHover(true)} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))setHover(false)}}>
    {presentation&&<section data-pet-hit className="pet-bubble" aria-label="新的提醒与进展" aria-live="polite">
      <header><strong>{presentation.items.length>1?`${presentation.items.length} 条提醒与进展`:"Chela"}</strong><IconButton aria-label="收起这条气泡" disabled={busy} onClick={()=>void act("Dismiss",presentation.id)}><X size={14}/></IconButton></header>
      <div className="pet-items">{presentation.items.map(item=><article key={item.id}><p>{item.text}</p><div>{item.actions.map(action=><Button type="button" key={action.action_id} disabled={busy} onClick={()=>void act("Open",item.id,action.action_id)}>{action.label}</Button>)}</div></article>)}</div>
    </section>}
    <div data-pet-hit className="pet-body">
      <div className="pet-drag" title="拖动 Chela" aria-hidden="true"><Grip size={14}/></div>
      <button type="button" className="pet-face" aria-label={`打开 Chela，${states[snapshot.state]||"在这里"}，${emotions[snapshot.emotion]||"平静"}`} onClick={()=>void act("Open","","")}><img src={logo} alt="" draggable={false}/></button>
      <small role="status">{states[snapshot.state]||"在这里"}</small>
      <div className="pet-controls"><IconButton aria-label={snapshot.motion?"暂停待机动作":"开启待机动作"} title={snapshot.motion?"暂停待机动作":"开启待机动作"} onClick={()=>void act("SetMotion",!snapshot.motion)}>{snapshot.motion?<Pause size={13}/>:<Play size={13}/>}</IconButton><IconButton aria-label="靠近屏幕边缘" title="靠近屏幕边缘" onClick={()=>void act("Dock")}><MoveHorizontal size={13}/></IconButton><IconButton aria-label="隐藏桌宠" title="隐藏桌宠，可从系统托盘打开" onClick={()=>void act("SetHidden",true)}><EyeOff size={13}/></IconButton></div>
    </div>
    {error&&<p data-pet-hit className="pet-error" role="alert">{error}</p>}
  </main>;
}
