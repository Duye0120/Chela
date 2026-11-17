import { memo, useCallback, useMemo } from "react";
import type {
  ChatSession,
  ChatSessionSummary,
  ContextSummary,
  DesktopApi,
  GitBranchSummary,
  InterruptedApprovalGroup,
  SelectedFile,
  ThinkingLevel,
} from "@shared/contracts";
import { AssistantThreadPanel } from "@renderer/components/assistant-ui/assistant-thread-panel";
import {
  ThreadEmptyState,
  ThreadUnavailableState,
} from "@renderer/components/assistant-ui/app-shell-states";
import { EMPTY_CONTEXT_USAGE_SUMMARY } from "@renderer/lib/context-usage";
import type { BrowserContextItem } from "@renderer/lib/browser-interview";

type ThreadRuntimeLayerProps = {
  desktopApi: DesktopApi | undefined;
  activeSessionId: string | null;
  archivedSummaries: ChatSessionSummary[];
  browserContextBySessionId: Record<string, BrowserContextItem[]>;
  contextSummaryBySessionId: Record<string, ContextSummary>;
  currentModelId: string;
  gitBranchSummary: GitBranchSummary | null;
  interruptedApprovalGroupsBySessionId: Record<string, InterruptedApprovalGroup[]>;
  isPickingFiles: boolean;
  runningSessionIds: string[];
  sessionCache: Record<string, ChatSession>;
  summaries: ChatSessionSummary[];
  thinkingLevel: ThinkingLevel;
  threadTerminalOpen: boolean;
  onAttachFiles: () => void;
  onBranchChanged: () => void | Promise<void>;
  onClearBrowserContextItems: (sessionId: string) => void;
  onComposerFocus: () => void;
  onCreateNewSession: () => void | Promise<void>;
  onDismissInterruptedApproval: (
    sessionId: string,
    runId: string,
  ) => void | Promise<void>;
  onModelChange: (modelEntryId: string) => void;
  onOpenArchived: () => void;
  onPasteFiles: (files: File[]) => void;
  onPersistSession: (session: ChatSession) => void;
  onReloadSession: (sessionId: string) => void | Promise<void>;
  onRemoveAttachment: (attachmentId: string) => void;
  onRemoveBrowserContextItem: (sessionId: string, itemId: string) => void;
  onResumeInterruptedApproval: (runId: string) => Promise<string>;
  onRunStateChange: (sessionId: string, isRunning: boolean) => void;
  onThinkingLevelChange: (level: ThinkingLevel) => void;
};

type MountedThreadSessionProps = {
  desktopApi: DesktopApi;
  browserContextItems: BrowserContextItem[];
  contextSummary: ContextSummary;
  currentModelId: string;
  disableGlobalSideEffects: boolean;
  gitBranchSummary: GitBranchSummary | null;
  interruptedApprovalGroups: InterruptedApprovalGroup[];
  isPickingFiles: boolean;
  session: ChatSession;
  thinkingLevel: ThinkingLevel;
  threadTerminalOpen: boolean;
  visible: boolean;
  onAttachFiles: ThreadRuntimeLayerProps["onAttachFiles"];
  onBranchChanged: ThreadRuntimeLayerProps["onBranchChanged"];
  onClearBrowserContextItems: ThreadRuntimeLayerProps["onClearBrowserContextItems"];
  onComposerFocus: ThreadRuntimeLayerProps["onComposerFocus"];
  onDismissInterruptedApproval: ThreadRuntimeLayerProps["onDismissInterruptedApproval"];
  onModelChange: ThreadRuntimeLayerProps["onModelChange"];
  onPasteFiles: ThreadRuntimeLayerProps["onPasteFiles"];
  onPersistSession: ThreadRuntimeLayerProps["onPersistSession"];
  onReloadSession: ThreadRuntimeLayerProps["onReloadSession"];
  onRemoveAttachment: ThreadRuntimeLayerProps["onRemoveAttachment"];
  onRemoveBrowserContextItem: ThreadRuntimeLayerProps["onRemoveBrowserContextItem"];
  onResumeInterruptedApproval: ThreadRuntimeLayerProps["onResumeInterruptedApproval"];
  onRunStateChange: ThreadRuntimeLayerProps["onRunStateChange"];
  onThinkingLevelChange: ThreadRuntimeLayerProps["onThinkingLevelChange"];
};

