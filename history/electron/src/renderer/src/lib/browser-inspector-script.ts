export function createBrowserInspectorScript() {
  return String.raw`
(() => {
  const apiName = "__chelaInspector";
  const existing = window[apiName];
  if (existing && existing.version === 5) {
    return;
  }

  const CAPTURE_DRAG_THRESHOLD_PX = 8;
  const CAPTURE_MIN_SIZE_PX = 8;
  let enabled = false;
  let overlay = null;
  let label = null;
  let captureOverlay = null;
  let captureHiddenElements = [];
  let hovered = null;
  let pendingTarget = null;
  let frame = 0;
  let pinMode = false;
  let dragState = null;
  let suppressNextClick = false;
  let cancelRequests = 0;
  const selections = [];
  const pins = [];
  const pendingPins = [];
  const pendingCaptures = [];

  const getCssVariable = (name, fallback) => {
    const value = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
  };

  const hexToRgb = (hex) => {
    const value = String(hex || "").trim();
    const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(value);
    if (!match) return null;
    return [
      parseInt(match[1], 16),
      parseInt(match[2], 16),
      parseInt(match[3], 16)
    ];
  };

  const colorWithAlpha = (color, alpha) => {
    const value = String(color || "").trim();
    const rgb = hexToRgb(value);
    if (rgb) {
      return "rgba(" + rgb[0] + ", " + rgb[1] + ", " + rgb[2] + ", " + alpha + ")";
    }
    if (value.startsWith("rgb(")) {
      return value.replace(/^rgb\((.*)\)$/i, "rgba($1, " + alpha + ")");
    }
    return value || "rgba(51, 51, 51, " + alpha + ")";
  };

  const getModeColors = () => {
    if (pinMode) {
      const pin = getCssVariable("--color-browser-pin-bg", "#f57f17");
      return {
        solid: pin,
        subtle: getCssVariable("--color-browser-pin-subtle", colorWithAlpha(pin, 0.14)),
        labelBg: "#1a1a1a",
        labelFg: "#fff8e1"
      };
    }
    const selection = getCssVariable("--color-browser-select-fg", "#333333");
    return {
      solid: selection,
      subtle: getCssVariable("--color-browser-select-subtle", colorWithAlpha(selection, 0.12)),
      labelBg: "#1a1a1a",
      labelFg: "#f5f5f5"
    };
  };

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
      "outline: 2px solid transparent !important",
      "outline-offset: -2px !important",
      "background: transparent !important",
      "box-shadow: 0 0 0 1px rgba(255,255,255,0.9) inset !important",
      "display: none !important"
    ].join(";");
    document.documentElement.appendChild(overlay);
    return overlay;
  };

  const ensureCaptureOverlay = () => {
    if (captureOverlay && document.documentElement.contains(captureOverlay)) {
      return captureOverlay;
    }
    captureOverlay = document.createElement("div");
    captureOverlay.id = "chela-inspector-capture-region";
    captureOverlay.style.cssText = [
      "position: fixed !important",
      "pointer-events: none !important",
      "z-index: 2147483646 !important",
      "outline: 2px solid " + getCssVariable("--color-browser-pin-bg", "#f57f17") + " !important",
      "outline-offset: -2px !important",
      "background: " + getCssVariable("--color-browser-pin-subtle", "rgba(245,127,23,0.14)") + " !important",
      "box-shadow: 0 0 0 1px rgba(255,255,255,0.9) inset !important",
      "display: none !important"
    ].join(";");
    document.documentElement.appendChild(captureOverlay);
    return captureOverlay;
  };

  const getScreenshotMarkerId = (screenshotId) =>
    String(screenshotId || "").replace(/[^a-zA-Z0-9_-]/g, "-");

  const upsertScreenshotMarker = (screenshot) => {
    const rect = screenshot && screenshot.rect;
    const screenshotId = getScreenshotMarkerId(screenshot && screenshot.screenshotId);
    if (!rect || !screenshotId) {
      return false;
    }

    let marker = document.querySelector('.chela-browser-screenshot-marker[data-chela-screenshot-id="' + screenshotId + '"]');
    if (!marker) {
      marker = document.createElement("div");
      marker.className = "chela-browser-screenshot-marker";
      marker.dataset.chelaScreenshotId = screenshotId;
      document.documentElement.appendChild(marker);
    }

    marker.className = "chela-browser-screenshot-marker";
    marker.dataset.chelaScreenshotId = screenshotId;
    marker.title = String(screenshot.comment || "");
    marker.setAttribute("aria-label", String(screenshot.comment || "截图批注"));
    marker.style.cssText = [
      "position: fixed !important",
      "left: " + Math.max(0, Math.round(rect.x)) + "px !important",
      "top: " + Math.max(0, Math.round(rect.y)) + "px !important",
      "width: " + Math.max(1, Math.round(rect.width)) + "px !important",
      "height: " + Math.max(1, Math.round(rect.height)) + "px !important",
      "z-index: 2147483644 !important",
      "pointer-events: none !important",
      "border-radius: 8px !important",
      "outline: 2px dashed " + getCssVariable("--color-browser-select-fg", "#2563eb") + " !important",
      "outline-offset: -2px !important",
      "background: " + getCssVariable("--color-browser-select-subtle", "rgba(37,99,235,0.14)") + " !important",
      "box-shadow: none !important"
    ].join(";");

    let badge = marker.querySelector(".chela-browser-screenshot-marker-badge");
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "chela-browser-screenshot-marker-badge";
      marker.appendChild(badge);
    }
    badge.textContent = String(screenshot.markerNumber || 1);
    badge.style.cssText = [
      "position: absolute !important",
      "left: -13px !important",
      "top: -13px !important",
      "min-width: 22px !important",
      "height: 22px !important",
      "padding: 0 6px !important",
      "display: inline-flex !important",
      "align-items: center !important",
      "justify-content: center !important",
      "border-radius: 999px !important",
      "background: " + getCssVariable("--color-browser-select-fg", "#2563eb") + " !important",
      "color: " + getCssVariable("--color-browser-select-bg", "#ffffff") + " !important",
      "font: 700 12px/1 ui-sans-serif, system-ui, sans-serif !important",
      "box-shadow: 0 6px 20px rgba(0,0,0,0.22) !important"
    ].join(";");

    return true;
  };

  const removeScreenshotMarker = (screenshotId) => {
    const markerId = getScreenshotMarkerId(screenshotId);
    const marker = document.querySelector('.chela-browser-screenshot-marker[data-chela-screenshot-id="' + markerId + '"]');
    if (marker) {
      marker.remove();
    }
    return true;
  };

  const syncScreenshotMarkers = (screenshots) => {
    const nextScreenshots = Array.isArray(screenshots) ? screenshots : [];
    const nextIds = new Set(
      nextScreenshots
        .map((screenshot) => getScreenshotMarkerId(screenshot && screenshot.screenshotId))
        .filter(Boolean)
    );

    for (const marker of Array.from(document.querySelectorAll(".chela-browser-screenshot-marker"))) {
      const markerId = marker.dataset.chelaScreenshotId || "";
      if (!nextIds.has(markerId)) {
        marker.remove();
      }
    }

    nextScreenshots.forEach((screenshot, index) => {
      upsertScreenshotMarker({
        ...screenshot,
        markerNumber: screenshot.markerNumber || index + 1
      });
    });

    return true;
  };

  const getPinKey = (pin) => [
    String(pin.sourceUrl || "").replace(/#.*$/, ""),
    String(pin.selector || "").trim()
  ].join("|");

  const findPinIndex = (pin) => {
    const key = getPinKey(pin);
    return pins.findIndex((item) => getPinKey(item) === key);
  };

  const isSavedPin = (pin) =>
    typeof pin?.comment === "string" && pin.comment.trim().length > 0;

  const getNextMarkerNumber = () => {
    const used = new Set(
      pins
        .filter(isSavedPin)
        .map((pin) => Number(pin.markerNumber))
        .filter((number) => Number.isInteger(number) && number > 0)
    );
    let next = 1;
    while (used.has(next)) {
      next += 1;
    }
    return next;
  };

  const removeUnsavedPins = () => {
    for (let index = pins.length - 1; index >= 0; index -= 1) {
      const pin = pins[index];
      if (isSavedPin(pin)) {
        continue;
      }
      pins.splice(index, 1);
      const marker = document.querySelector('.chela-browser-pin-marker[data-chela-pin-id="' + pin.pinId + '"]');
      if (marker) {
        marker.remove();
      }
    }
    for (let index = pendingPins.length - 1; index >= 0; index -= 1) {
      if (!isSavedPin(pendingPins[index])) {
        pendingPins.splice(index, 1);
      }
    }
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
      "background: " + getCssVariable("--color-browser-pin-bg", "#f57f17") + " !important",
      "color: " + getCssVariable("--color-browser-pin-fg", "#ffffff") + " !important",
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
    target === captureOverlay ||
    target?.id === "chela-inspector-highlight" ||
    target?.id === "chela-inspector-label" ||
    target?.id === "chela-inspector-capture-region" ||
    target?.classList?.contains("chela-browser-screenshot-marker") ||
    target?.classList?.contains("chela-browser-screenshot-marker-badge") ||
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
    const modeColors = getModeColors();
    const nextOverlay = ensureOverlay();
    nextOverlay.style.left = Math.round(rect.left) + "px";
    nextOverlay.style.top = Math.round(rect.top) + "px";
    nextOverlay.style.width = Math.round(rect.width) + "px";
    nextOverlay.style.height = Math.round(rect.height) + "px";
    nextOverlay.style.outlineColor = modeColors.solid;
    nextOverlay.style.background = modeColors.subtle;
    nextOverlay.style.display = "block";

    const nextLabel = ensureLabel();
    nextLabel.textContent =
      labelFor(target) + " " + Math.round(rect.width) + "x" + Math.round(rect.height);
    nextLabel.style.left = Math.max(8, Math.round(rect.left)) + "px";
    nextLabel.style.top = Math.max(8, Math.round(rect.top - 30)) + "px";
    nextLabel.style.background = modeColors.labelBg;
    nextLabel.style.color = modeColors.labelFg;
    nextLabel.style.display = "block";
  };

  const getDragRect = (startX, startY, currentX, currentY) => {
    const left = Math.max(0, Math.min(startX, currentX));
    const top = Math.max(0, Math.min(startY, currentY));
    const right = Math.min(window.innerWidth, Math.max(startX, currentX));
    const bottom = Math.min(window.innerHeight, Math.max(startY, currentY));
    return {
      x: Math.round(left),
      y: Math.round(top),
      width: Math.round(Math.max(0, right - left)),
      height: Math.round(Math.max(0, bottom - top))
    };
  };

  const updateCaptureOverlay = (rect) => {
    const nextOverlay = ensureCaptureOverlay();
    nextOverlay.style.left = rect.x + "px";
    nextOverlay.style.top = rect.y + "px";
    nextOverlay.style.width = rect.width + "px";
    nextOverlay.style.height = rect.height + "px";
    nextOverlay.style.display = "block";
    if (overlay) overlay.style.display = "none";
    const nextLabel = ensureLabel();
    nextLabel.textContent = "截图区域 " + rect.width + "x" + rect.height;
    nextLabel.style.left = Math.max(8, rect.x) + "px";
    nextLabel.style.top = Math.max(8, rect.y - 30) + "px";
    nextLabel.style.background = "#1a1a1a";
    nextLabel.style.color = "#fff8e1";
    nextLabel.style.display = "block";
  };

  const clearCaptureOverlay = () => {
    if (captureOverlay) captureOverlay.style.display = "none";
  };

  const clearInteractionVisuals = () => {
    if (frame) {
      window.cancelAnimationFrame(frame);
      frame = 0;
    }
    hovered = null;
    pendingTarget = null;
    if (overlay) overlay.style.display = "none";
    if (label) label.style.display = "none";
    clearCaptureOverlay();
  };

  const prepareCapture = () => {
    clearInteractionVisuals();
    captureHiddenElements = [
      overlay,
      label,
      captureOverlay,
      ...Array.from(document.querySelectorAll(".chela-browser-pin-marker,.chela-browser-screenshot-marker"))
    ]
      .filter(Boolean)
      .map((element) => ({
        element,
        display: element.style.display
      }));

    for (const item of captureHiddenElements) {
      item.element.style.display = "none";
    }

    return true;
  };

  const restoreCaptureVisuals = () => {
    for (const item of captureHiddenElements) {
      if (item.element && document.documentElement.contains(item.element)) {
        item.element.style.display = item.display || "";
      }
    }
    captureHiddenElements = [];
    return true;
  };

  const queueCancelRequest = () => {
    cancelRequests = 1;
    dragState = null;
    suppressNextClick = true;
    clearInteractionVisuals();
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

  const queueElementTarget = (target) => {
    if (!target || isInspectorElement(target) || typeof target.getBoundingClientRect !== "function") {
      return;
    }

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
      if (!existingPin) {
        removeUnsavedPins();
      }
      const markerNumber = existingPin?.markerNumber || getNextMarkerNumber();
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

  const queueCaptureRegion = (rect) => {
    pendingCaptures.push({
      sourceUrl: window.location.href,
      rect,
      viewport: {
        x: 0,
        y: 0,
        width: window.innerWidth,
        height: window.innerHeight
      },
      title: document.title || null,
      createdAt: new Date().toISOString()
    });
  };

  const onMouseDown = (event) => {
    if (!enabled) return;
    if (event.button === 2) {
      event.preventDefault();
      event.stopPropagation();
      queueCancelRequest();
      return;
    }
    if (event.button !== 0) return;
    const target = event.target || hovered;
    if (!target || isInspectorElement(target)) return;
    event.preventDefault();
    event.stopPropagation();
    dragState = {
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      startedAt: Date.now(),
      target,
      dragging: false
    };
  };

  const onMouseMove = (event) => {
    if (!enabled) return;
    event.preventDefault();
    event.stopPropagation();
    if (dragState) {
      dragState.lastX = event.clientX;
      dragState.lastY = event.clientY;
      const distance = Math.max(
        Math.abs(event.clientX - dragState.startX),
        Math.abs(event.clientY - dragState.startY)
      );
      if (distance >= CAPTURE_DRAG_THRESHOLD_PX) {
        dragState.dragging = true;
      }
      if (dragState.dragging) {
        updateCaptureOverlay(getDragRect(
          dragState.startX,
          dragState.startY,
          event.clientX,
          event.clientY
        ));
        return;
      }
    }
    pendingTarget = event.target;
    if (frame) return;
    frame = window.requestAnimationFrame(() => {
      frame = 0;
      updateHighlight(pendingTarget);
    });
  };

  const onMouseUp = (event) => {
    if (!enabled || !dragState) return;
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const state = dragState;
    dragState = null;
    if (state.dragging) {
      const rect = getDragRect(state.startX, state.startY, event.clientX, event.clientY);
      suppressNextClick = true;
      clearCaptureOverlay();
      if (label) label.style.display = "none";
      if (rect.width >= CAPTURE_MIN_SIZE_PX && rect.height >= CAPTURE_MIN_SIZE_PX) {
        queueCaptureRegion(rect);
      }
      return;
    }
    suppressNextClick = true;
    queueElementTarget(state.target || event.target || hovered);
  };

  const onClick = (event) => {
    if (!enabled) return;
    event.preventDefault();
    event.stopPropagation();
    if (suppressNextClick) {
      suppressNextClick = false;
      return;
    }
    const target = event.target || hovered;
    if (!target || isInspectorElement(target)) return;
    queueElementTarget(target);
  };

  const onContextMenu = (event) => {
    if (!enabled) return;
    event.preventDefault();
    event.stopPropagation();
    queueCancelRequest();
    window[apiName]?.disable?.();
  };

  const onKeyDown = (event) => {
    if (!enabled || event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    queueCancelRequest();
    window[apiName]?.disable?.();
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

  const addInteractionListeners = () => {
    document.addEventListener("mousedown", onMouseDown, true);
    document.addEventListener("mousemove", onMouseMove, true);
    document.addEventListener("mouseup", onMouseUp, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("contextmenu", onContextMenu, true);
    document.addEventListener("keydown", onKeyDown, true);
  };

  const removeInteractionListeners = () => {
    document.removeEventListener("mousedown", onMouseDown, true);
    document.removeEventListener("mousemove", onMouseMove, true);
    document.removeEventListener("mouseup", onMouseUp, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("contextmenu", onContextMenu, true);
    document.removeEventListener("keydown", onKeyDown, true);
  };

  window[apiName] = {
    version: 5,
    enable(options) {
      pinMode = Boolean(options && options.mode === "pin");
      if (enabled) return true;
      enabled = true;
      ensureOverlay();
      ensureLabel();
      ensureCaptureOverlay();
      addInteractionListeners();
      document.documentElement.style.cursor = "crosshair";
      return true;
    },
    disable() {
      enabled = false;
      pinMode = false;
      dragState = null;
      cancelRequests = 0;
      removeInteractionListeners();
      document.documentElement.style.cursor = "";
      clearInteractionVisuals();
      return true;
    },
    consumeSelection() {
      return selections.shift() || null;
    },
    consumePin() {
      return pendingPins.shift() || null;
    },
    consumeCaptureRegion() {
      return pendingCaptures.shift() || null;
    },
    consumeCancelRequest() {
      if (cancelRequests <= 0) return false;
      cancelRequests -= 1;
      return true;
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
    },
    prepareCapture() {
      return prepareCapture();
    },
    restoreCaptureVisuals() {
      return restoreCaptureVisuals();
    },
    upsertScreenshotMarker(screenshot) {
      return upsertScreenshotMarker(screenshot);
    },
    removeScreenshotMarker(screenshotId) {
      return removeScreenshotMarker(screenshotId);
    },
    syncScreenshotMarkers(screenshots) {
      return syncScreenshotMarkers(screenshots);
    }
  };
})();
`;
}
