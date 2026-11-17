import { useState, type ReactNode } from "react";
import { Copy, Link2, Zap } from "lucide-react";
import { IconButton } from "./icon-button";
import "./markdown.css";

type MarkdownLinks = { resolveLink?: (reference: string) => { id: string; title: string } | undefined; onOpen?: (id: string) => void };

export function blocksFromMarkdown(content: string) {
  const blocks: string[] = [];
  let fence = "";
  for (const line of content.split("\n")) {
    if (fence) {
      blocks[blocks.length - 1] += "\n" + line;
      if (line.trimStart().startsWith(fence)) fence = "";
    } else {
      blocks.push(line);
      const start = line.match(/^\s*(`{3,}|~{3,})/);
      if (start) fence = start[1];
    }
  }
  return blocks.length ? blocks : [""];
}

export function InlineMarkdownText({ text, resolveLink, onOpen }: { text: string } & MarkdownLinks) {
  const pieces: ReactNode[] = [];
  let end = 0;
  for (const match of text.matchAll(/\[\[([^\]\n]+)\]\]|\*\*([^*\n]+)\*\*|`([^`\n]+)`|\[([^\]\n]+)\]\(([^\s)]+)\)/g)) {
    pieces.push(text.slice(end, match.index));
    if (!match[1]) {
      pieces.push(match[2] ? <strong key={match.index}>{match[2]}</strong> : match[3] ? <code key={match.index}>{match[3]}</code> : /^(https?:\/\/|#)/i.test(match[5]) ? <a key={match.index} href={match[5]} target={match[5].startsWith("#") ? undefined : "_blank"} rel="noreferrer">{match[4]}</a> : match[0]);
      end = match.index + match[0].length; continue;
    }
    const [id, ...alias] = match[1].split("|");
    const target = resolveLink?.(id.trim());
    pieces.push(<button key={match.index} type="button" className="notes-wikilink" disabled={!target}
      title={target ? `打开 ${target.title}` : "引用的页面不存在"} onClick={() => target && onOpen?.(target.id)}>
      {target?.title || alias.join("|") || id}<span aria-hidden="true"> ↗</span>
    </button>);
    end = match.index + match[0].length;
  }
  pieces.push(text.slice(end));
  return <>{pieces}</>;
}

export function MarkdownBlock({ value, resolveLink, onOpen, onToggle, onDiff }: {
  value: string; onToggle?: () => void; onDiff?: (path: string) => void;
} & MarkdownLinks) {
  const inline = (text: string) => <InlineMarkdownText text={text} resolveLink={resolveLink} onOpen={onOpen} />;
  const task = value.match(/^\s*[-*] \[([ xX])\]\s?(.*)$/s);
  if (task) return <div className="notes-todo" data-done={task[1].toLowerCase() === "x"}>
    <input type="checkbox" aria-label={`完成 ${task[2] || "待办"}`} checked={task[1].toLowerCase() === "x"} disabled={!onToggle}
      onClick={event => event.stopPropagation()} onChange={onToggle} /><span>{inline(task[2])}</span>
  </div>;
  const heading = value.match(/^(#{1,3})\s+(.*)$/s);
  if (heading) return <div className={`notes-heading notes-h${heading[1].length}`}>{inline(heading[2])}</div>;
  const code = value.match(/^\s*(`{3,}|~{3,})([^\n]*)\n?([\s\S]*)$/);
  if (code) return <CodeBlock language={code[2]} content={code[3].replace(/\n\s*(`{3,}|~{3,})\s*$/, "")} onDiff={onDiff} />;
  if (/^>\s?\[!NOTE\]/.test(value)) return <div className="notes-callout"><Zap size={15} /><span>{inline(value.replace(/^>\s?\[!NOTE\]\s?/, ""))}</span></div>;
  if (/^>\s?/.test(value)) return <blockquote>{inline(value.replace(/^>\s?/, ""))}</blockquote>;
  const route = value.match(/^\[([^\]]+)\]\(#(chat|board)\/([^)]*)\)$/);
  if (route) return <a className="notes-linked-card" href={`#${route[2]}/${route[3]}`}><Link2 size={14} />{route[1]}<span>↗</span></a>;
  if (/^---+$/.test(value)) return <hr />;
  const list = value.match(/^\s*(?:([-*+])|\d+\.)\s+(.*)$/s);
  if (list) return list[1] ? <ul><li>{inline(list[2])}</li></ul> : <ol start={Number.parseInt(value)}><li>{inline(list[2])}</li></ol>;
  return <div className="notes-paragraph">{inline(value) || "\u00a0"}</div>;
}

function CodeBlock({ language, content, onDiff }: { language: string; content: string;onDiff?:(path:string)=>void }) {
  const [status, setStatus] = useState("");
  const diff = /^diff\b/.test(language), lines = content.split("\n");
  const filename = language.replace(/^diff\s*/, "") || content.match(/^\+\+\+ (?:b\/)?(.+)$/m)?.[1] || "文件变更";
  return <div className="notes-code" data-diff={diff}><header><small>{diff ? filename : language || "代码"}</small>{diff && <span><b>+{lines.filter(line => line.startsWith("+") && !line.startsWith("+++")).length}</b><i>−{lines.filter(line => line.startsWith("-") && !line.startsWith("---")).length}</i></span>}{diff&&onDiff&&filename!=="文件变更"&&<button type="button" className="notes-diff-open" onClick={()=>onDiff(filename.replace(/^b\//,""))}>右栏查看 ↗</button>}<IconButton aria-label="复制代码" onClick={() => void navigator.clipboard.writeText(content).then(() => setStatus("已复制")).catch(() => setStatus("复制失败，请手动选择代码"))}><Copy size={13} /></IconButton></header><pre>{diff ? lines.map((line, index) => <code key={index} data-change={line.startsWith("+") && !line.startsWith("+++") ? "added" : line.startsWith("-") && !line.startsWith("---") ? "removed" : undefined}>{line}{index < lines.length - 1 ? "\n" : ""}</code>) : content}</pre>{status && <small role="status">{status}</small>}</div>;
}

export function Markdown({ content, resolveLink, onOpen, onDiff }: { content: string; onDiff?: (path: string) => void } & MarkdownLinks) {
  return <div className="notes-markdown">{blocksFromMarkdown(content).map((value, index) => <MarkdownBlock key={index} value={value} resolveLink={resolveLink} onOpen={onOpen} onDiff={onDiff} />)}</div>;
}
