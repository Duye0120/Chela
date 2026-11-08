import { useEffect, useRef, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { ArrowUp, Bell, BellOff, Minus, Power, Square, X } from "lucide-react";
import type { CompanionAction, CompanionApi, CompanionChatState, CompanionState } from "@shared/companion";
import { Button } from "@renderer/components/assistant-ui/button";
import { Surface } from "@renderer/components/assistant-ui/surface";
import "./styles.css";
import "./styles/companion.css";

declare global {
  interface Window {
    chelaCompanion: CompanionApi;
  }
}

function commandError(cause: unknown, fallback: string): string {
  if (!(cause instanceof Error)) return fallback;
  return cause.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "").slice(0, 240) || fallback;
}

function PlannerApproval({ approval, api, onError }: {
  approval: NonNullable<CompanionChatState["plannerApproval"]>;
  api: CompanionApi;
  onError: (message: string) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);
  async function respond(allowed: boolean) {
    if (inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    onError("");
    try {
      await api.command(allowed ? "approve-plan" : "reject-plan", approval.requestId);
    } catch (cause) {
      inFlight.current = false;
      setSubmitting(false);
      onError(commandError(cause, "确认未完成，请重试。"));
    }
  }
  return <Surface tone="control" padding="sm" role="region" aria-label={approval.title} className="space-y-2 text-xs">
    <p className="font-medium">{approval.title}</p>
    <p className="text-[color:var(--color-text-secondary)]">{approval.description}</p>
    {approval.detail && <pre className="max-h-36 overflow-y-auto whitespace-pre-wrap break-words font-sans leading-5">{approval.detail}</pre>}
    <div className="flex gap-1">
      <Button type="button" size="xs" disabled={submitting} onClick={() => void respond(true)}>确认新增</Button>
      <Button type="button" size="xs" variant="ghost" disabled={submitting} onClick={() => void respond(false)}>不添加</Button>
    </div>
  </Surface>;
}

function Companion() {
  const api = window.chelaCompanion;
  const [state, setState] = useState<CompanionState>({ mode: "compact", align: "right", bubbleAbove: true, muted: false, today: null, notice: null, chat: null });
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const submitInFlight = useRef(false);
  const composer = useRef<HTMLTextAreaElement>(null);
  const transcript = useRef<HTMLDivElement>(null);
  const followTranscript = useRef(true);
  const expanded = state.mode !== "compact";
  const pinned = state.mode === "open";
  const chat = state.chat;
  const running = chat?.status === "running";
  const waiting = chat?.status === "awaiting_confirmation" || chat?.pendingApproval;
  const failed = chat?.status === "error" || Boolean(chat?.error);
  const latest = chat?.messages.at(-1);
  const chatNotice = state.mode === "notice" && !state.notice;
  const hasReply = chat?.status === "idle" && !failed && latest?.role === "assistant" && latest.status === "done" && Boolean(latest.text.trim());
  const previewReply = chatNotice && !failed && (waiting || hasReply) && latest?.role === "assistant" ? latest.text : "";
  const face = waiting || failed ? "•_•" : running ? "˘_˘" : state.notice ? "◉ᴗ◉"
    : (pinned || chatNotice) && hasReply ? "^ᴗ^"
    : pinned ? "•‿•" : "•ᴗ•";

  useEffect(() => {
    let changed = false;
    let disposed = false;
    const unsubscribe = api.onChange((next) => {
      changed = true;
      setState(next);
      if (next.mode === "compact") setError("");
    });
    void api.command("read").then((next) => {
      if (!disposed && !changed) setState(next);
    }).catch(() => {});
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [api]);

  useEffect(() => {
    const region = transcript.current;
    if (pinned && region && followTranscript.current) region.scrollTop = region.scrollHeight;
  }, [pinned, chat?.messages]);

  useEffect(() => {
    if (pinned && document.hasFocus() && (document.activeElement === document.body || document.activeElement?.id === "companion-hotspot")) {
      composer.current?.focus();
    }
  }, [pinned]);

  function command(action: CompanionAction, payload?: string) {
    const passive = action === "leave" || action === "peek";
    if (!passive) setError("");
    void api.command(action, payload).catch((cause: unknown) => {
      if (!passive) setError(commandError(cause, "操作暂未完成，请重试。"));
    });
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || submitInFlight.current || running || waiting) return;
    submitInFlight.current = true;
    setSending(true);
    setError("");
    followTranscript.current = true;
    try {
      await api.command("send", text);
      setDraft((current) => current === draft ? "" : current);
    } catch (cause) {
      setError(commandError(cause, "消息未发出，请重试。"));
    } finally {
      submitInFlight.current = false;
      setSending(false);
    }
  }

  const notice = state.notice;
  const noticeTitle = notice?.reason === "review" ? "有任务待验收"
    : notice?.reason === "failed" ? "有任务执行失败"
    : notice?.reason === "waiting" ? "有任务等你输入"
    : "计划提醒";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "早上好" : hour < 18 ? "下午好" : "晚上好";
  const title = state.mode === "greeting" ? `老大，${greeting}！`
    : notice ? `老大，${noticeTitle}`
    : chatNotice ? waiting ? "这一步需要你确认" : failed ? "遇到一点问题" : hasReply ? "有回复了" : "对话已结束"
    : pinned ? "老大，我在。" : "老大，看看今天的安排";
  const today = state.today;
  const organizeDisclosure = "将最多 20 项今日、逾期或待处理任务的标题、日期、看板状态和执行状态及来源发给当前模型";
  const summary = !today ? "暂时读不到计划，请到看板查看。" : [
    `今日待办 ${today.pending}`,
    today.overdue ? `逾期 ${today.overdue}` : "",
    today.review ? `待验收 ${today.review}` : "",
    today.waiting ? `待输入 ${today.waiting}` : "",
    today.failed ? `执行失败 ${today.failed}` : "",
  ].filter(Boolean).join(" · ");

  return (
    <main
      className="companion-shell flex h-full min-w-0"
      data-mode={state.mode}
      data-align={state.align}
      data-bubble-above={state.bubbleAbove}
      onMouseEnter={() => command("peek")}
      onMouseLeave={() => command("leave")}
      onKeyDown={(event) => {
        if (event.key === "Escape" && expanded) {
          event.preventDefault();
          command("collapse");
          document.getElementById("companion-hotspot")?.focus();
        }
      }}
    >
      <button
        id="companion-hotspot"
        type="button"
        className="companion-hotspot"
        aria-label="打开 Chela 桌面助手"
        aria-expanded={expanded}
        aria-controls={expanded ? "companion-bubble" : undefined}
        onClick={() => command("pin")}
      />
      {expanded && (
        <Surface id="companion-bubble" tone="overlay" shadow="flyout" className="companion-bubble flex min-h-0 min-w-0 flex-1 flex-col gap-2 p-3" aria-label="Chela 桌面助手">
          <header className={`${pinned ? "app-drag" : ""} flex shrink-0 items-start justify-between gap-1`}>
            <div className="flex min-w-0 items-center gap-2">
              <button type="button" className="no-drag companion-face grid h-10 w-14 shrink-0 place-items-center text-lg" aria-label="固定助手并开始对话" onClick={() => { command("pin"); composer.current?.focus(); }}>
                <span aria-hidden="true">{face}</span>
              </button>
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-[color:var(--color-text-secondary)]">Chela</p>
                <p className="break-words text-sm font-semibold leading-5" role="status">{title}</p>
              </div>
            </div>
            <div className="no-drag flex shrink-0 flex-wrap justify-end">
              <Button type="button" size="icon-xs" variant="ghost" title={state.muted ? "恢复助手主动提醒" : "静默助手主动提醒"} aria-label="静默助手主动提醒" aria-pressed={state.muted} onClick={() => command("mute")}>
                {state.muted ? <BellOff /> : <Bell />}
              </Button>
              <Button type="button" size="icon-xs" variant="ghost" title="暂时隐藏助手" aria-label="暂时隐藏助手" onClick={() => command("hide")}><Minus /></Button>
              <Button type="button" size="icon-xs" variant="ghost" title="关闭助手" aria-label="关闭助手" onClick={() => command("close")}><X /></Button>
            </div>
          </header>
          <div
            ref={transcript}
            className="min-h-0 flex-1 space-y-2 overflow-y-auto px-1"
            onScroll={(event) => {
              const node = event.currentTarget;
              followTranscript.current = node.scrollHeight - node.scrollTop - node.clientHeight < 24;
            }}
          >
            {notice && (
              <Button type="button" variant="secondary" size="xs" className="my-1 w-full min-w-0 justify-start px-1 text-left" title={notice.title} onClick={() => command(notice.page, notice.id)}>
                <span className="min-w-0 truncate">{notice.title}</span>
              </Button>
            )}
            {previewReply && (
              <p className="companion-message line-clamp-4 whitespace-pre-wrap rounded-[var(--radius-control)] px-2.5 py-1.5 text-xs leading-5 [overflow-wrap:anywhere]">{previewReply}</p>
            )}
            {chat?.plannerApproval && !pinned && <Button type="button" size="xs" variant="secondary" onClick={() => command("pin")}>查看待办并确认</Button>}
            <div>
              <p className="text-xs leading-5 text-[color:var(--color-text-secondary)]">{summary}</p>
              {!!today?.tasks.length && (
                <ul className="m-0 list-none p-0">
                  {today.tasks.map((task) => (
                    <li key={task.id}>
                      <Button type="button" variant="ghost" size="xs" className="w-full min-w-0 justify-start px-1 text-left" title={task.title} onClick={() => command("board", task.id)}>
                        <span className="shrink-0" aria-hidden="true">·</span>
                        <span className="min-w-0 truncate">{task.title}</span>
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              {!!today?.tasks.length && (
                <Button type="button" variant="ghost" size="xs" disabled={sending || running || waiting} title={organizeDisclosure} aria-label={`整理今日任务。${organizeDisclosure}`} onClick={() => { followTranscript.current = true; command("plan-today"); }}>
                  整理今日任务
                </Button>
              )}
            </div>
            {pinned && chat?.messages.map((message) => (
              <div key={message.id} className="companion-message max-w-[94%] rounded-[var(--radius-control)] px-2.5 py-1.5 text-xs leading-5" data-role={message.role}>
                <span className="sr-only">{message.role === "user" ? "你" : "Chela"}</span>
                {message.thinking && (
                  <details className="text-[color:var(--color-text-secondary)]">
                    <summary className="cursor-pointer">{message.status === "streaming" ? "思考中" : "思考过程"}</summary>
                    <p className="mt-1 whitespace-pre-wrap [overflow-wrap:anywhere]">{message.thinking}</p>
                  </details>
                )}
                <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{message.text || (message.status === "streaming" ? "…" : "")}</p>
              </div>
            ))}
            {pinned && !chat?.messages.length && <p className="px-1 text-xs leading-5 text-[color:var(--color-text-secondary)]">可以问我今天的安排，或让我记一条待办。新增前会先给你确认。</p>}
            {pinned && chat?.plannerApproval && <PlannerApproval key={chat.plannerApproval.requestId} approval={chat.plannerApproval} api={api} onError={setError} />}
          </div>
          {(running || waiting) && <p role="status" className="px-1 text-xs text-[color:var(--color-text-secondary)]">{waiting ? chat?.plannerApproval ? "请核对待办内容后确认。" : "等待你在主窗口确认。" : latest?.text && latest.role === "assistant" ? "正在回复…" : "正在思考…"}</p>}
          {(error || chat?.error) && <p role="alert" className="max-h-12 overflow-auto break-words px-1 text-xs text-[color:var(--chela-status-error-text)]">{error || chat?.error}</p>}
          <form className="flex shrink-0 items-end gap-1" onSubmit={send}>
            <textarea
              ref={composer}
              className="chela-field min-h-12 min-w-0 flex-1 resize-none px-2 py-1.5 text-sm"
              rows={2}
              maxLength={10_000}
              value={draft}
              aria-label="发消息给 Chela"
              placeholder="和 Chela 聊聊…"
              onChange={(event) => setDraft(event.target.value)}
              onFocus={() => { if (!pinned) command("pin"); }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
            />
            {running || waiting ? (
              <Button type="button" size="icon-sm" variant="secondary" aria-label="停止回复" title="停止回复" onClick={() => command("cancel")}><Square /></Button>
            ) : (
              <Button type="submit" size="icon-sm" aria-label="发送" title="发送" disabled={sending || !draft.trim()}><ArrowUp /></Button>
            )}
          </form>
          <nav className="flex shrink-0 flex-wrap items-center gap-0.5" aria-label="工作台入口">
            <Button type="button" size="xs" variant="secondary" onClick={() => command("board")}>看板</Button>
            <Button type="button" size="xs" variant="ghost" onClick={() => command("calendar")}>日历</Button>
            <Button type="button" size="xs" variant={waiting && !chat?.plannerApproval ? "default" : "ghost"} onClick={() => command(chat?.sessionId ? "open-chat" : "assistant")}>{waiting && !chat?.plannerApproval ? "在主窗口确认" : "主窗口"}</Button>
            <Button type="button" size="icon-xs" variant="ghost" className="ml-auto" title="退出 Chela" aria-label="退出 Chela" onClick={() => command("quit")}><Power /></Button>
          </nav>
        </Surface>
      )}
    </main>
  );
}

const colorScheme = window.matchMedia("(prefers-color-scheme: dark)");
const applyColorScheme = () => { document.documentElement.dataset.theme = colorScheme.matches ? "dark" : "light"; };
colorScheme.addEventListener("change", applyColorScheme);
applyColorScheme();

createRoot(document.getElementById("root")!).render(<Companion />);
