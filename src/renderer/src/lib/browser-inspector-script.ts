export function createBrowserInspectorScript() {
  return String.raw`
(() => {
  const apiName = "__chelaInspector";
  const existing = window[apiName];
  if (existing && existing.version === 2) {
    return;
  }

  let enabled = false;
  let overlay = null;
  let label = null;
  let hovered = null;
  let pendingTarget = null;
  let frame = 0;
  let pinMode = false;
  let pinCounter = 0;
  const selections = [];
  const pins = [];
  const pendingPins = [];

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

  const getPinKey = (pin) => [
    String(pin.sourceUrl || "").replace(/#.*$/, ""),
    String(pin.selector || "").trim()
  ].join("|");

  const findPinIndex = (pin) => {
    const key = getPinKey(pin);
    return pins.findIndex((item) => getPinKey(item) === key);
  };

  const updatePinComment = (pinId, comment) => {
    const pin = pins.find((item) => item.pinId === pinId);
    if (pin) {
      pin.comment = String(comment || "");
    }
    const marker = document.querySelector('.chela-browser-pin-marker[data-chela-pin-id="' + pinId + '"]');
    if (marker) {
      marker.title = String(comment || "");
      marker.setAttribute("aria-label", String(comment || ""));
    }
    return Boolean(pin || marker);
  };

  const upsertPinMarker = (rect, number, pinId) => {
    let marker = document.querySelector('.chela-browser-pin-marker[data-chela-pin-id="' + pinId + '"]');
    if (!marker) {
      marker = document.createElement("div");
      marker.className = "chela-browser-pin-marker";
      marker.dataset.chelaPinId = pinId;
      document.documentElement.appendChild(marker);
    }
    marker.className = "chela-browser-pin-marker";
    marker.dataset.chelaPinId = pinId;
    marker.textContent = String(number);
    marker.style.cssText = [
      "position: fixed !important",
      "left: " + Math.max(8, Math.round(rect.left)) + "px !important",
      "top: " + Math.max(8, Math.round(rect.top)) + "px !important",
      "z-index: 2147483645 !important",
      "min-width: 22px !important",
      "height: 22px !important",
      "padding: 0 6px !important",
      "display: inline-flex !important",
      "align-items: center !important",
      "justify-content: center !important",
      "border-radius: 999px !important",
      "background: #f97316 !important",
      "color: #ffffff !important",
      "font: 700 12px/1 ui-sans-serif, system-ui, sans-serif !important",
      "box-shadow: 0 6px 20px rgba(0,0,0,0.22) !important",
      "pointer-events: none !important"
    ].join(";");
    return marker;
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
    target?.id === "chela-inspector-label" ||
    target?.classList?.contains("chela-browser-pin-marker");

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


  const cleanText = (value, maxLength) => {
    const normalized = String(value || "").replace(/\s+/g, " ").trim();
    if (normalized.length <= maxLength) return normalized;
    return normalized.slice(0, maxLength).trimEnd() + "...";
  };

  const isVisible = (element) => {
    if (!element || typeof element.getBoundingClientRect !== "function") return false;
    const rect = element.getBoundingClientRect();
    const styles = window.getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && styles.visibility !== "hidden" && styles.display !== "none";
  };

  const collectPageSnapshot = () => {
    const description = document.querySelector('meta[name="description"]')?.getAttribute("content") || null;
    const headings = Array.from(document.querySelectorAll("h1,h2,h3"))
      .filter(isVisible)
      .map((element) => cleanText(element.textContent, 120))
      .filter(Boolean)
      .slice(0, 12);
    const visibleText = cleanText(document.body?.innerText || "", 4000);
    const interactiveElements = Array.from(document.querySelectorAll("a,button,input,textarea,select,[role='button'],[role='link'],[role='textbox'],[tabindex]"))
      .filter(isVisible)
      .map((element) => {
        const tagName = element.tagName.toLowerCase();
        const label =
          cleanText(element.getAttribute("aria-label"), 100) ||
          cleanText(element.getAttribute("title"), 100) ||
          cleanText(element.textContent, 100) ||
          cleanText(element.getAttribute("placeholder"), 100) ||
          cleanText(element.getAttribute("value"), 100) ||
          tagName;
        return {
          label,
          selector: selectorFor(element),
          tagName,
          role: element.getAttribute("role") || null,
          href: element.getAttribute("href") || null,
          inputType: element.getAttribute("type") || null
        };
      })
      .filter((element) => element.label)
      .slice(0, 30);

    return {
      sourceUrl: window.location.href,
      title: document.title || null,
      description,
      viewport: {
        x: 0,
        y: 0,
        width: window.innerWidth,
        height: window.innerHeight
      },
      headings,
      visibleText,
      interactiveElements
    };
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
    const element = collectElement(target);
    if (pinMode) {
      const rect = target.getBoundingClientRect();
      const basePin = {
        sourceUrl: element.sourceUrl,
        selector: element.selector,
        tagName: element.tagName,
        textContent: element.textContent,
        boundingRect: element.boundingRect,
        viewport: {
          x: 0,
          y: 0,
          width: window.innerWidth,
          height: window.innerHeight
        },
        styles: element.styles
      };
      const existingIndex = findPinIndex(basePin);
      const existingPin = existingIndex >= 0 ? pins[existingIndex] : null;
      const markerNumber = existingPin?.markerNumber || (pinCounter += 1);
      const pinId = existingPin?.pinId || ("chela-pin-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8));
      upsertPinMarker(rect, markerNumber, pinId);
      const pendingPin = {
        ...existingPin,
        ...basePin,
        pinId,
        markerNumber
      };
      if (existingIndex >= 0) {
        pins[existingIndex] = pendingPin;
      } else {
        pins.push(pendingPin);
      }
      const pendingIndex = pendingPins.findIndex((item) => item.pinId === pinId);
      if (pendingIndex >= 0) {
        pendingPins.splice(pendingIndex, 1);
      }
      if (typeof pendingPin.comment === "string") {
        updatePinComment(pinId, pendingPin.comment);
      }
      pendingPins.push(pendingPin);
      return;
    }
    selections.push(element);
  };


  const focusPin = (pinId) => {
    const pin = pins.find((item) => item.pinId === pinId);
    const selector = pin && pin.selector;
    if (!selector) return { ok: false, reason: "pin-not-found" };
    let element = null;
    try {
      element = document.querySelector(selector);
    } catch {
      return { ok: false, reason: "selector-invalid" };
    }
    if (!element || typeof element.getBoundingClientRect !== "function") {
      return { ok: false, reason: "element-not-found" };
    }
    element.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
    const rect = element.getBoundingClientRect();
    updateHighlight(element);
    const marker = document.querySelector('.chela-browser-pin-marker[data-chela-pin-id="' + pinId + '"]');
    if (marker) {
      marker.style.transform = "scale(1.18)";
      marker.style.boxShadow = "0 0 0 4px rgba(249,115,22,0.28), 0 8px 24px rgba(0,0,0,0.28)";
      window.setTimeout(() => {
        marker.style.transform = "";
        marker.style.boxShadow = "0 6px 20px rgba(0,0,0,0.22)";
      }, 900);
    }
    return {
      ok: true,
      pinId,
      boundingRect: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      }
    };
  };

  const removePin = (pinId) => {
    const index = pins.findIndex((item) => item.pinId === pinId);
    if (index >= 0) {
      pins.splice(index, 1);
    }
    for (let index = pendingPins.length - 1; index >= 0; index -= 1) {
      if (pendingPins[index].pinId === pinId) {
        pendingPins.splice(index, 1);
      }
    }
    const marker = document.querySelector('.chela-browser-pin-marker[data-chela-pin-id="' + pinId + '"]');
    if (marker) {
      marker.remove();
    }
    return true;
  };

  window[apiName] = {
    version: 2,
    enable(options) {
      pinMode = Boolean(options && options.mode === "pin");
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
      pinMode = false;
      document.removeEventListener("mousemove", onMouseMove, true);
      document.removeEventListener("click", onClick, true);
      document.documentElement.style.cursor = "";
      if (overlay) overlay.style.display = "none";
      if (label) label.style.display = "none";
      return true;
    },
    consumeSelection() {
      return selections.shift() || null;
    },
    consumePin() {
      return pendingPins.shift() || null;
    },
    setMode(mode) {
      pinMode = mode === "pin";
      return true;
    },
    collectPageSnapshot() {
      return collectPageSnapshot();
    },
    listPins() {
      return pins.slice();
    },
    focusPin(pinId) {
      return focusPin(pinId);
    },
    removePin(pinId) {
      return removePin(pinId);
    },
    updatePinComment(pinId, comment) {
      return updatePinComment(pinId, comment);
    }
  };
})();
`;
}
