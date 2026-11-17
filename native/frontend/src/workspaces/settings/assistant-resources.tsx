import { useEffect, useState, type ReactNode } from "react";
import { Plus } from "lucide-react";
import { Button } from "../../ui/button";
import { CapabilitiesPanel } from "../../app/capabilities-panel";
import { MCPPanel } from "../../app/mcp-panel";
import { MemoryPanel } from "../chat/memory-panel";
import { chatApi, type Capability, type ChatSession, type MCPConfig, type MCPStatus, type MemoryItem } from "../../data/chat";
import { Row, SectionHeading, Toggle } from "./settings-controls";
import { SettingsDialog } from "./settings-dialog";

export function SettingsSkills() {
  const [selection, setSelection] = useState("");
  const [items, setItems] = useState<Capability[]>([]), [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const load = () => chatApi.capabilities().then(setItems);
  useEffect(() => { void load().catch(cause => setError(String(cause))); }, []);
  async function toggle(item: Capability) {
    if (!item.enabled && item.trust === "trusted-native") { setSelection(item.id); setOpen(true); return; }
    setBusy(true); setError("");
    try { await chatApi.changeCapability(item.id, item.enabled ? "disable" : "enable"); await load(); }
    catch (cause) { setError(String(cause)); }
    finally { setBusy(false); }
  }
  return <>
    <SectionHeading title="技能" description="可复用的领域规范与审校工作流"><Button size="small" onClick={() => { setSelection(""); setOpen(true); }}><Plus size={14} />导入</Button></SectionHeading>
    <div className="settings-card">{!items.length && <p className="settings-empty">尚未安装技能或扩展。</p>}{items.map(item => <Row key={item.id} label={item.name} description={item.problem || item.root || item.source}>
      <Button size="small" onClick={() => { setSelection(item.id); setOpen(true); }}>详情</Button><Toggle label={`启用 ${item.name}`} checked={item.enabled} disabled={busy || item.health === "unsupported"} onChange={() => void toggle(item)} />
    </Row>)}</div>
    {error && <p className="settings-error" role="alert">{error}</p>}
    {open && <SettingsDialog title="技能与扩展" onClose={() => { setOpen(false); void load().catch(cause => setError(String(cause))); }}><CapabilitiesPanel embedded initialItem={selection} importing={!selection} /></SettingsDialog>}
  </>;
}

export function SettingsMCP() {
  const [selection, setSelection] = useState<MCPConfig>({id:"",revision:0,project:"",description:"",autoApprove:false});
  const [items, setItems] = useState<MCPStatus[]>([]), [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const load = () => chatApi.mcpServers().then(setItems);
  useEffect(() => { void load().catch(cause => setError(String(cause))); }, []);
  async function change(item?: MCPStatus) {
    setBusy(true); setError("");
    try { if (item) await chatApi.changeMCP(item.config.id, item.enabled ? "disable" : "enable"); await load(); }
    catch (cause) { setError(String(cause)); }
    finally { setBusy(false); }
  }
  return <>
    <SectionHeading title="MCP 服务" description="标准协议连接设计 / 浏览器 / 数据库"><Button size="small" disabled={busy} onClick={() => void change()}>刷新</Button><Button size="small" variant="primary" onClick={() => { setSelection({id:"",revision:0,project:"",description:"",autoApprove:false}); setOpen(true); }}><Plus size={14} />添加</Button></SectionHeading>
    <div className="settings-card">{!items.length && <p className="settings-empty">尚未添加 MCP 服务。</p>}{items.map(item => <Row key={item.config.id} label={item.config.id} description={item.problem || `${item.config.url || "stdio"} · ${item.tools} 项工具`}>
      <span className="settings-tag" data-tone={item.health === "connected" ? "success" : item.health === "failed" ? "error" : undefined}>{item.health === "connected" && <i />}{({connected:"已连接",connecting:"连接中",disabled:"未启动",failed:"连接失败"} as Record<string,string>)[item.health] || item.health}</span>
      <Button size="small" onClick={() => { setSelection(item.config); setOpen(true); }}>{item.enabled ? "管理" : "配置"}</Button><Toggle label={`启用 ${item.config.id}`} checked={item.enabled} disabled={busy} onChange={() => void change(item)} />
    </Row>)}</div>
    {error && <p className="settings-error" role="alert">{error}</p>}
    {open && <SettingsDialog title="MCP 连接" onClose={() => { setOpen(false); void load().catch(cause => setError(String(cause))); }}><MCPPanel embedded initialConfig={selection} /></SettingsDialog>}
  </>;
}

export function SettingsMemories({ session, enabled, advanced }: { session?: ChatSession; enabled: ReactNode; advanced: ReactNode }) {
  const [items, setItems] = useState<MemoryItem[]>([]), [open, setOpen] = useState(false), [edit, setEdit] = useState<MemoryItem | null>(null), [forget, setForget] = useState(""), [clear, setClear] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const load = () => session ? chatApi.memories(session.id).then(setItems) : Promise.resolve();
  useEffect(() => { void load().catch(cause => setError(String(cause))); }, [session?.id]);
  async function clearMemories() {
    if (!session) return;
    setBusy(true); setError("");
    try { for (const item of items) await chatApi.forgetMemory(session.id, item.id, item.revision); setClear(false); }
    catch (cause) { setError(String(cause)); }
    finally { await load().catch(cause => setError(String(cause))); setBusy(false); }
  }
  return <>
    <SectionHeading title="长期记忆" description="跨会话记住稳定偏好"><Button size="small" disabled={!session} onClick={() => { setEdit(null); setForget(""); setOpen(true); }}><Plus size={14} />新增</Button><Button size="small" className="settings-danger" disabled={!items.length || busy} onClick={() => setClear(true)}>清空</Button></SectionHeading>
    <div className="settings-card"><Row label="启用偏好记忆" description="仅提取稳定偏好，不存密钥">{enabled}</Row>
      {items.map(item => <Row key={item.id} label={item.content} description={`${new Date(item.recorded_at).toLocaleDateString()} · ${{assistant:"全局",project:"当前项目",session:"当前会话"}[item.scope.type]}${item.status === "candidate" ? " · 待确认" : item.status === "disputed" ? " · 存在冲突" : ""}`}>
        <Button size="small" onClick={() => { setEdit(item); setForget(""); setOpen(true); }}>编辑</Button><Button size="small" className="settings-danger" onClick={() => { setEdit(null); setForget(item.id); setOpen(true); }}>移除</Button>
      </Row>)}
      {!items.length && <p className="settings-empty">{session ? "暂无可用记忆" : "先创建对话，再管理适用记忆"}</p>}
    </div>
    {error && <p className="settings-error" role="alert">{error}</p>}
    {open && session && <SettingsDialog title={edit ? "编辑记忆" : forget ? "移除记忆" : "管理记忆"} onClose={() => { setOpen(false); void load().catch(cause => setError(String(cause))); }}><MemoryPanel session={session} embedded initialEdit={edit} initialForget={forget} />{advanced}</SettingsDialog>}
    {clear && <SettingsDialog busy={busy} title="清空适用记忆？" onClose={() => { if (!busy) setClear(false); }}><p>移除此会话可使用的 {items.length} 条记忆，并阻止旧来源再次提取。原聊天保留；当前回复将停止，下轮重建上下文。已发送给模型的请求无法撤回。</p><div className="settings-dialog-actions"><Button autoFocus disabled={busy} onClick={() => setClear(false)}>取消</Button><Button className="settings-danger" disabled={busy} onClick={() => void clearMemories()}>{busy ? "正在清空…" : "确认清空"}</Button></div>{error && <p role="alert" className="settings-error">{error}</p>}</SettingsDialog>}
  </>;
}
