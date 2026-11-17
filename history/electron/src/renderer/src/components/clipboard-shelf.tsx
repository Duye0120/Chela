import { lazy, Suspense, useEffect, useState } from "react";
import { Check, Clipboard, Copy, Pause, Play, Search, Trash2, X } from "lucide-react";
import type { ClipboardShelfState } from "@shared/clipboard-shelf";
import { Button } from "@renderer/components/assistant-ui/button";
import { PreviewSurface, Surface } from "@renderer/components/assistant-ui/surface";

const PlannerUpcoming = lazy(() => import("./planner-panel").then((module) => ({ default: module.PlannerUpcoming })));

export default function ClipboardShelf() {
  const api = window.desktopApi.clipboardShelf;
  const [state, setState] = useState<ClipboardShelfState>({ items: [], paused: true });
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"clipboard" | "upcoming">("upcoming");

  async function perform(action: () => Promise<unknown>) {
    setError("");
    setBusy(true);
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "操作失败，请重试。");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    let disposed = false;
    let changed = false;
    const unsubscribe = api.onChange((next) => {
      changed = true;
      if (!disposed) {
        setState(next);
        setLoading(false);
      }
    });
    void api.setPaused(true).then((next) => {
      if (!disposed && !changed) setState(next);
    }).catch((cause: unknown) => {
      if (!disposed && !changed) setError(cause instanceof Error ? cause.message : "剪贴板暂不可用。");
    }).finally(() => {
      if (!disposed) setLoading(false);
    });
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [api]);

  useEffect(() => {
    if (!copiedId) return;
    const timer = window.setTimeout(() => setCopiedId(null), 1600);
    return () => window.clearTimeout(timer);
  }, [copiedId]);

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleItems = state.items.filter((item) => !normalizedQuery || (
    item.kind === "text" && item.text.toLocaleLowerCase().includes(normalizedQuery)
  ));

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-3xl flex-col px-4 pb-4 sm:px-6">
      <header className="shrink-0 py-5">
        <h1 className="text-2xl font-semibold tracking-tight">随手</h1>
        <p className="mt-1 text-sm text-muted-foreground">查看近期事项与临时剪贴板记录。</p>
      </header>
      <nav aria-label="随手页内容" className="flex shrink-0 flex-wrap gap-1 border-b border-[color:var(--color-control-border)] pb-2">
        <Button type="button" variant="ghost" size="sm" disabled={busy} aria-pressed={tab === "clipboard"} onClick={() => setTab("clipboard")}>剪贴板</Button>
        <Button type="button" variant="ghost" size="sm" disabled={busy} aria-pressed={tab === "upcoming"} onClick={() => {
          if (state.paused) setTab("upcoming");
          else void perform(async () => {
            setState(await api.setPaused(true));
            setTab("upcoming");
          });
        }}>近期</Button>
      </nav>
      {tab === "clipboard" ? <>
      <div className="shrink-0 space-y-2 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-[color:var(--color-text-secondary)]">
            {state.paused ? "记录已暂停" : "正在记录复制内容"} · {state.items.length} 条
          </span>
          <Button type="button" variant={state.paused ? "default" : "ghost"} size="sm" disabled={busy || loading} onClick={() => void perform(async () => setState(await api.setPaused(!state.paused)))}>
            {state.paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
            {state.paused ? "开始记录" : "暂停"}
          </Button>
        </div>
        <label className="chela-field flex items-center gap-2">
          <Search className="size-4 shrink-0 text-[color:var(--color-text-muted)]" aria-hidden="true" />
          <input className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" type="search" placeholder="搜索文字记录" aria-label="搜索文字记录" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        {error && <Surface tone="danger" padding="xs" role="alert" className="break-words text-xs">{error}</Surface>}
        <span className="sr-only" role="status">{copiedId ? "已复制到系统剪贴板" : ""}</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3" aria-label="剪贴板历史">
        {visibleItems.length === 0 ? (
          <div className="flex h-full min-h-24 flex-col items-center justify-center gap-2 px-4 text-center text-xs text-[color:var(--color-text-muted)]">
            <Clipboard className="size-6" aria-hidden="true" />
            <p>{loading ? "正在加载…" : normalizedQuery ? "没有匹配的文字记录" : state.paused ? "开始记录后，复制的文字和图片会出现在这里" : "复制一段文字或图片试试"}</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {visibleItems.map((item) => (
              <li key={item.id}>
                <PreviewSurface padding="sm">
                  {item.kind === "image" ? (
                    <img src={item.imageDataUrl} alt="复制的图片" className="max-h-40 w-full rounded-[var(--radius-shell)] object-contain" loading="lazy" />
                  ) : (
                    <p className="line-clamp-5 whitespace-pre-wrap break-words text-xs leading-relaxed">{item.text}</p>
                  )}
                  <div className="mt-2 flex items-center gap-1">
                    <time dateTime={item.createdAt} className="min-w-0 flex-1 text-[10px] text-[color:var(--color-text-muted)]">
                      {item.kind === "image" ? "图片" : "文字"} · {new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </time>
                    <Button type="button" variant="ghost" size="xs" disabled={busy} onClick={() => void perform(async () => { await api.copy(item.id); setCopiedId(item.id); })}>
                      {copiedId === item.id ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                      {copiedId === item.id ? "已复制" : "复制"}
                    </Button>
                    <Button type="button" variant="ghost" size="icon-xs" disabled={busy} title="移除记录" aria-label="移除这条记录" onClick={() => void perform(async () => setState(await api.remove(item.id)))}>
                      <X aria-hidden="true" />
                    </Button>
                  </div>
                </PreviewSurface>
              </li>
            ))}
          </ul>
        )}
      </div>

      <footer className="flex shrink-0 items-center gap-2 border-t border-[color:var(--color-control-border)] px-4 py-2">
        <p className="min-w-0 flex-1 text-[10px] leading-relaxed text-[color:var(--color-text-muted)]">
          仅保留本次启动记录，复制敏感内容前请暂停<br />
          单条文字最多 10 万字符，图片最多 1600 万像素及 4 MiB（PNG）
        </p>
        <Button type="button" variant="ghost" size="sm" disabled={busy || state.items.length === 0} title="清空历史，不改动系统剪贴板" onClick={() => void perform(async () => setState(await api.clear()))}>
          <Trash2 aria-hidden="true" />清空
        </Button>
      </footer>
      </> : <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pt-4">
        {error && <Surface tone="danger" padding="xs" role="alert" className="mb-2 break-words text-xs">{error}</Surface>}
        <Suspense fallback={<p role="status" className="text-xs text-[color:var(--color-text-muted)]">正在加载近期事项…</p>}>
          <PlannerUpcoming />
        </Suspense>
      </div>}
    </div>
  );
}
