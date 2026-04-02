import { MarkdownText } from "@renderer/components/ui/markdown-text";
import { ToolFallback } from "@renderer/components/ui/tool-fallback";
import { TooltipIconButton } from "@renderer/components/ui/tooltip-icon-button";
import { Button } from "@renderer/components/ui/button";
import {
  ActionBarPrimitive,
  AuiIf,
  ComposerPrimitive,
  ErrorPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useAuiState,
} from "@assistant-ui/react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  CopyIcon,
  PaperclipIcon,
  SquareIcon,
  XIcon,
} from "lucide-react";
import type { FC } from "react";
import type { ModelSelection, SelectedFile, ThinkingLevel } from "@shared/contracts";
import { ModelSelector } from "@renderer/components/ModelSelector";

type ThreadProps = {
  attachments?: SelectedFile[];
  isPickingFiles?: boolean;
  onAttachFiles?: () => void;
  onRemoveAttachment?: (attachmentId: string) => void;
  currentModel?: ModelSelection;
  thinkingLevel?: ThinkingLevel;
  onModelChange?: (model: ModelSelection) => void;
  onThinkingLevelChange?: (level: ThinkingLevel) => void;
};

type ThreadResolvedProps = {
  attachments: SelectedFile[];
  isPickingFiles: boolean;
  onAttachFiles: () => void;
  onRemoveAttachment: (attachmentId: string) => void;
  currentModel: ModelSelection;
  thinkingLevel: ThinkingLevel;
  onModelChange: (model: ModelSelection) => void;
  onThinkingLevelChange: (level: ThinkingLevel) => void;
};

