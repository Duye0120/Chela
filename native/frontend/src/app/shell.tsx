import { lazy, Suspense, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Copy } from "lucide-react";
import { IconButton } from "../ui/icon-button";
import { desktop } from "../platform/bridge";
import { ChatWorkspace } from "../workspaces/chat/chat-workspace";
import { BoardWorkspace } from "../workspaces/board/board-workspace";
import { CalendarWorkspace } from "../workspaces/calendar/calendar-workspace";
import { NotesWorkspace } from "../workspaces/notes/notes-workspace";
import { SystemMenu, type Position } from "./system-menu";
import { Notifications } from "./notifications";
import { CapabilitiesPanel } from "./capabilities-panel";
import { MCPPanel } from "./mcp-panel";
import { PetWorkspace } from "../workspaces/pet/pet-workspace";
import "../ui/controls.css";
import "./shell.css";

const pages = [
  ["chat", "对话", "LucideMessageSquare"], ["board", "看板", "LucideLayoutDashboard"],
  ["calendar", "日历", "LucideCalendarDays"], ["notes", "笔记", "LucideStickyNote"],
  ["terminal", "终端", "LucideSquareTerminal"],
] as const;
const icons = import.meta.glob<string>("../assets/icons/*.svg", { eager: true, query: "?url", import: "default" });
function Icon({ name }: { name: string }) {
  return <img src={icons["../assets/icons/" + name + ".svg"]} alt="" draggable={false} />;
}

function getPage() {
  return pages.find(([id]) => id === location.hash.slice(1).split("/")[0]) ?? pages[0];
}
const TerminalWorkspace = lazy(async () => ({ default: (await import("../workspaces/terminal/terminal-workspace")).TerminalWorkspace }));
const workspaces = { chat: ChatWorkspace, board: BoardWorkspace, calendar: CalendarWorkspace, notes: NotesWorkspace, terminal: TerminalWorkspace };
function Shell() {
  const [page, setPage] = useState(getPage);
  const [position, setPosition] = useState<Position>(() => {
    const value = localStorage.getItem("chela.shell.dock");
    return value === "left" || value === "right" ? value : "bottom";
  });
  const [chatTitle,setChatTitle]=useState("新对话");
  const [extensions,setExtensions]=useState(false);
  const [mcp,setMCP]=useState(false);
  useEffect(()=>{const update=(e:Event)=>setChatTitle((e as CustomEvent<string>).detail);window.addEventListener("chela-chat-title",update);return ()=>window.removeEventListener("chela-chat-title",update)},[]);
  const [sidebar, setSidebar] = useState(true);
  const [maximized, setMaximized] = useState(false);
  const controls = desktop?.window;
  const Workspace = workspaces[page[0]];

  useEffect(() => {
    const onHash = () => setPage(getPage());
    const onResize = () => { void controls?.isMaximized().then(setMaximized); };
    onResize();
    window.addEventListener("hashchange", onHash);
    window.addEventListener("resize", onResize);
    return () => { window.removeEventListener("hashchange", onHash); window.removeEventListener("resize", onResize); };
  }, [controls]);
  function navigate(id: string) {
    location.hash = id;
  }
  function dockAt(value: Position) {
    localStorage.setItem("chela.shell.dock", value);
    setPosition(value);
  }
  return <div className="shell" data-position={position}>
    <header>
      <div className="route"><Icon name="LucideFolder" />{page[1]}{page[0]==="chat" && <><span>/</span><strong>{chatTitle}</strong></>}</div>
      {controls && <div className="window-controls">
        <IconButton aria-label="最小化" onClick={() => void controls.minimize()}><Icon name="LucideMinus" /></IconButton>
        <IconButton aria-label={maximized ? "还原" : "最大化"} onClick={async () => { await controls.toggleMaximize(); setMaximized(await controls.isMaximized()); }}>
          {maximized ? <Copy size={10} /> : <Icon name="LucideSquare" />}
        </IconButton>
        <IconButton aria-label="关闭" onClick={() => void controls.close()}><Icon name="LucideX" /></IconButton>
      </div>}
    </header>
    <div className="body">
      <div className="frame">
        <div className="workspace">
          <Suspense fallback={<main aria-busy="true" aria-label={page[1]} />}>
            <Workspace sidebarOpen={sidebar} onToggleSidebar={() => setSidebar(value => !value)} />
          </Suspense>
        </div>
      </div>
      <nav aria-label="工作台">
        {pages.map(([id, label, icon]) => <IconButton key={id} className="dock-item" aria-label={label} title={label}
          aria-current={id === page[0] ? "page" : undefined} onClick={() => navigate(id)}><Icon name={icon} /></IconButton>)}
        <div className="separator" />
        <Notifications />
        <SystemMenu position={position} onPositionChange={dockAt} onTerminal={() => navigate("terminal")} onExtensions={()=>setExtensions(true)} onMCP={()=>setMCP(true)} onQuit={controls ? () => void controls.close() : undefined}>
          <Icon name="Chela24Px" />
        </SystemMenu>
      </nav>
      <CapabilitiesPanel open={extensions} onClose={()=>setExtensions(false)}/>
      <MCPPanel open={mcp} onClose={()=>setMCP(false)}/>
    </div>
  </div>;
}

createRoot(document.getElementById("root")!).render(new URLSearchParams(location.search).has("pet")?<PetWorkspace/>:<Shell />);
