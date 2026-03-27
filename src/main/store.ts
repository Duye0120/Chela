import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { app } from "electron";
import { createEmptySession, summarizeSession, type ChatSession, type PersistedAppState } from "../shared/contracts.js";

const STORE_FILE_NAME = "desktop-shell-state.json";

const DEFAULT_STATE: PersistedAppState = {
  sessions: [],
  ui: {
    rightPanelOpen: true,
  },
};

function getStorePath() {
  return join(app.getPath("userData"), STORE_FILE_NAME);
}

async function ensureStoreDirectory() {
  await mkdir(dirname(getStorePath()), { recursive: true });
}

async function readStore(): Promise<PersistedAppState> {
  try {
    const content = await readFile(getStorePath(), "utf8");
    const parsed = JSON.parse(content) as Partial<PersistedAppState>;

    return {
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      ui: {
        rightPanelOpen: parsed.ui?.rightPanelOpen ?? true,
      },
    };
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
}

async function writeStore(state: PersistedAppState) {
  await ensureStoreDirectory();
  await writeFile(getStorePath(), JSON.stringify(state, null, 2), "utf8");
}

export async function listSessions() {
  const state = await readStore();

  return state.sessions
    .slice()
    .sort((left: ChatSession, right: ChatSession) => right.updatedAt.localeCompare(left.updatedAt))
    .map(summarizeSession);
}

export async function loadSession(sessionId: string) {
  const state = await readStore();
  return state.sessions.find((session: ChatSession) => session.id === sessionId) ?? null;
}

export async function saveSession(session: ChatSession) {
  const state = await readStore();
  const sessionIndex = state.sessions.findIndex((entry: ChatSession) => entry.id === session.id);

  if (sessionIndex === -1) {
    state.sessions.unshift(session);
  } else {
    state.sessions[sessionIndex] = session;
  }

  state.sessions.sort((left: ChatSession, right: ChatSession) => right.updatedAt.localeCompare(left.updatedAt));
  await writeStore(state);
}

export async function createSession() {
  const state = await readStore();
  const session = createEmptySession();

  state.sessions.unshift(session);
  await writeStore(state);
  return session;
}

export async function getUiState() {
  const state = await readStore();
  return state.ui;
}

export async function setRightPanelOpen(open: boolean) {
  const state = await readStore();
  state.ui.rightPanelOpen = open;
  await writeStore(state);
}
