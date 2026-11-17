import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import type { AgentEvent } from "../shared/agent-events.ts";
import { formatChatRuntimeErrorMessage } from "../shared/chat-runtime-errors.ts";
import type { CompanionChatState } from "../shared/companion.ts";
import { observeSessionAgentEvents } from "./adapter.ts";
import { cancelChatRun, sendChatMessage } from "./chat/service.ts";
import { BUS_EVENTS, bus } from "./event-bus.ts";
import { harnessRuntime } from "./harness/singleton.ts";
import { readRequiredJsonFileSync, writeJsonFileSync } from "./json-file.ts";
import { appLogger } from "./logger.ts";
import { sanitizeLogMessage } from "./log-sanitize.ts";
import { createSession, loadSession, renameSession } from "./session/facade.ts";

type Message = CompanionChatState["messages"][number];
const historyLimit = 20;
const previewLimit = 16_000;

function preview(text: string): string {
  return text.length > previewLimit ? text.slice(0, previewLimit) + "…" : text;
}

export function createCompanionChat({ filePath, onChange }: { filePath: string; onChange: () => void }) {
  let sessionId: string | null = null;
  let messages: Message[] = [];
  let optimistic: Message | null = null;
  let pendingSend: { runId: string; cancelRequested: boolean } | null = null;
  let observedRunId: string | undefined;
  let stream: Message | null = null;
  let error: string | null = null;
  let storageError = false;
  let disposed = false;
  let stopAgentObserver: (() => void) | undefined;
  let scheduled: ReturnType<typeof setTimeout> | undefined;

  function publish(): void {
    clearTimeout(scheduled);
    scheduled = undefined;
    if (disposed) return;
    try { onChange(); } catch (cause) {
      appLogger.warn({ scope: "desktop-companion", message: "桌面助手对话状态发送失败", error: cause });
    }
  }

  function reloadHistory(): void {
    const session = sessionId ? loadSession(sessionId) : null;
    messages = (session?.messages ?? [])
      .filter((message) => message.role === "user" || message.role === "assistant")
      .slice(-historyLimit)
      .flatMap((message): Message[] => {
        if (message.role !== "user" && message.role !== "assistant") return [];
        const thinking = message.steps?.filter((step) => step.kind === "thinking" && step.thinkingText)
          .map((step) => step.thinkingText).join("\n\n");
        return [{
          id: message.id,
          role: message.role,
          text: preview(message.content),
          status: message.status === "error" ? "error" : "done",
          ...(thinking ? { thinking: preview(thinking) } : {}),
        }];
      });
  }

  function handleEvent(event: AgentEvent): void {
    const messageId = `assistant-${event.runId}`;
    const active = harnessRuntime.getActiveRunBySession(event.sessionId);
    if (event.runId !== (active?.runId ?? observedRunId ?? pendingSend?.runId)) return;
    if (event.type === "agent_end" || event.type === "agent_error") {
      observedRunId = undefined;
      stream = null;
      reloadHistory();
      if (event.type === "agent_error") error = sanitizeLogMessage(event.message);
      publish();
      return;
    }
    if (event.type === "agent_start") {
      error = null;
      stream = { id: messageId, role: "assistant", text: "", status: "streaming" };
      reloadHistory();
      publish();
      return;
    }
    if (event.type === "run_state_changed" || event.type === "confirmation_request") {
      publish();
      return;
    }
    if (event.type !== "text_delta" && event.type !== "thinking_delta" && event.type !== "message_end") return;
    const current = stream?.id === messageId ? stream : { id: messageId, role: "assistant", text: "", status: "streaming" } satisfies Message;
    if (event.type === "text_delta") current.text = preview(current.text + event.delta);
    if (event.type === "thinking_delta") current.thinking = preview((current.thinking ?? "") + event.delta);
    if (event.type === "message_end") {
      if (event.finalText) current.text = preview(event.finalText);
      if (event.finalThinking) current.thinking = preview(event.finalThinking);
    }
    stream = current;
    scheduled ??= setTimeout(publish, 50);
  }

  function useSession(id: string): void {
    stopAgentObserver?.();
    sessionId = id;
    observedRunId = harnessRuntime.getActiveRunBySession(id)?.runId;
    stopAgentObserver = observeSessionAgentEvents(id, handleEvent);
    reloadHistory();
  }

  try {
    if (existsSync(filePath)) {
      const record = readRequiredJsonFileSync(filePath) as { sessionId?: unknown } | null;
      const savedId = record?.sessionId;
      if (typeof savedId !== "string" || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(savedId)) {
        throw new Error("桌面助手会话记录无效。");
      }
      if (loadSession(savedId)) useSession(savedId);
    }
  } catch (cause) {
    storageError = true;
    error = "无法读取桌面助手的会话记录，原记录已保留。";
    appLogger.warn({ scope: "desktop-companion", message: error, error: cause });
  }

  const stopUserObserver = bus.on(BUS_EVENTS.MESSAGE_USER, (event) => {
    if (event.sessionId !== sessionId) return;
    if (!pendingSend || harnessRuntime.getActiveRunBySession(event.sessionId)?.runId === pendingSend.runId) optimistic = null;
    reloadHistory();
    publish();
  });
  const stopRunObserver = bus.on(BUS_EVENTS.RUN_CREATED, ({ sessionId: createdSessionId, runId, lane }) => {
    if (createdSessionId !== sessionId || lane !== "foreground") return;
    observedRunId = runId;
    stream = null;
    error = null;
    if (!pendingSend) publish();
    if (pendingSend?.runId !== runId || !pendingSend.cancelRequested) return;
    void cancelChatRun({ sessionId: createdSessionId, runId }).catch((cause: unknown) => {
      if (pendingSend?.runId !== runId) return;
      error = sanitizeLogMessage(formatChatRuntimeErrorMessage(cause));
      publish();
    });
  });

  function getPlannerApproval(active: ReturnType<typeof harnessRuntime.getActiveRunBySession>) {
    if (disposed || !active || active.sessionId !== sessionId || active.state !== "awaiting_confirmation"
      || active.pendingApproval?.kind !== "planner") return undefined;
    const { requestId, title, description, detail } = active.pendingApproval;
    return { requestId, title, description, detail };
  }

  return {
    getState(): CompanionChatState {
      const active = sessionId ? harnessRuntime.getActiveRunBySession(sessionId) : null;
      const pendingApproval = active?.state === "awaiting_confirmation";
      const plannerApproval = getPlannerApproval(active);
      return {
        sessionId,
        status: pendingApproval ? "awaiting_confirmation" : active || pendingSend ? "running" : error ? "error" : "idle",
        messages: [
          ...messages,
          ...(optimistic ? [optimistic] : []),
          ...(stream && (stream.text || stream.thinking) ? [{ ...stream }] : []),
        ],
        pendingApproval,
        ...(plannerApproval ? { plannerApproval } : {}),
        error,
      };
    },

    send(input: unknown, toolsDisabled = false): void {
      if (disposed) throw new Error("桌面助手已关闭。");
      const text = typeof input === "string" ? input.trim() : "";
      if (!text || text.length > 10_000) throw new Error("请输入 1 至 10,000 个字符。");
      if (storageError) throw new Error(error ?? "桌面助手会话记录不可用。");
      if (pendingSend || (sessionId && harnessRuntime.getActiveRunBySession(sessionId))) {
        throw new Error("已有一轮对话正在进行。");
      }
      if (!sessionId || !loadSession(sessionId)) {
        const session = createSession();
        renameSession(session.id, "桌面助手");
        writeJsonFileSync(filePath, { sessionId: session.id });
        useSession(session.id);
      }
      if (!sessionId) throw new Error("桌面助手会话尚未就绪。");
      const runId = randomUUID();
      const currentSessionId = sessionId;
      const send = { runId, cancelRequested: false };
      pendingSend = send;
      optimistic = { id: `user-${runId}`, role: "user", text, status: "streaming" };
      error = null;
      publish();
      void sendChatMessage({ sessionId: currentSessionId, runId, text, attachments: [], toolsDisabled })
        .catch((cause: unknown) => { error ??= sanitizeLogMessage(formatChatRuntimeErrorMessage(cause)); })
        .finally(() => {
          pendingSend = null;
          if (optimistic?.id === `user-${runId}`) {
            optimistic = { ...optimistic, status: "error" };
            error ??= send.cancelRequested ? "发送前已取消。" : "消息未能发送。";
          }
          if (stream?.id === `assistant-${runId}`) stream = null;
          publish();
        });
    },

    respondToPlannerApproval(requestId: unknown, allowed: boolean): void {
      const active = sessionId ? harnessRuntime.getActiveRunBySession(sessionId) : null;
      const approval = getPlannerApproval(active);
      if (typeof requestId !== "string" || !requestId.trim() || typeof allowed !== "boolean"
        || approval?.requestId !== requestId
        || !harnessRuntime.resolvePendingApproval({ requestId, allowed }, "renderer")) {
        throw new Error("计划确认已失效，请刷新后重试。");
      }
    },

    async cancel(): Promise<void> {
      const active = sessionId ? harnessRuntime.getActiveRunBySession(sessionId) : null;
      if (pendingSend && active?.runId !== pendingSend.runId) {
        pendingSend.cancelRequested = true;
        return;
      }
      if (active) await cancelChatRun({ sessionId: active.sessionId, runId: active.runId });
    },

    dispose(): void {
      disposed = true;
      clearTimeout(scheduled);
      stopAgentObserver?.();
      stopUserObserver();
      stopRunObserver();
    },
  };
}
