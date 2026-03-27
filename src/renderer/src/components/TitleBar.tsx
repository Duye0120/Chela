import { Menu, MenuButton, MenuItems } from "@headlessui/react";
import { ArrowsPointingOutIcon, EllipsisHorizontalIcon, MinusIcon, RectangleStackIcon, RectangleGroupIcon, XMarkIcon } from "@heroicons/react/24/outline";

type TitleBarProps = {
  sessionTitle: string;
  isMaximized: boolean;
  rightPanelOpen: boolean;
  onToggleRightPanel: () => void;
  onMinimize: () => void;
  onToggleMaximize: () => void;
  onClose: () => void;
};

export function TitleBar({
  sessionTitle,
  isMaximized,
  rightPanelOpen,
  onToggleRightPanel,
  onMinimize,
  onToggleMaximize,
  onClose,
}: TitleBarProps) {
  return (
    <header className="app-drag flex h-12 items-center border-b border-black/6 bg-shell-950/95 px-3 text-shell-300">
      <div className="no-drag flex items-center gap-3">
        <div className="grid h-7 w-7 place-items-center rounded-xl border border-black/8 bg-white/85 text-xs font-semibold text-accent-500 shadow-glow">
          PI
        </div>
        <div className="hidden md:block">
          <p className="text-xs text-shell-500">聊天助手</p>
          <p className="max-w-56 truncate text-sm font-medium text-shell-200">{sessionTitle}</p>
        </div>
      </div>

      <div className="app-drag flex flex-1 items-center justify-start pl-10">
        <nav className="no-drag hidden items-center gap-5 text-xs text-shell-500 lg:flex">
          <button className="transition hover:text-shell-200">聊天</button>
          <button className="transition hover:text-shell-200">历史</button>
          <button className="transition hover:text-shell-200">附件</button>
          <button className="transition hover:text-shell-200">帮助</button>
        </nav>
      </div>

      <div className="no-drag flex items-center gap-2">
        <button
          type="button"
          onClick={onToggleRightPanel}
          className="rounded-lg border border-black/8 bg-white/75 p-2 text-shell-400 transition hover:bg-accent-500/8"
          title={rightPanelOpen ? "收起右侧上下文" : "展开右侧上下文"}
        >
          <RectangleGroupIcon className="h-4 w-4" />
        </button>

        <Menu as="div" className="relative">
          <MenuButton className="rounded-lg border border-black/8 bg-white/75 p-2 text-shell-400 transition hover:bg-accent-500/8">
            <EllipsisHorizontalIcon className="h-4 w-4" />
          </MenuButton>
          <MenuItems
            anchor="bottom end"
            className="no-drag mt-2 w-40 rounded-2xl border border-black/8 bg-white/95 p-2 text-sm text-shell-400 shadow-glow focus:outline-none"
          />
        </Menu>

        <div className="ml-2 flex items-center overflow-hidden rounded-xl border border-black/8 bg-white/78">
          <button type="button" onClick={onMinimize} className="titlebar-control" title="最小化">
            <MinusIcon className="h-4 w-4" />
          </button>
          <button type="button" onClick={onToggleMaximize} className="titlebar-control" title="最大化">
            {isMaximized ? <RectangleStackIcon className="h-4 w-4" /> : <ArrowsPointingOutIcon className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="titlebar-control text-rose-200 hover:bg-rose-500/20 hover:text-rose-100"
            title="关闭"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
