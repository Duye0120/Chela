import type { ChatSession, ChatSessionSummary, SelectedFile } from "@shared/contracts";
import { summarizeSession } from "@shared/contracts";

const SESSION_TIME_FORMATTER = new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit",
  minute: "2-digit",
});

export function deriveSessionTitle(text: string, attachments: SelectedFile[]) {
  const trimmed = text.trim();

  if (trimmed) {
    return trimmed.slice(0, 24);
  }

  if (attachments.length > 0) {
    return `附件会话 · ${attachments[0].name}`;
  }

  return "新的工作线程";
}

export function upsertSummary(summaries: ChatSessionSummary[], session: ChatSession) {
  const nextSummary = summarizeSession(session);
  const filtered = summaries.filter((summary) => summary.id !== session.id);

  return [nextSummary, ...filtered].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function mergeAttachments(current: SelectedFile[], incoming: SelectedFile[]) {
  const seenPaths = new Set(current.map((file) => file.path));
  const merged = [...current];

  for (const file of incoming) {
    if (!seenPaths.has(file.path)) {
      seenPaths.add(file.path);
      merged.push(file);
    }
  }

  return merged;
}

export function formatTime(iso: string) {
  return SESSION_TIME_FORMATTER.format(new Date(iso));
}

export function formatRelativeTime(iso: string) {
  const time = new Date(iso).getTime();
  const diff = Date.now() - time;
  const minutes = Math.max(1, Math.floor(diff / 60_000));

  if (minutes < 60) {
    return `${minutes} 分钟前`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} 小时前`;
  }

  const days = Math.floor(hours / 24);
  return `${days} 天前`;
}
