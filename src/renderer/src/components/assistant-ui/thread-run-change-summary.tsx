import { useState, type FC } from "react";
import { useAuiState } from "@assistant-ui/react";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import type { GitDiffFile, RunChangeSummary } from "@shared/contracts";
import { DiffFileCard } from "@renderer/components/assistant-ui/diff-panel-parts";
import { cn } from "@renderer/lib/utils";

const runChangeLabels: Record<
  RunChangeSummary["files"][number]["changeKind"],
  string
> = {
  added: "已新增",
  updated: "已编辑",
  reverted: "已恢复",
};

const runChangeStatusLabels: Record<
  RunChangeSummary["files"][number]["status"],
  string
> = {
  modified: "变更",
  deleted: "删除",
  untracked: "新增",
};

const numberFormatter = new Intl.NumberFormat("zh-CN");

function formatSignedCount(value: number, sign: "+" | "-") {
  return `${sign}${numberFormatter.format(value)}`;
}

function getFileName(filePath: string) {
  const normalized = filePath.replace(/\\/g, "/");
  return normalized.split("/").pop() || normalized;
}

function toDiffFile(
  file: RunChangeSummary["files"][number],
): GitDiffFile | null {
  if (!file.patch || !file.kind) {
    return null;
  }

  return {
    path: file.path,
    status: file.status,
    patch: file.patch,
    kind: file.kind,
    additions: file.additions,
    deletions: file.deletions,
    previewPath: file.previewPath,
  };
}

export const AssistantMessageRunChangeSummary: FC = () => {
  const summary = useAuiState((s) => {
    const custom = s.message.metadata?.custom as
      | {
        runChangeSummary?: RunChangeSummary | null;
      }
      | undefined;
    return custom?.runChangeSummary ?? null;
  });
  const [expanded, setExpanded] = useState(true);
  const [expandedDiffPaths, setExpandedDiffPaths] = useState<Set<string>>(new Set());

  if (!summary || summary.fileCount === 0) {
    return null;
  }

  const primaryFile = summary.files[0];
  const summaryTarget =
    summary.fileCount === 1 ? getFileName(primaryFile.path) : `${summary.fileCount} 个文件`;
  const summaryLabel =
    summary.fileCount === 1 ? runChangeLabels[primaryFile.changeKind] : "已编辑";

  return (
    <div className="mt-3 max-w-full">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        className="inline-flex max-w-full items-center gap-2 rounded-[var(--radius-shell)] bg-[color:var(--color-control-bg)] px-3 py-1.5 text-left shadow-[var(--color-control-shadow)] transition hover:bg-[color:var(--color-control-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-control-focus-ring)]"
        aria-expanded={expanded}
      >
        <span className="shrink-0 text-[13px] font-medium text-[color:var(--chela-text-secondary)]">
          {summaryLabel}
        </span>
        <code className="min-w-0 truncate font-mono text-[13px] font-medium text-[color:var(--chela-text-primary)]">
          {summaryTarget}
        </code>
        <span className="shrink-0 font-mono text-[12px] font-semibold text-[color:var(--color-diff-add-text)]">
          {formatSignedCount(summary.additions, "+")}
        </span>
        <span className="shrink-0 font-mono text-[12px] font-semibold text-[color:var(--color-diff-del-text)]">
          {formatSignedCount(summary.deletions, "-")}
        </span>
        <ChevronDownIcon
          className={cn(
            "size-3.5 shrink-0 text-[color:var(--chela-text-tertiary)] transition-transform duration-200",
            expanded && "rotate-180",
          )}
        />
      </button>

      {expanded ? (
        <div className="mt-2 overflow-hidden rounded-[var(--radius-shell)] bg-[color:var(--color-control-panel-bg)] shadow-[var(--color-control-shadow)]">
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="flex w-full items-center gap-2 bg-[color:var(--color-control-bg)] px-3 py-2 text-left transition hover:bg-[color:var(--color-control-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-control-focus-ring)]"
          >
            <span className="text-[13px] font-medium text-[color:var(--chela-text-secondary)]">
              已编辑的文件
            </span>
            <span className="rounded-full bg-[color:var(--color-control-panel-bg)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--chela-text-tertiary)]">
              {summary.fileCount}
            </span>
            <ChevronUpIcon className="ml-auto size-3.5 text-[color:var(--chela-text-tertiary)]" />
          </button>

          <div className="max-h-[520px] overflow-y-auto p-2">
            {summary.files.map((file) => (
              <RunChangeFileRow
                key={`${file.changeKind}:${file.path}`}
                file={file}
                expanded={expandedDiffPaths.has(file.path)}
                onExpandedChange={(open) => {
                  setExpandedDiffPaths((current) => {
                    const next = new Set(current);
                    if (open) {
                      next.add(file.path);
                    } else {
                      next.delete(file.path);
                    }
                    return next;
                  });
                }}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
};

const RunChangeFileRow: FC<{
  file: RunChangeSummary["files"][number];
  expanded: boolean;
  onExpandedChange: (open: boolean) => void;
}> = ({ file, expanded, onExpandedChange }) => {
  const diffFile = toDiffFile(file);

  if (diffFile) {
    return (
      <div className="mb-2 last:mb-0">
        <DiffFileCard
          file={diffFile}
          expanded={expanded}
          onExpandedChange={onExpandedChange}
          layout="vertical"
          className="bg-[color:var(--color-control-panel-bg)]"
        />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-2 px-3 py-2 text-[12px] leading-5 transition hover:bg-[color:var(--color-control-bg)]">
      <span className="shrink-0 rounded-[var(--radius-shell)] bg-[color:var(--color-control-bg)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--chela-text-secondary)]">
        {runChangeLabels[file.changeKind]}
      </span>
      <div className="min-w-0">
        <code className="block truncate font-mono text-[12px] font-medium text-[color:var(--chela-text-primary)]">
          {file.path}
        </code>
        <span className="text-[11px] text-[color:var(--chela-text-tertiary)]">
          {runChangeStatusLabels[file.status]}
        </span>
      </div>
      <span className="font-mono text-[12px] font-semibold text-[color:var(--color-diff-add-text)]">
        {formatSignedCount(file.additions, "+")}
      </span>
      <span className="font-mono text-[12px] font-semibold text-[color:var(--color-diff-del-text)]">
        {formatSignedCount(file.deletions, "-")}
      </span>
    </div>
  );
};
