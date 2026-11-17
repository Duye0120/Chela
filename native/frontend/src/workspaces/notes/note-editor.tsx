import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { ArrowDown, ArrowUp, Copy, GripVertical, Plus, Trash2 } from "lucide-react";
import { IconButton } from "../../ui/icon-button";
import { Textarea } from "../../ui/text-field";
import * as Menu from "../../ui/menu";
import type { WorkNote } from "../../data/work";
import { blocksFromMarkdown } from "../../ui/markdown";
import { BlockView } from "./markdown";

export type NoteTarget = { id: string; title: string; kind: "note" | "chat" | "task"; detail: string };

export function noteLinks(content: string) {
  return [...content.matchAll(/\[\[([^\]\n]+)\]\]/g)].map(match => {
    const [id, ...label] = match[1].split("|");
    return { id: id.trim(), title: label.join("|").trim() || id.trim() };
  });
}

const commands = [
  { title: "待办列表（To-do）", hint: "[]", value: "- [ ] " },
  { title: "二级标题（H2）", hint: "##", value: "## " },
  { title: "引用块（Quote）", hint: ">", value: "> " },
  { title: "提示框（Callout）", hint: "!", value: "> [!NOTE] " },
  { title: "代码块（Code）", hint: "```", value: "```\n\n```" },
  { title: "关联对话卡片", hint: "↗", value: "chat" },
  { title: "转入任务看板", hint: "→", value: "task" },
] as const;

