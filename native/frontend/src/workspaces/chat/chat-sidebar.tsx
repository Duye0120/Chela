import { useState, type Dispatch, type SetStateAction } from "react";
import { Archive, ArchiveRestore, ChevronDown, Ellipsis, FolderClosed, FolderOpen, FolderPlus, MessageSquarePlus, Pin, Search, SquarePen, Trash2, X } from "lucide-react";
import { Button } from "../../ui/button";
import { IconButton } from "../../ui/icon-button";
import * as Menu from "../../ui/menu";
import { Sidebar, SidebarGroup, SidebarItem, SidebarToggle } from "../../ui/sidebar";
import { SessionRow } from "../../ui/session-row";
import { SearchField } from "../../ui/text-field";
import type { ChatSession, ChatSnapshot } from "../../data/chat";

type Props = {
  sidebarOpen: boolean; onToggleSidebar: () => void; sessions: ChatSession[]; approvals: ChatSnapshot["approvals"];
  selectedId: string | null; session?: ChatSession; busy: boolean; loading: boolean;
  query: string; setQuery: Dispatch<SetStateAction<string>>; archived: boolean; setArchived: Dispatch<SetStateAction<boolean>>;
  onCreate: (group?: ChatSession) => void; onSelect: (item: ChatSession) => void;
  onRename: (item: ChatSession, title: string) => Promise<void>; onPin: (item: ChatSession, pinned: boolean) => void;
  onArchive: (item: ChatSession) => void; onRestore: (item: ChatSession) => void; onDelete: (item: ChatSession) => void;
  onAddFolder: () => void; onOpenProject: (item: ChatSession) => void;
  onSaveGroup: (target: string | null, name: string) => Promise<boolean>; onRemoveGroup: (key: string) => void;
};

function updatedLabel(value: string) {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "";
  const minutes = Math.max(0, Math.floor((Date.now() - time) / 60_000));
  return minutes < 1 ? "刚刚" : minutes < 60 ? `${minutes}m` : minutes < 1440 ? `${Math.floor(minutes / 60)}h` : `${Math.floor(minutes / 1440)}d`;
}

export function folderKey(item: ChatSession) { return item.group ? item.project || `group:${item.group}` : ""; }

