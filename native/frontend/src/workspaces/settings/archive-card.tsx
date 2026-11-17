import { useId, useRef, useState } from "react";
import { Button } from "../../ui/button";
import { Select } from "../../ui/select";
import { SearchField } from "../../ui/text-field";
import { chatApi, type ChatSession } from "../chat/data";

export function ArchiveCard({ sessions, refresh }: { sessions: ChatSession[]; refresh: () => Promise<void> }) {
  const [query, setQuery] = useState(""), [group, setGroup] = useState("all"), [pending, setPending] = useState<ChatSession[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null), id = useId();
  const groups = [...new Set(sessions.map(item => item.group || "未分组"))];
  const filtered = sessions.filter(item => item.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()) && (group === "all" || (item.group || "未分组") === group));
  async function restore(item: ChatSession) {
    setBusy(true); setError("");
    try { await chatApi.update(item.id, { archived: false }); await refresh(); }
    catch (cause) { setError(String(cause)); } finally { setBusy(false); }
  }
  function confirm(items: ChatSession[]) { setPending(items); dialog.current?.showModal(); }
  async function remove() {
    setBusy(true); setError("");
    try {
      const current = (await chatApi.load()).sessions;
      for (const item of pending) {
        if (!current.some(row => row.id === item.id && row.archived)) throw Error("归档状态已改变，请刷新后重试");
        await chatApi.remove(item.id);
      }
      dialog.current?.close(); setPending([]);
    } catch (cause) { setError(String(cause)); }
    finally { try { await refresh(); } catch (cause) { setError(String(cause)); } setBusy(false); }
  }
  return <div className="settings-card">
    <search className="settings-archive-filter" aria-label="过滤归档会话"><SearchField aria-label="过滤归档标题" placeholder="过滤归档标题…" value={query} onChange={event => setQuery(event.target.value)} /><Select aria-label="归档分组" value={group} onChange={event => setGroup(event.target.value)}><option value="all">全部 ({sessions.length})</option>{groups.map(value => <option key={value}>{value}</option>)}</Select><Button size="small" disabled={!filtered.length || busy} className="settings-danger" onClick={() => confirm(filtered)}>清空{query || group !== "all" ? "筛选结果" : "归档"}</Button></search>
    {error && <p className="settings-error settings-inline-status" role="alert">{error}</p>}
    {!filtered.length && <p className="settings-inline-status">{sessions.length ? "没有匹配的归档会话" : "暂无归档会话"}</p>}
    {filtered.map(item => <div className="settings-row" key={item.id}><div><strong>{item.title}</strong><p>{item.group || "未分组"} · {new Date(item.updatedAt).toLocaleDateString()} · {item.messages.length} 条消息</p></div><div className="settings-row-control"><Button size="small" disabled={busy} onClick={() => void restore(item)}>恢复</Button><Button size="small" disabled={busy} className="settings-danger" onClick={() => confirm([item])}>删除</Button></div></div>)}
    <dialog ref={dialog} className="settings-confirm-dialog" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} onCancel={event => { if (busy) event.preventDefault(); }}>
      <h2 id={`${id}-title`}>删除 {pending.length} 条归档会话？</h2><p id={`${id}-description`}>将删除所选会话及其记录，此操作无法撤销。{pending.length === 1 && `「${pending[0].title}」`}</p><footer><Button size="small" autoFocus disabled={busy} onClick={() => dialog.current?.close()}>取消</Button><Button size="small" disabled={busy} onClick={() => void remove()}>{busy ? "正在删除…" : "删除归档"}</Button></footer>
    </dialog>
  </div>;
}
