import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowTopRightOnSquareIcon,
  ClipboardDocumentIcon,
  FolderIcon,
  PencilSquareIcon,
} from "@heroicons/react/24/outline";
import type {
  ChatSessionSummary,
  Settings,
  SessionGroup,
  SoulFilesStatus,
} from "@shared/contracts";
import { Badge } from "@renderer/components/assistant-ui/badge";
import { Button } from "@renderer/components/assistant-ui/button";
import { cn } from "@renderer/lib/utils";
import { SettingsCard } from "./shared";

function formatBytes(sizeBytes: number): string {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }
  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  }
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getProjectName(workspace: string) {
  return workspace.split(/[\\/]/).filter(Boolean).at(-1) ?? workspace;
}

type WorkspaceListItem = {
  id: string;
  name: string;
  path: string;
  groupId: string | null;
  tracked: boolean;
};

function RuleFileItem({
  label,
  exists,
  sizeBytes,
}: {
  label: string;
  exists: boolean;
  sizeBytes: number;
}) {
  return (
    <div className="rounded-[var(--radius-shell)] bg-[color:var(--color-control-panel-bg)] px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              "size-2 shrink-0 rounded-full",
              exists ? "bg-emerald-500" : "bg-amber-400",
            )}
          />
          <p className="truncate text-[12px] font-medium text-foreground">
            {label}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 text-[11px]",
            exists ? "text-emerald-600" : "text-amber-600",
          )}
        >
          {exists ? "已加载" : "缺失"}
        </span>
      </div>
      <p className="mt-1.5 text-[12px] leading-5 text-muted-foreground">
        {exists ? `${formatBytes(sizeBytes)} · 已检测到` : "当前工作区里还没有这个文件"}
      </p>
    </div>
  );
}

function WorkspaceListRow({
  item,
  active,
  liveCount,
  archivedCount,
  onSelect,
}: {
  item: WorkspaceListItem;
  active: boolean;
  liveCount: number;
  archivedCount: number;
  onSelect: (item: WorkspaceListItem) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className={cn(
        "w-full rounded-[var(--radius-shell)] px-4 py-3 text-left transition-colors",
        active
          ? "bg-[color:var(--color-control-bg-active)] text-foreground shadow-[var(--color-control-shadow)]"
          : "bg-[color:var(--color-control-bg)] text-foreground hover:bg-[color:var(--color-control-bg-hover)]",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-shell)] bg-[color:var(--color-control-panel-bg)] text-muted-foreground">
          <FolderIcon className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-[13px] font-medium text-foreground">
              {item.name}
            </p>
            {item.tracked ? (
              <Badge variant="secondary" className="text-muted-foreground">
                项目
              </Badge>
            ) : (
              <Badge className="bg-[color:var(--color-control-bg-active)] text-foreground">
                默认目录
              </Badge>
            )}
          </div>
          <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
            {item.path}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <span>活跃 {liveCount}</span>
            <span>归档 {archivedCount}</span>
          </div>
        </div>
      </div>
    </button>
  );
}

