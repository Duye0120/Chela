import { useEffect, useRef, type CSSProperties } from "react";
import "./chela-avatar.css";

export type AvatarExpression = "idle" | "peeking" | "speaking" | "wink" | "thinking" | "alert" | "sleepy";
export function ChelaAvatar({ expression = "idle", size = 60, interactive = false, motion = false }: { expression?: AvatarExpression; size?: 24 | 40 | 60; interactive?: boolean; motion?: boolean }) {
  const host = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!interactive) return;
    const node = host.current!, media = matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    const reset = () => { cancelAnimationFrame(frame); node.style.removeProperty("--eye-x"); node.style.removeProperty("--eye-y"); };
    const move = (event: PointerEvent) => {
      if (media.matches || document.documentElement.dataset.reducedMotion === "true" || event.pointerType === "touch") { reset(); return; }
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = node.getBoundingClientRect();
        const x = Math.max(-4, Math.min(4, (event.clientX - rect.x - rect.width / 2) / 40));
        const y = Math.max(-3, Math.min(3, (event.clientY - rect.y - rect.height / 2) / 50));
        node.style.setProperty("--eye-x", `${x}px`); node.style.setProperty("--eye-y", `${y}px`);
      });
    };
    const preference = new MutationObserver(reset); preference.observe(document.documentElement, { attributes: true, attributeFilter: ["data-reduced-motion"] });
    window.addEventListener("pointermove", move, { passive: true }); window.addEventListener("blur", reset); document.addEventListener("pointerleave", reset); media.addEventListener("change", reset);
    return () => { reset(); preference.disconnect(); window.removeEventListener("pointermove", move); window.removeEventListener("blur", reset); document.removeEventListener("pointerleave", reset); media.removeEventListener("change", reset); };
  }, [interactive]);
  return <span ref={host} className="chela-avatar" data-expression={expression} data-motion={motion} style={{ "--avatar-size": `${size}px`, "--avatar-scale": size / 60 } as CSSProperties} aria-hidden="true">
    <span className="chela-avatar-stage"><span className="chela-avatar-orb"><span className="chela-avatar-gaze"><span className="chela-avatar-eyes"><i /><i /></span></span></span></span>
  </span>;
}
