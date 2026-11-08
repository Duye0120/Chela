import { ArrowsPointingOutIcon, MinusIcon, RectangleStackIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Button } from "@renderer/components/assistant-ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@renderer/components/ui/tooltip";

type TitleBarProps = {
  isMaximized: boolean;
  onMinimize: () => void;
  onToggleMaximize: () => void;
  onClose: () => void;
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
};

export function TitleBar({
  isMaximized,
  onMinimize,
  onToggleMaximize,
  onClose,
  sidebarCollapsed = false,
  onToggleSidebar,
}: TitleBarProps) {
  return (
    <header
      className="app-drag flex min-h-[var(--control-size-lg)] shrink-0 items-center gap-1 bg-transparent px-2 text-[11px] text-[color:var(--color-text-secondary)]"
      onDoubleClick={onToggleMaximize}
    >
      <div className="no-drag flex items-center" onDoubleClick={(event) => event.stopPropagation()}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onToggleSidebar}
              aria-label={sidebarCollapsed ? "展开侧栏" : "收起侧栏"}
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen className="h-3.5 w-3.5" strokeWidth={1.9} />
              ) : (
                <PanelLeftClose className="h-3.5 w-3.5" strokeWidth={1.9} />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">切换侧栏 Ctrl+B</TooltipContent>
        </Tooltip>
      </div>
      <div className="app-drag min-w-0 flex-1 select-none truncate pl-1 text-xs font-medium">Chela</div>
      <div className="no-drag flex items-center gap-0.5" onDoubleClick={(event) => event.stopPropagation()}>
        <Button type="button" variant="ghost" size="icon-sm" onClick={onMinimize} title="最小化" aria-label="最小化">
          <MinusIcon className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onToggleMaximize}
          title={isMaximized ? "还原" : "最大化"}
          aria-label={isMaximized ? "还原" : "最大化"}
        >
          {isMaximized ? <RectangleStackIcon className="h-4 w-4" /> : <ArrowsPointingOutIcon className="h-4 w-4" />}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          className="hover:bg-destructive hover:text-destructive-foreground"
          title="关闭"
          aria-label="关闭"
        >
          <XMarkIcon className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
