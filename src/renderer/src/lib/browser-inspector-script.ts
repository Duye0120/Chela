export function createBrowserInspectorScript() {
  return String.raw`
(() => {
  const apiName = "__chelaInspector";
  const existing = window[apiName];
  if (existing && existing.version === 1) {
    return;
  }

  let enabled = false;
  let overlay = null;
  let label = null;
  let hovered = null;
  let pendingTarget = null;
  let frame = 0;
  const selections = [];

  const escapeCss = (value) => {
    if (window.CSS && typeof window.CSS.escape === "function") {
      return window.CSS.escape(value);
    }
    return String(value).replace(/["\\#.:,[\]>+~*^$|=]/g, "\\$&");
  };

  const getClassName = (element) => {
    const raw = element.getAttribute && element.getAttribute("class");
    return typeof raw === "string" ? raw.trim() : "";
  };

  const ensureOverlay = () => {
    if (overlay && document.documentElement.contains(overlay)) {
      return overlay;
    }
    overlay = document.createElement("div");
    overlay.id = "chela-inspector-highlight";
    overlay.style.cssText = [
      "position: fixed !important",
      "pointer-events: none !important",
      "z-index: 2147483646 !important",
      "outline: 2px solid #f97316 !important",
      "outline-offset: -2px !important",
      "background: rgba(249, 115, 22, 0.10) !important",
      "box-shadow: 0 0 0 1px rgba(255,255,255,0.9) inset !important",
      "display: none !important"
    ].join(";");
    document.documentElement.appendChild(overlay);
    return overlay;
  };

  const ensureLabel = () => {
    if (label && document.documentElement.contains(label)) {
      return label;
    }
    label = document.createElement("div");
    label.id = "chela-inspector-label";
    label.style.cssText = [
      "position: fixed !important",
      "pointer-events: none !important",
      "z-index: 2147483647 !important",
      "max-width: min(420px, calc(100vw - 16px)) !important",
      "overflow: hidden !important",
      "text-overflow: ellipsis !important",
      "white-space: nowrap !important",
      "background: #1a1a1a !important",
      "color: #fff7ed !important",
      "padding: 4px 8px !important",
      "border-radius: 6px !important",
      "font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace !important",
      "display: none !important"
    ].join(";");
    document.documentElement.appendChild(label);
    return label;
  };

  const isInspectorElement = (target) =>
    target === overlay || target === label ||
    target?.id === "chela-inspector-highlight" ||
    target?.id === "chela-inspector-label";

  const selectorFor = (element) => {
    const parts = [];
    let current = element;
    while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.documentElement) {
      let selector = current.tagName.toLowerCase();
      const id = current.getAttribute("id");
      if (id) {
        parts.unshift(selector + "#" + escapeCss(id));
        break;
      }

      const className = getClassName(current);
      if (className) {
        const classes = className.split(/\s+/).filter(Boolean).slice(0, 3);
        if (classes.length > 0) {
          selector += "." + classes.map(escapeCss).join(".");
        }
      }

      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter((item) => item.tagName === current.tagName);
        if (siblings.length > 1) {
          selector += ":nth-of-type(" + (siblings.indexOf(current) + 1) + ")";
        }
      }

      parts.unshift(selector);
      current = parent;
    }

    return parts.join(" > ");
  };

  const labelFor = (element) => {
    const tagName = element.tagName.toLowerCase();
    const id = element.getAttribute("id");
    const firstClass = getClassName(element).split(/\s+/).find(Boolean);
    return tagName + (id ? "#" + id : firstClass ? "." + firstClass : "");
  };

  const updateHighlight = (target) => {
    if (!target || isInspectorElement(target) || typeof target.getBoundingClientRect !== "function") {
      return;
    }

    hovered = target;
    const rect = target.getBoundingClientRect();
    const nextOverlay = ensureOverlay();
    nextOverlay.style.left = Math.round(rect.left) + "px";
    nextOverlay.style.top = Math.round(rect.top) + "px";
    nextOverlay.style.width = Math.round(rect.width) + "px";
    nextOverlay.style.height = Math.round(rect.height) + "px";
    nextOverlay.style.display = "block";

    const nextLabel = ensureLabel();
    nextLabel.textContent =
      labelFor(target) + " " + Math.round(rect.width) + "x" + Math.round(rect.height);
    nextLabel.style.left = Math.max(8, Math.round(rect.left)) + "px";
    nextLabel.style.top = Math.max(8, Math.round(rect.top - 30)) + "px";
    nextLabel.style.display = "block";
  };

  const collectElement = (element) => {
    const rect = element.getBoundingClientRect();
    const styles = window.getComputedStyle(element);
    return {
      sourceUrl: window.location.href,
      selector: selectorFor(element),
      tagName: element.tagName.toLowerCase(),
      id: element.getAttribute("id") || null,
      className: getClassName(element) || null,
      textContent: (element.textContent || "").trim().slice(0, 1000) || null,
      outerHTML: (element.outerHTML || "").slice(0, 4000) || null,
      boundingRect: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      },
      styles: {
        display: styles.display,
        position: styles.position,
        width: styles.width,
        height: styles.height,
        backgroundColor: styles.backgroundColor,
        color: styles.color,
        fontSize: styles.fontSize,
        padding: styles.padding,
        margin: styles.margin
      }
    };
  };

  const onMouseMove = (event) => {
    if (!enabled) return;
    event.preventDefault();
    event.stopPropagation();
    pendingTarget = event.target;
    if (frame) return;
    frame = window.requestAnimationFrame(() => {
      frame = 0;
      updateHighlight(pendingTarget);
    });
  };

  const onClick = (event) => {
    if (!enabled) return;
    event.preventDefault();
    event.stopPropagation();
    const target = event.target || hovered;
    if (!target || isInspectorElement(target)) return;
    selections.push(collectElement(target));
  };

  window[apiName] = {
    version: 1,
    enable() {
      if (enabled) return true;
      enabled = true;
      ensureOverlay();
      ensureLabel();
      document.addEventListener("mousemove", onMouseMove, true);
      document.addEventListener("click", onClick, true);
      document.documentElement.style.cursor = "crosshair";
      return true;
    },
    disable() {
      enabled = false;
      document.removeEventListener("mousemove", onMouseMove, true);
      document.removeEventListener("click", onClick, true);
      document.documentElement.style.cursor = "";
      if (overlay) overlay.style.display = "none";
      if (label) label.style.display = "none";
      return true;
    },
    consumeSelection() {
      return selections.shift() || null;
    }
  };
})();
`;
}
