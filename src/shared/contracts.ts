export type ChatRole = "user" | "assistant" | "system";
export type ChatMessageStatus = "idle" | "streaming" | "done" | "error";
export type FileKind = "text" | "image" | "binary" | "unknown";

export type SelectedFile = {
  id: string;
  name: string;
  path: string;
  size: number;
  extension: string;
  kind: FileKind;
  previewText?: string;
  truncated?: boolean;
  error?: string;
};

export type FilePreviewResult = {
  path: string;
  previewText?: string;
  truncated: boolean;
  error?: string;
};

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: string;
  status: ChatMessageStatus;
  meta?: Record<string, unknown>;
};

export type AssistantMessage = ChatMessage;

export type ChatSession = {
  id: string;
  title: string;
  messages: ChatMessage[];
  attachments: SelectedFile[];
  draft: string;
  createdAt: string;
  updatedAt: string;
};

export type ChatSessionSummary = {
  id: string;
  title: string;
  updatedAt: string;
  messageCount: number;
};

export type SendMessageInput = {
  sessionId: string;
  text: string;
  attachmentIds: string[];
};

export type WindowUiState = {
  rightPanelOpen: boolean;
};

export type WindowFrameState = {
  isMaximized: boolean;
};

export type PersistedAppState = {
  sessions: ChatSession[];
  ui: WindowUiState;
};

export type DesktopApi = {
  files: {
    pick: () => Promise<SelectedFile[]>;
    readPreview: (filePath: string) => Promise<FilePreviewResult>;
  };
  sessions: {
    list: () => Promise<ChatSessionSummary[]>;
    load: (sessionId: string) => Promise<ChatSession | null>;
    save: (session: ChatSession) => Promise<void>;
    create: () => Promise<ChatSession>;
  };
  chat: {
    send: (input: SendMessageInput) => Promise<AssistantMessage>;
  };
  ui: {
    getState: () => Promise<WindowUiState>;
    setRightPanelOpen: (open: boolean) => Promise<void>;
  };
  window: {
    getState: () => Promise<WindowFrameState>;
    minimize: () => void;
    toggleMaximize: () => void;
    close: () => void;
    onStateChange: (listener: (state: WindowFrameState) => void) => () => void;
  };
};

export function createEmptySession(): ChatSession {
  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    title: "新的工作线程",
    messages: [],
    attachments: [],
    draft: "",
    createdAt: now,
    updatedAt: now,
  };
}

export function summarizeSession(session: ChatSession): ChatSessionSummary {
  return {
    id: session.id,
    title: session.title,
    updatedAt: session.updatedAt,
    messageCount: session.messages.length,
  };
}
