import { createStore } from "zustand/vanilla";
import type { ChatAttachment } from "../data/chat";

export type ChatEdit = { session: string; message: string; previousDraft: string; previousContexts: ChatAttachment[] };

export const emptyAttachments: ChatAttachment[] = [];
export const chatDrafts = createStore<{
  drafts: Record<string, string>;
  contexts: Record<string, ChatAttachment[]>;
}>(() => ({ drafts: {}, contexts: {} }));

export function setDrafts(update: (values: Record<string, string>) => Record<string, string>) {
  chatDrafts.setState(state => ({ drafts: update(state.drafts) }));
}

export function setContexts(key: string, update: ChatAttachment[] | ((items: ChatAttachment[]) => ChatAttachment[])) {
  chatDrafts.setState(state => ({ contexts: { ...state.contexts,
    [key]: typeof update === "function" ? update(state.contexts[key] || emptyAttachments) : update,
  } }));
}

export function clearDraft(key: string) {
  chatDrafts.setState(state => {
    const drafts = { ...state.drafts }, contexts = { ...state.contexts };
    delete drafts[key]; delete contexts[key];
    return { drafts, contexts };
  });
}
