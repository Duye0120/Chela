import type { ChatSession, ChatSessionSummary } from "../../shared/contracts.js";
import {
  archivePersistedSession,
  createPersistedSession,
  dequeuePersistedQueuedMessage,
  deletePersistedSession,
  enqueuePersistedQueuedMessage,
  listPersistedArchivedSessions,
  listPersistedQueuedMessages,
  listPersistedSessions,
  loadPersistedSession,
  movePersistedQueuedMessageToFront,
  removePersistedQueuedMessage,
  renamePersistedSession,
  restorePersistedQueuedMessageToFront,
  saveSessionProjection,
  setPersistedSessionGroup,
  setPersistedSessionPinned,
  trimPersistedSessionMessages,
  unarchivePersistedSession,
} from "./service.js";
import {
  reindexSessionSearch,
  searchSessions,
} from "./search.js";

export function listSessions(): ChatSessionSummary[] {
  return listPersistedSessions();
}

export function loadSession(sessionId: string): ChatSession | null {
  return loadPersistedSession(sessionId);
}

export function saveSession(session: ChatSession): void {
  saveSessionProjection(session);
}

export function createSession(): ChatSession {
  return createPersistedSession();
}

export function deleteSession(sessionId: string): void {
  deletePersistedSession(sessionId);
}

export function trimSessionMessages(sessionId: string, messageId: string): ChatSession {
  return trimPersistedSessionMessages(sessionId, messageId);
}

export function listArchivedSessions(): ChatSessionSummary[] {
  return listPersistedArchivedSessions();
}

export function archiveSession(sessionId: string): void {
  archivePersistedSession(sessionId);
}

export function unarchiveSession(sessionId: string): void {
  unarchivePersistedSession(sessionId);
}

export function setSessionGroup(sessionId: string, groupId: string | null): void {
  setPersistedSessionGroup(sessionId, groupId);
}

export function renameSession(sessionId: string, title: string): void {
  const nextTitle = title.trim();
  if (!nextTitle) {
    return;
  }

  renamePersistedSession(sessionId, nextTitle);
}

export function setSessionPinned(sessionId: string, pinned: boolean): void {
  setPersistedSessionPinned(sessionId, pinned);
}

export function listSessionQueuedMessages(sessionId: string) {
  return listPersistedQueuedMessages(sessionId);
}

export function enqueueSessionQueuedMessage(sessionId: string, text: string) {
  return enqueuePersistedQueuedMessage(sessionId, text);
}

export function moveSessionQueuedMessageToFront(
  sessionId: string,
  messageId: string,
) {
  return movePersistedQueuedMessageToFront(sessionId, messageId);
}

export function removeSessionQueuedMessage(
  sessionId: string,
  messageId: string,
) {
  removePersistedQueuedMessage(sessionId, messageId);
}

export function dequeueSessionQueuedMessage(sessionId: string) {
  return dequeuePersistedQueuedMessage(sessionId);
}

export function restoreSessionQueuedMessageToFront(
  sessionId: string,
  queuedMessage: ReturnType<typeof dequeuePersistedQueuedMessage>,
) {
  if (!queuedMessage) {
    return;
  }

  restorePersistedQueuedMessageToFront(sessionId, queuedMessage);
}

export function searchSessionSummaries(query: string, limit?: number) {
  return searchSessions(query, limit);
}

export function rebuildSessionSearchIndex(): void {
  reindexSessionSearch();
}
