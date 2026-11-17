import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Button } from "../../ui/button";
import { Select } from "../../ui/select";
import { Input, SearchField } from "../../ui/text-field";
import { Sidebar, SidebarItem } from "../../ui/sidebar";
import { SettingsSubnav, settingsSections } from "../../ui/settings-subnav";
import { chatApi, type ChatSnapshot, type RuntimeSettings } from "../chat/data";
import { ModelSettings } from "../chat/model-settings";
import { CompanionPanel } from "../../app/companion-panel";
import { Plus } from "lucide-react";
import { Row, Toggle, SectionHeading } from "./settings-controls";
import { SettingsDialog } from "./settings-dialog";
import { SettingsMemories, SettingsSkills, SettingsMCP } from "./assistant-resources";
import { positions, type Position } from "../../app/system-menu";
import { themePresets, type Appearance } from "./appearance";
import { serviceCall } from "../../platform/bridge";
import { TypographySettings } from "./typography-settings";
import { readShortcuts, saveShortcut, shortcutLabel, shortcutNames, type ShortcutAction } from "../../ui/shortcuts";
import { ArchiveCard } from "./archive-card";
import { RulesSettings } from "./rules-settings";
import { ProviderList } from "./provider-list";
import { DataSettings } from "./data-settings";
import { NetworkSettings } from "./network-settings";
import { localPreviewURL, readPreviewPreferences, savePreviewPreferences, type PreviewPreferences } from "../preview/preferences";
import palette from "./assets/palette.svg";
import cpu from "./assets/cpu.svg";
import shield from "./assets/shield.svg";
import folder from "./assets/folder.svg";
import archive from "./assets/archive.svg";
import check from "./assets/check.svg";
import "./settings.css";

