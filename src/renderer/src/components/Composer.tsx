import { useLayoutEffect, useRef } from "react";
import { ChevronDownIcon, PaperAirplaneIcon, PaperClipIcon, XMarkIcon } from "@heroicons/react/24/outline";
import type { SelectedFile } from "@shared/contracts";

type ComposerProps = {
  draft: string;
  attachments: SelectedFile[];
  isSending: boolean;
  isPickingFiles: boolean;
  onDraftChange: (draft: string) => void;
  onAttachFiles: () => void;
  onRemoveAttachment: (attachmentId: string) => void;
  onSend: () => void;
};

export function Composer({
  draft,
  attachments,
  isSending,
  isPickingFiles,
  onDraftChange,
  onAttachFiles,
  onRemoveAttachment,
  onSend,
}: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;

    if (!textarea) {
      return;
    }

    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 240)}px`;
  }, [draft]);

  return (
    <section className="px-8 pb-6 pt-2">
      <div className="mx-auto max-w-4xl rounded-[30px] border border-black/8 bg-white/92 px-5 py-4 shadow-[0_16px_44px_rgba(99,117,145,0.16)]">
        {attachments.length > 0 ? (
          <div className="mb-3 flex flex-wrap gap-2">
            {attachments.map((attachment) => (
              <span
                key={attachment.id}
                className="inline-flex items-center gap-2 rounded-full border border-black/8 bg-white px-3 py-1.5 text-xs text-shell-300"
              >
                <PaperClipIcon className="h-4 w-4 text-accent-500" />
                <span className="max-w-40 truncate">{attachment.name}</span>
                <button
                  type="button"
                  onClick={() => onRemoveAttachment(attachment.id)}
                  className="rounded-full p-0.5 text-shell-500 transition hover:bg-accent-500/8 hover:text-shell-100"
                >
                  <XMarkIcon className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
          </div>
        ) : null}

        <textarea
          ref={textareaRef}
          rows={1}
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              onSend();
            }
          }}
          placeholder="给 first_pi_agent 发一条消息，或者附加一些本地文件…"
          className="max-h-60 w-full resize-none border-none bg-transparent text-[15px] leading-8 text-shell-100 outline-none placeholder:text-shell-500"
        />

        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button type="button" onClick={onAttachFiles} className="composer-ghost-button" disabled={isPickingFiles}>
              <PaperClipIcon className="h-4 w-4" />
              {isPickingFiles ? "读取中…" : "添加文件"}
            </button>
            <span className="hidden text-xs text-shell-500 md:inline">Enter 发送，Shift + Enter 换行</span>
          </div>

          <button
            type="button"
            onClick={onSend}
            disabled={isSending || (!draft.trim() && attachments.length === 0)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-shell-100 text-white transition hover:bg-accent-500 disabled:cursor-not-allowed disabled:bg-shell-700 disabled:text-shell-500"
          >
            <PaperAirplaneIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-black/6 pt-3">
          <span className="status-pill">
            GPT-5.4
            <ChevronDownIcon className="h-3.5 w-3.5" />
          </span>
          <span className="status-pill">
            自动
            <ChevronDownIcon className="h-3.5 w-3.5" />
          </span>
          <span className="status-pill">首选文件 `config.toml`</span>
          <span className="ml-auto text-xs text-shell-500">main</span>
        </div>
      </div>
    </section>
  );
}
