import { useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "../../ui/button";
import { IconButton } from "../../ui/icon-button";
import type { ChatSession, ChatMessage } from "../../data/chat";
import { useBranches } from "../../state/chat-actions";
import { setError } from "../../state/chat";
import { MemoryPanel } from "./memory-panel";
import { ModelSettings } from "./model-settings";

type Props = { session?: ChatSession; modelLabel?: string; last?: ChatMessage; blocked: boolean; onClose: () => void; onCompact: () => void; onBranch: (id: string) => void; onModelsSaved: () => Promise<void> };
export function ChatInfoPanel({session,modelLabel,last,blocked,onClose,onCompact,onBranch,onModelsSaved}: Props) {
  const { items: branches, error } = useBranches(session, true);
  useEffect(() => { if (error) setError(error); }, [error]);
  return <aside className="chat-info" aria-label="对话信息"><header><strong>对话信息</strong><IconButton aria-label="关闭对话信息" onClick={()=>onClose()}><X size={14}/></IconButton></header>
        <dl><dt>当前模型</dt><dd>{modelLabel || "未配置"}</dd><dt>上下文</dt><dd>{last?.tokens ? `${last.tokens.toLocaleString()} / ${last.limit?.toLocaleString()} tokens` : "尚无用量记录"}</dd><dt>消息</dt><dd>{session?.messages.length||0} 条</dd></dl>
        <Button disabled={blocked} onClick={onCompact}>整理上下文</Button>
        {branches.length>1 && <label>对话分支<select className="ui-field" value={branches.find(branch => branch.current)?.id} disabled={blocked} onChange={event => onBranch(event.target.value)}>
          {branches.map((branch,index) => <option key={branch.id} value={branch.id}>{branch.parent ? `分支 ${index}` : "原始分支"}</option>)}
        </select></label>}
        {session&&<MemoryPanel key={session.id} session={session}/>}<ModelSettings onSaved={onModelsSaved}/></aside>;
}