export function ChatSidebar({sidebarOpen,onToggleSidebar,sessions,approvals,selectedId,session,busy,loading,query,setQuery,archived,setArchived,onCreate,onSelect,onRename,onPin,onArchive,onRestore,onDelete,onAddFolder,onOpenProject,onSaveGroup,onRemoveGroup}: Props) {
  const [groupName,setGroupName]=useState<string|null>(null),[groupTarget,setGroupTarget]=useState<string|null>(null);
  async function saveGroup() {
    if (groupName === null || !groupName.trim()) return;
    if (await onSaveGroup(groupTarget, groupName.trim())) { setGroupName(null); setGroupTarget(null); }
  }
  const filter = query.trim().toLocaleLowerCase();
  const visible = sessions.filter(item => item.archived === archived
    && (!filter || (item.title + " " + item.messages.map(message => message.content).join(" ")).toLocaleLowerCase().includes(filter)))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt));

  function row(item: ChatSession) {
    return <SessionRow key={item.id} title={item.title} query={query} pinned={item.pinned} current={item.id === selectedId}
      meta={<>{item.pinned && <Pin size={11} aria-label="已置顶" />}{approvals?.some(approval=>approval.sessionId===item.id)?<span className="chat-needs-approval">需批准</span>:updatedLabel(item.updatedAt)}</>}
      onSelect={() => onSelect(item)} onRename={title => onRename(item, title)}
      onPinnedChange={pinned => onPin(item, pinned)}
      onArchive={() => onArchive(item)} onDelete={() => onDelete(item)} />;
  }

  return <Sidebar resizable hotEdge id="chat-sidebar" title="对话" open={sidebarOpen} actions={<>
      <span className="chat-sidebar-close"><SidebarToggle controls="chat-sidebar" open={sidebarOpen} onToggle={onToggleSidebar} /></span>
      <IconButton aria-label="添加文件夹" tooltip="添加文件夹" disabled={busy||loading||!window.chelaDesktop} onClick={onAddFolder}><FolderPlus size={14} /></IconButton>
      <IconButton aria-label="新建对话" tooltip="新建对话" onClick={()=>onCreate(session)} disabled={loading || busy}><SquarePen size={14} /></IconButton>
    </>} toolbar={<>
      {groupName!==null && <form className="chat-group-form" onSubmit={e=>{e.preventDefault();void saveGroup()}}>
        <input className="ui-field" autoFocus aria-label="文件夹名称" placeholder="输入文件夹名称" maxLength={100} required value={groupName} onChange={e=>setGroupName(e.target.value)}/>
        <Button type="submit" disabled={busy}>保存</Button><IconButton aria-label="取消分组" onClick={()=>{setGroupName(null);setGroupTarget(null)}}><X size={14}/></IconButton></form>}
      <div className="chat-search"><SearchField aria-label="搜索对话" placeholder="搜索对话…" value={query} onChange={event => setQuery(event.target.value)} />
        {query && <IconButton aria-label="清空搜索条件" onClick={() => setQuery("")}><X size={14} /></IconButton>}
      </div>
      <Button className="chat-list-heading" variant="ghost" aria-pressed={archived} disabled={busy}
        onClick={() => { setArchived(value => !value); setQuery(""); }}>
        {archived ? "已归档" : "文件夹"}<Archive size={13} /><ChevronDown size={12} />
      </Button>
    </>}>
      <fieldset className="chat-session-list" disabled={busy || loading} inert={busy || loading}>
        {loading ? <p className="chat-list-empty" role="status">正在加载对话…</p> : !visible.length ? <div className="chat-list-empty" role="status">
          {filter ? <><Search size={18} /><p>未找到包含“{query}”的对话</p><Button variant="ghost" onClick={() => setQuery("")}>清空搜索条件</Button></>
            : <><p>{archived ? "暂无归档对话" : "未分组"}</p>{!archived && <Button variant="ghost" onClick={()=>onCreate(session)}>新建对话</Button>}</>}
        </div> : archived ? visible.map(item => <div className="chat-archive-row" key={item.id}>
          <SidebarItem aria-current={item.id === selectedId ? "page" : undefined} onClick={() => onSelect(item)}>{item.title}</SidebarItem>
          <IconButton aria-label={`恢复 ${item.title}`} title="恢复对话" onClick={() => onRestore(item)}><ArchiveRestore size={14} /></IconButton>
          <IconButton aria-label={`删除 ${item.title}`} title="删除对话" onClick={() => onDelete(item)}><Trash2 size={14} /></IconButton>
        </div>) : <>
          {[...new Set(visible.map(folderKey))].map((key,index)=>{
            const items=visible.filter(item=>folderKey(item)===key),group=items[0];
            return <div className="chat-folder" key={key} id={`chat-folder-${index}`} title={group.project||undefined}>
              <SidebarGroup label={group.group||"未分组"} icon={key?<><FolderOpen className="chat-folder-open"/><FolderClosed className="chat-folder-closed"/></>:undefined} defaultOpen>{items.map(row)}</SidebarGroup>
              {key&&<div className="chat-folder-actions"><Menu.Root><Menu.Trigger asChild><IconButton aria-label={`${group.group}文件夹操作`}><Ellipsis size={14}/></IconButton></Menu.Trigger><Menu.Content className="chat-folder-menu" aria-label={`${group.group}文件夹操作`}>
                <Menu.Item onSelect={()=>onCreate(group)}><MessageSquarePlus/>新增聊天</Menu.Item>
                <Menu.Item onSelect={()=>document.getElementById(`chat-folder-${index}`)?.querySelector("details")?.removeAttribute("open")}><FolderClosed/>折叠该组会话</Menu.Item>
                <Menu.Item disabled={!window.chelaDesktop||!group.project} onSelect={()=>onOpenProject(group)}><FolderOpen/>在文件管理器打开</Menu.Item>
                <Menu.Item onSelect={()=>{setGroupTarget(key);setGroupName(group.group||"")}}><SquarePen/>重命名文件夹</Menu.Item><Menu.Separator/>
                <Menu.Item className="ui-session-delete" onSelect={()=>onRemoveGroup(key)}><Trash2/>从列表移除</Menu.Item>
              </Menu.Content></Menu.Root><IconButton aria-label={`在 ${group.group} 新增聊天`} tooltip={`在 ${group.group} 新增聊天`} onClick={()=>onCreate(group)}><MessageSquarePlus size={14}/></IconButton></div>}
            </div>;
          })}
        </>}
      </fieldset>
    </Sidebar>;
}
