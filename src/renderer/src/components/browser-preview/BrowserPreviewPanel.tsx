import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  Globe2Icon,
  MousePointer2Icon,
  RefreshCwIcon,
  ScanSearchIcon,
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
  formatBrowserElementLabel,
  normalizeBrowserPreviewUrl,
  type BrowserContextItem,
  type BrowserInterviewElement,
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

const BROWSER_PREVIEW_URL_STORAGE_KEY = "chela.browser-preview.url";

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

function getNavigationUrl(event: Event) {
  const candidate = event as Event & { url?: unknown };
  return typeof candidate.url === "string" ? candidate.url : null;
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
  const [lastSelectionLabel, setLastSelectionLabel] = useState<string | null>(null);
  const [navigationState, setNavigationState] = useState<BrowserNavigationState>({
    canGoBack: false,
    canGoForward: false,
  });
  const [webviewElement, setWebviewElement] =
    useState<BrowserWebViewElement | null>(null);
  const inspectorEnabledRef = useRef(inspectorEnabled);
  const pollingRef = useRef<number | null>(null);

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
  }, [runInBrowser]);

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
    if (!webviewElement || !inspectorEnabled) {
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
      void runInBrowser(
        next
          ? "window.__chelaInspector?.enable?.()"
          : "window.__chelaInspector?.disable?.()",
      );
      return next;
    });
  }, [runInBrowser]);

  return (
    <section className={cn("flex h-full min-h-0 flex-col bg-background px-4 py-4", className)}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--color-text-secondary)]">
            Browser
          </p>
          <h3 className="mt-1 text-lg font-semibold text-foreground">浏览器选择</h3>
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
                {inspectorEnabled ? "选择中" : "选择"}
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
              : currentUrl}
        </span>
        {lastSelectionLabel ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-[var(--radius-shell)] bg-[color:var(--color-selection-muted-bg)] px-2 py-0.5 text-[11px] text-foreground">
            <MousePointer2Icon className="size-3" />
            {lastSelectionLabel}
          </span>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-hidden rounded-[var(--radius-shell)] bg-[color:var(--color-control-bg)]">
        <webview
          ref={handleWebviewRef}
          src={currentUrl}
          className="h-full w-full bg-white"
          partition="persist:chela-browser-preview"
          allowpopups={false}
        />
      </div>
    </section>
  );
}
