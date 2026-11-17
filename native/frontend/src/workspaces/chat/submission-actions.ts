import { chatApi, type ChatSession, type ChatAttachment, type ChatMessage } from "../../data/chat";
import { setDrafts, setContexts, type ChatEdit } from "../../state/chat-drafts";
import { refreshChat, replaceSession, invalidateBranches } from "../../state/chat-actions";

const submissionCommands = new Map<string, string>();

export async function submitMessage({ session, text, attachments, model, effort, editing, onCreated, onSubmitted }: {
  session?: ChatSession; text: string; attachments: ChatAttachment[]; model: string; effort: string;
  editing: ChatEdit | null; onCreated: (session: ChatSession) => void; onSubmitted: () => void;
}) {
  const current = session ?? await chatApi.create();
  if (!session) {
    replaceSession(current);
    setDrafts(values => ({ ...values, new: "", [current.id]: text }));
    setContexts(current.id, attachments); setContexts("new", []);
    onCreated(current);
  }
  const key = JSON.stringify([current.id, text, model, effort, editing?.message, attachments]);
  const command = submissionCommands.get(key) || crypto.randomUUID();
  submissionCommands.set(key, command);
  if (attachments.length) await chatApi.submitContext(current.id,text,attachments,model,effort,command,editing?.message);
  else if (editing) await chatApi.edit(current.id,editing.message,text,model,effort,command);
  else await chatApi.submit(current.id,text,model,effort,command);
  submissionCommands.delete(key);
  setDrafts(values => values[current.id]?.trim() === text ? { ...values, [current.id]: editing?.previousDraft || "" } : values);
  setContexts(current.id, editing?.previousContexts || []);
  if (editing) invalidateBranches(current.id);
  onSubmitted();
  await refreshChat();
}

export async function steerMessage(run: string, text: string, draftKey: string) {
  const key = JSON.stringify(["steer", run, text]);
  const command = submissionCommands.get(key) || crypto.randomUUID();
  submissionCommands.set(key, command);
  await chatApi.steer(run,text,command);
  submissionCommands.delete(key);
  setDrafts(values => values[draftKey]?.trim() === text ? { ...values, [draftKey]: "" } : values);
  await refreshChat();
}

export async function regenerateMessage(session: ChatSession, message: ChatMessage, model: string, effort: string) {
  const items = await Promise.all((message.attachments || []).map(item => chatApi.attachment(session.id,message.id,item.id)));
  if (items.length) await chatApi.submitContext(session.id,message.content,items,model,effort,crypto.randomUUID(),message.id);
  else await chatApi.edit(session.id,message.id,message.content,model,effort,crypto.randomUUID());
  invalidateBranches(session.id);
  await refreshChat();
}
