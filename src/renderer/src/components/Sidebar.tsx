import { useEffect, useRef, useState } from "react";
import {
  ArchiveBoxIcon,
  ArrowUturnLeftIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  Cog6ToothIcon,
  EllipsisHorizontalIcon,
  FolderIcon,
  FolderPlusIcon,
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import type { ChatSessionSummary, SessionGroup } from "@shared/contracts";
import { formatRelativeTime } from "@renderer/lib/session";

type SidebarProps = {
  summaries: ChatSessionSummary[];
  activeSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onNewSession: () => void;
  onOpenSettings: () => void;
  onArchiveSession: (sessionId: string) => void;
  onUnarchiveSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  archivedSummaries: ChatSessionSummary[];
  groups: SessionGroup[];
  onCreateGroup: (name: string) => void;
  onRenameGroup: (groupId: string, name: string) => void;
  onDeleteGroup: (groupId: string) => void;
  onSetSessionGroup: (sessionId: string, groupId: string | null) => void;
};

export function Sidebar({
  summaries,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onOpenSettings,
  onArchiveSession,
  onUnarchiveSession,
  onDeleteSession,
  archivedSummaries,
  groups,
  onCreateGroup,
  onRenameGroup,
  onDeleteGroup,
  onSetSessionGroup,
}: SidebarProps) {
  const [showArchived, setShowArchived] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [movingSessionId, setMovingSessionId] = useState<string | null>(null);
  const [groupMenuOpenFor, setGroupMenuOpenFor] = useState<string | null>(null);
  // Drag & drop state
  const [dragOverGroupId, setDragOverGroupId] = useState<string | null>(null);
  const [dragOverUngrouped, setDragOverUngrouped] = useState(false);
  const dragSessionIdRef = useRef<string | null>(null);

  const newGroupInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (creatingGroup) newGroupInputRef.current?.focus();
  }, [creatingGroup]);

  useEffect(() => {
    if (renamingGroupId) renameInputRef.current?.focus();
  }, [renamingGroupId]);

  useEffect(() => {
    if (!groupMenuOpenFor && !movingSessionId) return;
    const handler = () => {
      setGroupMenuOpenFor(null);
      setMovingSessionId(null);
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [groupMenuOpenFor, movingSessionId]);

  const toggleGroupCollapse = (groupId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const submitCreateGroup = () => {
    const name = newGroupName.trim();
    if (name) onCreateGroup(name);
    setCreatingGroup(false);
    setNewGroupName("");
  };

  const submitRenameGroup = () => {
    if (renamingGroupId && renameValue.trim()) {
      onRenameGroup(renamingGroupId, renameValue.trim());
    }
    setRenamingGroupId(null);
    setRenameValue("");
  };

  const ungroupedSessions = summaries.filter((s) => !s.groupId);
  const groupedSessions = groups.map((group) => ({
    group,
    sessions: summaries.filter((s) => s.groupId === group.id),
  }));

  const renderThreadItem = (summary: ChatSessionSummary, indented = false) => {
    const active = summary.id === activeSessionId;
    const isMoving = movingSessionId === summary.id;

    return (
      <div key={summary.id} className="relative">
        <div
          draggable
          onDragStart={(e) => {
            dragSessionIdRef.current = summary.id;
            e.dataTransfer.effectAllowed = "move";
            // Suppress the popup if open
            setMovingSessionId(null);
          }}
          onDragEnd={() => {
            dragSessionIdRef.current = null;
            setDragOverGroupId(null);
            setDragOverUngrouped(false);
          }}
          onClick={(e) => {
            e.stopPropagation();
            onSelectSession(summary.id);
            setMovingSessionId(null);
            setGroupMenuOpenFor(null);
          }}
          className={`group flex cursor-pointer items-center rounded-md py-1.5 transition ${indented ? "pl-5 pr-2" : "px-2.5"
            } ${active ? "bg-white shadow-sm" : "hover:bg-black/[0.04]"}`}
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className={`truncate text-[12px] ${active ? "text-gray-800" : "text-gray-600"}`}>
                {summary.title}
              </span>
              <span className="shrink-0 text-[10px] text-gray-400">
                {formatRelativeTime(summary.updatedAt)}
              </span>
            </div>
          </div>
          <div className="ml-1 flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
            {groups.length > 0 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setMovingSessionId(isMoving ? null : summary.id);
                  setGroupMenuOpenFor(null);
                }}
                className="cursor-pointer rounded p-0.5 text-gray-400 hover:bg-black/5 hover:text-gray-600"
                title="移动到分组"
              >
                <FolderIcon className="h-3 w-3" />
              </button>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onArchiveSession(summary.id);
              }}
              className="cursor-pointer rounded p-0.5 text-gray-400 hover:bg-black/5 hover:text-gray-600"
              title="归档"
            >
              <ArchiveBoxIcon className="h-3 w-3" />
            </button>
          </div>
        </div>

        {/* Inline group picker */}
        {isMoving && (
          <div
            onClick={(e) => e.stopPropagation()}
            className={`mx-2 mb-1 rounded-md border border-black/8 bg-white py-1 shadow-sm ${indented ? "ml-5" : ""}`}
          >
            {summary.groupId && (
              <button
                type="button"
                onClick={() => {
                  onSetSessionGroup(summary.id, null);
                  setMovingSessionId(null);
                }}
                className="flex w-full cursor-pointer items-center gap-2 px-2.5 py-1 text-[11px] text-gray-500 hover:bg-black/[0.04] hover:text-gray-700"
              >
                移出分组
              </button>
            )}
            {groups.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => {
                  onSetSessionGroup(summary.id, g.id);
                  setMovingSessionId(null);
                }}
                className={`flex w-full cursor-pointer items-center gap-2 px-2.5 py-1 text-[11px] hover:bg-black/[0.04] ${summary.groupId === g.id ? "text-gray-800" : "text-gray-500 hover:text-gray-700"
                  }`}
              >
                <FolderIcon className="h-3 w-3 shrink-0 text-gray-400" />
                <span className="truncate">{g.name}</span>
                {summary.groupId === g.id && <span className="ml-auto text-[10px] text-gray-400">✓</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <aside className="flex h-full flex-col bg-transparent text-[13px]">
      {/* Top: New thread */}
      <div className="px-2 pb-1 pt-2">
        <button
          type="button"
          onClick={onNewSession}
          className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-gray-700 transition hover:bg-black/[0.05]"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          <span>新线程</span>
        </button>
      </div>

      {/* Threads header */}
      <div className="flex items-center px-3 pb-1 pt-2">
        {showArchived ? (
          <button
            type="button"
            onClick={() => setShowArchived(false)}
            className="flex cursor-pointer items-center gap-1.5 text-[11px] text-gray-500 transition hover:text-gray-700"
          >
            <ArrowUturnLeftIcon className="h-3 w-3" />
            <span>返回</span>
          </button>
        ) : (
          <>
            <span className="flex-1 text-[11px] font-medium text-gray-500">线程</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setCreatingGroup(true);
                setGroupMenuOpenFor(null);
                setMovingSessionId(null);
              }}
              className="cursor-pointer rounded p-0.5 text-gray-400 transition hover:bg-black/5 hover:text-gray-600"
              title="新建分组"
            >
              <FolderPlusIcon className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>

      {/* Thread list */}
      <div className="flex-1 overflow-y-auto pb-2">
        {showArchived ? (
          <div className="space-y-px px-2">
            {archivedSummaries.length === 0 ? (
              <p className="px-2 py-4 text-center text-[11px] text-gray-400">没有已归档的线程</p>
            ) : (
              archivedSummaries.map((summary) => (
                <div
                  key={summary.id}
                  className="group flex cursor-pointer items-center justify-between rounded-md px-2.5 py-1.5 transition hover:bg-black/[0.04]"
                >
                  <button
                    type="button"
                    onClick={() => {
                      onSelectSession(summary.id);
                      setShowArchived(false);
                    }}
                    className="min-w-0 flex-1 cursor-pointer text-left"
                  >
                    <span className="block truncate text-[12px] text-gray-600">{summary.title}</span>
                  </button>
                  <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => onUnarchiveSession(summary.id)}
                      className="cursor-pointer rounded p-0.5 text-gray-500 hover:bg-black/5 hover:text-gray-700"
                      title="恢复"
                    >
                      <ArrowUturnLeftIcon className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteSession(summary.id)}
                      className="cursor-pointer rounded p-0.5 text-gray-500 hover:bg-red-50 hover:text-red-500"
                      title="永久删除"
                    >
                      <TrashIcon className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="px-2">
            {/* Create group input */}
            {creatingGroup && (
              <div className="flex items-center rounded-md px-1.5 py-1">
                <span className="shrink-0 text-transparent">
                  <ChevronRightIcon className="h-3 w-3" />
                </span>
                <FolderIcon className="h-3.5 w-3.5 shrink-0 text-gray-400 ml-1.5" />
                <input
                  ref={newGroupInputRef}
                  type="text"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitCreateGroup();
                    else if (e.key === "Escape") {
                      setCreatingGroup(false);
                      setNewGroupName("");
                    }
                  }}
                  onBlur={submitCreateGroup}
                  placeholder="分组名称..."
                  className="min-w-0 flex-1 bg-transparent border-none p-0 text-[12px] text-gray-700 outline-none ml-1.5 placeholder:text-gray-400/70"
                />
              </div>
            )}

            {/* Groups — each is a drop target */}
            {groupedSessions.map(({ group, sessions }) => {
              const collapsed = collapsedGroups.has(group.id);
              const isGroupMenuOpen = groupMenuOpenFor === group.id;
              const isRenaming = renamingGroupId === group.id;
              const isDragOver = dragOverGroupId === group.id;

              return (
                <div
                  key={group.id}
                  className={`mb-1 rounded-md transition-colors ${isDragOver ? "bg-black/[0.04] ring-1 ring-inset ring-black/10" : ""}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    setDragOverGroupId(group.id);
                    setDragOverUngrouped(false);
                  }}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                      setDragOverGroupId(null);
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const sid = dragSessionIdRef.current;
                    if (sid) onSetSessionGroup(sid, group.id);
                    setDragOverGroupId(null);
                    dragSessionIdRef.current = null;
                  }}
                >
                  {/* Group header */}
                  <div className="group flex items-center rounded-md px-1.5 py-1 transition hover:bg-black/[0.04]">
                    <button
                      type="button"
                      onClick={() => toggleGroupCollapse(group.id)}
                      className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5"
                    >
                      <span className="shrink-0 text-gray-400">
                        {collapsed
                          ? <ChevronRightIcon className="h-3 w-3" />
                          : <ChevronDownIcon className="h-3 w-3" />}
                      </span>
                      <FolderIcon className={`h-3.5 w-3.5 shrink-0 transition-colors ${isDragOver ? "text-gray-600" : "text-gray-400"}`} />
                      {isRenaming ? (
                        <input
                          ref={renameInputRef}
                          type="text"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") submitRenameGroup();
                            else if (e.key === "Escape") setRenamingGroupId(null);
                          }}
                          onBlur={submitRenameGroup}
                          className="min-w-0 flex-1 bg-transparent border-none p-0 text-[12px] font-medium text-gray-700 outline-none"
                        />
                      ) : (
                        <span className="truncate text-[12px] font-medium text-gray-600">{group.name}</span>
                      )}
                    </button>

                    {/* Group "..." menu */}
                    <div className="relative ml-1 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setGroupMenuOpenFor(isGroupMenuOpen ? null : group.id);
                          setMovingSessionId(null);
                        }}
                        className="cursor-pointer rounded p-0.5 text-gray-300 opacity-0 transition hover:bg-black/5 hover:text-gray-600 group-hover:opacity-100"
                        title="分组操作"
                      >
                        <EllipsisHorizontalIcon className="h-3.5 w-3.5" />
                      </button>
                      {isGroupMenuOpen && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="absolute right-0 top-full z-20 mt-0.5 min-w-[88px] rounded-md border border-black/8 bg-white py-1 shadow-md"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setRenamingGroupId(group.id);
                              setRenameValue(group.name);
                              setGroupMenuOpenFor(null);
                            }}
                            className="flex w-full cursor-pointer items-center px-3 py-1.5 text-[11px] text-gray-600 hover:bg-black/[0.04]"
                          >
                            重命名
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              onDeleteGroup(group.id);
                              setGroupMenuOpenFor(null);
                            }}
                            className="flex w-full cursor-pointer items-center px-3 py-1.5 text-[11px] text-red-500 hover:bg-red-50"
                          >
                            删除分组
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Sessions in group */}
                  {!collapsed && (
                    <div className="space-y-px">
                      {sessions.length === 0 ? (
                        <p className={`py-1 pl-7 text-[11px] ${isDragOver ? "text-gray-400" : "text-gray-300"}`}>
                          {isDragOver ? "松开鼠标放入分组" : "暂无线程"}
                        </p>
                      ) : (
                        sessions.map((s) => renderThreadItem(s, true))
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Ungrouped sessions — also a drop target (to remove from group) */}
            {ungroupedSessions.length > 0 && (
              <div
                className={`space-y-px transition-colors ${groupedSessions.length > 0 ? "mt-1 border-t border-black/4 pt-1" : ""} ${dragOverUngrouped ? "rounded-md bg-black/[0.03]" : ""}`}
                onDragOver={(e) => {
                  // Only accept sessions that are in a group
                  if (dragSessionIdRef.current) {
                    const sid = dragSessionIdRef.current;
                    const s = summaries.find((x) => x.id === sid);
                    if (s?.groupId) {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      setDragOverUngrouped(true);
                      setDragOverGroupId(null);
                    }
                  }
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    setDragOverUngrouped(false);
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const sid = dragSessionIdRef.current;
                  if (sid) onSetSessionGroup(sid, null);
                  setDragOverUngrouped(false);
                  dragSessionIdRef.current = null;
                }}
              >
                {ungroupedSessions.map((s) => renderThreadItem(s, false))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom: Archive entry + Settings */}
      <div className="border-t border-black/8 px-2 py-1.5">
        {!showArchived ? (
          <button
            type="button"
            onClick={() => setShowArchived(true)}
            className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-[12px] text-gray-500 transition hover:bg-black/[0.04] hover:text-gray-700"
          >
            <ArchiveBoxIcon className="h-3.5 w-3.5" />
            已归档
            {archivedSummaries.length > 0 ? (
              <span className="ml-auto text-[10px] text-gray-400">{archivedSummaries.length}</span>
            ) : null}
          </button>
        ) : null}
        <button
          type="button"
          onClick={onOpenSettings}
          className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-[12px] text-gray-500 transition hover:bg-black/[0.04] hover:text-gray-700"
        >
          <Cog6ToothIcon className="h-3.5 w-3.5" />
          设置
        </button>
      </div>
    </aside>
  );
}
