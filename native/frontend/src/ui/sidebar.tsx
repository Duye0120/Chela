import { ChevronRight } from "lucide-react";
import { useEffect, useId, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { createPortal } from "react-dom";
import panelIcon from "../assets/icons/LucidePanelLeftClose.svg";
import { Button } from "./button";
import { IconButton } from "./icon-button";

type SidebarProps = {
  id: string;
  title: string;
  open: boolean;
  actions?: ReactNode;
  toolbar?: ReactNode;
  children?: ReactNode;
  resizable?: boolean;
  hotEdge?: boolean;
};

export function Sidebar({ id, title, open, actions, toolbar, children, resizable = false, hotEdge = false }: SidebarProps) {
  const titleId = useId();
  const [peek, setPeek] = useState(false), [dragging, setDragging] = useState(false);
  const [width, setWidth] = useState<number | undefined>(() => { const value = Number(localStorage.getItem(`chela.sidebar.${id}`)); return value >= 184 && value <= 420 ? value : undefined; });
  const panel = useRef<HTMLElement>(null), timer = useRef<ReturnType<typeof setTimeout>>(undefined), drag = useRef({ x: 0, width: 0 }), currentWidth = useRef(width);
  useEffect(() => setPeek(false), [open]);
  function saveWidth(value: number) { const next = Math.round(Math.max(184, Math.min(420, innerWidth - 360, value))); currentWidth.current = next; setWidth(next); }
  useEffect(() => {
    const reveal = (event: Event) => {
      const detail = (event as CustomEvent<{ id: string; open: boolean }>).detail;
      if (detail.id !== id || open) return;
      clearTimeout(timer.current);
      if (detail.open) setPeek(true); else timer.current = setTimeout(() => { if (!panel.current?.contains(document.activeElement)) setPeek(false); }, 180);
    };
    window.addEventListener("chela-sidebar-peek", reveal);
    return () => { clearTimeout(timer.current); window.removeEventListener("chela-sidebar-peek", reveal); };
  }, [id, open]);
  useEffect(() => {
    if (!dragging) return;
    document.documentElement.dataset.chelaResizing = "true";
    const move = (event: PointerEvent) => saveWidth(drag.current.width + event.clientX - drag.current.x);
    const end = () => { setDragging(false); if (currentWidth.current) localStorage.setItem(`chela.sidebar.${id}`, String(currentWidth.current)); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") end(); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", end); window.addEventListener("pointercancel", end); window.addEventListener("blur", end); window.addEventListener("keydown", escape);
    return () => { delete document.documentElement.dataset.chelaResizing; window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", end); window.removeEventListener("pointercancel", end); window.removeEventListener("blur", end); window.removeEventListener("keydown", escape); };
  }, [dragging, id]);
  return <><aside ref={panel} id={id} className="ui-sidebar" data-peek={!open && peek} aria-labelledby={titleId} hidden={!open && !peek} style={width && open ? { width } : undefined}
    onPointerEnter={() => clearTimeout(timer.current)} onPointerLeave={() => { if (!open) timer.current = setTimeout(() => { if (!panel.current?.contains(document.activeElement)&&!document.querySelector('.ui-menu[data-state="open"]')) setPeek(false); }, 180); }} onFocus={()=>clearTimeout(timer.current)} onBlur={event=>{if(!open&&!event.currentTarget.contains(event.relatedTarget))timer.current=setTimeout(()=>{if(!document.querySelector('.ui-menu[data-state="open"]'))setPeek(false)},180)}} onKeyDown={event => { if (event.key === "Escape" && !event.defaultPrevented && !open) setPeek(false); }}>
    <header><h1 id={titleId}>{title}</h1>{actions}</header>
    {toolbar}
    <div className="ui-sidebar-list">{children}</div>
    {open && resizable && <div className="ui-sidebar-resizer" role="separator" aria-label={`调整${title}侧栏宽度`} aria-orientation="vertical" aria-valuemin={184} aria-valuemax={420} aria-valuenow={width || 280} tabIndex={0}
      onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); drag.current = { x: event.clientX, width: panel.current!.getBoundingClientRect().width }; setDragging(true); }} onLostPointerCapture={() => setDragging(false)}
      onKeyDown={event => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); const value = (currentWidth.current || panel.current!.clientWidth) + (event.key === "ArrowRight" ? 16 : -16); saveWidth(value); localStorage.setItem(`chela.sidebar.${id}`, String(currentWidth.current)); } }} />}
  </aside>{!open&&hotEdge&&<div className="chat-sidebar-hot-edge" aria-hidden="true" onPointerEnter={()=>{clearTimeout(timer.current);setPeek(true)}} onPointerLeave={()=>{timer.current=setTimeout(()=>{if(!panel.current?.matches(":hover, :focus-within"))setPeek(false)},180)}}/>}{dragging && createPortal(<div className="ui-resize-shield" aria-hidden="true" />, document.body)}</>;
}

export function SidebarToggle({ controls, open, onToggle }: { controls: string; open: boolean; onToggle: () => void }) {
  return <IconButton className="ui-sidebar-toggle" aria-label={open ? "收起侧栏" : "展开侧栏"}
    aria-controls={controls} aria-expanded={open} onClick={onToggle}
    onPointerEnter={() => window.dispatchEvent(new CustomEvent("chela-sidebar-peek", { detail: { id: controls, open: true } }))}
    onPointerLeave={() => window.dispatchEvent(new CustomEvent("chela-sidebar-peek", { detail: { id: controls, open: false } }))}
    onFocus={() => window.dispatchEvent(new CustomEvent("chela-sidebar-peek", { detail: { id: controls, open: true } }))}
    onBlur={() => window.dispatchEvent(new CustomEvent("chela-sidebar-peek", { detail: { id: controls, open: false } }))}>
    <img src={panelIcon} alt="" draggable={false} />
  </IconButton>;
}

type GroupProps = { label: string; icon?: ReactNode; defaultOpen?: boolean; children: ReactNode };

export function SidebarGroup({ label, icon, defaultOpen, children }: GroupProps) {
  return <details className="ui-sidebar-group" open={defaultOpen}>
    <summary>{icon}<span>{label}</span><ChevronRight aria-hidden="true" /></summary>
    {children}
  </details>;
}

type ItemProps = ComponentProps<"button"> & { meta?: ReactNode };

export function SidebarItem({ children, meta, className = "", ...props }: ItemProps) {
  return <Button {...props} variant="ghost" className={`ui-sidebar-item ${className}`.trimEnd()}>
    <span>{children}</span>{meta && <small>{meta}</small>}
  </Button>;
}
