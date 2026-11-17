import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import { Archive, Check, Pencil, Pin, PinOff, Trash2, X } from "lucide-react";
import { SidebarItem } from "./sidebar";
import { IconButton } from "./icon-button";
import { Input } from "./text-field";
import { HighlightText } from "./highlight-text";
import "./workspace-controls.css";

type Props = {
  title: string;
  query?: string;
  pinned: boolean;
  current?: boolean;
  meta?: ReactNode;
  onSelect: () => void;
  onPinnedChange: (pinned: boolean) => void;
  onArchive: () => void;
  onDelete: () => void;
  onRename: (name: string) => void | Promise<void>;
};

export function SessionRow({ title, query, pinned, current, meta, onSelect, onPinnedChange, onArchive, onDelete, onRename }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const row = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  const errorId = useId();
  useLayoutEffect(() => {
    if (editing) {
      input.current?.focus();
      input.current?.select();
    } else if (restoreFocus.current) {
      restoreFocus.current = false;
      row.current?.focus();
    }
  }, [editing]);

  function startRename() {
    setError("");
    setDraft(title);
    restoreFocus.current = true;
    setEditing(true);
  }
  async function save() {
    if (saving) return;
    const name = draft.trim();
    if (!name) { setError("请输入会话名称"); input.current?.focus(); return; }
    setSaving(true);
    try {
      if (name !== title) await onRename(name);
      setEditing(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message || "重命名失败" : "重命名失败，请重试");
      input.current?.focus();
    } finally {
      setSaving(false);
    }
  }
  if (editing) return <div className="ui-session-edit">
    <div className="ui-rename" data-invalid={Boolean(error)}>
      <Pencil size={14} />
      <Input ref={input} aria-label="会话名称" placeholder="输入会话名称…" value={draft} readOnly={saving}
        aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined}
        onChange={event => { setDraft(event.target.value); setError(""); }}
        onKeyDown={event => {
          if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229 || saving) return;
          if (event.key === "Enter") { event.preventDefault(); void save(); }
          if (event.key === "Escape") { event.preventDefault(); setEditing(false); }
        }} />
      <IconButton aria-label="确认重命名" disabled={saving||!draft.trim()} onClick={() => void save()}><Check size={14} /></IconButton>
      <IconButton aria-label="取消重命名" disabled={saving} onClick={() => setEditing(false)}><X size={14} /></IconButton>
    </div>
    {error && <small id={errorId} role="alert">{error}</small>}
  </div>;

  const PinIcon = pinned ? PinOff : Pin;
  const actions = [
    { label: pinned ? "取消置顶" : "置顶", Icon: PinIcon, run: () => onPinnedChange(!pinned) },
    { label: "重命名", Icon: Pencil, run: startRename },
    { label: "归档", Icon: Archive, run: onArchive },
  ];
  function items() {
    return <>{actions.map(({ label, Icon, run }) => <ContextMenu.Item key={label} onSelect={run}><Icon />{label}</ContextMenu.Item>)}
      <ContextMenu.Separator /><ContextMenu.Item className="ui-session-delete" onSelect={onDelete}><Trash2 />删除</ContextMenu.Item></>;
  }
  function closeFocus(event: Event) {
    if (restoreFocus.current) event.preventDefault();
  }
  return <ContextMenu.Root>
    <ContextMenu.Trigger asChild>
      <div className="ui-session-row" data-current={current}>
        <SidebarItem ref={row} aria-current={current ? "page" : undefined} onClick={onSelect} onDoubleClick={startRename} onKeyDown={event=>{if(event.key==="F2"){event.preventDefault();startRename()}}} meta={meta}><HighlightText text={title} query={query}/></SidebarItem>
        <div className="ui-session-tools">
          <IconButton aria-label={actions[0].label} tooltip={actions[0].label} onClick={actions[0].run}><PinIcon size={14} /></IconButton>
          <IconButton aria-label="归档" tooltip="归档对话" onClick={onArchive}><Archive size={14} /></IconButton>
        </div>
      </div>
    </ContextMenu.Trigger>
    <ContextMenu.Portal><ContextMenu.Content className="ui-menu ui-session-menu" loop collisionPadding={8}
      onCloseAutoFocus={closeFocus}>{items()}</ContextMenu.Content></ContextMenu.Portal>
  </ContextMenu.Root>;
}
