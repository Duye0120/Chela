import { useEffect, useRef, useState } from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import { desktop } from "../../platform/bridge";
import { Button } from "../../ui/button";
import { ChelaAvatar, type AvatarExpression } from "../../ui/chela-avatar";
import type { Delivery } from "../../data/work";
import { applyAppearance, readAppearance } from "../settings/appearance";
import "./pet.css";

type ReportFact = { id:string;title:string;dueAt:string;dueDate:string;timezone:string };
type Presentation = { id: string; acknowledged: boolean; items: (Pick<Delivery, "id" | "text" | "purpose" | "actions"> & {report?:{today:ReportFact[];completed:ReportFact[];leftover:ReportFact[]}})[] };
type Snapshot = { state: string; side: string; emotion: string; motion: boolean; presentation: Presentation | null };
const call = <T,>(method: string, ...args: unknown[]) => desktop ? desktop.call<T>(`Pet.${method}`, ...args) : Promise.reject(new Error("桌宠需要 Chela 桌面窗口"));
const expressions: Record<string, AvatarExpression> = { joy: "speaking", pride: "speaking", playful_irritation: "wink", concern: "alert", curiosity: "peeking", disappointment: "sleepy", attentive: "thinking" };

export function PetWorkspace() {
  const [snapshot, setSnapshot] = useState<Snapshot>({ state: "idle", side: "right", emotion: "neutral", motion: false, presentation: null });
  const [error, setError] = useState(""), [busy, setBusy] = useState(false), [hover, setHover] = useState(false), [menu, setMenu] = useState(false), [wink, setWink] = useState(false);
  const ack = useRef(""), winkTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const presentation = snapshot.presentation;
  const collapsed = snapshot.state === "peeking" && !hover && !menu && !presentation;
  const morning = presentation?.items.some(item => item.purpose === "daily_report") || false;
  const expression: AvatarExpression = wink ? "wink" : snapshot.state === "thinking" ? "thinking" : snapshot.state === "listening" ? "alert" : expressions[snapshot.emotion] || (hover && snapshot.state === "peeking" ? "peeking" : "idle");
  useEffect(() => {
    document.documentElement.classList.add("pet-window");
    const appearance = () => applyAppearance(readAppearance());
    appearance(); window.addEventListener("storage", appearance);
    let disposed = false, timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try { const next = await call<Snapshot>("Snapshot"); if (!disposed) { setSnapshot(next); setError(""); } }
      catch (cause) { if (!disposed) setError(String(cause)); }
      finally { if (!disposed) timer = setTimeout(() => void refresh(), 1000); }
    }
    void refresh();
    return () => { disposed = true; clearTimeout(timer); clearTimeout(winkTimer.current); window.removeEventListener("storage", appearance); document.documentElement.classList.remove("pet-window"); };
  }, []);
  useEffect(() => {
    if (!presentation || snapshot.state === "hidden" || document.visibilityState !== "visible" || ack.current === presentation.id) return;
    let second = 0;
    const frame = requestAnimationFrame(() => { second = requestAnimationFrame(() => {
      if (document.visibilityState !== "visible") return;
      void call("Acknowledge", presentation.id).then(() => { ack.current = presentation.id; }).catch(cause => setError(String(cause)));
    }); });
    return () => { cancelAnimationFrame(frame); cancelAnimationFrame(second); };
  }, [presentation, snapshot.state]);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const regions = Array.from(document.querySelectorAll<HTMLElement>("[data-pet-hit]")).filter(element => element.getClientRects().length).map(element => {
          const rect = element.getBoundingClientRect(), X = Math.max(0, Math.floor(rect.left)), Y = Math.max(0, Math.floor(rect.top));
          return { X, Y, Width: Math.max(0, Math.min(innerWidth, Math.ceil(rect.right)) - X), Height: Math.max(0, Math.min(innerHeight, Math.ceil(rect.bottom)) - Y) };
        });
        void call("SetRegions", JSON.stringify(regions)).catch(cause => setError(String(cause)));
      });
    };
    const observer = new ResizeObserver(update);
    document.querySelectorAll<HTMLElement>("[data-pet-hit]").forEach(element => observer.observe(element));
    update(); window.addEventListener("resize", update);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); window.removeEventListener("resize", update); };
  }, [presentation?.id, error, collapsed, menu, snapshot.side]);
  async function act(method: string, ...args: unknown[]) {
    setBusy(true); setError("");
    try { await call(method, ...args); setSnapshot(await call<Snapshot>("Snapshot")); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }
  function touch() { setWink(true); clearTimeout(winkTimer.current); winkTimer.current = setTimeout(() => setWink(false), 900); }
  const dismiss = () => presentation && void act("Dismiss", presentation.id);
  return <main className="pet" data-state={snapshot.state} data-side={snapshot.side} data-collapsed={collapsed} data-motion={snapshot.motion} aria-label="Chela 陪伴"
    onPointerEnter={() => setHover(true)} onPointerLeave={() => setHover(false)} onFocus={() => setHover(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setHover(false); }}>
    {presentation && <section data-pet-hit className="pet-bubble" data-morning={morning} aria-label="新的提醒与进展" aria-live="polite">
      <header>{morning ? new Date().toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" }) : "Chela · 新的进展"}</header>
      {morning && <h2>今天的安排</h2>}
      <div className="pet-items">{presentation.items.map(item => <article key={item.id}>{item.report?<><p className="pet-report-summary">昨天完成 {item.report.completed?.length||0} 项 · 遗留 {item.report.leftover?.length||0} 项</p>{item.report.today?.length?<ul className="pet-report-agenda">{item.report.today.map(fact=><li key={fact.id}><time>{fact.dueAt?new Date(fact.dueAt).toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit",timeZone:fact.timezone||undefined}):fact.dueDate||"今日"}</time><span>{fact.title}</span></li>)}</ul>:<p>今天暂无安排</p>}</>:<p>{item.text}</p>}{!morning&&<div className="pet-bubble-actions">{item.actions.map(action => <Button variant="primary" key={action.action_id} disabled={busy} onClick={() => void act("Open", item.id, action.action_id)}>{action.label}</Button>)}{!morning && <Button variant="ghost" disabled={busy} onClick={dismiss}>收起</Button>}</div>}</article>)}</div>
      {morning && <footer><div className="pet-bubble-actions">{presentation.items.flatMap(item=>item.actions.map(action=><Button variant="primary" key={`${item.id}:${action.action_id}`} disabled={busy} onClick={()=>void act("Open",item.id,action.action_id)}>{action.label}</Button>))}</div><Button variant="ghost" disabled={busy} onClick={dismiss}>收起</Button></footer>}
    </section>}
    <div className="pet-anchor" data-pet-hit={collapsed ? undefined : ""}>
      {collapsed ? <button data-pet-hit className="pet-edge" aria-label="展开 Chela" onClick={() => setHover(true)}><i /><i /></button> : <ContextMenu.Root onOpenChange={setMenu}>
        <ContextMenu.Trigger asChild><button type="button" className="pet-face" aria-label="轻碰 Chela，让它眨眼回应" onClick={touch}><ChelaAvatar expression={expression} interactive motion={snapshot.motion} /><span className="pet-drag-zone" title="拖动 Chela" /></button></ContextMenu.Trigger>
        <ContextMenu.Portal><ContextMenu.Content data-pet-hit className="ui-menu pet-menu" collisionPadding={12}>
          <ContextMenu.Item onSelect={() => void act("Open", "", "")}>打开 Chela</ContextMenu.Item>
          <ContextMenu.Item onSelect={() => void act("SetMotion", !snapshot.motion)}>{snapshot.motion ? "暂停待机动作" : "开启待机动作"}</ContextMenu.Item>
          <ContextMenu.Item onSelect={() => void act("Dock")}>靠近屏幕边缘</ContextMenu.Item>
          <ContextMenu.Separator /><ContextMenu.Item onSelect={() => void act("SetHidden", true)}>隐藏桌宠</ContextMenu.Item>
        </ContextMenu.Content></ContextMenu.Portal>
      </ContextMenu.Root>}
    </div>
    {error && <p data-pet-hit className="pet-error" role="alert">{error}</p>}
  </main>;
}
