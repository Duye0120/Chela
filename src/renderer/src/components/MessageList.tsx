import type { ChatMessage } from "@shared/contracts";
import { formatTime } from "@renderer/lib/session";

type MessageListProps = {
  messages: ChatMessage[];
};

export function MessageList({ messages }: MessageListProps) {
  if (messages.length === 0) {
    return (
      <section className="px-12 py-10">
        <div className="mx-auto max-w-4xl">
          <p className="text-xs uppercase tracking-[0.28em] text-shell-500">Chat</p>
          <h2 className="mt-4 text-[34px] font-semibold tracking-[-0.03em] text-shell-100">新的聊天</h2>
          <div className="mt-8 space-y-7 text-[15px] leading-8 text-shell-300">
            <p>这里现在是一个更偏聊天体验的工作台，不再强调开发或工作区概念，只保留你喜欢的那种界面气质。</p>
            <div>
              <p className="mb-2 font-medium text-shell-200">你可以直接开始聊天：</p>
              <ul className="space-y-2 pl-5 text-shell-300">
                <li>• 支持多会话切换</li>
                <li>• 支持本地附件与预览</li>
                <li>• 支持草稿恢复与历史保留</li>
              </ul>
            </div>
            <div className="rounded-3xl border border-black/6 bg-white/78 p-5 shadow-[0_8px_24px_rgba(90,109,139,0.08)]">
              <p className="text-sm leading-7 text-shell-300">从左上角点一次“新线程”就够了，其他多余入口我已经继续收掉。</p>
            </div>
            <div className="rounded-3xl border border-black/6 bg-white/78 p-5 shadow-[0_8px_24px_rgba(90,109,139,0.08)]">
              <p className="text-sm leading-7 text-shell-300">如果你后面想继续往图片里那个感觉靠，我会优先继续收窄顶部工具条、弱化右侧面板、再压低左侧信息密度。</p>
            </div>
          </div>
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
