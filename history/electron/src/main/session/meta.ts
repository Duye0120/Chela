import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import type {
  AgentResponseStatus,
  ChatSession,
  ChatSessionSummary,
  QueuedMessage,
  SelectedFile,
  SessionTranscriptEvent,
} from "../../shared/contracts.ts";
import { getBrowserContextItems } from "../../shared/browser-context.ts";
import { appLogger } from "../logger.ts";
import { atomicWrite } from "./io.ts";
import { getIndexPath, getSessionMetaPath } from "./paths.ts";
import {
  countMaterializedMessages,
  loadTranscript,
} from "./transcript.ts";

type SessionIndex = {
  summaries: ChatSessionSummary[];
};

export type SessionTodoStatus = "pending" | "in_progress" | "completed";

export type SessionTodoItem = {
  id: string;
  content: string;
  activeForm: string;
  status: SessionTodoStatus;
};

export type PersistedSessionMeta = {
  id: string;
  title: string;
  titleManuallySet?: boolean;
  createdAt: string;
  updatedAt: string;
  archived?: boolean;
  groupId?: string;
  pinned?: boolean;
  draft: string;
  attachments: SelectedFile[];
  lastModelEntryId: string | null;
  lastRunId: string | null;
  lastRunState?: AgentResponseStatus | "awaiting_confirmation" | "running";
  transcriptSeq: number;
  snapshotRevision: number;
  autoCompactFailureCount: number;
  autoCompactBlockedAt?: string;
  todos?: SessionTodoItem[];
  queuedMessages?: QueuedMessage[];
  pendingRedirectDraft?: string;
  pendingRedirectUpdatedAt?: string;
};

export function createMetaFromSession(session: ChatSession): PersistedSessionMeta {
  return {
    id: session.id,
    title: session.title,
    titleManuallySet: false,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    archived: session.archived,
    groupId: session.groupId,
    pinned: session.pinned,
    draft: session.draft,
    attachments: session.attachments,
    lastModelEntryId: null,
    lastRunId: null,
    transcriptSeq: 0,
    snapshotRevision: 0,
    autoCompactFailureCount: 0,
    todos: [],
    queuedMessages: session.queuedMessages ?? [],
    pendingRedirectDraft: "",
  };
}

