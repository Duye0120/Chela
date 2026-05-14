import { Button } from "@renderer/components/assistant-ui/button";
import { ChelaAsciiBoot } from "@renderer/components/assistant-ui/chela-ascii-boot";

export function AppBootingScreen() {
  return (
    <main className="chela-ascii-boot-screen">
      <ChelaAsciiBoot />
    </main>
  );
}

export function AppBootErrorScreen({ message }: { message: string }) {
  return (
    <main className="grid h-screen place-items-center bg-shell-window px-6 text-[color:var(--color-text-muted)]">
      <div className="max-w-lg rounded-[var(--radius-shell)] bg-[color:var(--chela-status-error-bg)] px-6 py-4 shadow-[var(--shadow-subtle)] ring-1 ring-[color:var(--chela-status-error-text)]/20">
        <p className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--chela-status-error-text)]/50">
          Renderer Error
        </p>
        <h1 className="mt-2 text-lg font-medium text-foreground">
          界面初始化失败
        </h1>
        <p className="mt-2 whitespace-pre-wrap text-xs leading-6 text-[color:var(--color-text-secondary)]">
          {message}
        </p>
        <p className="mt-2 text-xs text-[color:var(--color-text-muted)]">
          现在就算 preload 出问题，也不会再整窗发黑，而是直接显示诊断信息。
        </p>
      </div>
    </main>
  );
}

export function ThreadUnavailableState() {
  return (
    <div className="grid min-h-0 flex-1 place-items-center px-6 text-sm text-[color:var(--color-text-muted)]">
      当前没有可用线程。
    </div>
  );
}

export function ThreadEmptyState({
  hasArchivedSessions,
  hasLiveSessions,
  onCreateNewSession,
  onOpenArchived,
}: {
  hasArchivedSessions: boolean;
  hasLiveSessions: boolean;
  onCreateNewSession: () => void;
  onOpenArchived: () => void;
}) {
  return (
    <div className="grid min-h-0 flex-1 place-items-center px-6">
      <div className="flex max-w-[440px] flex-col items-center gap-3 text-center">
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-[color:var(--chela-text-primary)]">
            {hasLiveSessions ? "还没有选中的线程" : "当前没有活跃线程"}
          </p>
          <p className="text-[12px] leading-5 text-[color:var(--chela-text-secondary)]">
            {hasArchivedSessions
              ? "可以新建一个线程继续，也可以去已归档里恢复之前的对话。"
              : "可以先新建一个线程，空线程列表现在也允许保留。"}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button
            type="button"
            size="sm"
            onClick={onCreateNewSession}
            className="rounded-[var(--radius-shell)]"
          >
            新建线程
          </Button>
          {hasArchivedSessions ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onOpenArchived}
              className="rounded-[var(--radius-shell)]"
            >
              查看已归档
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