export function NoteEditor({ content, onChange, notes, targets, onOpen, onCreateTask, onError }: {
  content: string; onChange: (value: string) => void; notes: WorkNote[]; targets: NoteTarget[];
  onOpen: (id: string) => void; onCreateTask: (text: string) => void; onError: (message: string) => void;
}) {
  const blocks = blocksFromMarkdown(content);
  const [active, setActive] = useState<number | null>(null);
  const [caret, setCaret] = useState(0);
  const [choice, setChoice] = useState(0);
  const [targetKind, setTargetKind] = useState<"chat" | "task" | null>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const focusPosition = useRef<number | null>(null);
  const current = active === null ? "" : blocks[active] || "";
  const link = current.slice(0, caret).match(/\[\[([^\]\n]*)$/);
  const slash = current.match(/^\/([^\n]*)$/);
  const linkQuery = (link?.[1] || "").toLocaleLowerCase();
  const suggestions = targets.filter(target => targetKind ? target.kind === targetKind : target.kind === "note")
    .filter(target => target.title.toLocaleLowerCase().includes(linkQuery)).slice(0, 8);
  const slashItems = commands.filter(command => command.title.toLocaleLowerCase().includes((slash?.[1] || "").toLocaleLowerCase()));
  const open = Boolean(link || slash || targetKind);
  const total = slash && !targetKind ? slashItems.length : suggestions.length;

  useLayoutEffect(() => {
    const input = field.current;
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${input.scrollHeight}px`;
    if (focusPosition.current !== null) {
      input.focus();
      input.setSelectionRange(focusPosition.current, focusPosition.current);
      setCaret(focusPosition.current);
      focusPosition.current = null;
    }
  }, [content, active]);

  function changeBlock(index: number, value: string) {
    const next = [...blocks];
    next[index] = value;
    onChange(next.join("\n"));
  }

  function choose(index: number) {
    if (active === null) return;
    if (slash && !targetKind) {
      const command = slashItems[index];
      if (!command) return;
      if (command.value === "chat") { setTargetKind("chat"); return; }
      if (command.value === "task") { onCreateTask(""); changeBlock(active, ""); return; }
      changeBlock(active, command.value);
      focusPosition.current = command.value.startsWith("```") ? 4 : command.value.length;
    } else {
      const target = suggestions[index];
      if (!target) return;
      const value = target.kind === "note" ? `[[${target.id}|${target.title.replaceAll("]]", "")}]]`
        : `[${target.title.replaceAll("]", "")}](#${target.kind === "chat" ? "chat" : "board"}/${encodeURIComponent(target.id)})`;
      const from = link ? caret - link[0].length : 0;
      const after = current.slice(caret).startsWith("]]") ? caret + 2 : caret;
      changeBlock(active, current.slice(0, from) + value + (targetKind ? "" : current.slice(after)));
      focusPosition.current = from + value.length;
    }
    setTargetKind(null);
    setChoice(0);
  }

  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>, index: number) {
    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
    if (open && ["ArrowDown", "ArrowUp"].includes(event.key)) {
      event.preventDefault();
      setChoice(value => total ? (value + (event.key === "ArrowDown" ? 1 : -1) + total) % total : 0);
      return;
    }
    if (event.key === "Escape") { event.preventDefault(); setTargetKind(null); setActive(null); return; }
    if (open && event.key === "Enter" && !event.shiftKey) { event.preventDefault(); choose(Math.min(choice, Math.max(0, total - 1))); return; }
    if (event.key === "Enter" && !event.shiftKey && !/^\s*(`{3,}|~{3,})/.test(current)) {
      event.preventDefault();
      const start = event.currentTarget.selectionStart;
      const end = event.currentTarget.selectionEnd;
      const next = [...blocks];
      const prefix = current.match(/^(?:[-*] \[[ xX]\] |[-*] |> )/)?.[0].replace(/\[[xX]\]/, "[ ]") || "";
      next.splice(index, 1, current.slice(0, start), prefix + current.slice(end));
      onChange(next.join("\n"));
      setActive(index + 1); focusPosition.current = prefix.length;
    }
    if (event.key === "Backspace" && index > 0 && event.currentTarget.selectionStart === 0 && event.currentTarget.selectionEnd === 0) {
      event.preventDefault();
      const next = [...blocks];
      const position = next[index - 1].length;
      next.splice(index - 1, 2, next[index - 1] + next[index]);
      onChange(next.join("\n")); setActive(index - 1); focusPosition.current = position;
    }
  }

  function move(index: number, direction: number) {
    const next = [...blocks];
    [next[index], next[index + direction]] = [next[index + direction], next[index]];
    onChange(next.join("\n")); setActive(index + direction); focusPosition.current = 0;
  }

  return <div className="notes-blocks" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) { setActive(null); setTargetKind(null); }
  }}>
    {blocks.map((value, index) => <div className="notes-block" key={index} data-editing={active === index} data-empty={!value}>
      <div className="notes-block-tools"><Menu.Root><Menu.Trigger asChild><IconButton aria-label={`第 ${index + 1} 块操作`}><GripVertical size={14} /></IconButton></Menu.Trigger>
        <Menu.Content align="start" className="notes-block-menu">
          <Menu.Item disabled={index === 0} onSelect={() => move(index, -1)}><ArrowUp />上移</Menu.Item>
          <Menu.Item disabled={index === blocks.length - 1} onSelect={() => move(index, 1)}><ArrowDown />下移</Menu.Item>
          <Menu.Item onSelect={() => { void navigator.clipboard.writeText(value).catch(cause => onError(String(cause))); }}><Copy />复制此块</Menu.Item>
          <Menu.Item onSelect={() => onCreateTask(value.replace(/^[-*] \[[ xX]\]\s*/, ""))}><Plus />转入任务看板</Menu.Item>
          <Menu.Separator /><Menu.Item className="notes-danger" onSelect={() => { onChange(blocks.filter((_, item) => item !== index).join("\n")); setActive(null); }}><Trash2 />删除此块</Menu.Item>
        </Menu.Content>
      </Menu.Root></div>
      {active === index ? <Textarea ref={field} className="notes-block-input" rows={1} value={value} aria-label={`编辑第 ${index + 1} 个 Markdown 块`}
        autoFocus placeholder="输入 “/” 插入块，输入 “[[” 引用页面…"
        onSelect={event => setCaret(event.currentTarget.selectionStart)}
        onChange={event => { changeBlock(index, event.target.value); setCaret(event.target.selectionStart); setChoice(0); setTargetKind(null); }}
        onKeyDown={event => keyDown(event, index)} />
        : <div className="notes-block-body" tabIndex={0} role="group" aria-label={`第 ${index + 1} 块，回车编辑`}
          onClick={event => { if ((event.target as HTMLElement).closest("button,a,input")) return; setActive(index); focusPosition.current = value.length; }}
          onKeyDown={event => { if (event.target === event.currentTarget && event.key === "Enter") { event.preventDefault(); setActive(index); focusPosition.current = value.length; } }}>
          <BlockView value={value} notes={notes} onOpen={onOpen} onToggle={() => changeBlock(index, value.replace(/\[([ xX])\]/, (_, done: string) => done === " " ? "[x]" : "[ ]"))} />
          {!value && index === blocks.length - 1 && <span className="notes-block-placeholder">输入 “/” 插入标题、待办、代码块、引用或关联对话…</span>}
        </div>}
      {active === index && open && <div className="notes-suggestions" role="listbox" aria-label={slash && !targetKind ? "插入块" : "引用页面、对话或任务"}>
        <small>{slash && !targetKind ? "插入块（/）" : targetKind === "chat" ? "关联历史对话" : "引用页面（[[）"}</small>
        {slash && !targetKind ? slashItems.map((command, item) => <button key={command.title} type="button" role="option" aria-selected={choice === item}
          onMouseDown={event => event.preventDefault()} onClick={() => choose(item)}><span>{command.title}</span><kbd>{command.hint}</kbd></button>)
          : suggestions.map((target, item) => <button key={target.kind + target.id} type="button" role="option" aria-selected={choice === item}
            onMouseDown={event => event.preventDefault()} onClick={() => choose(item)}><span>{target.title}</span><small>{target.detail}</small></button>)}
        {total === 0 && <p>没有匹配的{targetKind === "chat" ? "历史对话" : "页面"}</p>}
      </div>}
    </div>)}
    <IconButton className="notes-add-block" aria-label="添加内容块" onClick={() => { onChange(content + (content ? "\n" : "")); setActive(content ? blocks.length : 0); focusPosition.current = 0; }}><Plus size={14} /></IconButton>
  </div>;
}
