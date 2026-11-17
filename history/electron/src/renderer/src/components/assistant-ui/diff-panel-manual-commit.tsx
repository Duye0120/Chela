import { CheckIcon, RefreshCwIcon } from "lucide-react";
import { Button } from "@renderer/components/assistant-ui/button";
import { cn } from "@renderer/lib/utils";

export type ManualCommitDraft = {
  title: string;
  description: string;
};

type ManualCommitPanelProps = ManualCommitDraft & {
  selectedFileCount: number;
  disabled: boolean;
  isCommitting: boolean;
  error: string | null;
  className?: string;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onCommit: () => void;
};

function resizeTextarea(element: HTMLTextAreaElement) {
  element.style.height = "auto";
  element.style.height = `${element.scrollHeight}px`;
}

export function ManualCommitPanel({
  title,
  description,
  selectedFileCount,
  disabled,
  isCommitting,
  error,
  className,
  onTitleChange,
  onDescriptionChange,
  onCommit,
}: ManualCommitPanelProps) {
  const canCommit =
    selectedFileCount > 0 && title.trim().length > 0 && !disabled && !isCommitting;

  return (
    <div
      className={cn(
        "rounded-[var(--radius-shell)] bg-[color:var(--color-control-bg)] px-3.5 py-3 shadow-[var(--color-control-shadow)]",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold leading-5 text-foreground">手动提交</p>
          <p className="mt-0.5 text-[11px] leading-5 text-muted-foreground">
            已选 {selectedFileCount} 个文件
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={onCommit}
          disabled={!canCommit}
          className={cn(
            "h-8 shrink-0 rounded-[var(--radius-shell)] px-3 text-[12px] transition-all",
            isCommitting && "opacity-100 disabled:opacity-100 bg-foreground/90",
          )}
        >
          {isCommitting ? (
            <RefreshCwIcon className="size-3.5 animate-spin" />
          ) : (
            <CheckIcon className="size-3.5" />
          )}
          {isCommitting ? "提交中..." : "提交所选"}
        </Button>
      </div>

      <textarea
        rows={1}
        value={title}
        aria-label="手动提交标题"
        disabled={disabled || isCommitting}
        onChange={(event) => onTitleChange(event.target.value)}
        onInput={(event) => resizeTextarea(event.currentTarget)}
        ref={(element) => {
          if (element) resizeTextarea(element);
        }}
        className="mt-2 min-h-[42px] w-full resize-none rounded-[var(--radius-shell)] bg-background/78 px-3 py-2 text-[13px] font-semibold leading-5 text-foreground outline-none ring-1 ring-[color:var(--color-control-border)] transition-[background-color,box-shadow] placeholder:text-muted-foreground focus-visible:bg-[color:var(--color-control-bg-active)] focus-visible:ring-2 focus-visible:ring-[color:var(--color-control-focus-ring)] disabled:cursor-not-allowed"
        placeholder="输入提交标题..."
      />

      <textarea
        rows={3}
        value={description}
        aria-label="手动提交说明"
        disabled={disabled || isCommitting}
        onChange={(event) => onDescriptionChange(event.target.value)}
        className="mt-2 min-h-[84px] w-full resize-y rounded-[var(--radius-shell)] bg-background/78 px-3 py-2.5 text-[12px] leading-6 text-foreground outline-none ring-1 ring-[color:var(--color-control-border)] transition-[background-color,box-shadow] placeholder:text-muted-foreground focus-visible:bg-[color:var(--color-control-bg-active)] focus-visible:ring-2 focus-visible:ring-[color:var(--color-control-focus-ring)] disabled:cursor-not-allowed"
        placeholder="输入提交说明（支持 Markdown）..."
      />

      {error ? (
        <div className="mt-2 rounded-[var(--radius-shell)] bg-[color:var(--chela-status-error-bg)] px-2.5 py-2 text-[12px] leading-5 text-[color:var(--chela-status-error-text)]">
          {error}
        </div>
      ) : null}
    </div>
  );
}
