import type {
  ChatSession,
  ChatSessionSummary,
  SessionGroup,
} from "@shared/contracts";
import { upsertSummary } from "@renderer/lib/session";

export function applySessionToLiveSummaries(
  current: ChatSessionSummary[],
  session: ChatSession,
) {
  if (session.archived) {
    return current.filter((summary) => summary.id !== session.id);
  }

  return upsertSummary(current, session);
}

export function applySessionToArchivedSummaries(
  current: ChatSessionSummary[],
  session: ChatSession,
) {
  if (session.archived) {
    return upsertSummary(current, session);
  }

  return current.filter((summary) => summary.id !== session.id);
}

export function removeRecordKey<T>(
  current: Record<string, T>,
  key: string,
) {
  if (!(key in current)) {
    return current;
  }

  const next = { ...current };
  delete next[key];
  return next;
}

export function updateRunningSessionIds(
  current: string[],
  sessionId: string,
  isRunning: boolean,
) {
  const exists = current.includes(sessionId);
  if (isRunning) {
    return exists ? current : [...current, sessionId];
  }

  return exists ? current.filter((id) => id !== sessionId) : current;
}

export function findSessionSummary(
  sessionId: string,
  liveSummaries: ChatSessionSummary[],
  archivedSummaries: ChatSessionSummary[],
) {
  return (
    liveSummaries.find((summary) => summary.id === sessionId) ??
    archivedSummaries.find((summary) => summary.id === sessionId) ??
    null
  );
}

export function resolveSessionProjectPath(
  sessionId: string,
  liveSummaries: ChatSessionSummary[],
  archivedSummaries: ChatSessionSummary[],
  groups: SessionGroup[],
) {
  const summary = findSessionSummary(sessionId, liveSummaries, archivedSummaries);
  if (!summary?.groupId) {
    return "";
  }

  return groups.find((group) => group.id === summary.groupId)?.path.trim() ?? "";
}

export function findGroupById(groups: SessionGroup[], groupId: string) {
  return groups.find((group) => group.id === groupId) ?? null;
}

export function findGroupByPath(groups: SessionGroup[], path: string) {
  return groups.find((group) => group.path === path) ?? null;
}

export function resolveGroupName(groups: SessionGroup[], groupId: string) {
  return findGroupById(groups, groupId)?.name ?? "";
}

export function resolveGroupPath(groups: SessionGroup[], groupId: string) {
  return findGroupById(groups, groupId)?.path.trim() ?? "";
}
