import { isValidElement, useId, type ReactNode } from "react";

export function Row({ label, description, children }: { label: string; description?: string; children: ReactNode }) {
  const Container = isValidElement(children) && children.type === Toggle ? "label" : "div";
  return <Container className="settings-row"><div><strong>{label}</strong>{description && <p>{description}</p>}</div><div className="settings-row-control">{children}</div></Container>;
}

export function Toggle({ label, checked, onChange, disabled = false }: { label: string; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  const id = useId();
  return <span className="settings-switch-target"><input id={id} className="settings-switch" type="checkbox" role="switch" aria-label={label} checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)} /></span>;
}

export function SectionHeading({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  return <header className="settings-section-heading"><div><h2>{title}</h2><p>{description}</p></div>{children && <div className="settings-heading-actions">{children}</div>}</header>;
}
