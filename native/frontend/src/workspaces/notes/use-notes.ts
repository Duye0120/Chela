import { useEffect, useRef, useState } from "react";
import { workApi, type WorkNote } from "../../data/work";
import { desktop } from "../../platform/bridge";

const draftKey = "chela.notes.drafts.v1";
const draftStorage = desktop ? localStorage : sessionStorage;
type Draft = { note: WorkNote; base: string };
let writes: Promise<unknown> = Promise.resolve();
const message = (cause: unknown) => cause instanceof Error ? cause.message : String(cause);
const sameContent = (left: WorkNote, right: WorkNote) => left.title === right.title && left.content === right.content && left.parentId === right.parentId &&
  Boolean(left.folder) === Boolean(right.folder) && Boolean(left.favorite) === Boolean(right.favorite) && Boolean(left.archived) === Boolean(right.archived) &&
  Boolean(left.inbox) === Boolean(right.inbox) && JSON.stringify(left.tags || []) === JSON.stringify(right.tags || []);

function readDrafts(): Record<string, Draft> {
  const value: unknown = JSON.parse(draftStorage.getItem(draftKey) || "{}");
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("本地笔记草稿格式异常，已保留原数据。");
  for (const item of Object.values(value)) {
    if (!item || typeof item !== "object" || !item.note || typeof item.base !== "string" ||
      ![item.note.id, item.note.title, item.note.content, item.note.parentId, item.note.updatedAt].every(field => typeof field === "string"))
      throw new Error("本地笔记草稿格式异常，已保留原数据。");
  }
  return value as Record<string, Draft>;
}

