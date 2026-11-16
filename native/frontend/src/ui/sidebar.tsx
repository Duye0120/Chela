import { ChevronRight } from "lucide-react";
import { useId, type ComponentProps, type ReactNode } from "react";
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
};

export function Sidebar({ id, title, open, actions, toolbar, children }: SidebarProps) {
  const titleId = useId();
  return <aside id={id} className="ui-sidebar" aria-labelledby={titleId} hidden={!open}>
    <header><h1 id={titleId}>{title}</h1>{actions}</header>
    {toolbar}
    <div className="ui-sidebar-list">{children}</div>
  </aside>;
}

export function SidebarToggle({ controls, open, onToggle }: { controls: string; open: boolean; onToggle: () => void }) {
  return <IconButton className="ui-sidebar-toggle" aria-label={open ? "收起侧栏" : "展开侧栏"}
    aria-controls={controls} aria-expanded={open} onClick={onToggle}>
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
