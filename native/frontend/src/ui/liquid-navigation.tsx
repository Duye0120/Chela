import { useId, useLayoutEffect, useRef } from "react";

export function LiquidNavigation({ sections, value, onChange }: { sections: readonly string[]; value: string; onChange: (value: string) => void }) {
  const nav = useRef<HTMLElement>(null), body = useRef<HTMLSpanElement>(null), edge = useRef<HTMLSpanElement>(null), trail = useRef<HTMLSpanElement>(null), previous = useRef<{ x: number; width: number } | null>(null);
  const filter = "liquid-" + useId().replaceAll(":", "");
  useLayoutEffect(() => {
    const node = nav.current!, nodes = [body.current!, edge.current!, trail.current!];
    function place() {
      const button = node.querySelector<HTMLButtonElement>('[aria-current="location"]');
      if (!button) return;
      const next = { x: button.offsetLeft, width: button.offsetWidth }, old = previous.current;
      const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.reducedMotion === "true";
      if (old?.x === next.x && old?.width === next.width && !reduced) return;
      nodes.forEach(element => element.getAnimations().forEach(animation => animation.cancel()));
      for (const element of nodes.slice(0, 2)) { element.style.width = `${next.width}px`; element.style.transform = `translateX(${next.x}px)`; }
      previous.current = next;
      if (!old || old.x === next.x || reduced) return;
      const from = `translateX(${old.x}px) scaleX(${old.width / next.width})`, end = `translateX(${next.x}px) scaleX(1)`, direction = Math.sign(next.x - old.x);
      const frames = [{ transform: from }, { transform: `translateX(${old.x + (next.x - old.x) * .4}px) scaleX(1.45)`, offset: .35 }, { transform: `translateX(${next.x + direction * 6}px) scaleX(1.16)`, offset: .65 }, { transform: end }];
      nodes.slice(0, 2).forEach(element => { void element.animate(frames, { duration: 340, easing: "cubic-bezier(.2,.7,.2,1)" }).finished.catch(() => {}); });
      trail.current!.style.transform = `translateX(${old.x + old.width / 2 - 20}px)`;
      void trail.current!.animate([{ opacity: 0, transform: `translateX(${old.x}px) scaleX(.4)` }, { opacity: .85, transform: `translateX(${old.x + (next.x - old.x) * .35}px) scaleX(1.3)`, offset: .35 }, { opacity: 0, transform: `translateX(${next.x}px) scaleX(.3)` }], { duration: 340 }).finished.catch(() => {});
    }
    place();
    const resize = new ResizeObserver(place); node.querySelectorAll("button").forEach(button => resize.observe(button));
    const preferences = new MutationObserver(place); preferences.observe(document.documentElement, { attributes: true, attributeFilter: ["data-reduced-motion"] });
    const media = matchMedia("(prefers-reduced-motion: reduce)"); media.addEventListener("change", place);
    return () => { resize.disconnect(); preferences.disconnect(); media.removeEventListener("change", place); nodes.forEach(element => element.getAnimations().forEach(animation => animation.cancel())); };
  }, [value, sections]);
  return <nav ref={nav} aria-label="设置子导航" className="ui-settings-subnav" data-liquid>
    <svg width="0" height="0" aria-hidden="true"><defs><filter id={filter} x="-30%" y="-50%" width="160%" height="200%"><feGaussianBlur in="SourceGraphic" stdDeviation="5" /><feColorMatrix values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 20 -9" /></filter></defs></svg>
    <span className="ui-liquid-goo" style={{ filter: `url(#${filter})` }} aria-hidden="true"><span ref={trail} className="ui-liquid-trail" /><span ref={body} className="ui-liquid-body" /></span><span ref={edge} className="ui-liquid-edge" aria-hidden="true" />
    {sections.map(section => <button key={section} type="button" aria-current={value === section ? "location" : undefined} onClick={() => onChange(section)}>{section}</button>)}
  </nav>;
}
