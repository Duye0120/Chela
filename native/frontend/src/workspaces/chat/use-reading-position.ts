import { useLayoutEffect, useRef, useState } from "react";

const positions = new Map<string, { top: number; question?: string }>();

export function useReadingPosition(session: string, branch: string, question: string | undefined, empty: boolean) {
  const history = useRef<HTMLDivElement>(null);
  const animation = useRef(0);
  const [latestHidden, setLatestHidden] = useState(false);
  const key = `${session}:${branch}`;
  useLayoutEffect(() => {
    const node = history.current;
    if (!node || empty) return;
    const list = node.querySelector<HTMLElement>(".chat-message-list")!;
    const space = node.querySelector<HTMLElement>(".chat-reading-space")!;
    const saved = positions.get(key);
    const latestQuestion = [...list.querySelectorAll<HTMLElement>('[data-role="user"]')].find(item => item.dataset.messageId === question);
    const update = () => {
      const last = list.lastElementChild;
      const padding = parseFloat(getComputedStyle(node).paddingTop);
      const turnHeight = latestQuestion ? list.getBoundingClientRect().bottom - latestQuestion.getBoundingClientRect().top : list.clientHeight;
      space.style.height = `${latestQuestion ? Math.max(0, node.clientHeight - padding * 2 - turnHeight) : 0}px`;
      setLatestHidden(Boolean(last && last.getBoundingClientRect().bottom > node.getBoundingClientRect().bottom - padding + 1));
    };
    update();
    // Only a new question changes the reading anchor; streaming and completion keep the current position.
    node.scrollTop = saved && saved.question === question ? saved.top : latestQuestion ? node.scrollTop + latestQuestion.getBoundingClientRect().top - node.getBoundingClientRect().top - parseFloat(getComputedStyle(node).paddingTop) : 0;
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node); observer.observe(list);
    let top = node.scrollTop;
    const scroll = () => { top = node.scrollTop; positions.set(key, { top, question }); update(); };
    const cancel = () => cancelAnimationFrame(animation.current);
    node.addEventListener("scroll", scroll, { passive: true });
    node.addEventListener("wheel", cancel, { passive: true });
    node.addEventListener("pointerdown", cancel);
    node.addEventListener("keydown", cancel);
    return () => { cancel(); positions.set(key, { top, question }); observer.disconnect(); node.removeEventListener("scroll", scroll); node.removeEventListener("wheel", cancel); node.removeEventListener("pointerdown", cancel); node.removeEventListener("keydown", cancel); };
  }, [key, question, empty]);

  function viewLatest() {
    const node = history.current, last = node?.querySelector(".chat-message-list")?.lastElementChild;
    if (!node || !last) return;
    const top = Math.max(0, node.scrollTop + last.getBoundingClientRect().bottom - node.getBoundingClientRect().bottom + parseFloat(getComputedStyle(node).paddingBottom));
    cancelAnimationFrame(animation.current);
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.reducedMotion === "true") { node.scrollTop = top; return; }
    const from = node.scrollTop, start = performance.now();
    const step = (time: number) => {
      const progress = Math.min(1, (time - start) / 200);
      node.scrollTop = from + (top - from) * (1 - (1 - progress) ** 3);
      if (progress < 1) animation.current = requestAnimationFrame(step);
    };
    animation.current = requestAnimationFrame(step);
  }
  return { history, latestHidden, viewLatest };
}
