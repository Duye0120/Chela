import { useLayoutEffect, useRef } from "react";

export function captureWorkspace() {
  const source = document.querySelector<HTMLElement>(".workspace");
  if (!source) return null;
  const clone = source.cloneNode(true) as HTMLElement;
  clone.setAttribute("inert", ""); clone.setAttribute("aria-hidden", "true");
  clone.querySelectorAll("[id]").forEach(node => node.removeAttribute("id"));
  const canvases = source.querySelectorAll("canvas");
  clone.querySelectorAll("canvas").forEach((canvas, index) => { try { canvas.getContext("2d")?.drawImage(canvases[index], 0, 0); } catch { /* Native surfaces may not expose a bitmap. */ } });
  return { node: clone, width: source.clientWidth, height: source.clientHeight };
}
export type WorkspacePreview = NonNullable<ReturnType<typeof captureWorkspace>>;
export function DockPreview({ title, snapshot, anchor, position }: { title: string; snapshot?: WorkspacePreview; anchor: DOMRect; position: string }) {
  const host = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { const node = host.current; if (!node || !snapshot) return; node.replaceChildren(snapshot.node); return () => node.replaceChildren(); }, [snapshot]);
  const width = 236, height = snapshot ? 172 : 40;
  const left = position === "left" ? anchor.right + 12 : position === "right" ? anchor.left - width - 12 : anchor.x + anchor.width / 2 - width / 2;
  const top = position === "bottom" ? anchor.top - height - 12 : anchor.y + anchor.height / 2 - height / 2;
  return <div className="dock-preview" role="tooltip" style={{ left: Math.max(8, Math.min(innerWidth - width - 8, left)), top: Math.max(8, Math.min(innerHeight - height - 8, top)) }}>
    <strong>{title}</strong>{snapshot ? <div className="dock-preview-viewport"><div ref={host} style={{ width: snapshot.width, height: snapshot.height, transform: `scale(${212 / snapshot.width})` }} /></div> : <small>尚未打开</small>}
  </div>;
}