export function useNotes() {
  const [notes, setNotes] = useState<WorkNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [recovered, setRecovered] = useState<WorkNote[]>([]);
  const [revision, setRevision] = useState(0);
  const latest = useRef(notes);
  const drafts = useRef<Record<string, Draft>>({});
  const ready = useRef(false);
  const mounted = useRef(true);
  latest.current = notes;

  function storeDraft(id: string, draft?: Draft) {
    // Merge per-note journal entries so a second mounted editor cannot erase another draft.
    const stored = readDrafts();
    if (draft) stored[id] = draft; else delete stored[id];
    draftStorage.setItem(draftKey, JSON.stringify(stored));
  }

  useEffect(() => {
    mounted.current = true;
    void workApi.notes().then(items => {
      if (!mounted.current) return;
      drafts.current = readDrafts();
      const merged = new Map(items.map(note => [note.id, note]));
      const conflicts: WorkNote[] = [];
      for (const [id, draft] of Object.entries(drafts.current)) {
        if (id.startsWith("recovered:")) { conflicts.push(draft.note); delete drafts.current[id]; continue; }
        const remote = merged.get(id);
        if (!remote || remote.updatedAt !== draft.base) {
          if (remote && sameContent(remote, draft.note)) storeDraft(id);
          else {
            storeDraft(`recovered:${id}:${draft.base}`, draft);
            storeDraft(id);
            conflicts.push(draft.note);
          }
          delete drafts.current[id];
          continue;
        }
        merged.set(id, draft.note);
      }
      setRecovered(conflicts);
      latest.current = [...merged.values()];
      setNotes(latest.current);
      ready.current = true;
      if (Object.keys(drafts.current).length) setRevision(value => value + 1);
    }).catch(cause => { if (mounted.current) setError(message(cause)); })
      .finally(() => { if (mounted.current) setLoading(false); });
    return () => { mounted.current = false; };
  }, []);

  function update(note: WorkNote) {
    const previous = latest.current.find(item => item.id === note.id);
    if (!ready.current || !previous) return;
    const draft = { note, base: drafts.current[note.id]?.base ?? previous.updatedAt };
    drafts.current[note.id] = draft;
    latest.current = latest.current.map(item => item.id === note.id ? note : item);
    setNotes(latest.current);
    try { storeDraft(note.id, draft); setError(""); }
    catch (cause) { setError(`草稿尚未写入本地：${message(cause)}`); }
    setRevision(value => value + 1);
  }

  function flush() {
    const operation = writes.catch(() => undefined).then(async () => {
      for (const id of Object.keys(drafts.current)) {
        const draft = drafts.current[id];
        if (!draft) continue;
        if (!draft.note.title.trim()) throw new Error("请填写笔记标题；正文草稿已保留。");
        if (mounted.current) setSaving(true);
        const remote = (await workApi.notes()).find(item => item.id === id);
        if (!remote || remote.updatedAt !== draft.base)
          throw new Error(`“${draft.note.title}”已在其他位置修改或删除。草稿已保留，请另存副本，避免覆盖。`);
        const saved = await workApi.saveNote({ ...draft.note, updatedAt: draft.base });
        if (drafts.current[id] === draft) {
          delete drafts.current[id];
          const stored = readDrafts()[id];
          if (stored && JSON.stringify(stored.note) === JSON.stringify(draft.note)) storeDraft(id);
          latest.current = latest.current.map(note => note.id === id ? saved : note);
        } else if (drafts.current[id]) {
          drafts.current[id] = { ...drafts.current[id], base: saved.updatedAt };
          storeDraft(id, drafts.current[id]);
          latest.current = latest.current.map(note => note.id === id ? { ...note, updatedAt: saved.updatedAt } : note);
        }
        if (mounted.current) setNotes(latest.current);
      }
      if (mounted.current) setError("");
    });
    writes = operation;
    void operation.catch(cause => { if (mounted.current) setError(message(cause)); })
      .finally(() => { if (mounted.current) setSaving(false); });
    return operation;
  }

  useEffect(() => {
    if (!revision) return;
    const timer = window.setTimeout(() => { void flush(); }, 650);
    return () => window.clearTimeout(timer);
  }, [revision]);

  useEffect(() => {
    function beforeUnload(event: BeforeUnloadEvent) {
      if (Object.keys(drafts.current).length) { event.preventDefault(); event.returnValue = ""; }
    }
    window.addEventListener("beforeunload", beforeUnload);
    return () => { window.removeEventListener("beforeunload", beforeUnload); void flush(); };
  }, []);

  async function create(values: Partial<WorkNote> = {}) {
    if (!ready.current) throw new Error("笔记尚未读取完成，请重试。");
    const saved = await workApi.saveNote({ title: "未命名页面", content: "", parentId: "", updatedAt: "", ...values, id: "" });
    latest.current = [...latest.current, saved];
    if (mounted.current) setNotes(latest.current);
    return saved;
  }

  async function remove(note: WorkNote) {
    await writes.catch(() => undefined);
    await workApi.deleteNote(note.id);
    delete drafts.current[note.id];
    storeDraft(note.id);
    const remote = await workApi.notes();
    latest.current = remote.map(item => {
      const draft = drafts.current[item.id];
      if (!draft) return item;
      drafts.current[item.id] = { note: { ...draft.note, parentId: item.parentId, updatedAt: item.updatedAt }, base: item.updatedAt };
      storeDraft(item.id, drafts.current[item.id]);
      return drafts.current[item.id].note;
    });
    setNotes(latest.current);
  }

  async function restoreRecovered(note: WorkNote) {
    const saved = await create({ ...note, title: `${note.title || "笔记"}（恢复草稿）`, parentId: "", archived: false });
    for (const [key, draft] of Object.entries(readDrafts())) {
      if (key.startsWith("recovered:") && JSON.stringify(draft.note) === JSON.stringify(note)) storeDraft(key);
    }
    setRecovered(previous => previous.filter(item => item !== note));
    return saved;
  }

  async function saveConflictCopy(note: WorkNote) {
    const saved = await create({ ...note, title: `${note.title || "笔记"}（副本）`, archived: false });
    const draft = drafts.current[note.id];
    if (draft && JSON.stringify(draft.note) === JSON.stringify(note)) {
      delete drafts.current[note.id]; storeDraft(note.id);
      const remote = (await workApi.notes()).find(item => item.id === note.id);
      latest.current = latest.current.filter(item => item.id !== note.id);
      if (remote) latest.current.push(remote);
      setNotes([...latest.current]); setError("");
    }
    return saved;
  }

  return { notes, loading, error, saving, update, create, remove, flush, recovered, restoreRecovered, saveConflictCopy, dirty: Object.keys(drafts.current).length > 0 };
}
