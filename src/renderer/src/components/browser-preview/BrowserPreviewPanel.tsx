import {
  useCallback,
  useEffect,
  memo,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  Globe2Icon,
  MapPinIcon,
  RefreshCwIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@renderer/components/assistant-ui/button";
import { PreviewSurface, Surface } from "@renderer/components/assistant-ui/surface";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@renderer/components/ui/tooltip";
import { createBrowserInspectorScript } from "@renderer/lib/browser-inspector-script";
import {
  DEFAULT_BROWSER_PREVIEW_URL,
  createBrowserPageSnapshotContextItem,
  createBrowserPinContextItem,
  createBrowserScreenshotContextItem,
  formatBrowserContextChipLabel,
  normalizeBrowserPreviewUrl,
  type BrowserContextItem,
  type BrowserPagePin,
  type BrowserPageSnapshot,
} from "@renderer/lib/browser-interview";
import { cn } from "@renderer/lib/utils";
import type { SelectedFile } from "@shared/contracts";

type BrowserPreviewPanelProps = {
  onClose: () => void;
  onElementSelected: (item: BrowserContextItem) => void;
  onScreenshotCaptured: (files: SelectedFile[]) => Promise<void> | void;
  browserContextItems: BrowserContextItem[];
  resetInteractionSignal?: number;
  className?: string;
};

type BrowserLoadState = "idle" | "loading" | "ready" | "error";

type BrowserNavigationState = {
  canGoBack: boolean;
  canGoForward: boolean;
};

type BrowserWebViewElement = HTMLElement & {
  executeJavaScript: (code: string, userGesture?: boolean) => Promise<unknown>;
  reload?: () => void;
  goBack?: () => void;
  goForward?: () => void;
  canGoBack?: () => boolean;
  canGoForward?: () => boolean;
  capturePage?: (rect?: BrowserCaptureRect) => Promise<BrowserCaptureImage>;
};

type BrowserPendingPin = Omit<BrowserPagePin, "comment"> & {
  comment?: string | null;
};

type BrowserCaptureRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type BrowserCaptureImage = {
  toPNG?: () => Uint8Array;
  toDataURL?: () => string;
};

type BrowserCaptureRegion = {
  sourceUrl?: string | null;
  rect: BrowserCaptureRect;
  viewport?: BrowserCaptureRect | null;
  title?: string | null;
};

type BrowserPendingScreenshot = BrowserCaptureRegion & {
  screenshotId: string;
  markerNumber: number;
  imageBuffer: ArrayBuffer;
  imageUrl: string;
};

type BrowserScreenshotMarkerPayload = {
  screenshotId: string;
  markerNumber: number;
  rect: BrowserCaptureRect;
  comment: string;
};

const BROWSER_PREVIEW_URL_STORAGE_KEY = "chela.browser-preview.url";
const PIN_COMPOSER_WIDTH_PX = 320;
const SCREENSHOT_COMPOSER_WIDTH_PX = 340;

function readInitialBrowserUrl() {
  if (typeof window === "undefined") {
    return DEFAULT_BROWSER_PREVIEW_URL;
  }

  return (
    normalizeBrowserPreviewUrl(
      window.localStorage.getItem(BROWSER_PREVIEW_URL_STORAGE_KEY) ?? "",
    ) || DEFAULT_BROWSER_PREVIEW_URL
  );
}

function isBrowserPendingPin(value: unknown): value is BrowserPendingPin {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<BrowserPagePin>;
  return (
    typeof candidate.selector === "string" &&
    candidate.selector.trim().length > 0 &&
    typeof candidate.tagName === "string" &&
    candidate.tagName.trim().length > 0
  );
}

function isBrowserCaptureRegion(value: unknown): value is BrowserCaptureRegion {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<BrowserCaptureRegion>;
  const rect = candidate.rect;
  return (
    Boolean(rect) &&
    typeof rect?.x === "number" &&
    typeof rect.y === "number" &&
    typeof rect.width === "number" &&
    typeof rect.height === "number" &&
    rect.width > 0 &&
    rect.height > 0
  );
}

function isBrowserPageSnapshot(value: unknown): value is BrowserPageSnapshot {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<BrowserPageSnapshot>;
  return (
    typeof candidate.sourceUrl === "string" ||
    typeof candidate.title === "string" ||
    typeof candidate.visibleText === "string"
  );
}

function getNavigationUrl(event: Event) {
  const candidate = event as Event & { url?: unknown };
  return typeof candidate.url === "string" ? candidate.url : null;
}

function canonicalizeBrowserPinUrl(value: string | null | undefined) {
  const raw = value?.trim();
  if (!raw) {
    return "";
  }

  try {
    const url = new URL(raw);
    url.hash = "";
    return url.toString();
  } catch {
    return raw.replace(/#.*$/u, "");
  }
}

function getBrowserPinKey(pin: Pick<BrowserPagePin, "sourceUrl" | "selector">) {
  return [
    canonicalizeBrowserPinUrl(pin.sourceUrl),
    pin.selector.trim(),
  ].join("|");
}

function getPinTargetLabel(pin: Pick<BrowserPagePin, "tagName" | "textContent">) {
  const tag = pin.tagName?.trim().toLowerCase() || "element";
  const text = pin.textContent?.replace(/\s+/gu, " ").trim();
  return text ? `<${tag}> ${text.slice(0, 48)}` : `<${tag}>`;
}

function getPinComposerStyle(pin: BrowserPendingPin): CSSProperties {
  const rect = pin.boundingRect;
  if (!rect) {
    return {
      left: 12,
      top: 12,
      width: `min(${PIN_COMPOSER_WIDTH_PX}px, calc(100% - 24px))`,
    };
  }

  const preferredLeft = Math.round(rect.x + Math.min(rect.width, 36) + 12);
  const preferredTop = Math.round(rect.y);

  return {
    left: `max(12px, min(${preferredLeft}px, calc(100% - ${PIN_COMPOSER_WIDTH_PX + 12}px)))`,
    top: `max(12px, min(${preferredTop}px, calc(100% - 172px)))`,
    width: `min(${PIN_COMPOSER_WIDTH_PX}px, calc(100% - 24px))`,
  };
}

function getScreenshotComposerStyle(
  screenshot: BrowserPendingScreenshot,
): CSSProperties {
  const rect = screenshot.rect;
  const preferredLeft = Math.round(rect.x + Math.min(rect.width, 36) + 12);
  const preferredTop = Math.round(rect.y);

  return {
    left: `max(12px, min(${preferredLeft}px, calc(100% - ${SCREENSHOT_COMPOSER_WIDTH_PX + 12}px)))`,
    top: `max(12px, min(${preferredTop}px, calc(100% - 260px)))`,
    width: `min(${SCREENSHOT_COMPOSER_WIDTH_PX}px, calc(100% - 24px))`,
  };
}

function getPngArrayBuffer(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function getPngArrayBufferFromDataUrl(dataUrl: string) {
  const [, base64 = ""] = dataUrl.split(",");
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

function getScreenshotName(region: BrowserCaptureRegion) {
  const date = new Date();
  const stamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
    String(date.getSeconds()).padStart(2, "0"),
  ].join("");
  const title = region.title?.trim().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/gu, "").slice(0, 32);
  return `browser-region-${title ? `${title}-` : ""}${stamp}.png`;
}

function createBrowserScreenshotId() {
  return `browser-screenshot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeCaptureRect(rect: BrowserCaptureRect): BrowserCaptureRect {
  return {
    x: Math.max(0, Math.round(rect.x)),
    y: Math.max(0, Math.round(rect.y)),
    width: Math.max(1, Math.round(rect.width)),
    height: Math.max(1, Math.round(rect.height)),
  };
}

function waitForBrowserPaint() {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, 48);
  });
}

function createScreenshotMarkerPayloads(
  items: readonly BrowserContextItem[],
): BrowserScreenshotMarkerPayload[] {
  return items.flatMap((item, index) => {
    const screenshot = item.kind === "screenshot" ? item.screenshot : null;
    const rect = screenshot?.boundingRect;
    if (!screenshot?.screenshotId || !rect) {
      return [];
    }

    return [{
      screenshotId: screenshot.screenshotId,
      markerNumber: index + 1,
      rect: normalizeCaptureRect(rect),
      comment: screenshot.comment,
    }];
  });
}

const BrowserPreviewPanelImpl = ({
  onClose,
  onElementSelected,
  onScreenshotCaptured,
  browserContextItems,
  resetInteractionSignal = 0,
  className,
}: BrowserPreviewPanelProps) => {
  const [currentUrl, setCurrentUrl] = useState(readInitialBrowserUrl);
  const [draftUrl, setDraftUrl] = useState(currentUrl);
  const [loadState, setLoadState] = useState<BrowserLoadState>("idle");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pinModeEnabled, setPinModeEnabled] = useState(false);
  const [pendingPin, setPendingPin] = useState<BrowserPendingPin | null>(null);
  const [pinCommentDraft, setPinCommentDraft] = useState("");
  const [pendingScreenshot, setPendingScreenshot] =
    useState<BrowserPendingScreenshot | null>(null);
  const [screenshotCommentDraft, setScreenshotCommentDraft] = useState("");
  const [pagePins, setPagePins] = useState<BrowserPagePin[]>([]);
  const [pageTitle, setPageTitle] = useState<string | null>(null);
  const [snapshotBusy, setSnapshotBusy] = useState(false);
  const [navigationState, setNavigationState] = useState<BrowserNavigationState>({
    canGoBack: false,
    canGoForward: false,
  });
  const [webviewElement, setWebviewElement] =
    useState<BrowserWebViewElement | null>(null);
  const pollingRef = useRef<number | null>(null);
  const pagePinsRef = useRef(pagePins);
  const screenshotMarkerCounterRef = useRef(0);
  const resetInteractionSignalRef = useRef(resetInteractionSignal);
  const hasPendingComposer = Boolean(pendingPin || pendingScreenshot);
  const screenshotMarkerPayloads = useMemo(
    () => createScreenshotMarkerPayloads(browserContextItems),
    [browserContextItems],
  );
  const screenshotMarkerSignature = useMemo(
    () => JSON.stringify(screenshotMarkerPayloads),
    [screenshotMarkerPayloads],
  );

  const handleWebviewRef = useCallback((node: HTMLElement | null) => {
    const nextNode = node as BrowserWebViewElement | null;
    setWebviewElement((current) => (current === nextNode ? current : nextNode));
  }, []);

  useEffect(() => {
    window.localStorage.setItem(BROWSER_PREVIEW_URL_STORAGE_KEY, currentUrl);
  }, [currentUrl]);

  useEffect(() => {
    pagePinsRef.current = pagePins;
  }, [pagePins]);

  const runInBrowser = useCallback(
    async (code: string) => {
      if (!webviewElement) {
        return null;
      }

      try {
        return await webviewElement.executeJavaScript(code);
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : "浏览器脚本执行失败。");
        return null;
      }
    },
    [webviewElement],
  );

  const stopBrowserInteraction = useCallback(() => {
    setPinModeEnabled(false);
    if (pollingRef.current !== null) {
      window.clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    void runInBrowser("window.__chelaInspector?.disable?.()");
  }, [runInBrowser]);

  const refreshNavigationState = useCallback(
    (webview: BrowserWebViewElement | null = webviewElement) => {
      if (!webview) {
        setNavigationState((current) =>
          current.canGoBack || current.canGoForward
            ? { canGoBack: false, canGoForward: false }
            : current,
        );
        return;
      }

      try {
        const nextState = {
          canGoBack: webview.canGoBack?.() ?? false,
          canGoForward: webview.canGoForward?.() ?? false,
        };
        setNavigationState((current) =>
          current.canGoBack === nextState.canGoBack &&
          current.canGoForward === nextState.canGoForward
            ? current
            : nextState,
        );
      } catch {
        setNavigationState((current) =>
          current.canGoBack || current.canGoForward
            ? { canGoBack: false, canGoForward: false }
            : current,
        );
      }
    },
    [webviewElement],
  );

  const injectInspector = useCallback(async () => {
    await runInBrowser(createBrowserInspectorScript());
    await runInBrowser(
      `window.__chelaInspector?.syncScreenshotMarkers?.(${screenshotMarkerSignature})`,
    );
    if (pinModeEnabled) {
      await runInBrowser("window.__chelaInspector?.enable?.({ mode: 'pin' })");
    }
  }, [pinModeEnabled, runInBrowser, screenshotMarkerSignature]);

  useEffect(() => {
    if (!webviewElement) {
      return;
    }

    void runInBrowser(
      `window.__chelaInspector?.syncScreenshotMarkers?.(${screenshotMarkerSignature})`,
    );
  }, [runInBrowser, screenshotMarkerSignature, webviewElement]);

  useEffect(() => {
    const webview = webviewElement;
    if (!webview) {
      return;
    }

    const handleDomReady = () => {
      setLoadState("ready");
      setLoadError(null);
      refreshNavigationState(webview);
      void injectInspector();
      void runInBrowser("document.title || null").then((value) => {
        setPageTitle(typeof value === "string" && value.trim() ? value : null);
      });
    };
    const handleDidStartLoading = () => {
      setLoadState("loading");
      setLoadError(null);
      refreshNavigationState(webview);
    };
    const handleDidStopLoading = () => {
      setLoadState("ready");
      refreshNavigationState(webview);
    };
    const handleDidFailLoad = () => {
      setLoadState("error");
      setLoadError("页面加载失败，请检查地址或本地服务状态。");
      refreshNavigationState(webview);
    };
    const handleNavigate = (event: Event) => {
      const nextUrl = getNavigationUrl(event);
      if (nextUrl) {
        setCurrentUrl(nextUrl);
        setDraftUrl(nextUrl);
      }
      refreshNavigationState(webview);
    };

    webview.addEventListener("dom-ready", handleDomReady);
    webview.addEventListener("did-start-loading", handleDidStartLoading);
    webview.addEventListener("did-stop-loading", handleDidStopLoading);
    webview.addEventListener("did-fail-load", handleDidFailLoad);
    webview.addEventListener("did-navigate", handleNavigate);
    webview.addEventListener("did-navigate-in-page", handleNavigate);
    refreshNavigationState(webview);

    return () => {
      webview.removeEventListener("dom-ready", handleDomReady);
      webview.removeEventListener("did-start-loading", handleDidStartLoading);
      webview.removeEventListener("did-stop-loading", handleDidStopLoading);
      webview.removeEventListener("did-fail-load", handleDidFailLoad);
      webview.removeEventListener("did-navigate", handleNavigate);
      webview.removeEventListener("did-navigate-in-page", handleNavigate);
      refreshNavigationState(null);
    };
  }, [injectInspector, refreshNavigationState, webviewElement]);

  useEffect(() => () => {
    if (pollingRef.current !== null) {
      window.clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const nextUrl = normalizeBrowserPreviewUrl(draftUrl);
      if (!nextUrl) {
        return;
      }

      setCurrentUrl(nextUrl);
      setDraftUrl(nextUrl);
      setLoadState("loading");
      setLoadError(null);
      if (nextUrl === currentUrl) {
        webviewElement?.reload?.();
      }
    },
    [currentUrl, draftUrl, webviewElement],
  );

  const togglePinMode = useCallback(() => {
    if (hasPendingComposer) {
      return;
    }
    setPinModeEnabled((current) => {
      const next = !current;
      void runInBrowser(
        next
          ? "window.__chelaInspector?.enable?.({ mode: 'pin' })"
          : "window.__chelaInspector?.disable?.()",
      );
      return next;
    });
  }, [hasPendingComposer, runInBrowser]);

  const submitPendingPin = useCallback(() => {
    const comment = pinCommentDraft.trim();
    if (!pendingPin || !comment) {
      return;
    }

    const pin: BrowserPagePin = {
      ...pendingPin,
      comment,
      sourceUrl: pendingPin.sourceUrl || currentUrl,
    };
    const item = createBrowserPinContextItem(pin);
    setPagePins((current) => [
      pin,
      ...current.filter((candidate) => getBrowserPinKey(candidate) !== getBrowserPinKey(pin)),
    ].slice(0, 12));
    setPendingPin(null);
    setPinCommentDraft("");
    if (pin.pinId) {
      void runInBrowser(
        `window.__chelaInspector?.updatePinComment?.(${JSON.stringify(pin.pinId)}, ${JSON.stringify(comment)})`,
      );
    }
    onElementSelected(item);
  }, [currentUrl, onElementSelected, pendingPin, pinCommentDraft, runInBrowser]);

  const cancelPendingPin = useCallback(() => {
    const pinId = pendingPin?.pinId;
    const hasSavedPin = pendingPin
      ? pagePinsRef.current.some(
          (pin) => getBrowserPinKey(pin) === getBrowserPinKey(pendingPin),
        )
      : false;
    setPendingPin(null);
    setPinCommentDraft("");
    if (pinId && !hasSavedPin) {
      void runInBrowser(
        `window.__chelaInspector?.removePin?.(${JSON.stringify(pinId)})`,
      );
    }
  }, [pendingPin, runInBrowser]);

  const clearPendingScreenshot = useCallback(
    (removeScreenshotMarker: boolean) => {
      if (pendingScreenshot?.imageUrl) {
        URL.revokeObjectURL(pendingScreenshot.imageUrl);
      }
      if (removeScreenshotMarker && pendingScreenshot?.screenshotId) {
        void runInBrowser(
          `window.__chelaInspector?.removeScreenshotMarker?.(${JSON.stringify(pendingScreenshot.screenshotId)})`,
        );
      }
      setPendingScreenshot(null);
      setScreenshotCommentDraft("");
    },
    [pendingScreenshot, runInBrowser],
  );

  const cancelPendingScreenshot = useCallback(() => {
    clearPendingScreenshot(true);
    setScreenshotCommentDraft("");
  }, [clearPendingScreenshot]);

  const captureBrowserRegion = useCallback(
    async (region: BrowserCaptureRegion) => {
      if (!webviewElement?.capturePage) {
        setLoadError("当前浏览器不支持区域截图。");
        return;
      }

      try {
        const rect = normalizeCaptureRect(region.rect);
        const screenshotId = createBrowserScreenshotId();
        const markerNumber = screenshotMarkerCounterRef.current + 1;
        let image: BrowserCaptureImage | null = null;
        let capturePrepared = false;
        try {
          await runInBrowser("window.__chelaInspector?.prepareCapture?.() ?? false");
          capturePrepared = true;
          await waitForBrowserPaint();
          image = await webviewElement.capturePage(rect);
        } finally {
          if (capturePrepared) {
            await runInBrowser("window.__chelaInspector?.restoreCaptureVisuals?.()");
          }
        }
        const buffer = image.toPNG
          ? getPngArrayBuffer(image.toPNG())
          : image.toDataURL
            ? getPngArrayBufferFromDataUrl(image.toDataURL())
            : null;

        if (!buffer) {
          setLoadError("区域截图生成失败。");
          return;
        }

        const imageUrl = URL.createObjectURL(
          new Blob([buffer], { type: "image/png" }),
        );
        setPendingScreenshot((current) => {
          if (current?.imageUrl) {
            URL.revokeObjectURL(current.imageUrl);
          }
          if (current?.screenshotId) {
            void runInBrowser(
              `window.__chelaInspector?.removeScreenshotMarker?.(${JSON.stringify(current.screenshotId)})`,
            );
          }
          return {
            ...region,
            rect,
            screenshotId,
            markerNumber,
            imageUrl,
            imageBuffer: buffer,
          };
        });
        void runInBrowser(
          `window.__chelaInspector?.upsertScreenshotMarker?.(${JSON.stringify({
            screenshotId,
            markerNumber,
            rect,
            comment: "",
          })})`,
        );
        stopBrowserInteraction();
        setScreenshotCommentDraft("");
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : "区域截图失败。");
      }
    },
    [stopBrowserInteraction, webviewElement],
  );

  const submitPendingScreenshot = useCallback(async () => {
    const comment = screenshotCommentDraft.trim();
    if (!pendingScreenshot || !comment || !window.desktopApi?.files) {
      return;
    }

    try {
      const file = await window.desktopApi.files.saveFromClipboard({
        name: getScreenshotName(pendingScreenshot),
        mimeType: "image/png",
        buffer: pendingScreenshot.imageBuffer,
      });
      const contextItem = createBrowserScreenshotContextItem({
        screenshotId: pendingScreenshot.screenshotId,
        sourceUrl: pendingScreenshot.sourceUrl || currentUrl,
        title: pendingScreenshot.title ?? pageTitle,
        comment,
        imageName: file.name,
        imagePath: file.path,
        boundingRect: pendingScreenshot.rect,
        viewport: pendingScreenshot.viewport ?? null,
      });
      await onScreenshotCaptured([{
        ...file,
        displayName: formatBrowserContextChipLabel(contextItem),
        description: comment,
        browserContextItemId: contextItem.id,
      }]);
      onElementSelected(contextItem);
      screenshotMarkerCounterRef.current = Math.max(
        screenshotMarkerCounterRef.current,
        pendingScreenshot.markerNumber,
      );
      void runInBrowser(
        `window.__chelaInspector?.upsertScreenshotMarker?.(${JSON.stringify({
          screenshotId: pendingScreenshot.screenshotId,
          markerNumber: pendingScreenshot.markerNumber,
          rect: pendingScreenshot.rect,
          comment,
        })})`,
      );
      clearPendingScreenshot(false);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "截图批注保存失败。");
    }
  }, [
    clearPendingScreenshot,
    currentUrl,
    onElementSelected,
    onScreenshotCaptured,
    pageTitle,
    pendingScreenshot,
    runInBrowser,
    screenshotCommentDraft,
  ]);

  useEffect(() => {
    if (resetInteractionSignalRef.current === resetInteractionSignal) {
      return;
    }

    resetInteractionSignalRef.current = resetInteractionSignal;
    setPendingPin(null);
    setPinCommentDraft("");
    cancelPendingScreenshot();
    stopBrowserInteraction();
  }, [cancelPendingScreenshot, resetInteractionSignal, stopBrowserInteraction]);

  useEffect(() => {
    if (!webviewElement || !pinModeEnabled || hasPendingComposer) {
      if (pollingRef.current !== null) {
        window.clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      return;
    }

    void injectInspector();
    pollingRef.current = window.setInterval(() => {
      void runInBrowser("window.__chelaInspector?.consumePin?.() ?? null")
        .then((value) => {
          if (!isBrowserPendingPin(value)) {
            return;
          }
          const pending = {
            ...value,
            sourceUrl: value.sourceUrl || currentUrl,
          };
          const existing = pagePinsRef.current.find(
            (pin) => getBrowserPinKey(pin) === getBrowserPinKey(pending),
          );
          setPendingPin({
            ...pending,
            comment: pending.comment ?? existing?.comment ?? "",
          });
          setPinCommentDraft(pending.comment ?? existing?.comment ?? "");
          stopBrowserInteraction();
        });
      void runInBrowser("window.__chelaInspector?.consumeCaptureRegion?.() ?? null")
        .then((value) => {
          if (!isBrowserCaptureRegion(value)) {
            return;
          }
          void captureBrowserRegion({
            ...value,
            sourceUrl: value.sourceUrl || currentUrl,
          });
        });
      void runInBrowser("window.__chelaInspector?.consumeCancelRequest?.() ?? false")
        .then((value) => {
          if (!value) {
            return;
          }
          cancelPendingPin();
          cancelPendingScreenshot();
          stopBrowserInteraction();
        });
    }, 220);

    return () => {
      if (pollingRef.current !== null) {
        window.clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [
    currentUrl,
    captureBrowserRegion,
    cancelPendingPin,
    cancelPendingScreenshot,
    injectInspector,
    hasPendingComposer,
    pinModeEnabled,
    runInBrowser,
    stopBrowserInteraction,
    webviewElement,
  ]);

  const capturePageSnapshot = useCallback(async () => {
    if (!webviewElement || snapshotBusy) {
      return;
    }

    setSnapshotBusy(true);
    setLoadError(null);
    await injectInspector();
    const value = await runInBrowser("window.__chelaInspector?.collectPageSnapshot?.() ?? null");
    setSnapshotBusy(false);

    if (!isBrowserPageSnapshot(value)) {
      setLoadError("页面快照抓取失败，请等待页面加载完成后重试。");
      return;
    }

    const snapshot: BrowserPageSnapshot = {
      ...value,
      sourceUrl: value.sourceUrl || currentUrl,
    };
    const item = createBrowserPageSnapshotContextItem(snapshot);
    setPageTitle(snapshot.title?.trim() || pageTitle);
    onElementSelected(item);
  }, [
    currentUrl,
    injectInspector,
    onElementSelected,
    pageTitle,
    runInBrowser,
    snapshotBusy,
    webviewElement,
  ]);

  const pageStatusLabel =
    loadState === "loading"
      ? "页面加载中"
      : loadState === "error"
        ? loadError ?? "页面加载失败"
        : pageTitle
          ? `${pageTitle} · ${currentUrl}`
          : currentUrl;

  return (
    <section className={cn("flex h-full min-h-0 flex-col bg-background px-4 py-4", className)}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--color-text-secondary)]">
            Browser Workspace
          </p>
          <h3 className="mt-1 text-lg font-semibold text-foreground">浏览器工作区</h3>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="size-7 shrink-0 rounded-[var(--radius-shell)] text-muted-foreground hover:bg-[color:var(--color-control-bg-hover)]"
          aria-label="关闭浏览器面板"
        >
          <XIcon className="size-4" />
        </Button>
      </div>

      <form
        onSubmit={handleSubmit}
        className="mb-3 flex min-w-0 items-center gap-2 rounded-[var(--radius-shell)] bg-[color:var(--color-control-panel-bg)] p-2 shadow-[var(--color-control-shadow)]"
      >
        <div className="flex shrink-0 items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={!navigationState.canGoBack}
                onClick={() => {
                  webviewElement?.goBack?.();
                  refreshNavigationState();
                }}
                className="size-8 rounded-[var(--radius-shell)] text-muted-foreground hover:bg-[color:var(--color-control-bg-hover)]"
                aria-label="后退"
              >
                <ChevronLeftIcon className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>后退</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={!navigationState.canGoForward}
                onClick={() => {
                  webviewElement?.goForward?.();
                  refreshNavigationState();
                }}
                className="size-8 rounded-[var(--radius-shell)] text-muted-foreground hover:bg-[color:var(--color-control-bg-hover)]"
                aria-label="前进"
              >
                <ChevronRightIcon className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>前进</TooltipContent>
          </Tooltip>
        </div>

        <label
          className="flex min-w-0 flex-1 items-center gap-2 rounded-[var(--radius-shell)] bg-[color:var(--color-control-bg)] px-2.5 py-1.5"
          title={pageStatusLabel}
        >
          <Globe2Icon className="size-4 shrink-0 text-muted-foreground" />
          <input
            value={draftUrl}
            onChange={(event) => setDraftUrl(event.target.value)}
            className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
            placeholder={DEFAULT_BROWSER_PREVIEW_URL}
            aria-label="浏览器地址"
          />
        </label>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => webviewElement?.reload?.()}
              className="size-8 rounded-[var(--radius-shell)] text-muted-foreground hover:bg-[color:var(--color-control-bg-hover)]"
              aria-label="刷新页面"
            >
              <RefreshCwIcon
                className={cn("size-4", loadState === "loading" && "animate-spin")}
              />
            </Button>
          </TooltipTrigger>
          <TooltipContent>刷新</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!webviewElement || snapshotBusy}
              onClick={() => void capturePageSnapshot()}
              className="h-8 rounded-[var(--radius-shell)] px-2.5 text-[12px] text-muted-foreground shadow-none hover:bg-[color:var(--color-control-bg-hover)] hover:text-foreground disabled:opacity-45"
              aria-label="抓取当前页面上下文"
            >
              <SparklesIcon className={cn("size-4", snapshotBusy && "animate-pulse")} />
              <span className="ml-1.5 hidden xl:inline">
                {snapshotBusy ? "抓取中" : "抓页面"}
              </span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>把当前页面标题、文本和可交互元素加入聊天上下文</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant={pinModeEnabled ? "default" : "ghost"}
              size="sm"
              disabled={hasPendingComposer}
              onClick={togglePinMode}
              className={cn(
                "h-8 rounded-[var(--radius-shell)] px-2.5 text-[12px] shadow-none",
                pinModeEnabled
                  ? "bg-[color:var(--color-browser-pin-bg)] text-[color:var(--color-browser-pin-fg)] hover:bg-[color:var(--color-browser-pin-bg)]/90"
                  : "text-muted-foreground hover:bg-[color:var(--color-control-bg-hover)] hover:text-foreground",
              )}
              aria-label={pinModeEnabled ? "关闭页面批注" : "开启页面批注"}
            >
              <MapPinIcon className="size-4" />
              <span className="ml-1.5 hidden xl:inline">
                {pinModeEnabled ? "批注中" : "批注"}
              </span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {pinModeEnabled
              ? "左键点击页面目标写批注，拖拽框选区域截图，右键或 Esc 取消"
              : "选择页面目标批注或框选区域截图"}
          </TooltipContent>
        </Tooltip>

      </form>

      <PreviewSurface className="flex-1">
        <webview
          ref={handleWebviewRef}
          src={currentUrl}
          className="h-full w-full bg-[color:var(--chela-bg-surface)]"
          partition="persist:chela-browser-preview"
          allowpopups={false}
        />
        {pendingPin ? (
          <Surface
            tone="overlay"
            shadow="inset"
            padding="sm"
            className="absolute z-40"
            style={getPinComposerStyle(pendingPin)}
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="inline-flex max-w-full items-center gap-1.5 text-[12px] font-medium text-foreground">
                  <MapPinIcon className="size-3.5 shrink-0 text-[color:var(--color-browser-pin-bg)]" />
                  <span className="truncate">{getPinTargetLabel(pendingPin)}</span>
                </p>
                {pendingPin.comment ? (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">更新页面批注</p>
                ) : null}
              </div>
              <button
                type="button"
                className="inline-flex size-6 shrink-0 items-center justify-center rounded-[var(--radius-shell)] text-muted-foreground hover:bg-[color:var(--color-control-bg-hover)] hover:text-foreground"
                onClick={cancelPendingPin}
                aria-label="取消页面批注"
              >
                <XIcon className="size-3.5" />
              </button>
            </div>
            <textarea
              value={pinCommentDraft}
              onChange={(event) => setPinCommentDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  cancelPendingPin();
                  return;
                }
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  event.preventDefault();
                  submitPendingPin();
                }
              }}
              className="h-20 w-full resize-none rounded-[var(--radius-shell)] bg-[color:var(--color-control-bg)] px-2.5 py-2 text-[12px] leading-4 text-foreground outline-none placeholder:text-muted-foreground"
              placeholder="写一句批注"
              autoFocus
            />
            <div className="mt-2 flex justify-end gap-1.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={cancelPendingPin}
                className="h-7 rounded-[var(--radius-shell)] px-2.5 text-[12px]"
              >
                取消
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!pinCommentDraft.trim()}
                onClick={submitPendingPin}
                className="h-7 rounded-[var(--radius-shell)] px-2.5 text-[12px]"
              >
                {pendingPin.comment ? "更新" : "保存"}
              </Button>
            </div>
          </Surface>
        ) : null}
        {pendingScreenshot ? (
          <Surface
            tone="overlay"
            shadow="inset"
            padding="sm"
            className="absolute z-40"
            style={getScreenshotComposerStyle(pendingScreenshot)}
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="inline-flex max-w-full items-center gap-1.5 text-[12px] font-medium text-foreground">
                  <MapPinIcon className="size-3.5 shrink-0 text-[color:var(--color-browser-pin-bg)]" />
                  <span className="truncate">
                    截图区域 {Math.round(pendingScreenshot.rect.width)}x{Math.round(pendingScreenshot.rect.height)}
                  </span>
                </p>
              </div>
              <button
                type="button"
                className="inline-flex size-6 shrink-0 items-center justify-center rounded-[var(--radius-shell)] text-muted-foreground hover:bg-[color:var(--color-control-bg-hover)] hover:text-foreground"
                onClick={cancelPendingScreenshot}
                aria-label="取消截图批注"
              >
                <XIcon className="size-3.5" />
              </button>
            </div>
            <img
              src={pendingScreenshot.imageUrl}
              alt="截图预览"
              className="mb-2 h-24 w-full rounded-[var(--radius-shell)] bg-[color:var(--color-control-bg)] object-contain"
            />
            <textarea
              value={screenshotCommentDraft}
              onChange={(event) => setScreenshotCommentDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  cancelPendingScreenshot();
                  return;
                }
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  event.preventDefault();
                  void submitPendingScreenshot();
                }
              }}
              className="h-20 w-full resize-none rounded-[var(--radius-shell)] bg-[color:var(--color-control-bg)] px-2.5 py-2 text-[12px] leading-4 text-foreground outline-none placeholder:text-muted-foreground"
              placeholder="评价这张截图"
              autoFocus
            />
            <div className="mt-2 flex justify-end gap-1.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={cancelPendingScreenshot}
                className="h-7 rounded-[var(--radius-shell)] px-2.5 text-[12px]"
              >
                取消
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!screenshotCommentDraft.trim()}
                onClick={() => void submitPendingScreenshot()}
                className="h-7 rounded-[var(--radius-shell)] px-2.5 text-[12px]"
              >
                保存
              </Button>
            </div>
          </Surface>
        ) : null}
      </PreviewSurface>
    </section>
  );
};

export const BrowserPreviewPanel = memo(BrowserPreviewPanelImpl);
