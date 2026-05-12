import {
  useCallback,
  useEffect,
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
  MousePointer2Icon,
  RefreshCwIcon,
  ScanSearchIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@renderer/components/assistant-ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@renderer/components/ui/tooltip";
import { createBrowserInspectorScript } from "@renderer/lib/browser-inspector-script";
import {
  DEFAULT_BROWSER_PREVIEW_URL,
  createBrowserContextItem,
  createBrowserPageSnapshotContextItem,
  createBrowserPinContextItem,
  createBrowserReviewQueue,
  createBrowserReviewQueueContextItem,
  formatBrowserElementLabel,
  normalizeBrowserPreviewUrl,
  type BrowserContextItem,
  type BrowserInterviewElement,
  type BrowserPagePin,
  type BrowserPageSnapshot,
} from "@renderer/lib/browser-interview";
import { cn } from "@renderer/lib/utils";

type BrowserPreviewPanelProps = {
  onClose: () => void;
  onElementSelected: (item: BrowserContextItem) => void;
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
};

type BrowserPendingPin = Omit<BrowserPagePin, "comment"> & {
  comment?: string | null;
};

const BROWSER_PREVIEW_URL_STORAGE_KEY = "chela.browser-preview.url";
const PIN_COMPOSER_WIDTH_PX = 320;

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

function isBrowserInterviewElement(
  value: unknown,
): value is BrowserInterviewElement {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<BrowserInterviewElement>;
  return (
    typeof candidate.selector === "string" &&
    candidate.selector.trim().length > 0 &&
    typeof candidate.tagName === "string" &&
    candidate.tagName.trim().length > 0
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

function getBrowserPageTitle(snapshot: BrowserPageSnapshot, fallbackUrl: string) {
  return snapshot.title?.trim() || snapshot.sourceUrl?.trim() || fallbackUrl;
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

export function BrowserPreviewPanel({
  onClose,
  onElementSelected,
  className,
}: BrowserPreviewPanelProps) {
  const [currentUrl, setCurrentUrl] = useState(readInitialBrowserUrl);
  const [draftUrl, setDraftUrl] = useState(currentUrl);
  const [loadState, setLoadState] = useState<BrowserLoadState>("idle");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [inspectorEnabled, setInspectorEnabled] = useState(false);
  const [pinModeEnabled, setPinModeEnabled] = useState(false);
  const [pendingPin, setPendingPin] = useState<BrowserPendingPin | null>(null);
  const [pinCommentDraft, setPinCommentDraft] = useState("");
  const [pagePins, setPagePins] = useState<BrowserPagePin[]>([]);
  const [lastSelectionLabel, setLastSelectionLabel] = useState<string | null>(null);
  const [lastPinLabel, setLastPinLabel] = useState<string | null>(null);
  const [lastReviewQueueLabel, setLastReviewQueueLabel] = useState<string | null>(null);
  const [pageTitle, setPageTitle] = useState<string | null>(null);
  const [snapshotBusy, setSnapshotBusy] = useState(false);
  const [lastSnapshotLabel, setLastSnapshotLabel] = useState<string | null>(null);
  const [navigationState, setNavigationState] = useState<BrowserNavigationState>({
    canGoBack: false,
    canGoForward: false,
  });
  const [pinFocusError, setPinFocusError] = useState<string | null>(null);
  const [webviewElement, setWebviewElement] =
    useState<BrowserWebViewElement | null>(null);
  const inspectorEnabledRef = useRef(inspectorEnabled);
  const pollingRef = useRef<number | null>(null);
  const pagePinsRef = useRef(pagePins);

  const handleWebviewRef = useCallback((node: HTMLElement | null) => {
    const nextNode = node as BrowserWebViewElement | null;
    setWebviewElement((current) => (current === nextNode ? current : nextNode));
  }, []);

  useEffect(() => {
    inspectorEnabledRef.current = inspectorEnabled;
  }, [inspectorEnabled]);

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
    if (inspectorEnabledRef.current) {
      await runInBrowser("window.__chelaInspector?.enable?.()");
    }
    if (pinModeEnabled) {
      await runInBrowser("window.__chelaInspector?.enable?.({ mode: 'pin' })");
    }
  }, [pinModeEnabled, runInBrowser]);

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

  useEffect(() => {
    if (!webviewElement || (!inspectorEnabled && !pinModeEnabled)) {
      if (pollingRef.current !== null) {
        window.clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      return;
    }

    void injectInspector();
    pollingRef.current = window.setInterval(() => {
      void runInBrowser("window.__chelaInspector?.consumeSelection?.() ?? null")
        .then((value) => {
          if (!isBrowserInterviewElement(value)) {
            return;
          }

          const element: BrowserInterviewElement = {
            ...value,
            sourceUrl: value.sourceUrl || currentUrl,
          };
          const item = createBrowserContextItem(element);
          setLastSelectionLabel(formatBrowserElementLabel(element));
          onElementSelected(item);
        });
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
    injectInspector,
    inspectorEnabled,
    pinModeEnabled,
    onElementSelected,
    runInBrowser,
    webviewElement,
  ]);

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

  const toggleInspector = useCallback(() => {
    setInspectorEnabled((current) => {
      const next = !current;
      if (next) {
        setPinModeEnabled(false);
      }
      void runInBrowser(
        next
          ? "window.__chelaInspector?.enable?.()"
          : "window.__chelaInspector?.disable?.()",
      );
      return next;
    });
  }, [runInBrowser]);

  const togglePinMode = useCallback(() => {
    setPinModeEnabled((current) => {
      const next = !current;
      if (next) {
        setInspectorEnabled(false);
      }
      void runInBrowser(
        next
          ? "window.__chelaInspector?.enable?.({ mode: 'pin' })"
          : "window.__chelaInspector?.disable?.()",
      );
      return next;
    });
  }, [runInBrowser]);

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
    setPinFocusError(null);
    setLastPinLabel(item.label);
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

  const removePagePin = useCallback(
    (pin: BrowserPagePin) => {
      setPagePins((current) =>
        current.filter((candidate) => getBrowserPinKey(candidate) !== getBrowserPinKey(pin)),
      );
      if (
        pendingPin &&
        getBrowserPinKey(pendingPin) === getBrowserPinKey(pin)
      ) {
        setPendingPin(null);
        setPinCommentDraft("");
      }
      if (pin.pinId) {
        void runInBrowser(
          `window.__chelaInspector?.removePin?.(${JSON.stringify(pin.pinId)})`,
        );
      }
    },
    [pendingPin, runInBrowser],
  );


  const focusPagePin = useCallback(
    async (pin: BrowserPagePin) => {
      if (!pin.pinId) {
        setPinFocusError("这条批注缺少定位 id，无法回跳。");
        return;
      }

      const result = await runInBrowser(
        `window.__chelaInspector?.focusPin?.(${JSON.stringify(pin.pinId)}) ?? null`,
      );
      const ok = Boolean(result && typeof result === "object" && (result as { ok?: unknown }).ok === true);
      if (!ok) {
        setPinFocusError("批注位置暂时找不到，可能页面已刷新或 DOM 结构变了。");
        return;
      }
      setPinFocusError(null);
      setLastPinLabel(pin.comment ? `批注: ${pin.comment}` : `批注 #${pin.markerNumber ?? ""}`);
    },
    [runInBrowser],
  );


  const addReviewQueueToContext = useCallback(() => {
    if (pagePins.length === 0) {
      return;
    }

    const queue = createBrowserReviewQueue(pagePins, {
      title: pageTitle ? `${pageTitle} 页面 Review` : "页面 Review 队列",
      sourceUrl: currentUrl,
      summary: `按 ${pagePins.length} 条页面批注修复当前页面`,
    });
    const item = createBrowserReviewQueueContextItem(queue);
    setLastReviewQueueLabel(item.label);
    onElementSelected(item);
  }, [currentUrl, onElementSelected, pagePins, pageTitle]);

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
    const label = getBrowserPageTitle(snapshot, currentUrl);
    setPageTitle(snapshot.title?.trim() || pageTitle);
    setLastSnapshotLabel(label);
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

        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-[var(--radius-shell)] bg-[color:var(--color-control-bg)] px-2.5 py-1.5">
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
              onClick={togglePinMode}
              className={cn(
                "h-8 rounded-[var(--radius-shell)] px-2.5 text-[12px] shadow-none",
                pinModeEnabled
                  ? "bg-[color:var(--color-accent)] text-white hover:bg-[color:var(--color-accent-hover)]"
                  : "text-muted-foreground hover:bg-[color:var(--color-control-bg-hover)] hover:text-foreground",
              )}
              aria-label={pinModeEnabled ? "关闭页面批注" : "开启页面批注"}
            >
              <MapPinIcon className="size-4" />
              <span className="ml-1.5 hidden xl:inline">
                {pinModeEnabled ? "批注中" : "Pin"}
              </span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {pinModeEnabled ? "点击页面元素后输入一句批注" : "在页面上添加批注上下文"}
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant={inspectorEnabled ? "default" : "ghost"}
              size="sm"
              onClick={toggleInspector}
              className={cn(
                "h-8 rounded-[var(--radius-shell)] px-2.5 text-[12px] shadow-none",
                inspectorEnabled
                  ? "bg-[color:var(--color-accent)] text-white hover:bg-[color:var(--color-accent-hover)]"
                  : "text-muted-foreground hover:bg-[color:var(--color-control-bg-hover)] hover:text-foreground",
              )}
              aria-label={inspectorEnabled ? "关闭元素选择" : "开启元素选择"}
            >
              <ScanSearchIcon className="size-4" />
              <span className="ml-1.5 hidden xl:inline">
                {inspectorEnabled ? "选择中" : "选元素"}
              </span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {inspectorEnabled ? "点击页面元素加入聊天上下文" : "开启元素选择"}
          </TooltipContent>
        </Tooltip>
      </form>

      <div className="mb-2 flex min-h-5 items-center justify-between gap-2 px-1 text-[12px] text-muted-foreground">
        <span className="truncate">
          {loadState === "loading"
            ? "页面加载中"
            : loadState === "error"
              ? loadError ?? "页面加载失败"
              : pageTitle
                ? `${pageTitle} · ${currentUrl}`
                : currentUrl}
        </span>
        <div className="flex min-w-0 shrink-0 items-center gap-1.5">
          {lastSnapshotLabel ? (
            <span className="inline-flex max-w-[220px] shrink min-w-0 items-center gap-1 rounded-[var(--radius-shell)] bg-[color:var(--color-selection-muted-bg)] px-2 py-0.5 text-[11px] text-foreground">
              <SparklesIcon className="size-3 shrink-0" />
              <span className="truncate">{lastSnapshotLabel}</span>
            </span>
          ) : null}
          {lastReviewQueueLabel ? (
            <span className="inline-flex max-w-[200px] shrink-0 items-center gap-1 rounded-[var(--radius-shell)] bg-[color:var(--color-selection-muted-bg)] px-2 py-0.5 text-[11px] text-foreground">
              <SparklesIcon className="size-3 shrink-0" />
              <span className="truncate">{lastReviewQueueLabel}</span>
            </span>
          ) : null}
          {lastPinLabel ? (
            <span className="inline-flex max-w-[180px] shrink-0 items-center gap-1 rounded-[var(--radius-shell)] bg-[color:var(--color-selection-muted-bg)] px-2 py-0.5 text-[11px] text-foreground">
              <MapPinIcon className="size-3 shrink-0" />
              <span className="truncate">{lastPinLabel}</span>
            </span>
          ) : null}
          {lastSelectionLabel ? (
            <span className="inline-flex max-w-[180px] shrink-0 items-center gap-1 rounded-[var(--radius-shell)] bg-[color:var(--color-selection-muted-bg)] px-2 py-0.5 text-[11px] text-foreground">
              <MousePointer2Icon className="size-3 shrink-0" />
              <span className="truncate">{lastSelectionLabel}</span>
            </span>
          ) : null}
        </div>
      </div>


      {pagePins.length > 0 ? (
        <div className="mb-2 rounded-[var(--radius-shell)] bg-[color:var(--color-control-panel-bg)] px-2 py-2 shadow-[var(--color-control-shadow)]">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Review Queue
              </p>
              <p className="truncate text-[12px] text-muted-foreground">
                {pagePins.length} 条页面批注，可一键交给 Agent 处理
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={addReviewQueueToContext}
              className="h-8 shrink-0 rounded-[var(--radius-shell)] px-3 text-[12px]"
            >
              加入 Review 上下文
            </Button>
          </div>
          <div className="flex min-w-0 items-stretch gap-2 overflow-x-auto pb-1">
            {pagePins.map((pin) => (
              <div
                key={pin.pinId ?? `${pin.selector}-${pin.comment}`}
                className="group flex w-[260px] shrink-0 items-start gap-2 rounded-[var(--radius-shell)] bg-[color:var(--color-selection-muted-bg)] px-2.5 py-2 text-left transition-colors hover:bg-[color:var(--color-control-bg-hover)]"
              >
                <button
                  type="button"
                  onClick={() => void focusPagePin(pin)}
                  className="flex min-w-0 flex-1 items-start gap-2 text-left"
                  title={pin.comment}
                >
                  <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-[var(--radius-shell)] bg-[color:var(--color-accent)] text-[11px] font-semibold text-white">
                    {pin.markerNumber ?? "?"}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {getPinTargetLabel(pin)}
                    </span>
                    <span className="mt-0.5 line-clamp-2 block text-[12px] leading-4 text-foreground">
                      {pin.comment}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => removePagePin(pin)}
                  className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-[var(--radius-shell)] text-muted-foreground opacity-70 transition-opacity hover:bg-[color:var(--color-control-bg)] hover:text-foreground group-hover:opacity-100"
                  aria-label="删除页面批注"
                >
                  <XIcon className="size-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}


      {pinFocusError ? (
        <div className="mb-2 rounded-[var(--radius-shell)] border border-[color:var(--color-border-muted)] bg-[color:var(--color-control-panel-bg)] px-2.5 py-1.5 text-[12px] text-[color:var(--color-status-warning)]">
          {pinFocusError}
        </div>
      ) : null}
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-[var(--radius-shell)] bg-[color:var(--color-control-bg)]">
        <webview
          ref={handleWebviewRef}
          src={currentUrl}
          className="h-full w-full bg-white"
          partition="persist:chela-browser-preview"
          allowpopups={false}
        />
        {pendingPin ? (
          <div
            className="absolute z-20 rounded-[var(--radius-shell)] bg-[color:var(--color-control-panel-bg)] p-2.5 shadow-[var(--color-control-shadow)]"
            style={getPinComposerStyle(pendingPin)}
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="inline-flex max-w-full items-center gap-1.5 text-[12px] font-medium text-foreground">
                  <MapPinIcon className="size-3.5 shrink-0 text-[color:var(--color-accent)]" />
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
          </div>
        ) : null}
      </div>
    </section>
  );
}