function normalizeTimestamp(
  value: unknown,
  fallback = new Date().toISOString(),
): string {
  if (typeof value !== "string") {
    return fallback;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : fallback;
}

function normalizeQueuedMessage(
  message: Partial<QueuedMessage>,
): QueuedMessage {
  const source = message.source === "guided" ? "guided" : "queued";
  const browserContextItems = getBrowserContextItems(message.browserContextItems);
  const displayText = message.displayText?.trim();

  return {
    id:
      typeof message.id === "string" && message.id.trim()
        ? message.id
        : `queued-${randomUUID()}`,
    text: typeof message.text === "string" ? message.text.trim() : "",
    ...(displayText ? { displayText } : {}),
    ...(browserContextItems.length > 0 ? { browserContextItems } : {}),
    createdAt: normalizeTimestamp(message.createdAt),
    source,
  };
}

function migrateLegacyRedirectDraft(meta: PersistedSessionMeta): QueuedMessage[] {
  const text =
    typeof meta.pendingRedirectDraft === "string"
      ? meta.pendingRedirectDraft.trim()
      : "";

  if (!text) {
    return [];
  }

  return [
    {
      id: `queued-${randomUUID()}`,
      text,
      createdAt: normalizeTimestamp(
        meta.pendingRedirectUpdatedAt,
        normalizeTimestamp(meta.updatedAt),
      ),
      source: "queued",
    },
  ];
}

export function normalizePersistedSessionMeta(
  meta: PersistedSessionMeta,
): PersistedSessionMeta {
  const queuedMessages = Array.isArray(meta.queuedMessages)
    ? meta.queuedMessages
        .map((item) => normalizeQueuedMessage(item))
        .filter((item) => item.text.length > 0)
    : migrateLegacyRedirectDraft(meta);

  return {
    ...meta,
    titleManuallySet: meta.titleManuallySet === true,
    transcriptSeq: Number.isFinite(meta.transcriptSeq)
      ? Math.max(0, meta.transcriptSeq)
      : 0,
    snapshotRevision: Number.isFinite(meta.snapshotRevision)
      ? Math.max(0, meta.snapshotRevision)
      : 0,
    autoCompactFailureCount: Number.isFinite(meta.autoCompactFailureCount)
      ? Math.max(0, meta.autoCompactFailureCount)
      : 0,
    todos: Array.isArray(meta.todos) ? meta.todos.map(normalizeTodoItem) : [],
    queuedMessages,
    pendingRedirectDraft: "",
    pendingRedirectUpdatedAt: undefined,
  };
}

export function normalizeTodoStatus(value: unknown): SessionTodoStatus {
  switch (value) {
    case "pending":
    case "in_progress":
    case "completed":
      return value;
    default:
      return "pending";
  }
}

export function normalizeTodoItem(item: Partial<SessionTodoItem>): SessionTodoItem {
  const content = typeof item.content === "string" ? item.content.trim() : "";
  const activeForm =
    typeof item.activeForm === "string" && item.activeForm.trim()
      ? item.activeForm.trim()
      : content;

  return {
    id:
      typeof item.id === "string" && item.id.trim()
        ? item.id
        : `todo-${randomUUID()}`,
    content,
    activeForm,
    status: normalizeTodoStatus(item.status),
  };
}

export function writeMeta(meta: PersistedSessionMeta): void {
  atomicWrite(
    getSessionMetaPath(meta.id),
    JSON.stringify(normalizePersistedSessionMeta(meta), null, 2),
  );
}

export function readMeta(sessionId: string): PersistedSessionMeta | null {
  const filePath = getSessionMetaPath(sessionId);
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    return normalizePersistedSessionMeta(
      JSON.parse(readFileSync(filePath, "utf-8")) as PersistedSessionMeta,
    );
  } catch {
    return null;
  }
}

