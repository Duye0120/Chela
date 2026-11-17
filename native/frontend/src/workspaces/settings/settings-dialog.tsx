import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { IconButton } from "../../ui/icon-button";

export function SettingsDialog({ title, onClose, children, busy = false }: { title: string; onClose: () => void; children: ReactNode; busy?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null), id = useId();
  useEffect(() => { const previous = document.activeElement; dialog.current?.showModal(); dialog.current?.querySelector<HTMLElement>('input:not(:disabled):not([readonly]):not([type=checkbox]):not([type=radio]),textarea:not(:disabled),select:not(:disabled)')?.focus({preventScroll:true}); return () => { if (previous instanceof HTMLElement) previous.focus(); }; }, []);
  return <dialog ref={dialog} className="settings-dialog" aria-labelledby={id} onClose={onClose} onCancel={event => { if (busy) event.preventDefault(); }}>
    <header><h2 id={id}>{title}</h2><IconButton aria-label="关闭" disabled={busy} onClick={() => dialog.current?.close()}><X size={16} /></IconButton></header>
    <div className="settings-dialog-content">{children}</div>
  </dialog>;
}
