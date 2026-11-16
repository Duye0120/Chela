import { useEffect, useState, type ReactNode } from "react";
import { Archive, Blocks, ChevronRight, Folder, Info, Power, RefreshCw, Search, Settings, Shield, SlidersHorizontal, SquareTerminal } from "lucide-react";
import { IconButton } from "../ui/icon-button";
import * as Menu from "../ui/menu";

export const positions = { bottom: "底部居中", left: "左侧居中", right: "右侧居中" } as const;
export type Position = keyof typeof positions;
const positionOptions = (Object.keys(positions) as Position[]).map(value => ({ value, label: positions[value] }));
const sides = { bottom: "top", left: "right", right: "left" } as const;

type Props = {
  position: Position;
  onPositionChange: (position: Position) => void;
  onTerminal: () => void;
  onExtensions: () => void;
  onMCP: () => void;
  onQuit?: () => void;
  children: ReactNode;
};

export function SystemMenu({ position, onPositionChange, onTerminal, onExtensions, onMCP, onQuit, children }: Props) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("blur", close);
    return () => window.removeEventListener("blur", close);
  }, [open]);
  return <Menu.Root modal={false} open={open} onOpenChange={setOpen}>
    <Menu.Trigger asChild>
      <IconButton className="dock-item" aria-label="Chela 系统菜单" onContextMenu={event => {
        event.preventDefault();
        setOpen(true);
      }}>{children}</IconButton>
    </Menu.Trigger>
    <Menu.Content aria-label="Chela" side={sides[position]} align="end">
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
        <Menu.Item disabled><Settings />设置<kbd>Ctrl+,</kbd></Menu.Item>
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
