import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
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
import { SettingsWorkspace, settingGroups, currentSettingsGroup } from "../workspaces/settings/settings-workspace";
import { applyAppearance, readAppearance, type Appearance } from "../workspaces/settings/appearance";
import settingsIcon from "../workspaces/settings/assets/settings.svg";
import { PetWorkspace } from "../workspaces/pet/pet-workspace";
import "../ui/controls.css";
import "./shell.css";
import { DockPreview, captureWorkspace, type WorkspacePreview } from "./dock-preview";
import { matchesShortcut, readShortcuts } from "../ui/shortcuts";

const pages = [
  ["chat", "对话", "LucideMessageSquare"], ["board", "看板", "LucideLayoutDashboard"],
  ["calendar", "日历", "LucideCalendarDays"], ["notes", "笔记", "LucideStickyNote"],
  ["terminal", "终端", "LucideSquareTerminal"],
] as const;
const icons = import.meta.glob<string>("../assets/icons/*.svg", { eager: true, query: "?url", import: "default" });
function Icon({ name }: { name: string }) {
  return <img src={icons["../assets/icons/" + name + ".svg"]} alt="" draggable={false} />;
}

function getPage(hash: string) {
  return hash.slice(1).split("/")[0] === "settings" ? ["settings", "设置", ""] as const : pages.find(([id]) => id === hash.slice(1).split("/")[0]) ?? pages[0];
}
const TerminalWorkspace = lazy(async () => ({ default: (await import("../workspaces/terminal/terminal-workspace")).TerminalWorkspace }));
const workspaces = { chat: ChatWorkspace, board: BoardWorkspace, calendar: CalendarWorkspace, notes: NotesWorkspace, terminal: TerminalWorkspace };
function Shell() {
  const [route, setRoute] = useState(() => location.hash);
  const page = getPage(route);
  const previews = useRef<Record<string, WorkspacePreview>>({}), previewTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [preview, setPreview] = useState<{ id: string; title: string; anchor: DOMRect } | null>(null);
  const [dockHidden, setDockHidden] = useState(false);
  const [appearance, setAppearance] = useState(readAppearance);
  useEffect(() => {
    applyAppearance(appearance);
    const media = matchMedia("(prefers-color-scheme: dark)");
    const update = () => applyAppearance(appearance);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [appearance]);
  function changeAppearance(value: Appearance) {
    localStorage.setItem("chela.shell.appearance", JSON.stringify(value));
    setAppearance(value);
  }
  const [position, setPosition] = useState<Position>(() => {
    const value = localStorage.getItem("chela.shell.dock");
    return value === "left" || value === "right" ? value : "bottom";
  });
  const [chatTitle,setChatTitle]=useState("新对话");
  const [pageTitles, setPageTitles] = useState<Record<string, string>>({});
  useLayoutEffect(() => {
    const update = (event: Event) => { const value = (event as CustomEvent<{ page: string; title: string }>).detail; setPageTitles(current => current[value.page] === value.title ? current : { ...current, [value.page]: value.title }); };
    window.addEventListener("chela-route-title", update);
    return () => window.removeEventListener("chela-route-title", update);
  }, []);
  const [extensions,setExtensions]=useState(false);
  const [mcp,setMCP]=useState(false);
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!event.defaultPrevented && !event.isComposing && matchesShortcut(event,readShortcuts().settings)) {
        event.preventDefault();
        if (!document.querySelector("dialog[open]") && !location.hash.startsWith("#settings")) location.hash = "settings";
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  useEffect(()=>{const update=(e:Event)=>setChatTitle((e as CustomEvent<string>).detail);window.addEventListener("chela-chat-title",update);return ()=>window.removeEventListener("chela-chat-title",update)},[]);
  const [sidebar, setSidebar] = useState(true);
  const [maximized, setMaximized] = useState(false);
  const controls = desktop?.window;
  const Workspace = page[0] === "settings" ? null : workspaces[page[0]];

  useEffect(() => {
    const onHash = () => { const value = captureWorkspace(); if (value) previews.current[getPage(route)[0]] = value; setRoute(location.hash); setPreview(null); clearTimeout(previewTimer.current); };
    const onResize = () => { void controls?.isMaximized().then(setMaximized); };
    onResize();
    window.addEventListener("hashchange", onHash);
    window.addEventListener("resize", onResize);
    return () => { window.removeEventListener("hashchange", onHash); window.removeEventListener("resize", onResize); };
  }, [controls, route]);
  useEffect(() => () => clearTimeout(previewTimer.current), []);
  useEffect(() => {
    if (!appearance.dockAutoHide) { setDockHidden(false); return; }
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => { clearTimeout(timer); if (!document.querySelector('.body > nav:hover, .body > nav:focus-within, [data-radix-menu-content]')) timer = setTimeout(() => setDockHidden(true), appearance.dockHideDelay * 1000); };
    reset(); window.addEventListener("pointermove", reset); window.addEventListener("keydown", reset);
    return () => { clearTimeout(timer); window.removeEventListener("pointermove", reset); window.removeEventListener("keydown", reset); };
  }, [appearance.dockAutoHide, appearance.dockHideDelay, dockHidden]);
  function navigate(id: string) {
    location.hash = id;
  }
  function dockAt(value: Position) {
    localStorage.setItem("chela.shell.dock", value);
    setPosition(value);
  }
  return <div className="shell" data-position={position} data-dock-hidden={dockHidden} data-dock-auto={appearance.dockAutoHide}>
    <header>
      <div className="route">{page[0] === "settings" ? <img src={settingsIcon} width={14} height={14} alt="" /> : <Icon name={page[2]} />}{page[1]}{page[0]==="chat" && <><span>/</span><strong>{chatTitle}</strong></>}{page[0] === "settings" && <><span>/</span><strong>{settingGroups[currentSettingsGroup()].name}</strong></>}{pageTitles[page[0]] && page[0] !== "chat" && page[0] !== "settings" && <><span>/</span><strong>{pageTitles[page[0]]}</strong></>}</div>
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
            {Workspace ? <Workspace sidebarOpen={sidebar} onToggleSidebar={() => setSidebar(value => !value)} /> : <SettingsWorkspace position={position} onPositionChange={dockAt} appearance={appearance} onAppearanceChange={changeAppearance} />}
          </Suspense>
        </div>
      </div>
      {appearance.dockAutoHide && <div className="dock-hot-edge" onPointerEnter={() => setDockHidden(false)} />}
      <nav aria-label="工作台" onPointerEnter={() => setDockHidden(false)} onFocus={() => setDockHidden(false)}>
        {pages.map(([id, label, icon]) => <IconButton key={id} className="dock-item" aria-label={label} title={label}
          onPointerEnter={event => { const anchor = event.currentTarget.getBoundingClientRect(); clearTimeout(previewTimer.current); previewTimer.current = setTimeout(() => { if (id === page[0]) { const value = captureWorkspace(); if (value) previews.current[id] = value; } setPreview({ id, title: label, anchor }); }, 180); }}
          onPointerLeave={() => { clearTimeout(previewTimer.current); setPreview(null); }} onBlur={() => setPreview(null)}
          aria-current={id === page[0] ? "page" : undefined} onClick={() => navigate(id)}><Icon name={icon} /></IconButton>)}
        <div className="separator" />
        <Notifications />
        <SystemMenu expressions={appearance.iconExpressions} active={page[0] === "settings"} position={position} onPositionChange={dockAt} onTerminal={() => navigate("terminal")} onExtensions={()=>setExtensions(true)} onMCP={()=>setMCP(true)} onSettings={()=>navigate("settings")} onQuit={desktop ? () => void desktop?.call("Work.Quit") : undefined} />
      </nav>
      {preview && <DockPreview title={preview.title} snapshot={previews.current[preview.id]} anchor={preview.anchor} position={position} />}
      <CapabilitiesPanel open={extensions} onClose={()=>setExtensions(false)}/>
      <MCPPanel open={mcp} onClose={()=>setMCP(false)}/>
    </div>
  </div>;
}

const root = import.meta.hot?.data.root ?? createRoot(document.getElementById("root")!);
if (import.meta.hot) import.meta.hot.data.root = root;
root.render(new URLSearchParams(location.search).has("pet")?<PetWorkspace/>:<Shell />);
