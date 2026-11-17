import { useEffect, useRef, useState } from "react";
import { ChelaAvatar, type AvatarExpression } from "../ui/chela-avatar";
import { Archive, Blocks, ChevronRight, Folder, Info, Power, RefreshCw, Search, Settings, Shield, SlidersHorizontal, SquareTerminal } from "lucide-react";
import { IconButton } from "../ui/icon-button";
import * as Menu from "../ui/menu";
import { readShortcuts, shortcutLabel } from "../ui/shortcuts";

export const positions = { bottom: "底部居中", left: "左侧居中", right: "右侧居中" } as const;
export type Position = keyof typeof positions;
const positionOptions = (Object.keys(positions) as Position[]).map(value => ({ value, label: positions[value] }));
const sides = { bottom: "top", left: "right", right: "left" } as const;

type Props = {
  expressions?: boolean;
  active?: boolean;
  position: Position;
  onPositionChange: (position: Position) => void;
  onTerminal: () => void;
  onExtensions: () => void;
  onMCP: () => void;
  onSettings: () => void;
  onQuit?: () => void;
};

export function SystemMenu({ expressions = true, active, position, onPositionChange, onTerminal, onExtensions, onMCP, onSettings, onQuit }: Props) {
  const [open, setOpen] = useState(false);
  const [expression, setExpression] = useState<AvatarExpression>("idle");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined), hovering = useRef(false);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("blur", close);
    return () => window.removeEventListener("blur", close);
  }, [open]);
  return <Menu.Root modal={false} open={open} onOpenChange={setOpen}>
    <Menu.Trigger asChild>
      <IconButton className="dock-item" aria-current={active ? "page" : undefined} aria-label="Chela 系统菜单" title="右键打开系统菜单"
        onPointerDown={event => { if (event.button === 0) event.preventDefault(); }}
        onClick={() => { setExpression("wink"); clearTimeout(timer.current); timer.current = setTimeout(() => setExpression(hovering.current ? "peeking" : "idle"), 900); }}
        onPointerEnter={() => { hovering.current = true; setExpression("speaking"); clearTimeout(timer.current); timer.current = setTimeout(() => setExpression("peeking"), 700); }}
        onPointerLeave={() => { hovering.current = false; clearTimeout(timer.current); setExpression("idle"); }}
        onContextMenu={event => {
        event.preventDefault();
        setOpen(true);
      }}><ChelaAvatar size={24} expression={expressions ? expression : "idle"} interactive={expressions && expression !== "idle"} /></IconButton>
    </Menu.Trigger>
    <Menu.Content className="chela-system-menu" aria-label="Chela" side={sides[position]} align="end">
      <Menu.Group>
        <Menu.Item onSelect={onExtensions}><Blocks />应用与扩展</Menu.Item>
        <Menu.Item onSelect={onMCP}><Blocks />MCP 连接</Menu.Item>
        <Menu.Item onSelect={onTerminal}><SquareTerminal />终端</Menu.Item>
        <Menu.Item disabled><Folder />工作区目录</Menu.Item>
        <Menu.Item disabled><Archive />会话归档</Menu.Item>
      </Menu.Group>
      <Menu.Separator />
      <Menu.Group>
        <Menu.Item disabled><Search />快速命令<kbd>Ctrl+K</kbd></Menu.Item>
        <Menu.Sub>
          <Menu.SubTrigger><SlidersHorizontal />导航栏布局<ChevronRight className="ui-menu-end" /></Menu.SubTrigger>
          <Menu.SubContent aria-label="导航栏布局">
            <Menu.Choices label="停靠位置" options={positionOptions} value={position} onChange={onPositionChange} />
          </Menu.SubContent>
        </Menu.Sub>
        <Menu.Item disabled><Shield />系统诊断</Menu.Item>
      </Menu.Group>
      <Menu.Separator />
      <Menu.Group>
        <Menu.Item onSelect={onSettings}><Settings />设置<kbd>{shortcutLabel(readShortcuts().settings)}</kbd></Menu.Item>
        <Menu.Item disabled><Info />关于 Chela</Menu.Item>
      </Menu.Group>
      <Menu.Separator />
      <Menu.Group>
        <Menu.Item onSelect={() => location.reload()}><RefreshCw />重载工作区</Menu.Item>
        <Menu.Item onSelect={onQuit} disabled={!onQuit}><Power className="power" />退出 Chela</Menu.Item>
      </Menu.Group>
    </Menu.Content>
  </Menu.Root>;
}
