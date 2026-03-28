import { ArrowsPointingOutIcon, MinusIcon, RectangleStackIcon, XMarkIcon } from "@heroicons/react/24/outline";

type TitleBarProps = {
  isMaximized: boolean;
  onMinimize: () => void;
  onToggleMaximize: () => void;
  onClose: () => void;
};

export function TitleBar({ isMaximized, onMinimize, onToggleMaximize, onClose }: TitleBarProps) {
  return (
    <header className="app-drag flex h-10 text-shell-400">
      <div className="app-drag flex-1" />
      <div className="no-drag flex">
        <button type="button" onClick={onMinimize} className="titlebar-control hover:text-shell-100" title="最小化" aria-label="最小化">
          <MinusIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onToggleMaximize}
          className="titlebar-control hover:text-shell-100"
          title={isMaximized ? "还原" : "最大化"}
          aria-label={isMaximized ? "还原" : "最大化"}
        >
          {isMaximized ? <RectangleStackIcon className="h-4 w-4" /> : <ArrowsPointingOutIcon className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="titlebar-control hover:bg-rose-500 hover:text-white"
          title="关闭"
          aria-label="关闭"
        >
          <XMarkIcon className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
