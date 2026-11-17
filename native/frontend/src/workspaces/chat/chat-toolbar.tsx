import { useStore } from "zustand";
import { ChevronDown, Code2, PanelRight } from "lucide-react";
import { Button } from "../../ui/button";
import { IconButton } from "../../ui/icon-button";
import * as Menu from "../../ui/menu";
import { SidebarToggle } from "../../ui/sidebar";
import { previewState, setPreviewOpen } from "../../state/preview";

type Props = { sidebarOpen: boolean; onToggleSidebar: () => void; approvalCount: number; busy: boolean; project?: string; onChooseProject: () => void; onOpenEditor: () => void; onOpenProject: () => void };
export function ChatToolbar({ sidebarOpen,onToggleSidebar,approvalCount,busy,project,onChooseProject,onOpenEditor,onOpenProject }: Props) {
  const previewOpen = useStore(previewState, state => state.open);
  return <header className="chat-toolbar"><SidebarToggle controls="chat-sidebar" open={sidebarOpen} onToggle={onToggleSidebar} />{approvalCount>0&&<span className="chat-pending-badge">待批准 {approvalCount}</span>}
        <div className="chat-toolbar-end"><div className="chat-open-split"><Button className="chat-open" disabled={!window.chelaDesktop||busy} title={window.chelaDesktop?"打开项目目录":"在桌面端打开本机项目"} onClick={onOpenEditor}><Code2 size={12}/>打开</Button>
        <Menu.Root><Menu.Trigger asChild><IconButton className="chat-open-menu" aria-label="项目操作"><ChevronDown size={10}/></IconButton></Menu.Trigger>
        <Menu.Content><Menu.Item disabled={!window.chelaDesktop||busy} onSelect={onChooseProject}>选择项目目录</Menu.Item><Menu.Item disabled={!window.chelaDesktop||!project} onSelect={onOpenProject}>在文件管理器中打开</Menu.Item></Menu.Content></Menu.Root></div><IconButton aria-label="切换右侧工作区" aria-expanded={previewOpen} onClick={()=>setPreviewOpen(value=>!value)}><PanelRight size={14}/></IconButton></div>
      </header>;
}