export const Thread: FC<ThreadProps> = ({
  attachments = [],
  isPickingFiles = false,
  onAttachFiles = () => undefined,
  onRemoveAttachment = () => undefined,
  currentModel = { provider: "anthropic", model: "claude-sonnet-4-20250514" },
  thinkingLevel = "off",
  onModelChange = () => undefined,
  onThinkingLevelChange = () => undefined,
}) => {
  return (
    <ThreadPrimitive.Root
      className="aui-root aui-thread-root @container flex h-full flex-col bg-background"
      style={{
        ["--thread-max-width" as string]: "44rem",
        ["--composer-radius" as string]: "24px",
        ["--composer-padding" as string]: "10px",
      }}
    >
      <ThreadPrimitive.Viewport
        turnAnchor="top"
        className="aui-thread-viewport relative flex flex-1 flex-col overflow-x-auto overflow-y-scroll scroll-smooth px-4 pt-4"
      >
        <AuiIf condition={(s) => s.thread.isEmpty}>
          <ThreadWelcome />
        </AuiIf>

        <ThreadPrimitive.Messages>
          {() => <ThreadMessage />}
        </ThreadPrimitive.Messages>

        <ThreadPrimitive.ViewportFooter className="aui-thread-viewport-footer sticky bottom-0 mx-auto mt-auto flex w-full max-w-(--thread-max-width) flex-col gap-4 overflow-visible rounded-t-(--composer-radius) bg-background pb-4 md:pb-6">
          <ThreadScrollToBottom />
          <Composer
            attachments={attachments}
            isPickingFiles={isPickingFiles}
            onAttachFiles={onAttachFiles}
            onRemoveAttachment={onRemoveAttachment}
            currentModel={currentModel}
            thinkingLevel={thinkingLevel}
            onModelChange={onModelChange}
            onThinkingLevelChange={onThinkingLevelChange}
          />
        </ThreadPrimitive.ViewportFooter>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
};

const ThreadMessage: FC = () => {
  const role = useAuiState((s) => s.message.role);
  if (role === "user") return <UserMessage />;
  return <AssistantMessage />;
};

const ThreadScrollToBottom: FC = () => {
  return (
    <ThreadPrimitive.ScrollToBottom asChild>
      <TooltipIconButton
        tooltip="Scroll to bottom"
        variant="outline"
        className="aui-thread-scroll-to-bottom absolute -top-12 z-10 self-center rounded-full p-4 disabled:invisible dark:border-border dark:bg-background dark:hover:bg-accent"
      >
        <ArrowDownIcon />
      </TooltipIconButton>
    </ThreadPrimitive.ScrollToBottom>
  );
};

const ThreadWelcome: FC = () => {
  return (
    <div className="aui-thread-welcome-root mx-auto my-auto flex w-full max-w-(--thread-max-width) grow flex-col">
      <div className="aui-thread-welcome-center flex w-full grow flex-col items-center justify-center">
        <div className="aui-thread-welcome-message flex size-full flex-col justify-center px-4">
          <h1 className="aui-thread-welcome-message-inner fade-in slide-in-from-bottom-1 animate-in fill-mode-both font-semibold text-2xl duration-200">
            开始构建
          </h1>
          <p className="aui-thread-welcome-message-inner fade-in slide-in-from-bottom-1 animate-in fill-mode-both text-muted-foreground text-xl delay-75 duration-200">
            first_pi_agent
          </p>
        </div>
      </div>
    </div>
  );
};

const Composer: FC<ThreadResolvedProps> = ({
  attachments,
  isPickingFiles,
  onAttachFiles,
  onRemoveAttachment,
  currentModel,
  thinkingLevel,
  onModelChange,
  onThinkingLevelChange,
}) => {
  return (
    <ComposerPrimitive.Root className="aui-composer-root relative flex w-full flex-col">
      <div
        data-slot="composer-shell"
        className="flex w-full flex-col gap-2 rounded-(--composer-radius) border bg-background p-(--composer-padding) transition-shadow focus-within:border-ring/75 focus-within:ring-2 focus-within:ring-ring/20"
      >
        {attachments.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 px-1">
            {attachments.map((attachment) => (
              <span
                key={attachment.id}
                className="inline-flex max-w-52 items-center gap-1.5 rounded-full border border-border/50 bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground"
              >
                <PaperclipIcon className="size-3 shrink-0" />
                <span className="truncate">{attachment.name}</span>
                <button
                  type="button"
                  onClick={() => onRemoveAttachment(attachment.id)}
                  className="rounded-full p-0.5 transition hover:bg-black/5 hover:text-foreground"
                  aria-label={`移除 ${attachment.name}`}
                >
                  <XIcon className="size-3" />
                </button>
              </span>
            ))}
          </div>
        ) : null}

        <ComposerPrimitive.Input
          placeholder="向 Pi Agent 提问..."
          className="aui-composer-input max-h-32 min-h-10 w-full resize-none bg-transparent px-1.75 py-1 text-sm outline-none placeholder:text-muted-foreground/80"
          rows={1}
          autoFocus
          aria-label="消息输入框"
        />
        <ComposerAction
          isPickingFiles={isPickingFiles}
          onAttachFiles={onAttachFiles}
          currentModel={currentModel}
          thinkingLevel={thinkingLevel}
          onModelChange={onModelChange}
          onThinkingLevelChange={onThinkingLevelChange}
        />
      </div>
    </ComposerPrimitive.Root>
  );
};

type ComposerActionProps = Pick<
  ThreadResolvedProps,
  "isPickingFiles" | "onAttachFiles" | "currentModel" | "thinkingLevel" | "onModelChange" | "onThinkingLevelChange"
>;

