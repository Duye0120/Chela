import { useEffect, useId, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Check, ChevronDown, RotateCcw } from "lucide-react";
import { Button } from "../../ui/button";
import { IconButton } from "../../ui/icon-button";
import { Input } from "../../ui/text-field";
import { Select } from "../../ui/select";
import { Row } from "./settings-controls";
import type { Appearance } from "./appearance";
import "./typography-settings.css";

const monoFonts = ["Maple Mono NF CN", "JetBrains Mono", "Cascadia Code", "Consolas", "Courier New"];
const uiFonts = ["Inter", "Noto Sans SC", "Microsoft YaHei UI", "Segoe UI", "Arial"];
let installedFonts: Promise<string[]> | undefined;

function discoverFonts() {
  const api = window as Window & { queryLocalFonts?: () => Promise<{ family: string }[]> };
  return installedFonts ??= api.queryLocalFonts
    ? api.queryLocalFonts().then(fonts => [...new Set(fonts.map(font => font.family))].sort((a, b) => a.localeCompare(b)))
    : Promise.reject(Error("当前环境不支持读取系统字体"));
}

function FontFamilyPicker({ label, value, monospace, onChange }: { label: string; value: string; monospace: boolean; onChange: (font: string) => void }) {
  const [open, setOpen] = useState(false), [query, setQuery] = useState(""), [active, setActive] = useState(0);
  const [families, setFamilies] = useState<string[]>([]), [status, setStatus] = useState("");
  const listId = useId();
  const choices = [...new Set([value, ...(monospace ? monoFonts : ["system", ...uiFonts]), ...families])]
    .filter(font => (font === "system" ? "系统默认 Inter 中文" : font).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const title = value === "system" ? "Inter · 系统中文" : value;
  function changeOpen(next: boolean) {
    setOpen(next);
    if (!next) return;
    setQuery(""); setActive(0); setStatus("正在读取系统字体…");
    void discoverFonts().then(fonts => {
      const context = document.createElement("canvas").getContext("2d");
      setFamilies(monospace && context ? fonts.filter(font => {
        context.font = `16px ${JSON.stringify(font)}, monospace`;
        return Math.abs(context.measureText("iiiiiiii").width - context.measureText("WWWWWWWW").width) < .1;
      }) : fonts);
      setStatus("");
    }).catch(() => setStatus("无法读取系统字体，可继续选择常用字体"));
  }
  function select(font: string) { onChange(font); setOpen(false); }
  useEffect(() => { if (open) document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: "nearest" }); }, [open, active, listId]);
  return <Popover.Root open={open} onOpenChange={changeOpen}>
    <Popover.Trigger asChild><Button className="settings-font-trigger" aria-label={label} title={title} onKeyDown={event => { if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); changeOpen(true); } }}><span>{title}</span><ChevronDown size={14} /></Button></Popover.Trigger>
    <Popover.Portal><Popover.Content className="ui-picker settings-font-picker" sideOffset={8} collisionPadding={8} align="end" aria-label={`${label}选择`}>
      <Input type="search" role="combobox" aria-label={`搜索${label}`} aria-expanded="true" aria-autocomplete="list" aria-controls={listId}
        aria-activedescendant={choices[active] === undefined ? undefined : `${listId}-${active}`} placeholder="搜索字体…" value={query}
        onChange={event => { setQuery(event.target.value); setActive(0); }}
        onKeyDown={event => {
          if (event.nativeEvent.isComposing || !choices.length) return;
          if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setActive(current => (current + (event.key === "ArrowDown" ? 1 : -1) + choices.length) % choices.length); }
          if (event.key === "Enter") { event.preventDefault(); select(choices[active] ?? choices[0]); }
        }} />
      <div id={listId} className="settings-font-options" role="listbox" aria-label={label}>
        {choices.map((font, index) => <Button key={font} id={`${listId}-${index}`} variant="ghost" role="option" tabIndex={-1} aria-selected={font === value}
          data-highlighted={index === active || undefined} onPointerMove={() => setActive(index)} onClick={() => select(font)}>
          <span style={{ fontFamily: font === "system" ? undefined : `${JSON.stringify(font)}, ${monospace ? "monospace" : "sans-serif"}` }}>{font === "system" ? "Inter · 系统中文" : font}</span>
          {font === value && <Check size={14} />}
        </Button>)}
        {!choices.length && <p role="status">没有匹配的字体</p>}
      </div>
      {status && <small role="status">{status}</small>}
    </Popover.Content></Popover.Portal>
  </Popover.Root>;
}

