import { useEffect, useRef, useState, type ReactNode } from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import { Archive, Check, ChevronDown, ChevronRight, Clipboard, FileText, Folder, FolderPlus, Link2, Pencil, Plus, Search, SquarePen, Star, Trash2, X, Zap, Ellipsis, Copy, ArrowUpRight } from "lucide-react";
import { Button } from "../../ui/button";
import { IconButton } from "../../ui/icon-button";
import { Input, SearchField, Textarea } from "../../ui/text-field";
import { Select } from "../../ui/select";
import { Sidebar, SidebarItem, SidebarToggle } from "../../ui/sidebar";
import * as Menu from "../../ui/menu";
import { workApi, type WorkNote } from "../../data/work";
import { chatApi } from "../chat/data";
import { MarkdownNote, NoteEditor, noteLinks, type NoteTarget } from "./note-editor";
import { useNotes } from "./use-notes";
import "./notes.css";

type View = "page" | "inbox" | "favorites" | "archive";
type Props = { sidebarOpen: boolean; onToggleSidebar: () => void };
const message = (cause: unknown) => cause instanceof Error ? cause.message : String(cause);
const date = (value: string) => value && !Number.isNaN(Date.parse(value)) ? new Date(value).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "尚未保存";

function routeNote() {
  try { return decodeURIComponent(location.hash.split("/").slice(1).join("/")); } catch { return ""; }
}

