import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export type PaneLayout = string | { direction: "rows" | "columns"; first: PaneLayout; second: PaneLayout };
export function splitPane(tree: PaneLayout, target: string, id: string, direction: "rows" | "columns"): PaneLayout {
  if (typeof tree === "string") return tree === target ? { direction, first: tree, second: id } : tree;
  return { ...tree, first: splitPane(tree.first, target, id, direction), second: splitPane(tree.second, target, id, direction) };
}
export function prunePanes(tree: PaneLayout, ids: string[]): PaneLayout | null {
  if (typeof tree === "string") return ids.includes(tree) ? tree : null;
  const first = prunePanes(tree.first, ids), second = prunePanes(tree.second, ids);
  return first && second ? { ...tree, first, second } : first || second;
}
export function initialPanes(ids: string[]): PaneLayout | null {
  if (!ids.length) return null;
  if (ids.length === 1) return ids[0];
  return { direction: ids.length === 3 ? "columns" : "rows", first: ids[0], second: initialPanes(ids.slice(1))! };
}
export function PaneSplit({ tree, maximized, render }: { tree: PaneLayout; maximized: string; render: (id: string) => ReactNode }) {
  const host = useRef<HTMLDivElement>(null), stop = useRef<(() => void) | null>(null);
  const [ratio, setRatio] = useState(.5), [dragging, setDragging] = useState(false);
  useEffect(() => () => stop.current?.(), []);
  if (typeof tree === "string") return render(tree);
  const vertical = tree.direction === "columns";
  const contains = (node: PaneLayout): boolean => typeof node === "string" ? node === maximized : contains(node.first) || contains(node.second);
  return <div className="terminal-split" ref={host} data-direction={tree.direction} style={{ flexDirection: vertical ? "row" : "column" }}>
    <div className="terminal-split-child" hidden={Boolean(maximized && !contains(tree.first))} style={{ flex: maximized ? 1 : ratio }}><PaneSplit tree={tree.first} maximized={maximized} render={render} /></div>
    <div hidden={Boolean(maximized)} role="separator" aria-label={vertical ? "调整终端左右宽度" : "调整终端上下高度"} aria-orientation={vertical ? "vertical" : "horizontal"} aria-valuemin={20} aria-valuemax={80} aria-valuenow={Math.round(ratio * 100)} tabIndex={0} className="terminal-split-handle"
      onKeyDown={event => { const delta = ["ArrowRight", "ArrowDown"].includes(event.key) ? .05 : ["ArrowLeft", "ArrowUp"].includes(event.key) ? -.05 : 0; if (delta) { event.preventDefault(); setRatio(value => Math.max(.2, Math.min(.8, value + delta))); } }}
      onPointerDown={event => {
        if (event.button !== 0) return;
        event.preventDefault(); stop.current?.();
        const rect = host.current!.getBoundingClientRect();
        const move = (value: PointerEvent) => setRatio(Math.max(.2, Math.min(.8, vertical ? (value.clientX - rect.left) / rect.width : (value.clientY - rect.top) / rect.height)));
        const finish = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", finish); window.removeEventListener("pointercancel", finish); window.removeEventListener("blur", finish); window.removeEventListener("keydown", key); document.documentElement.removeAttribute("data-chela-resizing"); setDragging(false); stop.current = null; };
        const key = (value: KeyboardEvent) => { if (value.key === "Escape") finish(); };
        stop.current = finish; setDragging(true); document.documentElement.dataset.chelaResizing = "true";
        window.addEventListener("pointermove", move); window.addEventListener("pointerup", finish); window.addEventListener("pointercancel", finish); window.addEventListener("blur", finish); window.addEventListener("keydown", key);
      }} />
    <div className="terminal-split-child" hidden={Boolean(maximized && !contains(tree.second))} style={{ flex: maximized ? 1 : 1 - ratio }}><PaneSplit tree={tree.second} maximized={maximized} render={render} /></div>
    {dragging && createPortal(<div className="ui-resize-shield" style={{ cursor: vertical ? "col-resize" : "row-resize" }} />, document.body)}
  </div>;
}