export function readIndex(): SessionIndex {
  let raw: string;
  try {
    raw = readFileSync(getIndexPath(), "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { summaries: [] };
    throw error;
  }
  const index = JSON.parse(raw) as Partial<SessionIndex> | null;
  if (!Array.isArray(index?.summaries)) {
    throw new Error("会话索引格式无效。");
  }
  return { summaries: index.summaries };
}

export function writeIndex(index: SessionIndex): void {
  atomicWrite(getIndexPath(), JSON.stringify(index, null, 2));
}

function buildSessionSummary(
  meta: PersistedSessionMeta,
  transcript: SessionTranscriptEvent[],
): ChatSessionSummary {
  return {
    id: meta.id,
    title: meta.title,
    updatedAt: meta.updatedAt,
    messageCount: countMaterializedMessages(transcript),
    archived: meta.archived,
    groupId: meta.groupId,
    pinned: meta.pinned,
    lastRunState: meta.lastRunState,
  };
}

function writeIndexSummary(summary: ChatSessionSummary): void {
  const index = readIndex();
  const filtered = index.summaries.filter((entry) => entry.id !== summary.id);
  filtered.push(summary);
  filtered.sort((left, right) => {
    if (Boolean(left.pinned) !== Boolean(right.pinned)) {
      return left.pinned ? -1 : 1;
    }
    return right.updatedAt.localeCompare(left.updatedAt);
  });
  writeIndex({ summaries: filtered });
}

export function updateIndexWithMeta(meta: PersistedSessionMeta): void {
  writeIndexSummary(buildSessionSummary(meta, loadTranscript(meta.id)));
}

type LastRunFields = Pick<
  PersistedSessionMeta,
  "lastModelEntryId" | "lastRunId" | "lastRunState"
>;

export function resolveLastRunFields(
  events: SessionTranscriptEvent[],
  initial: LastRunFields = { lastModelEntryId: null, lastRunId: null },
): LastRunFields {
  let { lastModelEntryId, lastRunId, lastRunState } = initial;
  for (const event of events) {
    switch (event.type) {
      case "run_started":
        lastModelEntryId = event.modelEntryId;
        lastRunId = event.runId;
        lastRunState = "running";
        break;
      case "run_state_changed":
        lastRunId = event.runId;
        lastRunState =
          event.state === "awaiting_confirmation" ? "awaiting_confirmation" : "running";
        break;
      case "run_finished":
        lastRunId = event.runId;
        lastRunState =
          event.finalState === "completed"
            ? "completed"
            : event.finalState === "aborted"
              ? "cancelled"
              : "error";
        break;
    }
  }
  return { lastModelEntryId, lastRunId, lastRunState };
}

export const pendingTranscriptProjections = new Set<string>();

export function reconcileTranscriptProjection(
  meta: PersistedSessionMeta,
  transcript: SessionTranscriptEvent[],
  indexed?: ChatSessionSummary,
): ChatSessionSummary {
  const { transcriptSeq, lastRunState, lastRunId, lastModelEntryId } = meta;
  const last = transcript.at(-1);
  if (last && last.seq > transcriptSeq) {
    const unprojected = transcript.filter((event) => event.seq > transcriptSeq);
    Object.assign(meta, resolveLastRunFields(unprojected, meta));
    meta.transcriptSeq = last.seq;
    if (last.timestamp > meta.updatedAt) meta.updatedAt = last.timestamp;
  } else if (lastRunState === "running" || lastRunState === "awaiting_confirmation") {
    Object.assign(meta, resolveLastRunFields(transcript, meta));
  }

  const summary = buildSessionSummary(meta, transcript);
  const metaChanged = transcriptSeq !== meta.transcriptSeq || lastRunState !== meta.lastRunState ||
    lastRunId !== meta.lastRunId || lastModelEntryId !== meta.lastModelEntryId;
  const indexChanged = !indexed || indexed.updatedAt !== summary.updatedAt ||
    indexed.messageCount !== summary.messageCount || indexed.lastRunState !== summary.lastRunState;
  const errors: unknown[] = [];
  for (const [changed, write] of [
    [metaChanged, () => writeMeta(meta)],
    [indexChanged, () => writeIndexSummary(summary)],
  ] as const) {
    if (!changed) continue;
    try {
      write();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length === 0) {
    pendingTranscriptProjections.delete(meta.id);
  } else {
    pendingTranscriptProjections.add(meta.id);
    const message = "会话记录已写入，但更新会话摘要失败";
    try {
      appLogger.warn({
        scope: "session.transcript",
        message,
        data: { sessionId: meta.id },
        error: new AggregateError(errors, message),
      });
    } catch (loggingError) {
      console.warn(message, { sessionId: meta.id, errors, loggingError });
    }
  }
  return summary;
}

export function sortSessionSummaries(
  summaries: ChatSessionSummary[],
): ChatSessionSummary[] {
  return summaries.sort((left, right) => {
    if (Boolean(left.pinned) !== Boolean(right.pinned)) {
      return left.pinned ? -1 : 1;
    }
    return right.updatedAt.localeCompare(left.updatedAt);
  });
}

export function removeFromIndex(sessionId: string): void {
  const index = readIndex();
  if (!index.summaries.some((summary) => summary.id === sessionId)) {
    return;
  }

  writeIndex({
    summaries: index.summaries.filter((summary) => summary.id !== sessionId),
  });
}

export function updateMeta(
  sessionId: string,
  updater: (meta: PersistedSessionMeta) => void,
): PersistedSessionMeta | null {
  const meta = readMeta(sessionId);
  if (!meta) {
    return null;
  }

  updater(meta);
  meta.updatedAt = new Date().toISOString();
  writeMeta(meta);
  updateIndexWithMeta(meta);
  return meta;
}