function Modal({ title, children, onClose, className = "" }: { title: string; children: ReactNode; onClose: () => void; className?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog className={`notes-dialog ${className}`} ref={dialog} aria-label={title}
    onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    {children}
  </dialog>;
}

export function NotesWorkspace({ sidebarOpen, onToggleSidebar }: Props) {
  const data = useNotes();
  const { notes } = data;
  const [selected, setSelected] = useState(routeNote);
  const [view, setView] = useState<View>(routeNote() ? "page" : "inbox");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [searchIndex, setSearchIndex] = useState(0);
  const [related, setRelated] = useState<NoteTarget[]>([]);
  const [relationError, setRelationError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const actionPending = useRef(false);
  const [inboxText, setInboxText] = useState(() => sessionStorage.getItem("chela.notes.inboxDraft") || "");
  const [rename, setRename] = useState<WorkNote | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleting, setDeleting] = useState<WorkNote | null>(null);
  const [taskText, setTaskText] = useState<string | null>(null);
  const [peek, setPeek] = useState<string | null>(null);
  const [raw, setRaw] = useState(false);
  const titleField = useRef<HTMLInputElement>(null);
  const tagField = useRef<HTMLInputElement>(null);
  const searchResults = useRef<HTMLDivElement>(null);
  const note = notes.find(item => item.id === selected);
  const inbox = notes.filter(item => item.inbox && !item.archived);
  const favorites = notes.filter(item => item.favorite && !item.archived);
  const archived = notes.filter(item => item.archived);
  const pages = notes.filter(item => !item.inbox && !item.archived);
  const targets: NoteTarget[] = [...notes.map(item => ({ id: item.id, title: item.title, kind: "note" as const, detail: item.folder ? "目录" : item.inbox ? "Inbox" : item.archived ? "已归档" : "笔记" })), ...related];
  const queryLower = query.trim().toLocaleLowerCase();
  const results = targets.filter(target => {
    const targetNote = target.kind === "note" ? notes.find(item => item.id === target.id) : undefined;
    if (queryLower.startsWith("#")) return targetNote?.tags?.some(tag => tag.toLocaleLowerCase().includes(queryLower.slice(1))) || false;
    return `${target.title} ${targetNote?.content || ""} ${targetNote?.tags?.join(" ") || ""}`.toLocaleLowerCase().includes(queryLower);
  }).slice(0, 30);
  const backlinks = note ? notes.filter(item => item.id !== note.id && noteLinks(item.content).some(link => link.id === note.id || link.id === note.title)) : [];
  const peekNote = notes.find(item => item.id === peek);
  const dirty = data.dirty;

  useEffect(() => {
    function hashChange() { const id = routeNote(); if (id) { setSelected(id); setView("page"); } }
    function shortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "p") { event.preventDefault(); setSearching(true); setQuery(""); setSearchIndex(0); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); void data.flush(); }
    }
    window.addEventListener("hashchange", hashChange);
    window.addEventListener("keydown", shortcut);
    return () => { window.removeEventListener("hashchange", hashChange); window.removeEventListener("keydown", shortcut); };
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.allSettled([chatApi.load(), workApi.tasks()]).then(([chats, tasks]) => {
      if (!active) return;
      const items: NoteTarget[] = [];
      if (chats.status === "fulfilled") items.push(...chats.value.sessions.map(item => ({ id: item.id, title: item.title, kind: "chat" as const, detail: "历史对话" })));
      if (tasks.status === "fulfilled") items.push(...tasks.value.map(item => ({ id: item.id, title: item.title, kind: "task" as const, detail: `看板 · ${item.status}` })));
      setRelated(items);
      if (chats.status === "rejected" || tasks.status === "rejected") setRelationError("部分对话或任务未读取成功，可重新进入笔记重试。");
    });
    return () => { active = false; };
  }, []);

  useEffect(() => { searchResults.current?.children[searchIndex]?.scrollIntoView({ block: "nearest" }); }, [searchIndex, query, searching]);

  function openNote(id: string) {
    setSelected(id); setView("page"); setRaw(false); setPeek(null);
    history.replaceState(null, "", `#notes/${encodeURIComponent(id)}`);
  }

  function openView(next: View) { setView(next); setPeek(null); history.replaceState(null, "", "#notes"); }

  async function run(action: () => void | Promise<void>) {
    if (actionPending.current) return;
    actionPending.current = true; setBusy(true); setError("");
    try { await action(); } catch (cause) { setError(message(cause)); }
    finally { actionPending.current = false; setBusy(false); }
  }

  async function create(folder = false, parentId = "", title?: string) {
    const created = await data.create({ folder, parentId, title: title || (folder ? "未命名目录" : "未命名页面") });
    setCollapsed(previous => { const next = new Set(previous); next.delete(parentId); return next; });
    openNote(created.id);
    window.setTimeout(() => { titleField.current?.focus(); titleField.current?.select(); }, 0);
  }

  function update(values: Partial<WorkNote>, target = note) { if (target) data.update({ ...target, ...values }); }

  function startRename(target: WorkNote) { setRename(target); setRenameValue(target.title); setError(""); }

  function items(target: WorkNote, context = false) {
    const { Item, Separator } = context ? ContextMenu : Menu;
    return <>
      <Item onSelect={() => update({ favorite: !target.favorite }, target)}><Star />{target.favorite ? "取消收藏" : "收藏"}</Item>
      <Item onSelect={() => startRename(target)}><Pencil />重命名</Item>
      <Item onSelect={() => void run(() => create(false, target.id))}><Plus />新建子页面</Item>
      <Item onSelect={() => update({ archived: !target.archived, inbox: false }, target)}><Archive />{target.archived ? "取消归档" : "归档"}</Item>
      <Separator /><Item className="notes-danger" onSelect={() => { setDeleting(target); setError(""); }}><Trash2 />删除</Item>
    </>;
  }

  function tree(parentId: string, ancestors = new Set<string>()): ReactNode {
    return pages.filter(item => item.parentId === parentId || (!parentId && !pages.some(parent => parent.id === item.parentId)))
      .filter(item => !ancestors.has(item.id)).map(item => {
        const children = pages.some(child => child.parentId === item.id);
        const nextAncestors = new Set(ancestors).add(item.id);
        return <div key={item.id} className="notes-tree-node">
          <ContextMenu.Root><ContextMenu.Trigger asChild><div className="notes-tree-row" data-current={view === "page" && selected === item.id}>
            {children || item.folder ? <IconButton aria-label={`${collapsed.has(item.id) ? "展开" : "收起"} ${item.title}`}
              aria-expanded={!collapsed.has(item.id)} onClick={() => setCollapsed(previous => { const next = new Set(previous); next.has(item.id) ? next.delete(item.id) : next.add(item.id); return next; })}>
              {collapsed.has(item.id) ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
            </IconButton> : <span className="notes-tree-spacer" />}
            <Button variant="ghost" aria-current={view === "page" && selected === item.id ? "page" : undefined} onClick={() => openNote(item.id)}>
              {item.folder || children ? <Folder size={14} /> : <FileText size={14} />}<span>{item.title || "未命名页面"}</span>
            </Button>
            <Menu.Root><Menu.Trigger asChild><IconButton className="notes-tree-more" aria-label={`${item.title} 的操作`}><Ellipsis size={14} /></IconButton></Menu.Trigger><Menu.Content className="notes-page-menu" align="end">{items(item)}</Menu.Content></Menu.Root>
          </div></ContextMenu.Trigger><ContextMenu.Portal><ContextMenu.Content className="ui-menu notes-page-menu" loop collisionPadding={8}>{items(item, true)}</ContextMenu.Content></ContextMenu.Portal></ContextMenu.Root>
          {!collapsed.has(item.id) && children && <div className="notes-tree-children">{tree(item.id, nextAncestors)}</div>}
        </div>;
      });
  }

  async function capture(text = inboxText) {
    if (!text.trim()) throw new Error("请先写下一条摘录。");
    await data.create({ inbox: true, title: text.trim().split("\n")[0].slice(0, 80), content: text });
    if (text === inboxText) { setInboxText(""); sessionStorage.removeItem("chela.notes.inboxDraft"); }
  }

  function openTarget(target: NoteTarget, side = false) {
    if (target.kind === "note") side ? setPeek(target.id) : openNote(target.id);
    else location.hash = `${target.kind === "chat" ? "chat" : "board"}/${encodeURIComponent(target.id)}`;
    setSearching(false);
  }

  function downloadMarkdown() {
    if (!note) return;
    const url = URL.createObjectURL(new Blob([`# ${note.title}\n\n${note.content}`], { type: "text/markdown;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${note.title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_") || "笔记"}.md`; anchor.click(); URL.revokeObjectURL(url);
  }

  const parentChoices = notes.filter(candidate => {
    if (candidate.id === note?.id || candidate.inbox || candidate.archived) return false;
    const seen = new Set<string>(); let parent: WorkNote | undefined = candidate;
    while (parent && !seen.has(parent.id)) { if (parent.id === note?.id) return false; seen.add(parent.id); parent = notes.find(item => item.id === parent?.parentId); }
    return true;
  });

  return <>
    <Sidebar id="notes-sidebar" title="笔记" open={sidebarOpen} actions={<>
      <IconButton aria-label="新建目录" disabled={busy || data.loading} onClick={() => void run(() => create(true))}><FolderPlus size={14} /></IconButton>
      <IconButton aria-label="新建笔记" disabled={busy || data.loading} onClick={() => void run(() => create())}><SquarePen size={14} /></IconButton>
    </>} toolbar={<Button variant="ghost" className="notes-search-trigger" onClick={() => { setSearching(true); setQuery(""); }}><Search size={14} /><span>搜索笔记或 #标签…</span><kbd>Ctrl+P</kbd></Button>}>
      <div className="notes-nav-label">快捷入口</div>
      <SidebarItem aria-current={view === "inbox" ? "page" : undefined} meta={inbox.length} onClick={() => openView("inbox")}><Zap size={14} />随手摘录（Inbox）</SidebarItem>
      <SidebarItem aria-current={view === "favorites" ? "page" : undefined} meta={favorites.length} onClick={() => openView("favorites")}><Star size={14} />已收藏</SidebarItem>
      <div className="notes-nav-label">工作空间 · 页面树</div>
      {data.loading ? <p className="notes-muted">正在读取笔记…</p> : tree("")}
      {!data.loading && pages.length === 0 && <p className="notes-muted">还没有页面，点击右上角新建。</p>}
      {archived.length > 0 && <SidebarItem aria-current={view === "archive" ? "page" : undefined} meta={archived.length} onClick={() => openView("archive")}><Archive size={14} />已归档</SidebarItem>}
    </Sidebar>
    <main className="notes-main">
      <header className="notes-toolbar"><SidebarToggle controls="notes-sidebar" open={sidebarOpen} onToggle={onToggleSidebar} />
        <span>{view === "inbox" ? `${inbox.length} 条待归档` : view === "page" && note ? `Markdown · ${Array.from(note.content).length} 字` : view === "favorites" ? "已收藏" : view === "archive" ? "已归档" : "笔记"}</span>
        <span className="notes-save-status" role="status" data-error={Boolean(data.error)}><Check size={13} />{data.error ? "保存失败 · 草稿已保留" : data.saving ? "保存中…" : dirty ? "待保存 · 草稿已保留" : view === "inbox" ? "本地实时收集" : "已自动保存 · 本地 Markdown"}</span>
        {view === "inbox" && <Button className="notes-compact" disabled={busy || !inbox.length} onClick={() => void run(async () => { for (const item of inbox) data.update({ ...item, inbox: false }); await data.flush(); })}><Check size={12} />全部归档</Button>}
        {view === "page" && note && <>
          <Menu.Root><Menu.Trigger asChild><Button className="notes-compact"><Link2 size={12} />引用 {backlinks.length}</Button></Menu.Trigger><Menu.Content className="notes-reference-menu" align="end">
            {backlinks.length ? backlinks.map(item => <Menu.Item key={item.id} onSelect={() => openNote(item.id)}><FileText />{item.title}</Menu.Item>) : <Menu.Item disabled>尚无页面引用此页</Menu.Item>}
          </Menu.Content></Menu.Root>
          <Menu.Root><Menu.Trigger asChild><IconButton aria-label="更多笔记操作"><Ellipsis size={14} /></IconButton></Menu.Trigger><Menu.Content className="notes-page-menu" align="end">
            {items(note)}<Menu.Separator />
            <Menu.Item onSelect={() => setRaw(value => !value)}><Pencil />{raw ? "块编辑" : "编辑 Markdown"}</Menu.Item>
            <Menu.Item onSelect={downloadMarkdown}><FileText />导出 Markdown</Menu.Item>
            <Menu.Item onSelect={() => void run(async () => { const copy = data.error ? await data.saveConflictCopy(note) : await data.create({ ...note, title: `${note.title || "笔记"}（副本）`, archived: false }); openNote(copy.id); })}><Copy />另存副本</Menu.Item>
          </Menu.Content></Menu.Root>
        </>}
      </header>
      {(error || data.error) && <div className="notes-error" role="alert"><span>{error || data.error}</span>{data.error && <Button variant="ghost" onClick={() => void data.flush()}>重试保存</Button>}<IconButton aria-label="关闭操作提示" onClick={() => setError("")}><X size={14} /></IconButton></div>}
      {data.recovered.map((draft, index) => <div className="notes-recovery" key={draft.id + ":" + index} role="status"><span>“{draft.title}”有一份与当前页面不同的本地草稿，原页面已保留。</span><Button disabled={busy} onClick={() => void run(async () => { const restored = await data.restoreRecovered(draft); openNote(restored.id); })}>恢复为新页面</Button></div>)}
      <div className="notes-body">
        <div className="notes-scroll"><article className="notes-document">
          {data.loading ? <p className="notes-muted">正在读取笔记…</p> : view === "inbox" ? <>
            <h1>随手摘录（Inbox）</h1><p className="notes-description">随时收集剪贴板片段、灵感草稿或对话回复，可一键转为正式笔记页面或待办块。</p>
            <form className="notes-capture" onSubmit={event => { event.preventDefault(); void run(() => capture()); }}>
              <Textarea aria-label="随手摘录" value={inboxText} rows={1} placeholder="写下一条灵感…" onChange={event => { setInboxText(event.target.value); sessionStorage.setItem("chela.notes.inboxDraft", event.target.value); }} />
              <div><Button variant="ghost" disabled={busy} onClick={() => void run(async () => capture(await navigator.clipboard.readText()))}><Clipboard size={12} />收集剪贴板</Button><Button variant="primary" type="submit" disabled={busy || !inboxText.trim()}>保存摘录</Button></div>
            </form>
            <div className="notes-inbox-list">{inbox.map(item => <section className="notes-inbox-card" key={item.id}>
              <MarkdownNote content={item.content} notes={notes} onOpen={openNote} /><footer><small>手动记录 · {date(item.updatedAt)}</small>
                <Button variant="ghost" className="notes-compact" onClick={() => { update({ inbox: false }, item); openNote(item.id); }}>转为笔记页面 ↗</Button>
                <Menu.Root><Menu.Trigger asChild><IconButton aria-label="摘录操作"><Ellipsis size={14} /></IconButton></Menu.Trigger><Menu.Content className="notes-page-menu" align="end">
                  <Menu.Item onSelect={() => setTaskText(item.content)}><Plus />转入任务看板</Menu.Item>{items(item)}
                </Menu.Content></Menu.Root>
              </footer>
            </section>)}</div>{!inbox.length && <div className="notes-empty"><Zap size={24} /><h2>把灵感先记在这里</h2><p>写下一条摘录，或收集剪贴板中的文字。</p></div>}
          </> : view === "favorites" || view === "archive" ? <>
            <h1>{view === "favorites" ? "已收藏" : "已归档"}</h1>
            {(view === "favorites" ? favorites : archived).map(item => <div className="notes-collection-row" key={item.id}>
              <Button variant="ghost" onClick={() => openNote(item.id)}><FileText size={15} /><span>{item.title}</span><small>{date(item.updatedAt)}</small></Button>
              <Menu.Root><Menu.Trigger asChild><IconButton aria-label={`${item.title} 的操作`}><Ellipsis size={14} /></IconButton></Menu.Trigger><Menu.Content className="notes-page-menu">{items(item)}</Menu.Content></Menu.Root>
            </div>)}{!(view === "favorites" ? favorites : archived).length && <p className="notes-muted">这里还没有页面。</p>}
          </> : note ? <>
            <div className="notes-page-additions">
              <Menu.Root><Menu.Trigger asChild><Button variant="ghost">+ 添加图标</Button></Menu.Trigger><Menu.Content><Menu.Item onSelect={() => update({ title: "📝 " + note.title })}>📝 笔记</Menu.Item><Menu.Item onSelect={() => update({ title: "💡 " + note.title })}>💡 灵感</Menu.Item><Menu.Item onSelect={() => update({ title: "📌 " + note.title })}>📌 重点</Menu.Item></Menu.Content></Menu.Root>
              <Button variant="ghost" onClick={() => tagField.current?.focus()}>+ 添加属性</Button>
              <Menu.Root><Menu.Trigger asChild><Button variant="ghost">插入模板</Button></Menu.Trigger><Menu.Content>
                {[{ title: "会议纪要", content: "## 会议主题\n\n## 讨论记录\n\n## 行动项\n- [ ] " }, { title: "周报", content: "## 本周进展\n\n## 遇到的问题\n\n## 下周计划\n- [ ] " }, { title: "复盘", content: "## 目标与结果\n\n## 做得好的\n\n## 需要改进的\n\n## 下一步\n- [ ] " }].map(template => <Menu.Item key={template.title} onSelect={() => update({ content: (note.content ? note.content + "\n\n" : "") + template.content })}>{template.title}</Menu.Item>)}
              </Menu.Content></Menu.Root>
            </div>
            <Input className="notes-title" ref={titleField} aria-label="页面标题" value={note.title} onChange={event => update({ title: event.target.value })} placeholder="未命名页面" />
            <div className="notes-properties">
              <label><span>标签</span><Input key={note.id + ":tags"} ref={tagField} aria-label="标签，使用逗号分隔" defaultValue={note.tags?.join("，") || ""} placeholder="添加标签…" onBlur={event => update({ tags: [...new Set(event.target.value.split(/[,，]/).map(tag => tag.trim()).filter(Boolean))] })} /></label>
              <label><span>所属页面</span><Select aria-label="所属页面" value={note.parentId} onChange={event => update({ parentId: event.target.value })}><option value="">工作空间</option>{parentChoices.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</Select></label>
              <div><span>最后编辑</span><small>{date(note.updatedAt)}{note.archived ? " · 已归档" : ""}</small></div>
              {backlinks.length > 0 && <div><span>反向链接（{backlinks.length}）</span><div className="notes-reference-chips">{backlinks.map(item => <button type="button" key={item.id} className="notes-wikilink" onClick={() => openNote(item.id)}>← {item.title}</button>)}</div></div>}
            </div>
            {backlinks.length > 0 && <details className="notes-backlinks" open><summary><Link2 size={13} />引用了此页面的位置（Backlinks · {backlinks.length}）</summary>
              {backlinks.map(item => <button type="button" key={item.id} onClick={() => openNote(item.id)}><span>{item.title}</span><small>{item.content.split("\n").find(line => noteLinks(line).some(link => link.id === note.id || link.id === note.title))}</small></button>)}
            </details>}
            {note.folder && <div className="notes-folder-pages">{notes.filter(item => item.parentId === note.id).map(item => <Button key={item.id} variant="ghost" onClick={() => openNote(item.id)}><FileText size={14} />{item.title}</Button>)}<Button variant="ghost" disabled={busy} onClick={() => void run(() => create(false, note.id))}><Plus size={14} />新建子页面</Button></div>}
            {raw ? <Textarea className="notes-raw-editor" aria-label="Markdown 正文" value={note.content} onChange={event => update({ content: event.target.value })} rows={16} />
              : <NoteEditor key={note.id} content={note.content} onChange={content => update({ content })} notes={notes} targets={targets} onOpen={openNote} onCreateTask={setTaskText} onError={setError} />}
          </> : <div className="notes-empty"><FileText size={24} /><h1>{selected ? "找不到这个页面" : "开始记录"}</h1><p>{selected ? "页面可能已被删除。可以从左侧选择其他笔记。" : "创建一页笔记，把想法整理下来。"}</p><Button onClick={() => void run(() => create())} disabled={busy || data.loading}>新建笔记</Button></div>}
        </article></div>
        {peekNote && <aside className="notes-peek"><header><FileText size={14} /><span>页面预览</span><IconButton aria-label="关闭页面预览" onClick={() => setPeek(null)}><X size={14} /></IconButton></header><h2>{peekNote.title}</h2><MarkdownNote content={peekNote.content} notes={notes} onOpen={openNote} /><Button onClick={() => openNote(peekNote.id)}>打开页面 <ArrowUpRight size={14} /></Button></aside>}
      </div>
    </main>
    {searching && <Modal title="快速搜索" className="notes-search-dialog" onClose={() => setSearching(false)}><div className="notes-quick-search">
      <SearchField autoFocus aria-label="搜索笔记、正文、标签、对话或任务" value={query} placeholder="搜索笔记、正文、#标签…" onChange={event => { setQuery(event.target.value); setSearchIndex(0); }}
        onKeyDown={event => {
          if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
          if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setSearching(false); return; }
          if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setSearchIndex(value => results.length ? (value + (event.key === "ArrowDown" ? 1 : -1) + results.length) % results.length : 0); }
          if (event.key === "Enter" && results[searchIndex]) { event.preventDefault(); openTarget(results[searchIndex], event.ctrlKey || event.metaKey); }
        }} /><Button variant="ghost" className="notes-escape" onClick={() => setSearching(false)}>Esc 关闭</Button></div>
      <small className="notes-search-heading">匹配结果 · 笔记 / 正文 / 标签 / 对话 / 任务</small>
      <div className="notes-search-results" ref={searchResults}>{results.map((target, index) => <button type="button" key={target.kind + target.id} data-selected={searchIndex === index} onClick={event => openTarget(target, event.ctrlKey || event.metaKey)}>
        <FileText size={15} /><span>{target.title}<small>{target.detail}</small></span>{target.kind === "note" && <small>{date(notes.find(item => item.id === target.id)?.updatedAt || "")}</small>}
      </button>)}{!results.length && <p>没有匹配结果</p>}</div>
      {relationError && <p className="notes-muted">{relationError}</p>}<footer>↑↓ 选择 · Enter 打开 · Ctrl+Enter 在右侧预览笔记</footer>
    </Modal>}
    {rename && <Modal title="重命名页面" onClose={() => setRename(null)}><form onSubmit={event => { event.preventDefault(); if (!renameValue.trim()) { setError("请输入页面名称。"); return; } update({ title: renameValue.trim() }, rename); setRename(null); }}>
      <h2>重命名页面</h2><Input aria-label="页面名称" value={renameValue} onChange={event => setRenameValue(event.target.value)} autoFocus required
        onKeyDown={event => { if (event.key === "Enter" && (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229)) event.preventDefault(); }} />
      <footer><Button onClick={() => setRename(null)}>取消</Button><Button type="submit" variant="primary">保存</Button></footer>
    </form></Modal>}
    {deleting && <Modal title="删除页面" onClose={() => { if (!busy) setDeleting(null); }}><h2>删除“{deleting.title}”？</h2><p>此页面会被删除，子页面将保留并移到工作空间顶层。</p>
      {error && <p className="notes-danger" role="alert">{error}</p>}<footer><Button disabled={busy} onClick={() => setDeleting(null)}>取消</Button><Button variant="primary" disabled={busy} onClick={() => void run(async () => { await data.remove(deleting); if (selected === deleting.id) openView("inbox"); setDeleting(null); })}>{busy ? "删除中…" : "删除页面"}</Button></footer>
    </Modal>}
    {taskText !== null && <Modal title="转入任务看板" onClose={() => setTaskText(null)}><form onSubmit={event => { event.preventDefault(); void run(async () => {
      if (!taskText.trim()) throw new Error("请输入任务名称。");
      const task = await workApi.saveTask({ id: "", title: taskText.trim().split("\n")[0].slice(0, 200), description: taskText, status: "待办", priority: "不重要不紧急", project: "", date: "", endDate: "", parentId: "" });
      setTaskText(null); location.hash = `board/${encodeURIComponent(task.id)}`;
    }); }}><h2>转入任务看板</h2><Textarea aria-label="任务内容" autoFocus value={taskText} onChange={event => setTaskText(event.target.value)} rows={4} required />{error && <p className="notes-danger" role="alert">{error}</p>}<footer><Button onClick={() => setTaskText(null)}>取消</Button><Button type="submit" variant="primary" disabled={busy}>创建任务</Button></footer></form></Modal>}
  </>;
}