const MountedThreadSession = memo(function MountedThreadSession({
  desktopApi,
  browserContextItems,
  contextSummary,
  currentModelId,
  disableGlobalSideEffects,
  gitBranchSummary,
  interruptedApprovalGroups,
  isPickingFiles,
  session,
  thinkingLevel,
  threadTerminalOpen,
  visible,
  onAttachFiles,
  onBranchChanged,
  onClearBrowserContextItems,
  onComposerFocus,
  onDismissInterruptedApproval,
  onModelChange,
  onPasteFiles,
  onPersistSession,
  onReloadSession,
  onRemoveAttachment,
  onRemoveBrowserContextItem,
  onResumeInterruptedApproval,
  onRunStateChange,
  onThinkingLevelChange,
}: MountedThreadSessionProps) {
  const handleDismissInterruptedApproval = useCallback(
    (runId: string) => {
      void onDismissInterruptedApproval(session.id, runId);
    },
    [onDismissInterruptedApproval, session.id],
  );

  const handleRemoveBrowserContextItem = useCallback(
    (itemId: string) => {
      onRemoveBrowserContextItem(session.id, itemId);
    },
    [onRemoveBrowserContextItem, session.id],
  );

  const handleClearBrowserContextItems = useCallback(() => {
    onClearBrowserContextItems(session.id);
  }, [onClearBrowserContextItems, session.id]);

  return (
    <div
      className={visible ? "flex h-full min-h-0 flex-1 flex-col" : "hidden"}
      aria-hidden={!visible}
    >
      <AssistantThreadPanel
        session={session}
        desktopApi={desktopApi}
        onPersistSession={onPersistSession}
        onReloadSession={onReloadSession}
        currentModelId={currentModelId}
        thinkingLevel={thinkingLevel}
        terminalOpen={threadTerminalOpen}
        isPickingFiles={isPickingFiles}
        onAttachFiles={onAttachFiles}
        onPasteFiles={onPasteFiles}
        onRemoveAttachment={onRemoveAttachment}
        onModelChange={onModelChange}
        onThinkingLevelChange={onThinkingLevelChange}
        onBranchChanged={onBranchChanged}
        onRunStateChange={onRunStateChange}
        branchSummary={gitBranchSummary}
        contextSummary={contextSummary}
        interruptedApprovalGroups={interruptedApprovalGroups}
        onDismissInterruptedApproval={handleDismissInterruptedApproval}
        onResumeInterruptedApproval={onResumeInterruptedApproval}
        browserContextItems={browserContextItems}
        onRemoveBrowserContextItem={handleRemoveBrowserContextItem}
        onClearBrowserContextItems={handleClearBrowserContextItems}
        onComposerFocus={onComposerFocus}
        visible={visible}
        disableGlobalSideEffects={disableGlobalSideEffects}
      />
    </div>
  );
});

function ThreadRuntimeLayerImpl({
  desktopApi,
  activeSessionId,
  archivedSummaries,
  browserContextBySessionId,
  contextSummaryBySessionId,
  currentModelId,
  gitBranchSummary,
  interruptedApprovalGroupsBySessionId,
  isPickingFiles,
  runningSessionIds,
  sessionCache,
  summaries,
  thinkingLevel,
  threadTerminalOpen,
  onAttachFiles,
  onBranchChanged,
  onClearBrowserContextItems,
  onComposerFocus,
  onCreateNewSession,
  onDismissInterruptedApproval,
  onModelChange,
  onOpenArchived,
  onPasteFiles,
  onPersistSession,
  onReloadSession,
  onRemoveAttachment,
  onRemoveBrowserContextItem,
  onResumeInterruptedApproval,
  onRunStateChange,
  onThinkingLevelChange,
}: ThreadRuntimeLayerProps) {
  const mountedSessionIds = useMemo(() => {
    const ids = new Set<string>();
    if (activeSessionId) {
      ids.add(activeSessionId);
    }
    runningSessionIds.forEach((sessionId) => ids.add(sessionId));
    return [...ids].filter((sessionId) => Boolean(sessionCache[sessionId]));
  }, [activeSessionId, runningSessionIds, sessionCache]);

  if (!desktopApi) {
    return (
      <section className="flex h-full min-h-0 flex-col bg-[color:var(--chela-bg-surface)]">
        <ThreadUnavailableState />
      </section>
    );
  }

  if (mountedSessionIds.length === 0) {
    return (
      <section className="flex h-full min-h-0 flex-col bg-[color:var(--chela-bg-surface)]">
        <ThreadEmptyState
          hasArchivedSessions={archivedSummaries.length > 0}
          hasLiveSessions={summaries.length > 0}
          onCreateNewSession={() => {
            void onCreateNewSession();
          }}
          onOpenArchived={onOpenArchived}
        />
      </section>
    );
  }

  const hasAnyRunningSessions = runningSessionIds.length > 0;

  return (
    <section className="flex h-full min-h-0 flex-col bg-[color:var(--chela-bg-surface)]">
      <div className="flex h-full min-h-0 flex-col bg-[color:var(--chela-bg-surface)]">
        {mountedSessionIds.map((sessionId) => {
          const session = sessionCache[sessionId];
          if (!session) {
            return null;
          }

          const visible = sessionId === activeSessionId;

          return (
            <MountedThreadSession
              key={sessionId}
              session={session}
              desktopApi={desktopApi}
              browserContextItems={browserContextBySessionId[session.id] ?? []}
              contextSummary={
                contextSummaryBySessionId[session.id] ??
                EMPTY_CONTEXT_USAGE_SUMMARY
              }
              currentModelId={currentModelId}
              disableGlobalSideEffects={hasAnyRunningSessions}
              gitBranchSummary={gitBranchSummary}
              interruptedApprovalGroups={
                interruptedApprovalGroupsBySessionId[session.id] ?? []
              }
              isPickingFiles={isPickingFiles}
              thinkingLevel={thinkingLevel}
              threadTerminalOpen={threadTerminalOpen}
              visible={visible}
              onAttachFiles={onAttachFiles}
              onBranchChanged={onBranchChanged}
              onClearBrowserContextItems={onClearBrowserContextItems}
              onComposerFocus={onComposerFocus}
              onDismissInterruptedApproval={onDismissInterruptedApproval}
              onModelChange={onModelChange}
              onPasteFiles={onPasteFiles}
              onPersistSession={onPersistSession}
              onReloadSession={onReloadSession}
              onRemoveAttachment={onRemoveAttachment}
              onRemoveBrowserContextItem={onRemoveBrowserContextItem}
              onResumeInterruptedApproval={onResumeInterruptedApproval}
              onRunStateChange={onRunStateChange}
              onThinkingLevelChange={onThinkingLevelChange}
            />
          );
        })}
      </div>
    </section>
  );
}

export const ThreadRuntimeLayer = memo(ThreadRuntimeLayerImpl);