const ComposerAction: FC<ComposerActionProps> = ({
  isPickingFiles,
  onAttachFiles,
  currentModel,
  thinkingLevel,
  onModelChange,
  onThinkingLevelChange,
}) => {
  return (
    <div className="aui-composer-action-wrapper relative flex items-center justify-between">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={onAttachFiles}
          disabled={isPickingFiles}
          className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="添加附件"
        >
          <PaperclipIcon className="size-4" />
        </button>
        <ModelSelector
          currentModel={currentModel}
          thinkingLevel={thinkingLevel}
          onModelChange={onModelChange}
          onThinkingLevelChange={onThinkingLevelChange}
        />
      </div>
      <AuiIf condition={(s) => !s.thread.isRunning}>
        <ComposerPrimitive.Send asChild>
          <TooltipIconButton
            tooltip="发送"
            side="bottom"
            type="button"
            variant="default"
            size="icon"
            className="aui-composer-send size-8 rounded-full"
            aria-label="Send message"
          >
            <ArrowUpIcon className="aui-composer-send-icon size-4" />
          </TooltipIconButton>
        </ComposerPrimitive.Send>
      </AuiIf>
      <AuiIf condition={(s) => s.thread.isRunning}>
        <ComposerPrimitive.Cancel asChild>
          <Button
            type="button"
            variant="default"
            size="icon"
            className="aui-composer-cancel size-8 rounded-full"
            aria-label="停止生成"
          >
            <SquareIcon className="aui-composer-cancel-icon size-3 fill-current" />
          </Button>
        </ComposerPrimitive.Cancel>
      </AuiIf>
    </div>
  );
};

const MessageError: FC = () => {
  return (
    <MessagePrimitive.Error>
      <ErrorPrimitive.Root className="aui-message-error-root mt-2 rounded-md border border-destructive bg-destructive/10 p-3 text-destructive text-sm dark:bg-destructive/5 dark:text-red-200">
        <ErrorPrimitive.Message className="aui-message-error-message line-clamp-2" />
      </ErrorPrimitive.Root>
    </MessagePrimitive.Error>
  );
};

const AssistantMessage: FC = () => {
  return (
    <MessagePrimitive.Root
      className="aui-assistant-message-root fade-in slide-in-from-bottom-1 relative mx-auto w-full max-w-(--thread-max-width) animate-in py-3 duration-150"
      data-role="assistant"
    >
      <div className="aui-assistant-message-content wrap-break-word px-2 text-foreground leading-relaxed">
        <MessagePrimitive.Parts>
          {({ part }) => {
            if (part.type === "text") return <MarkdownText />;
            if (part.type === "reasoning") {
              return (
                <div className="mb-2 rounded-xl border border-dashed border-border/60 bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                  {part.text}
                </div>
              );
            }
            if (part.type === "tool-call")
              return part.toolUI ?? <ToolFallback {...part} />;
            return null;
          }}
        </MessagePrimitive.Parts>
        <MessageError />
      </div>

      <div className="aui-assistant-message-footer mt-1 ml-2 flex min-h-6 items-center">
        <AssistantActionBar />
      </div>
    </MessagePrimitive.Root>
  );
};

const AssistantActionBar: FC = () => {
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      className="aui-assistant-action-bar-root -ml-1 flex gap-1 text-muted-foreground"
    >
      <ActionBarPrimitive.Copy asChild>
        <TooltipIconButton tooltip="复制">
          <AuiIf condition={(s) => s.message.isCopied}>
            <CheckIcon />
          </AuiIf>
          <AuiIf condition={(s) => !s.message.isCopied}>
            <CopyIcon />
          </AuiIf>
        </TooltipIconButton>
      </ActionBarPrimitive.Copy>
    </ActionBarPrimitive.Root>
  );
};

const UserMessage: FC = () => {
  return (
    <MessagePrimitive.Root
      className="aui-user-message-root fade-in slide-in-from-bottom-1 mx-auto grid w-full max-w-(--thread-max-width) animate-in auto-rows-auto grid-cols-[minmax(72px,1fr)_auto] content-start gap-y-2 px-2 py-3 duration-150 [&:where(>*)]:col-start-2"
      data-role="user"
    >
      <div className="aui-user-message-content-wrapper relative col-start-2 min-w-0">
        <div className="aui-user-message-content wrap-break-word peer rounded-2xl bg-muted px-4 py-2.5 text-foreground empty:hidden">
          <MessagePrimitive.Parts />
        </div>
      </div>
    </MessagePrimitive.Root>
  );
};
