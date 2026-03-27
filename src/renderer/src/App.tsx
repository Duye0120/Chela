import { startTransition, useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDownIcon } from "@heroicons/react/24/outline";
import type { ChatMessage, ChatSession, ChatSessionSummary, SelectedFile, WindowFrameState } from "@shared/contracts";
import { Composer } from "@renderer/components/Composer";
import { ContextPanel } from "@renderer/components/ContextPanel";
import { MessageList } from "@renderer/components/MessageList";
import { Sidebar } from "@renderer/components/Sidebar";
import { TitleBar } from "@renderer/components/TitleBar";
import { deriveSessionTitle, mergeAttachments, upsertSummary } from "@renderer/lib/session";

const ACTIVE_SESSION_STORAGE_KEY = "first-pi-agent.active-session-id";

function buildUserMessage(text: string, attachments: SelectedFile[]): ChatMessage {
  const trimmed = text.trim();
  const fallback = attachments.length > 0 ? `附加了 ${attachments.length} 个本地文件。` : "空消息";

  return {
    id: crypto.randomUUID(),
    role: "user",
    content: trimmed || fallback,
    timestamp: new Date().toISOString(),
    status: "done",
    meta: {
      attachmentIds: attachments.map((attachment) => attachment.id),
    },
  };
}

export default function App() {
  const desktopApi = window.desktopApi;
  const [booting, setBooting] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isPickingFiles, setIsPickingFiles] = useState(false);
  const [summaries, setSummaries] = useState<ChatSessionSummary[]>([]);
  const [activeSession, setActiveSession] = useState<ChatSession | null>(null);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [frameState, setFrameState] = useState<WindowFrameState>({ isMaximized: false });

  const activeSessionId = activeSession?.id ?? null;

  const hydrateSession = useCallback((session: ChatSession) => {
    startTransition(() => {
      setActiveSession(session);
    });
    localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, session.id);
  }, []);

  const persistSession = useCallback(
    (session: ChatSession) => {
      setActiveSession(session);
      setSummaries((current) => upsertSummary(current, session));
      void desktopApi?.sessions.save(session);
    },
    [desktopApi],
  );

  const bootApp = useCallback(async () => {
    if (!desktopApi) {
      setBootError("桌面桥接没有注入成功，renderer 无法访问 Electron API。现在不会再整窗黑掉，而是直接把问题暴露出来。");
      setBooting(false);
      return;
    }

    try {
      const [uiState, frame, sessionSummaries] = await Promise.all([
        desktopApi.ui.getState(),
        desktopApi.window.getState(),
        desktopApi.sessions.list(),
      ]);

      setRightPanelOpen(uiState.rightPanelOpen);
      setFrameState(frame);
      setSummaries(sessionSummaries);

      const storedSessionId = localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY);
      let nextSession = storedSessionId ? await desktopApi.sessions.load(storedSessionId) : null;

      if (!nextSession && sessionSummaries[0]) {
        nextSession = await desktopApi.sessions.load(sessionSummaries[0].id);
      }

      if (!nextSession) {
        nextSession = await desktopApi.sessions.create();
        setSummaries([upsertSummary([], nextSession)[0]]);
      }

      hydrateSession(nextSession);
    } catch (error) {
      setBootError(error instanceof Error ? error.message : "桌面壳初始化失败。");
    } finally {
      setBooting(false);
    }
  }, [desktopApi, hydrateSession]);

  useEffect(() => {
    void bootApp();

    if (!desktopApi) {
      return;
    }

    const cleanup = desktopApi.window.onStateChange((state) => {
      setFrameState(state);
    });

    return cleanup;
  }, [bootApp, desktopApi]);

  const createNewSession = useCallback(async () => {
    if (!desktopApi) {
      return;
    }

    const nextSession = await desktopApi.sessions.create();
    setSummaries((current) => upsertSummary(current, nextSession));
    hydrateSession(nextSession);
  }, [desktopApi, hydrateSession]);

  const selectSession = useCallback(
    async (sessionId: string) => {
      if (!desktopApi) {
        return;
      }

      const session = await desktopApi.sessions.load(sessionId);
      if (session) {
        hydrateSession(session);
      }
    },
    [desktopApi, hydrateSession],
  );

  const updateDraft = useCallback(
    (draft: string) => {
      setActiveSession((current) => {
        if (!current) {
          return current;
        }

        const nextSession = {
          ...current,
          draft,
        };

        void desktopApi?.sessions.save(nextSession);
        return nextSession;
      });
    },
    [desktopApi],
  );

  const attachFiles = useCallback(async () => {
    if (!activeSession || !desktopApi) {
      return;
    }

    setIsPickingFiles(true);

    try {
      const pickedFiles = await desktopApi.files.pick();
      const enrichedFiles = await Promise.all(
        pickedFiles.map(async (file) => {
          if (file.kind !== "text") {
            return file;
          }

          const preview = await desktopApi.files.readPreview(file.path);
          return {
            ...file,
            previewText: preview.previewText,
            truncated: preview.truncated,
            error: preview.error,
          };
        }),
      );

      const nextSession: ChatSession = {
        ...activeSession,
        attachments: mergeAttachments(activeSession.attachments, enrichedFiles),
        updatedAt: new Date().toISOString(),
      };

      persistSession(nextSession);

      if (!rightPanelOpen) {
        setRightPanelOpen(true);
        void desktopApi.ui.setRightPanelOpen(true);
      }
    } finally {
      setIsPickingFiles(false);
    }
  }, [activeSession, desktopApi, persistSession, rightPanelOpen]);

  const removeAttachment = useCallback(
    (attachmentId: string) => {
      if (!activeSession) {
        return;
      }

      const nextSession: ChatSession = {
        ...activeSession,
        attachments: activeSession.attachments.filter((attachment) => attachment.id !== attachmentId),
        updatedAt: new Date().toISOString(),
      };

      persistSession(nextSession);
    },
    [activeSession, persistSession],
  );

  const sendMessage = useCallback(async () => {
    if (!activeSession || isSending) {
      return;
    }

    const text = activeSession.draft.trim();
    const attachments = activeSession.attachments;

    if (!text && attachments.length === 0) {
      return;
    }

    setIsSending(true);

    try {
      const userMessage = buildUserMessage(text, attachments);
      const nextSessionTitle =
        activeSession.messages.length === 0 ? deriveSessionTitle(text, attachments) : activeSession.title;

      const sessionAfterUserMessage: ChatSession = {
        ...activeSession,
        title: nextSessionTitle,
        messages: [...activeSession.messages, userMessage],
        draft: "",
        attachments: [],
        updatedAt: userMessage.timestamp,
      };

      persistSession(sessionAfterUserMessage);

      if (!desktopApi) {
        throw new Error("桌面桥接不可用，无法发送消息。");
      }

      const assistantMessage = await desktopApi.chat.send({
        sessionId: activeSession.id,
        text,
        attachmentIds: attachments.map((attachment) => attachment.id),
      });

      const sessionAfterAssistantMessage: ChatSession = {
        ...sessionAfterUserMessage,
        messages: [...sessionAfterUserMessage.messages, assistantMessage],
        updatedAt: assistantMessage.timestamp,
      };

      persistSession(sessionAfterAssistantMessage);
    } catch (error) {
      const message = error instanceof Error ? error.message : "发送失败，请稍后重试。";
      const systemMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "system",
        content: message,
        timestamp: new Date().toISOString(),
        status: "error",
      };

      persistSession({
        ...activeSession,
        messages: [...activeSession.messages, systemMessage],
        updatedAt: systemMessage.timestamp,
      });
    } finally {
      setIsSending(false);
    }
  }, [activeSession, desktopApi, isSending, persistSession]);

  const toggleRightPanel = useCallback(() => {
    const nextOpen = !rightPanelOpen;
    setRightPanelOpen(nextOpen);
    void desktopApi?.ui.setRightPanelOpen(nextOpen);
  }, [desktopApi, rightPanelOpen]);

  const topSummary = useMemo(() => {
    if (!activeSession) {
      return "准备启动工作线程";
    }

    return `${activeSession.messages.length} 条消息 · ${activeSession.attachments.length} 个附件等待发送`;
  }, [activeSession]);

  if (booting) {
    return (
      <main className="grid h-screen place-items-center bg-shell-950 text-shell-300">
        <div className="rounded-[28px] border border-black/8 bg-white/82 px-8 py-7 shadow-glow">
          <p className="text-xs uppercase tracking-[0.24em] text-shell-500">Booting</p>
          <h1 className="mt-3 text-2xl font-semibold text-shell-100">正在拉起桌面聊天壳…</h1>
          <p className="mt-2 text-sm text-shell-400">会话状态、窗口状态和本地文件能力正在就位。</p>
        </div>
      </main>
    );
  }

  if (bootError) {
    return (
      <main className="grid h-screen place-items-center bg-shell-950 px-8 text-shell-300">
        <div className="max-w-2xl rounded-[28px] border border-rose-400/25 bg-rose-50 px-8 py-7 shadow-glow">
          <p className="text-xs uppercase tracking-[0.24em] text-rose-200">Renderer Error</p>
          <h1 className="mt-3 text-2xl font-semibold text-shell-100">界面初始化失败</h1>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-shell-300">{bootError}</p>
          <p className="mt-4 text-sm text-shell-400">现在就算 preload 出问题，也不会再整窗发黑，而是直接显示诊断信息。</p>
        </div>
      </main>
    );
  }

  return (
    <main className="grid h-screen grid-rows-[auto_1fr] bg-shell-950 text-shell-100">
      <TitleBar
        sessionTitle={activeSession?.title ?? "新的工作线程"}
        isMaximized={frameState.isMaximized}
        rightPanelOpen={rightPanelOpen}
        onToggleRightPanel={toggleRightPanel}
        onMinimize={() => desktopApi?.window.minimize()}
        onToggleMaximize={() => desktopApi?.window.toggleMaximize()}
        onClose={() => desktopApi?.window.close()}
      />

      <div className={`grid min-h-0 ${rightPanelOpen ? "grid-cols-[220px_minmax(0,1fr)_300px]" : "grid-cols-[220px_minmax(0,1fr)]"}`}>
        <Sidebar
          summaries={summaries}
          activeSessionId={activeSessionId}
          onSelectSession={selectSession}
          onNewSession={createNewSession}
        />

        <section className="flex min-h-0 flex-col bg-[#fbfbf8]">
          <div className="border-b border-black/6 px-10 py-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-xs text-shell-500">
                  <span>聊天</span>
                  <ChevronDownIcon className="h-3.5 w-3.5" />
                </div>
                <h1 className="mt-2 text-lg font-semibold text-shell-100">{activeSession?.title ?? "新的工作线程"}</h1>
                <p className="mt-1 text-sm text-shell-500">{topSummary}</p>
              </div>
              <div className="hidden items-center gap-2 lg:flex">
                <span className="rounded-full border border-black/8 bg-white px-3 py-1 text-xs text-shell-500">
                  在线
                </span>
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <MessageList messages={activeSession?.messages ?? []} />
          </div>

          <Composer
            draft={activeSession?.draft ?? ""}
            attachments={activeSession?.attachments ?? []}
            isSending={isSending}
            isPickingFiles={isPickingFiles}
            onDraftChange={updateDraft}
            onAttachFiles={attachFiles}
            onRemoveAttachment={removeAttachment}
            onSend={() => void sendMessage()}
          />
        </section>

        {rightPanelOpen ? <ContextPanel open={rightPanelOpen} session={activeSession} /> : null}
      </div>
    </main>
  );
}