export function WorkspaceSection({
  settings,
  groups,
  liveSummaries,
  archivedSummaries,
  soulStatus,
  onSettingsChange,
  onCreateProject,
}: {
  settings: Settings;
  groups: SessionGroup[];
  liveSummaries: ChatSessionSummary[];
  archivedSummaries: ChatSessionSummary[];
  soulStatus: SoulFilesStatus | null;
  onSettingsChange: (partial: Partial<Settings>) => void;
  onCreateProject: () => void;
}) {
  const desktopApi = window.desktopApi;
  const [openingFolder, setOpeningFolder] = useState(false);
  const [pickingFolder, setPickingFolder] = useState(false);
  const [copyDone, setCopyDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const workspaceItems = useMemo(() => {
    const normalizedCurrentWorkspace = settings.workspace.trim();
    const seenPaths = new Set<string>();
    const nextItems: WorkspaceListItem[] = [];

    for (const group of groups) {
      const normalizedPath = group.path.trim();
      if (!normalizedPath || seenPaths.has(normalizedPath)) {
        continue;
      }

      seenPaths.add(normalizedPath);
      nextItems.push({
        id: group.id,
        name: group.name.trim() || getProjectName(normalizedPath),
        path: normalizedPath,
        groupId: group.id,
        tracked: true,
      });
    }

    if (normalizedCurrentWorkspace && !seenPaths.has(normalizedCurrentWorkspace)) {
      nextItems.unshift({
        id: `workspace:${normalizedCurrentWorkspace}`,
        name: getProjectName(normalizedCurrentWorkspace),
        path: normalizedCurrentWorkspace,
        groupId: null,
        tracked: false,
      });
    }

    return nextItems;
  }, [groups, settings.workspace]);

  const selectedItem = useMemo(() => {
    const normalizedWorkspace = settings.workspace.trim();
    if (normalizedWorkspace) {
      const matchedItem = workspaceItems.find(
        (item) => item.path === normalizedWorkspace,
      );
      if (matchedItem) {
        return matchedItem;
      }
    }

    return workspaceItems[0] ?? null;
  }, [settings.workspace, workspaceItems]);

  const summaryCountByGroupId = useMemo(() => {
    const counts = new Map<string, { live: number; archived: number }>();

    const ensure = (groupId: string) => {
      const existing = counts.get(groupId);
      if (existing) {
        return existing;
      }

      const next = { live: 0, archived: 0 };
      counts.set(groupId, next);
      return next;
    };

    for (const summary of liveSummaries) {
      if (!summary.groupId) {
        continue;
      }
      ensure(summary.groupId).live += 1;
    }

    for (const summary of archivedSummaries) {
      if (!summary.groupId) {
        continue;
      }
      ensure(summary.groupId).archived += 1;
    }

    return counts;
  }, [archivedSummaries, liveSummaries]);

  const selectedCounts = useMemo(() => {
    if (!selectedItem?.groupId) {
      return { live: 0, archived: 0 };
    }
    return summaryCountByGroupId.get(selectedItem.groupId) ?? {
      live: 0,
      archived: 0,
    };
  }, [selectedItem, summaryCountByGroupId]);

  const soulItems = useMemo(
    () =>
      soulStatus
        ? [
            { key: "soul", label: "SOUL.md", ...soulStatus.soul },
            { key: "user", label: "USER.md", ...soulStatus.user },
            { key: "agents", label: "AGENTS.md", ...soulStatus.agents },
            { key: "claude", label: "CLAUDE.md", ...soulStatus.claude },
          ]
        : [],
    [soulStatus],
  );

  const loadedCount = useMemo(() => {
    let count = 0;
    for (const item of soulItems) {
      if (item.exists) {
        count += 1;
      }
    }
    return count;
  }, [soulItems]);

  const handleSelectWorkspace = useCallback(
    (item: WorkspaceListItem) => {
      if (item.path === settings.workspace) {
        return;
      }

      setError(null);
      onSettingsChange({ workspace: item.path });
    },
    [onSettingsChange, settings.workspace],
  );

  const handleCopyPath = useCallback(async () => {
    if (!selectedItem) {
      return;
    }

    try {
      await navigator.clipboard.writeText(selectedItem.path);
      setCopyDone(true);
      setError(null);

      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }

      copyTimerRef.current = window.setTimeout(() => {
        setCopyDone(false);
        copyTimerRef.current = null;
      }, 1600);
    } catch (err) {
      setError(err instanceof Error ? err.message : "复制路径失败");
    }
  }, [selectedItem]);

  const handleOpenFolder = useCallback(async () => {
    if (!desktopApi || !selectedItem) {
      return;
    }

    setOpeningFolder(true);
    setError(null);

    try {
      if (selectedItem.path !== settings.workspace) {
        onSettingsChange({ workspace: selectedItem.path });
      }
      await desktopApi.workspace.openFolder();
    } catch (err) {
      setError(err instanceof Error ? err.message : "打开目录失败");
    } finally {
      setOpeningFolder(false);
    }
  }, [desktopApi, onSettingsChange, selectedItem, settings.workspace]);

  const handlePickFolder = useCallback(async () => {
    if (!desktopApi) {
      return;
    }

    setPickingFolder(true);
    setError(null);

    try {
      const nextWorkspace = await desktopApi.workspace.pickFolder();
      if (!nextWorkspace || nextWorkspace === settings.workspace) {
        return;
      }

      onSettingsChange({ workspace: nextWorkspace });
    } catch (err) {
      setError(err instanceof Error ? err.message : "切换默认目录失败");
    } finally {
      setPickingFolder(false);
    }
  }, [desktopApi, onSettingsChange, settings.workspace]);

  return (
    <SettingsCard>
      <div className="space-y-4 px-6 pb-6 pt-1">
        <div className="rounded-[calc(var(--radius-shell)+4px)] bg-[color:var(--color-control-panel-bg)] p-5 sm:p-6">
          <div className="flex flex-col gap-3 border-b border-[color:var(--color-control-border)]/60 pb-5 md:flex-row md:items-start md:justify-between">
            <div className="space-y-1">
              <p className="text-[15px] font-semibold tracking-[-0.02em] text-foreground">
                工作区列表
              </p>
              <p className="text-[12px] leading-6 text-muted-foreground">
                外部侧边栏里的项目会同步出现在这里，当前默认目录也会一起纳入管理。
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onCreateProject}
              >
                <FolderIcon className="size-4" />
                添加项目
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handlePickFolder()}
                disabled={pickingFolder}
              >
                <PencilSquareIcon className="size-4" />
                {pickingFolder ? "选择中…" : "更换默认目录"}
              </Button>
            </div>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
            <div className="space-y-3">
              {workspaceItems.length > 0 ? (
                workspaceItems.map((item) => {
                  const counts = item.groupId
                    ? summaryCountByGroupId.get(item.groupId) ?? {
                        live: 0,
                        archived: 0,
                      }
                    : { live: 0, archived: 0 };

                  return (
                    <WorkspaceListRow
                      key={item.id}
                      item={item}
                      active={item.path === selectedItem?.path}
                      liveCount={counts.live}
                      archivedCount={counts.archived}
                      onSelect={handleSelectWorkspace}
                    />
                  );
                })
              ) : (
                <div className="rounded-[var(--radius-shell)] bg-[color:var(--color-control-bg)] px-4 py-4 text-[12px] leading-6 text-muted-foreground">
                  还没有已保存项目。先添加一个项目，后面可以按项目分别管理规则和聊天。
                </div>
              )}
            </div>

            <div className="space-y-4">
              {selectedItem ? (
                <>
                  <div className="rounded-[var(--radius-shell)] bg-[color:var(--color-control-bg)] px-5 py-5 shadow-[var(--color-control-shadow)]">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="truncate text-[20px] font-semibold tracking-[-0.02em] text-foreground">
                            {selectedItem.name}
                          </h2>
                          {selectedItem.tracked ? (
                            <Badge className="bg-[color:var(--color-control-bg-active)] text-foreground">
                              已保存项目
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-muted-foreground">
                              当前默认目录
                            </Badge>
                          )}
                          {selectedItem.path === settings.workspace ? (
                            <Badge variant="secondary" className="text-muted-foreground">
                              当前生效
                            </Badge>
                          ) : null}
                        </div>
                        <p className="text-[13px] leading-6 text-muted-foreground">
                          这里展示当前工作区的路径、聊天归属和规则文件。切换工作区后，右侧依赖 workspace 的能力会跟着同步。
                        </p>
                      </div>

                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void handleOpenFolder()}
                          disabled={openingFolder}
                        >
                          <ArrowTopRightOnSquareIcon className="size-4" />
                          {openingFolder ? "打开中…" : "打开目录"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void handleCopyPath()}
                        >
                          <ClipboardDocumentIcon className="size-4" />
                          {copyDone ? "已复制" : "复制路径"}
                        </Button>
                      </div>
                    </div>

                    <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1.8fr)_minmax(260px,1fr)]">
                      <div className="rounded-[var(--radius-shell)] bg-[color:var(--color-control-panel-bg)] px-4 py-4">
                        <p className="text-[11px] font-medium text-muted-foreground">
                          当前路径
                        </p>
                        <p className="mt-2 break-all font-mono text-[12px] leading-6 text-foreground">
                          {selectedItem.path}
                        </p>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-[var(--radius-shell)] bg-[color:var(--color-control-panel-bg)] px-4 py-4">
                          <p className="text-[11px] font-medium text-muted-foreground">
                            活跃聊天
                          </p>
                          <p className="mt-2 text-[20px] font-semibold tracking-[-0.02em] text-foreground">
                            {selectedCounts.live}
                          </p>
                        </div>
                        <div className="rounded-[var(--radius-shell)] bg-[color:var(--color-control-panel-bg)] px-4 py-4">
                          <p className="text-[11px] font-medium text-muted-foreground">
                            已归档
                          </p>
                          <p className="mt-2 text-[20px] font-semibold tracking-[-0.02em] text-foreground">
                            {selectedCounts.archived}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[var(--radius-shell)] bg-[color:var(--color-control-bg)] px-5 py-5 shadow-[var(--color-control-shadow)]">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-[13px] font-medium text-foreground">
                          规则文件
                        </p>
                        <p className="mt-1 text-[12px] leading-6 text-muted-foreground">
                          SOUL.md、USER.md、AGENTS.md、CLAUDE.md 会跟着当前工作区一起读取。
                        </p>
                      </div>
                      <Badge className="bg-[color:var(--color-control-bg-active)] text-foreground">
                        {soulStatus ? `已加载 ${loadedCount} / ${soulItems.length}` : "读取中…"}
                      </Badge>
                    </div>

                    {soulStatus ? (
                      <div className="mt-4 grid gap-3 lg:grid-cols-2">
                        {soulItems.map((item) => (
                          <RuleFileItem
                            key={item.key}
                            label={item.label}
                            exists={item.exists}
                            sizeBytes={item.sizeBytes}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="mt-4 rounded-[var(--radius-shell)] bg-[color:var(--color-control-panel-bg)] px-4 py-4 text-[12px] text-muted-foreground">
                        正在读取规则文件状态…
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="rounded-[var(--radius-shell)] bg-[color:var(--color-control-bg)] px-5 py-5 text-[13px] leading-6 text-muted-foreground shadow-[var(--color-control-shadow)]">
                  先添加一个项目，或者先设置默认目录，这里会开始展示对应工作区的规则和状态。
                </div>
              )}
            </div>
          </div>
        </div>

        {error ? (
          <div className="rounded-[var(--radius-shell)] bg-[color:rgba(239,68,68,0.08)] px-4 py-3 text-[12px] leading-6 text-[color:rgb(185,28,28)]">
            {error}
          </div>
        ) : null}
      </div>
    </SettingsCard>
  );
}