export function TypographySettings({ appearance, onChange }: { appearance: Appearance; onChange: (patch: Partial<Appearance>) => void }) {
  const rows = [
    { label: "界面字体", description: "导航、消息正文与表单文字", family: "uiFont", size: "uiSize", defaultFamily: "system", defaultSize: 14, min: 12, max: 20 },
    { label: "代码字体", description: "代码块、Diff 与文件预览", family: "codeFont", size: "codeSize", defaultFamily: "Maple Mono NF CN", defaultSize: 13, min: 10, max: 18 },
    { label: "终端字体", description: "终端输出，独立于界面与代码字体", family: "terminalFont", size: "terminalSize", defaultFamily: "Maple Mono NF CN", defaultSize: 13, min: 8, max: 20 },
  ] as const;
  return <div className="settings-card settings-typography">{rows.map(row => <section key={row.family} className="settings-font-setting" aria-label={row.label}>
    <Row label={row.label} description={row.description}>
      {(appearance[row.family] !== row.defaultFamily || appearance[row.size] !== row.defaultSize) && <IconButton aria-label={`重置${row.label}`} title="恢复默认字体与字号" onClick={() => onChange({ [row.family]: row.defaultFamily, [row.size]: row.defaultSize })}><RotateCcw size={12} /></IconButton>}
      <FontFamilyPicker label={row.label} value={appearance[row.family]} monospace={row.family !== "uiFont"} onChange={font => onChange({ [row.family]: font })} />
      <Select aria-label={row.label.replace("字体", "字号")} value={appearance[row.size]} onChange={event => onChange({ [row.size]: Number(event.target.value) })}>
        {Array.from({ length: row.max - row.min + 1 }, (_, index) => row.min + index).map(size => <option key={size} value={size}>{size} px</option>)}
      </Select>
    </Row>
    {row.family === "uiFont" && <p className="settings-font-preview settings-interface-preview" aria-label="界面字体预览">让 <strong>Chela</strong> 帮你检查<span className="settings-preview-info">界面布局</span>，并整理 <span className="settings-preview-keyword">notes.md</span> 中的任务。<br />中文与 English · 0123456789 · Aa Bb Cc</p>}
    {row.family === "codeFont" && <div className="settings-font-preview settings-code-preview" aria-label="代码字体预览">
      <header><span>src/formatUser.ts</span><span><b className="settings-preview-deleted">−1</b> <b className="settings-preview-added">+1</b></span></header>
      <div><span>1</span><code><span className="settings-preview-keyword">export function</span> <span className="settings-preview-info">formatUser</span>(user: User) {"{"}</code></div>
      <div data-change="removed"><span>− 2</span><code>  <span className="settings-preview-keyword">return</span> user.name.toUpperCase();</code></div>
      <div data-change="added"><span>+ 2</span><code>  <span className="settings-preview-keyword">return</span> <span className="settings-preview-added">{"`${user.name} <${user.email}>`"}</span>; <span className="settings-preview-comment">// 0O 1lI</span></code></div>
      <div><span>3</span><code>{"}"}</code></div>
    </div>}
    {row.family === "terminalFont" && <pre className="settings-font-preview settings-terminal-preview" aria-label="终端字体预览"><span className="settings-preview-added">➜</span>{" "}<span className="settings-preview-info">Chela</span>{" git:("}<span className="settings-preview-keyword">main</span>{") npm run dev\n\n"}<span className="settings-preview-added">READY</span>{"  本机服务已启动 · ready in 1.24s\n"}<span className="settings-preview-comment">{"  Local:   "}</span><span className="settings-preview-info">http://localhost:5173/</span>{"\n\n"}<span className="settings-preview-added">✓ 85 passed</span>{"   "}<span className="settings-preview-warning">△ 2 warnings</span>{"   "}<span className="settings-preview-deleted">× 0 failed</span>{"\n0O 1lI · 中文与 English"}</pre>}
  </section>)}</div>;
}
