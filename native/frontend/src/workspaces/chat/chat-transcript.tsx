import type { RefObject } from "react";
import { ArrowDown, Copy, RotateCcw, ShieldAlert, SquarePen } from "lucide-react";
import { Button } from "../../ui/button";
import { IconButton } from "../../ui/icon-button";
import { Markdown } from "../../ui/markdown";
import type { ChatSession, ChatMessage, ChatRun, ChatProgress, ChatSnapshot } from "../../data/chat";
import { ContextChips } from "./context-chips";
import { ToolActivities } from "./tool-activity";
import { Thought } from "./thought";

type Props = {
  session?: ChatSession; selectedId: string | null; running: boolean; activeRun?: ChatRun;
  pending: ChatProgress[string] | null; approvals: NonNullable<ChatSnapshot["approvals"]>; queuedRuns: ChatRun[];
  busy: boolean; editing: boolean; hasModel: boolean; history: RefObject<HTMLDivElement | null>;
  latestHidden: boolean; viewLatest: () => void; openDiff: (path: string) => void;
  onEdit: (message: ChatMessage) => void; onCopy: (text: string) => void; onRegenerate: (id: string) => void;
  onApproval: (id: string, approved: boolean) => void; onAllowSession: (id: string) => void;
};
export function ChatTranscript({session,selectedId,running,activeRun,pending,approvals,queuedRuns,busy,editing,hasModel,history,latestHidden,viewLatest,openDiff,onEdit,onCopy,onRegenerate,onApproval,onAllowSession}: Props) {
  return <div className="chat-reading"><div className="chat-history" ref={history} role="log" aria-label="对话消息" aria-live="polite">
          <div className="chat-message-list">{session?.messages.filter(message => message.content || message.thinking || message.tools?.length).map((message, index) => <article className="chat-message" data-role={message.role} key={message.id || index}
            data-message-id={message.id} aria-label={message.role === "user" ? "你" : "Chela"}>{message.thinking && <Thought text={message.thinking}/>}{!!message.tools?.length&&<ToolActivities items={message.tools}/>} {message.role === "assistant" ? <Markdown content={message.content} onDiff={openDiff} /> : <div className="chat-user-text">{message.content}</div>}
            {message.delivery==="queued" && <small role="status">等待补充到本轮</small>}{message.delivery==="cancelled" && <small role="status">本轮结束前未处理，请重新发送</small>}
            {!!message.attachments?.length && selectedId && <ContextChips items={message.attachments} session={selectedId} message={message.id} />}
            <div className="chat-message-actions">{message.role==="user" && <IconButton aria-label="编辑消息并建立分支" tooltip="编辑重发" disabled={busy||running||!!queuedRuns.length||editing} onClick={()=>onEdit(message)}><SquarePen size={14}/></IconButton>}
            <IconButton aria-label={message.role==="assistant"?"复制回复":"复制消息"} tooltip="复制" onClick={()=>onCopy(message.content)}><Copy size={14}/></IconButton>
            {message.role==="assistant"&&<IconButton aria-label="重新生成回复" tooltip="重新生成" disabled={busy||running||!!queuedRuns.length||editing||!hasModel} onClick={()=>onRegenerate(message.id)}><RotateCcw size={14}/></IconButton>}</div></article>)}
            {running && <><article className="chat-message" data-role="assistant">{pending?.thinking && <Thought running text={pending.thinking}/>}{pending?.text ? <Markdown content={pending.text} onDiff={openDiff} /> : <span className="chat-sending">{activeRun?.state === "waiting_approval" ? "等待你的确认…" : "正在回复…"}</span>}</article></>}
            {approvals.map(approval => <section className="chat-approval" key={approval.id} aria-label="工具执行确认">
              <header><ShieldAlert size={16}/><strong>{approval.title}</strong><small>等待批准</small></header>{approval.preview.length<1000?<pre className="chat-approval-preview">{approval.preview}</pre>:<details><summary>查看操作内容</summary><pre className="chat-approval-preview">{approval.preview}</pre></details>}<footer><small title={approval.description}>来自权限策略：请求批准</small>
              <Button disabled={busy} onClick={() => onApproval(approval.id, false)}>拒绝</Button>
              {approval.canAllowSession && <Button disabled={busy} title="本次启动期间，仅此会话的当前工作区文件写入；不包含外部服务" onClick={()=>onAllowSession(approval.id)}>本会话允许</Button>}
              <Button variant="primary" disabled={busy} onClick={() => onApproval(approval.id, true)}>批准执行</Button>
            </footer></section>)}
          </div><div className="chat-reading-space" aria-hidden="true"/>
        </div>{latestHidden&&<Button className="chat-view-latest" onClick={viewLatest}><ArrowDown size={14}/>{running?"有新回复内容":"查看最新回复"}</Button>}</div>;
}
