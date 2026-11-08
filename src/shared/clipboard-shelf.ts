export type ClipboardShelfItem = {
  id: string;
  kind: "text" | "image";
  text: string;
  imageDataUrl?: string;
  createdAt: string;
};

export type ClipboardShelfState = {
  items: ClipboardShelfItem[];
  paused: boolean;
};

export type ClipboardShelfApi = {
  show: () => Promise<void>;
  getState: () => Promise<ClipboardShelfState>;
  setPaused: (paused: boolean) => Promise<ClipboardShelfState>;
  copy: (id: string) => Promise<void>;
  remove: (id: string) => Promise<ClipboardShelfState>;
  clear: () => Promise<ClipboardShelfState>;
  onChange: (listener: (state: ClipboardShelfState) => void) => () => void;
};
