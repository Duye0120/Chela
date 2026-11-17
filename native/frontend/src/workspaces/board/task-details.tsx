import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { workApi, type WorkTask } from "../../data/work";
import { Button } from "../../ui/button";
import { IconButton } from "../../ui/icon-button";
import { Markdown } from "../../ui/markdown";
import "../notes/notes.css";

export function TaskDetails({ task, busy, onClose, onEdit, onComplete }: { task: WorkTask; busy: boolean; onClose: () => void; onEdit: () => void; onComplete: () => void }) {
  const [details, setDetails] = useState<Awaited<ReturnType<typeof workApi.details>> | null>(null), [error, setError] = useState("");
  useEffect(() => { let current = true; setDetails(null); setError(""); void workApi.details(task.id).then(value => { if (current) setDetails(value); }).catch(cause => { if (current) setError(String(cause)); }); return () => { current = false; }; }, [task.id, task.revision]);
  const executor = details?.executor === "terminal" ? "PowerShell" : details?.executor === "Chela" ? "Chela 对话" : details?.executor === "codex" ? "Codex CLI" : details?.executor === "opencode" ? "OpenCode" : "未关联执行工具";
  const target = details?.sessionId ? `#chat/${encodeURIComponent(details.sessionId)}` : details?.terminalId ? `#terminal/session/${encodeURIComponent(details.terminalId)}` : `#terminal/${encodeURIComponent(task.id)}`;
  return <section className="board-detail board-task-details" aria-label="任务详情">
    <header><span className="board-id" title={task.id}>{task.id.length > 14 ? task.id.slice(0, 8) : task.id}</span><span className="board-badge" data-tone={task.status === "进行中" ? "success" : "neutral"}>{task.status}</span><Button variant="ghost" onClick={onEdit}>编辑</Button><IconButton aria-label="关闭任务详情" onClick={onClose}><X size={14} /></IconButton></header>
    <div className="board-details-content"><h2>{task.title}</h2><dl>
      <dt>状态</dt><dd><span className="board-badge" data-tone={task.status === "进行中" ? "success" : "neutral"}>{task.status}</span></dd>
      <dt>所属项目</dt><dd>{task.project || "未关联项目"}</dd>
      <dt>工作目录</dt><dd title={details?.workspace}>{details?.workspace || "未关联目录"}</dd>
      <dt>执行工具</dt><dd>{executor}{details?.state === "exited" || details?.state === "interrupted" ? " · 已结束" : ""}</dd>
      <dt>时间</dt><dd>{task.dueDate ? `截止 ${task.dueDate}` : task.dueLocal || "未设截止日"}{details?.updatedAt && ` · 更新于 ${new Date(details.updatedAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}`}</dd>
    </dl><section className="board-details-progress"><h3>验收条件与最近进展</h3>{task.description ? <Markdown content={task.description} /> : <p>暂无补充说明，可通过“编辑”记录验收条件。</p>}</section>{error && <p role="alert" className="board-error">{error}<Button onClick={onEdit}>查看任务内容</Button></p>}</div>
    <footer><a href={target} className="ui-button" data-variant="primary">{details?.sessionId ? "查看关联对话" : details?.terminalId ? "返回原终端" : "打开关联终端"}</a>{task.status !== "已完成" && task.status !== "已归档" && <Button variant="ghost" disabled={busy} onClick={onComplete}>标记完成</Button>}<small>查看回复后任务继续，完成后再标记。</small></footer>
  </section>;
}
