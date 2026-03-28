import { ChevronDownIcon, CloudIcon } from "@heroicons/react/24/outline";
import type { ChatMessage } from "@shared/contracts";
import { formatTime } from "@renderer/lib/session";

type MessageListProps = {
  messages: ChatMessage[];
};

export function MessageList({ messages }: MessageListProps) {
  if (messages.length === 0) {
    return (
      <section className="flex min-h-full flex-col items-center justify-center px-12 py-10">
        <div className="flex max-w-4xl flex-col items-center text-center">
          <div className="grid h-16 w-16 place-items-center rounded-full border border-black/6 bg-[#f3f6fb] text-shell-500">
            <CloudIcon className="h-8 w-8" />
          </div>
          <h2 className="mt-6 text-[34px] font-semibold tracking-[-0.03em] text-shell-100">Let&apos;s build</h2>
          <button
            type="button"
            className="mt-4 inline-flex items-center gap-1 rounded-full border border-black/8 bg-white/80 px-3 py-1.5 text-sm text-shell-500"
          >
            first_pi_agent
            <ChevronDownIcon className="h-4 w-4" />
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-12 py-10">
      {messages.map((message) => {
        if (message.role === "system") {
          return (
            <div key={message.id} className="rounded-2xl border border-amber-400/25 bg-amber-100 px-4 py-3 text-sm text-amber-900">
              {message.content}
            </div>
          );
        }

        const isUser = message.role === "user";

        return (
          <article key={message.id} className="max-w-4xl">
            <div className="mb-3 flex items-center gap-3 text-[11px] uppercase tracking-[0.22em] text-shell-500">
              <span>{isUser ? "You" : "Assistant"}</span>
              <span className="tracking-normal">{formatTime(message.timestamp)}</span>
            </div>
            {isUser ? (
              <div className="inline-flex rounded-2xl border border-accent-400/20 bg-accent-500/8 px-4 py-3 text-sm leading-7 text-shell-200">
                {message.content}
              </div>
            ) : (
              <div className="text-[15px] leading-8 text-shell-200">
                <p className="whitespace-pre-wrap">{message.content}</p>
              </div>
            )}
          </article>
        );
      })}
    </section>
  );
}