export const settingGroups = {
  appearance: { name: "外观", icon: palette }, models: { name: "模型", icon: cpu },
  assistant: { name: "助手", icon: shield }, workspace: { name: "工作区", icon: folder }, data: { name: "数据与关于", icon: archive },
};
type Group = keyof typeof settingGroups;
export function currentSettingsGroup(): Group {
  const group = location.hash.split("/")[1];
  return Object.hasOwn(settingGroups, group) ? group as Group : "appearance";
}
type Props = { position: Position; onPositionChange: (value: Position) => void; appearance: Appearance; onAppearanceChange: (value: Appearance) => void };
export function SettingsWorkspace({ position, onPositionChange, appearance, onAppearanceChange }: Props) {
  const [group, setGroup] = useState(currentSettingsGroup), [active, setActive] = useState("");
  const [query, setQuery] = useState(""), [status, setStatus] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [snapshot, setSnapshot] = useState<ChatSnapshot | null>(null), [roles, setRoles] = useState<Record<string, string>>({});
  const [runtime,setRuntime]=useState<RuntimeSettings|null>(null);
  useEffect(()=>{let active=true;void chatApi.runtimeSettings().then(value=>{if(active)setRuntime(value)}).catch(cause=>{if(active)setError(String(cause))});return()=>{active=false}},[]);
  function runtimePreference(patch:Partial<RuntimeSettings>){if(runtime)void act(async()=>{const value={...runtime,...patch};await chatApi.setRuntimeSettings("",value);setRuntime(value);window.dispatchEvent(new Event("chela-runtime-settings-changed"))})}
  const [providerEditor, setProviderEditor] = useState<"magpie"|"custom"|null>(null);
  const [advancedModels, setAdvancedModels] = useState(false), [companion, setCompanion] = useState(false);
  const [editingShortcut, setEditingShortcut] = useState<ShortcutAction | null>(null), [editingDirectory, setEditingDirectory] = useState(false), [directoryDraft, setDirectoryDraft] = useState(""), [editingPort, setEditingPort] = useState<string | null>(null);
  const [closeMode, setCloseMode] = useState("tray");
  const [shortcuts,setShortcuts]=useState(readShortcuts);
  const [preview,setPreview]=useState(readPreviewPreferences),[port,setPort]=useState(""),[portError,setPortError]=useState("");
  function previewPreference(value:PreviewPreferences){void act(()=>setPreview(savePreviewPreferences(value)))}
  const [directory,setDirectory]=useState(""),[editor,setEditor]=useState(()=>localStorage.getItem("chela.workspace.editor")||"system"),[gitDetect,setGitDetect]=useState(()=>localStorage.getItem("chela.git.detect")!=="false"),[gitDepth,setGitDepth]=useState(()=>Number(localStorage.getItem("chela.git.depth")??2));
  useEffect(()=>{let active=true;void chatApi.defaultDirectory().then(value=>{if(active)setDirectory(value)}).catch(cause=>{if(active)setError(String(cause))});return()=>{active=false}},[]);
  function workspacePreference(key:string,value:string){localStorage.setItem(key,value);window.dispatchEvent(new Event("chela-workspace-settings"));setStatus("已自动保存")}
  useEffect(() => { let active = true; void serviceCall<string>("Work.WindowCloseMode").then(value => { if (active) setCloseMode(value); }).catch(cause => { if (active) setError(String(cause)); }); return () => { active = false; }; }, []);
  const scroll = useRef<HTMLDivElement>(null), id = useId();
  useEffect(() => {
    const change = () => { setGroup(currentSettingsGroup()); setActive(""); setQuery(""); if (scroll.current) scroll.current.scrollTop = 0; };
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  useEffect(() => {
    let current = true;
    void Promise.all([chatApi.load(), chatApi.modelRoles()]).then(([value, bindings]) => { if (current) { setSnapshot(value); setRoles(bindings); } }).catch(e => { if (current) setError(String(e)); });
    return () => { current = false; };
  }, []);
  async function refresh() {
    const [value, bindings] = await Promise.all([chatApi.load(), chatApi.modelRoles()]);
    setSnapshot(value); setRoles(bindings);
    window.dispatchEvent(new Event("chela-models-changed"));
  }
  async function act(action: () => Promise<unknown> | void) {
    setBusy(true); setError(""); setStatus("");
    try { await action(); setStatus("已自动保存"); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  function look(patch: Partial<Appearance>) { void act(() => onAppearanceChange({ ...appearance, ...patch })); }
  function modelDefault(key: string, value: string) {
    const previous = roles[key]; setRoles(current => ({ ...current, [key]: value }));
    void act(async () => { try { await chatApi.setModelRole(key, value); await refresh(); } catch (cause) { setRoles(current => ({ ...current, [key]: previous })); throw cause; } });
  }
  const presets = themePresets.find(p => p.id === appearance.preset) || themePresets[3];
  const dockCards = <div className="settings-dock-cards">{(["left", "right", "bottom"] as Position[]).map(value => <button key={value} type="button" aria-label={`导航栏${positions[value]}`} aria-pressed={value === position} onClick={() => void act(() => onPositionChange(value))}>
    <span className="settings-mini-window" data-dock={value}><span className="settings-mini-content"><i /><i /></span><span className="settings-mini-rail"><i /><i /><i />{value === "bottom" && <i />}</span></span>
    <span>{value === "bottom" ? "底部" : value === "left" ? "左侧" : "右侧"}<small>{value === position ? "当前 · 默认" : value === "bottom" ? "" : `${value === "left" ? "左" : "右"}边栏`}</small></span>
  </button>)}</div>;
  const roleRows = [{ key: "chat", label: "默认模型", description: "与输入框底部选择器同步" }, { key: "compaction", label: "上下文整理", description: "长对话压缩使用的模型" }, { key: "consolidation", label: "记忆整理", description: "空闲时整理长期记忆" }, { key: "proactivity", label: "主动关注", description: "后台关注判断使用的模型" }].map(role => <Row key={role.key} label={role.label} description={role.description}>
    <Select aria-label={role.label} value={roles[role.key] || (role.key === "chat" ? snapshot?.model : "") || ""} disabled={busy || !snapshot} onChange={e => void act(async () => { await chatApi.setModelRole(role.key, e.target.value); await refresh(); })}>
      <option value="">沿用现有默认模型</option>{[...new Set(snapshot?.models?.map(model => model.provider))].map(provider => <optgroup key={provider} label={provider}>{snapshot?.models?.filter(model => model.provider === provider).map(model => <option key={model.id} value={model.id}>{model.label}</option>)}</optgroup>)}
    </Select>
  </Row>);
  const roleCard = <div className="settings-card">{roleRows[0]}
    <Row label="默认思考强度" description="重构 / 架构 / 排查的推理深度"><div className="settings-segment" role="group" aria-label="默认思考强度">{["low", "medium", "high"].map(value => <button key={value} type="button" disabled={busy || !snapshot} aria-pressed={(roles.effort || snapshot?.effort || "medium") === value} onClick={() => modelDefault("effort", value)}>{value === "low" ? "Low" : value === "medium" ? "Medium" : "High"}</button>)}{!["low", "medium", "high"].includes(roles.effort || snapshot?.effort || "medium") && <button type="button" aria-pressed="true" onClick={() => setAdvancedModels(true)}>{({off:"关闭",xhigh:"极高"} as Record<string,string>)[roles.effort || snapshot?.effort || "off"] || roles.effort || snapshot?.effort}</button>}</div></Row>
    <Row label={`上下文窗 ${roles.compactionThreshold || "72"}% 提醒压缩`} description="接近上限时提示 /compact"><Toggle label="上下文自动整理" checked={roles.compactionEnabled !== "false"} disabled={busy || !snapshot} onChange={value => modelDefault("compactionEnabled", String(value))} /></Row>
  </div>;
  const archived = snapshot?.sessions.filter(s => s.archived) || [];
  const session = snapshot?.sessions.find(s => !s.archived);
  type Section = { name: string; title?: string; description: string; content: ReactNode; action?: ReactNode; ownHeading?: boolean };
  const sections: Record<Group, Section[]> = {
    appearance: [
      { name: "主题与配色", description: "明暗外观与纯色预设，切换即时生效", action: <div className="settings-segment">{([{ value: "system", label: "系统" }, { value: "light", label: "浅色" }, { value: "dark", label: "深色" }] as const).map(mode => <button key={mode.value} type="button" aria-pressed={appearance.mode === mode.value} onClick={() => look({ mode: mode.value })}>{mode.label}</button>)}</div>, content: <div className="settings-card settings-palette-card">
        <div className="settings-palette-heading"><div><strong>主题配色预设（10 套纯色）</strong><p>7 浅 + 3 深，零渐变纯平渲染</p></div><small>当前：{presets.name}</small></div>
        <div className="settings-themes">{themePresets.map(theme => <button type="button" key={theme.id} aria-label={theme.name} aria-pressed={appearance.preset === theme.id} onClick={() => look({ preset: theme.id, mode: theme.dark ? "dark" : "light" })} style={{ "--preview-bg": theme.bg, "--preview-accent": theme.accent, "--preview-text": theme.text, "--preview-muted": theme.muted } as CSSProperties}>
          <span className="settings-theme-preview"><i /><span><i /><i /></span></span><span>{theme.name}<small>{appearance.preset === theme.id ? "当前" : theme.dark ? "深" : "浅"}</small></span>
        </button>)}</div>
      </div> },
      { name: "字体与字号", description: "界面、代码与终端分别设置，预览即时生效", content: <TypographySettings appearance={appearance} onChange={look} /> },
      { name: "导航与窗口", description: "类似 macOS Dock 的窗口停靠位置选择与桌面动效偏好（图标默认居中，启动器置末）", content: <div className="settings-card">
        <div className="settings-dock-choice"><div className="settings-palette-heading"><div><strong>全局导航栏位置</strong><p>支持停靠窗口左侧、右侧或底部，图标统一居中排列，Chela 启动器固定在末位</p></div><small>当前：{position === "bottom" ? "底部" : position === "left" ? "左侧" : "右侧"}</small></div>{dockCards}</div>
        <Row label="自动隐藏 Dock（边缘悬浮呼出）" description="默认关闭（常驻显示）；开启后将在无操作超时后贴边收起，移至停靠边缘时悬浮呼出"><Toggle label="自动隐藏 Dock" checked={appearance.dockAutoHide} onChange={dockAutoHide => look({ dockAutoHide })} /></Row>
        <Row label="无操作自动隐藏延迟" description="开启自动隐藏后生效；无交互达设定时长自动收起"><Select aria-label="自动隐藏延迟" value={appearance.dockHideDelay} disabled={!appearance.dockAutoHide} onChange={event => look({ dockHideDelay: Number(event.target.value) })}>{[3,5,10,30].map(seconds => <option key={seconds} value={seconds}>{seconds} 秒</option>)}</Select></Row>
        <Row label="点击关闭按钮时" description="关闭主窗口后的驻留方式"><Select aria-label="关闭主窗口" value={closeMode} disabled={busy} onChange={event => { const value = event.target.value; void act(async () => { await serviceCall("Work.SetWindowCloseMode", value); setCloseMode(value); }); }}><option value="tray">最小化到托盘</option><option value="minimize">最小化到任务栏</option><option value="quit">退出应用</option></Select></Row>
        <Row label="Chela 图标互动表情" description="悬浮末位 Chela 图标时触发眨眼、眼睛等表情（不弹预览）；右键点击弹出系统菜单"><Toggle label="Chela 图标互动表情" checked={appearance.iconExpressions} onChange={iconExpressions => look({ iconExpressions })} /></Row>
        <Row label="减弱动态效果" description="减少视图与过渡动画"><Toggle label="减弱动态效果" checked={appearance.reducedMotion} onChange={reducedMotion => look({ reducedMotion })} /></Row>
      </div> },
    ],
    models: [
      { name: "默认对话模型", description: "新建对话的初始模型与推理偏好", action: <Button size="small" className="settings-secondary-entry" variant="ghost" onClick={() => setAdvancedModels(true)}>高级</Button>, content: roleCard },
      { name: "供应商与凭证", description: "接入账号、兼容端点与连通状态", action: <Button size="small" variant="primary" onClick={() => setProviderEditor("magpie")}><Plus size={14} />添加供应商</Button>, content: <>
        <ProviderList refresh={refresh} onConfigure={setProviderEditor}/>
      </> },
    ],
    assistant: [
      { name: "执行权限", description: "写入文件 / 运行命令前的审批策略", content: <div className="settings-card settings-permissions" role="radiogroup" aria-label="执行权限策略">{[{value:"ask",label:"每次询问（推荐）",description:"写文件与高风险命令前弹出审批"},{value:"auto",label:"工作区放行",description:"自动写入工作区，外部工具仍批准"},{value:"full",label:"全自动运行",description:"自主执行全部工具（隔离环境）"}].map(policy=><label key={policy.value}><strong>{policy.label}</strong><input type="radio" name={`${id}-permission`} className="settings-radio" aria-label={policy.label} checked={runtime?.permission===policy.value} disabled={busy||!runtime} onChange={()=>runtimePreference({permission:policy.value as RuntimeSettings["permission"]})}/><small>{policy.description}</small></label>)}</div> },
      { name: "规则", description: "约束编码风格与目录边界", action: <Button size="small" className="settings-secondary-entry" variant="ghost" onClick={() => setCompanion(true)}>人格与陪伴</Button>, content: <div className="settings-card"><RulesSettings/><Row label="自动读取项目规则" description="读取根目录 AGENTS.md / CHELA.md，下次运行生效"><Toggle label="自动读取项目规则" checked={runtime?.projectRules??true} disabled={busy||!runtime} onChange={projectRules=>runtimePreference({projectRules})}/></Row></div> },
      { name: "记忆", title: "长期记忆", description: "跨会话记住稳定偏好", ownHeading: true, content: <SettingsMemories session={session} enabled={<Toggle label="启用偏好记忆" checked={runtime?.memoryEnabled ?? true} disabled={busy || !runtime} onChange={memoryEnabled => runtimePreference({memoryEnabled})} />} advanced={<form className="settings-advanced-form" aria-label="记忆向量模型" onSubmit={event => { event.preventDefault(); void act(async () => { await chatApi.setModelRole("embedding", roles.embedding || ""); await refresh(); }); }}><label htmlFor={`${id}-embedding`}>Magpie 向量模型 ID（可选）</label><Input id={`${id}-embedding`} value={roles.embedding || ""} onChange={event => setRoles(current => ({...current, embedding: event.target.value}))} maxLength={300} spellCheck={false} autoComplete="off" /><p>留空使用词法搜索，修改后在后台重建索引。</p><Button type="submit" disabled={busy || !snapshot}>保存向量模型</Button>{error && <p className="settings-error" role="alert">{error}</p>}</form>} /> },
      { name: "技能", description: "可复用的领域规范与审校工作流", ownHeading: true, content: <SettingsSkills /> },
      { name: "MCP", title: "MCP 服务", description: "标准协议连接设计 / 浏览器 / 数据库", ownHeading: true, content: <SettingsMCP /> },
    ],
    workspace: [
      { name: "编辑器与快捷键", description: "顶栏“打开”默认编辑器、快捷键可重录", action: <Button size="small" onClick={() => void act(() => { localStorage.removeItem("chela.shortcuts"); setShortcuts(readShortcuts()); })}>恢复默认</Button>, content: <div className="settings-card">
        <Row label="默认代码编辑器" description="多个自动定位当前子仓"><Select aria-label="默认代码编辑器" value={editor} onChange={event => { setEditor(event.target.value); workspacePreference("chela.workspace.editor", event.target.value); }}><option value="system">系统文件管理器</option><option value="vscode">Visual Studio Code</option><option value="cursor">Cursor</option><option value="windsurf">Windsurf</option></Select></Row>
        {(Object.keys(shortcutNames) as ShortcutAction[]).map(action => <Row key={action} label={shortcutNames[action]} description={action === "settings" ? "任意视图快速打开" : action === "newTab" ? "打开浏览器或变更" : action === "togglePreview" ? "记忆上次标签页" : "单仓根目录 / 多仓子仓"}><kbd>{shortcutLabel(shortcuts[action])}</kbd><Button size="small" onClick={() => setEditingShortcut(action)}>修改</Button></Row>)}
      </div> },
      { name: "目录与多 Git", description: "默认目录与多仓库变更扫描", content: <div className="settings-card">
        <Row label="默认工作区目录" description={directory || "未设置，新建对话可直接开始"}><Button size="small" onClick={() => { setDirectoryDraft(directory); setEditingDirectory(true); }}>更改</Button></Row>
        <Row label="自动探测多 Git 子仓" description="≥ 2 个仓库展示树切换器"><Toggle label="多 Git 仓库自动探测" checked={gitDetect} onChange={value => { setGitDetect(value); workspacePreference("chela.git.detect", String(value)); }} /></Row>
        <Row label="最大扫描深度" description="忽略 node_modules / dist"><Select aria-label="仓库探测深度" value={gitDepth} disabled={!gitDetect} onChange={event => { setGitDepth(Number(event.target.value)); workspacePreference("chela.git.depth", event.target.value); }}>{[0,1,2,3,4].map(value => <option key={value} value={value}>{value === 0 ? "仅根目录" : `${value} 级`}</option>)}</Select></Row>
        <Row label="总览禁止批量还原" description="须切入单仓才可全部还原（始终保护）"><Toggle label="总览禁止批量还原" checked disabled onChange={() => {}} /></Row>
      </div> },
      { name: "浏览器与端口", title: "内嵌浏览器与端口", description: "同步至右栏新标签页快捷入口", action: <Button size="small" onClick={() => { setPort(""); setPortError(""); setEditingPort(""); }}><Plus size={14} />添加端口</Button>, content: <div className="settings-card">
        <Row label="允许元素拾取" description="点击元素生成注释码到输入框"><Toggle label="允许元素拾取" checked={preview.picker} onChange={picker => previewPreference({...preview, picker})} /></Row>
        {preview.ports.map(url => <Row key={url} label={new URL(url).host} description="本机页面快捷入口"><Button size="small" onClick={() => { setPort(url); setPortError(""); setEditingPort(url); }}>编辑</Button><Button size="small" className="settings-danger" onClick={() => previewPreference({...preview, ports: preview.ports.filter(value => value !== url)})}>移除</Button></Row>)}
      </div> },
      { name: "网络代理", description: "统一管理模型与更新的网络连接", content: <NetworkSettings/> },
    ],
    data: [
      { name: "会话归档", description: "完整保留记录，可恢复原会话", action:<small>共 {archived.length} 条</small>, content: <ArchiveCard sessions={archived} refresh={refresh}/> },
      { name: "诊断与数据", description: "脱敏诊断包与本地日志", ownHeading: true, content: <DataSettings/> },
      { name: "关于", description: "版本与更新", content: <DataSettings about/> },
    ],
  };
  const filter = query.trim().toLocaleLowerCase();
  const visible = sections[group].filter(s => !filter || `${s.name} ${s.title || ""} ${s.description}`.toLocaleLowerCase().includes(filter));
  const goTo = (name: string) => {
    setActive(name);
    document.getElementById(`${id}-${name}`)?.scrollIntoView({ block: "start", behavior: appearance.reducedMotion || matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };
  return <main className="settings-workspace" data-group={group} aria-label="设置">
    <Sidebar id={`${id}-sidebar`} title="设置" open actions={<kbd>{shortcutLabel(shortcuts.settings)}</kbd>} toolbar={<SearchField placeholder="搜索设置…" aria-label="搜索设置" value={query} onChange={event => setQuery(event.target.value)} />}>
      <nav aria-label="设置分类">{(Object.keys(settingGroups) as Group[]).map(key => <SidebarItem key={key} aria-current={group === key ? "page" : undefined} onClick={() => { location.hash = `settings/${key}`; }}><img src={settingGroups[key].icon} width={15} height={15} alt="" />{settingGroups[key].name}</SidebarItem>)}</nav>
    </Sidebar>
    <div className="settings-main">
      <header className="settings-topbar"><SettingsSubnav group={group} value={active || settingsSections[group][0]} onChange={goTo} renderPanel={() => null} navigationOnly />
        <span className="settings-save-status" role="status">{!busy && !error && <img src={check} width={12} height={12} alt="" />}{busy ? "正在保存…" : error ? "保存或读取失败" : status || "已自动保存"}</span>
      </header>
      <div ref={scroll} className="settings-scroll"><div className="settings-column">
        {error && <p role="alert" className="settings-error">{error}</p>}
        {!visible.length && <p role="status">此分类中没有匹配设置。</p>}
        {visible.map(s => <section id={`${id}-${s.name}`} key={s.name} className="settings-section" aria-label={s.title || s.name}>
          {!s.ownHeading && <SectionHeading title={s.title || s.name} description={s.description}>{s.action}</SectionHeading>}{s.content}
        </section>)}
      </div></div>
    </div>
    {editingShortcut && <SettingsDialog title={`修改${shortcutNames[editingShortcut]}快捷键`} onClose={() => setEditingShortcut(null)}><p>按新的组合键，使用 Ctrl、Alt 或 Meta 加一个按键。Esc 取消。</p><Input aria-label="录入快捷键" autoFocus readOnly value={shortcutLabel(shortcuts[editingShortcut])} onKeyDown={event => { if (event.key === "Tab" || event.key === "Escape") return; event.preventDefault(); event.stopPropagation(); if (["Control","Alt","Shift","Meta"].includes(event.key)) return; try { setShortcuts(saveShortcut(editingShortcut, {code:event.code,ctrl:event.ctrlKey,meta:event.metaKey,alt:event.altKey,shift:event.shiftKey})); setEditingShortcut(null); setError(""); setStatus("已自动保存"); } catch (cause) { setError(String(cause)); } }} />{error && <p className="settings-error" role="alert">{error}</p>}</SettingsDialog>}
    {editingDirectory && <SettingsDialog title="默认工作区目录" onClose={() => setEditingDirectory(false)}><form className="settings-advanced-form" onSubmit={event => { event.preventDefault(); void act(async () => { await chatApi.setDefaultDirectory(directoryDraft); setDirectory(directoryDraft); setEditingDirectory(false); }); }}><label htmlFor={`${id}-directory`}>新建对话使用此目录，留空可直接开始无项目对话</label><Input id={`${id}-directory`} autoFocus value={directoryDraft} onChange={event => setDirectoryDraft(event.target.value)} /><div className="settings-dialog-actions"><Button disabled={busy || !window.chelaDesktop} onClick={() => void act(async () => { const path = await chatApi.chooseDefaultDirectory(); setDirectory(path); setDirectoryDraft(path); })}>选择目录</Button><Button type="submit" variant="primary" disabled={busy}>保存</Button></div>{error && <p className="settings-error" role="alert">{error}</p>}</form></SettingsDialog>}
    {editingPort !== null && <SettingsDialog title={editingPort ? "编辑端口" : "添加端口"} onClose={() => setEditingPort(null)}><form className="settings-advanced-form" onSubmit={event => { event.preventDefault(); try { const url = localPreviewURL(port), others = preview.ports.filter(value => value !== editingPort); if (others.includes(url)) throw Error("此地址已保存"); setPreview(savePreviewPreferences({...preview, ports: editingPort ? preview.ports.map(value => value === editingPort ? url : value) : [...others, url]})); setEditingPort(null); setPortError(""); setStatus("已自动保存"); } catch (cause) { setPortError(String(cause)); } }}><label htmlFor={`${id}-port`}>本机页面地址</label><Input id={`${id}-port`} name="url" autoFocus type="url" required value={port} autoCapitalize="none" spellCheck={false} aria-invalid={Boolean(portError)} aria-describedby={`${id}-port-help`} onChange={event => { setPort(event.target.value); setPortError(""); }} /><p id={`${id}-port-help`}>例如 http://localhost:5173，最多保存 8 个。</p>{portError && <p className="settings-error" role="alert">{portError}</p>}<div className="settings-dialog-actions"><Button type="submit" variant="primary">保存</Button></div></form></SettingsDialog>}
    {providerEditor && <SettingsDialog title="供应商与凭证" onClose={() => setProviderEditor(null)}><ModelSettings key={providerEditor} initialMode={providerEditor} embedded showRoles={false} onSaved={async () => { await refresh(); setProviderEditor(null); }} /></SettingsDialog>}
    {advancedModels && <SettingsDialog title="模型与上下文偏好" onClose={() => setAdvancedModels(false)}><div className="settings-card">{roleRows.slice(1)}<Row label="默认思考强度"><Select aria-label="完整思考强度" value={roles.effort || snapshot?.effort || "off"} disabled={busy || !snapshot} onChange={event => modelDefault("effort", event.target.value)}>{[{value:"off",label:"关闭"},{value:"low",label:"低"},{value:"medium",label:"中"},{value:"high",label:"高"},{value:"xhigh",label:"极高"}].map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</Select></Row><Row label="自动整理阈值" description="安全输入预算的使用比例，仍保留预算校验"><Select aria-label="自动整理阈值" value={roles.compactionThreshold || "72"} disabled={busy || !snapshot || roles.compactionEnabled === "false"} onChange={event => modelDefault("compactionThreshold", event.target.value)}>{[50,60,70,72,80,90].map(percent => <option key={percent} value={percent}>{percent}%</option>)}</Select></Row></div></SettingsDialog>}
    {companion && <SettingsDialog title="人格、关注与陪伴" onClose={() => setCompanion(false)}><CompanionPanel /></SettingsDialog>}
  </main>;
}
