import { useRef, useState } from "react";
import { Button } from "../../ui/button";
import { Input } from "../../ui/text-field";
import { chatApi, type ChatSnapshot } from "./data";

export function ModelSettings({ onSaved }: { onSaved: () => Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [mode,setMode]=useState<"custom"|"magpie">("magpie");
  const [catalog,setCatalog]=useState<Awaited<ReturnType<typeof chatApi.magpie>>|null>(null);
  const [roles,setRoles]=useState<Record<string,string>>({});
  const [models,setModels]=useState<ChatSnapshot["models"]>([]);
  function open() {
    dialog.current?.showModal();setError("");
    void Promise.all([chatApi.magpie(),chatApi.modelRoles(),chatApi.load()]).then(([status,roles,snapshot])=>{setCatalog(status);setRoles(roles);setModels(snapshot.models)}).catch(e=>setError(String(e)));
  }
  async function refreshCatalog() {
    setBusy(true);setError("");
    try { await chatApi.refreshMagpie();setCatalog(await chatApi.magpie());await onSaved(); }
    catch(error) { setError(error instanceof Error ? error.message : "刷新失败"); }
    finally { setBusy(false); }
  }
  return (
    <>
      <Button variant="ghost" onClick={open}>
        配置模型
      </Button>
      <dialog
        ref={dialog}
        className="chat-delete-dialog chat-settings"
        aria-label="配置聊天模型"
      >
        <h2>配置聊天模型</h2>
        <div><Button type="button" aria-pressed={mode==="magpie"} onClick={()=>setMode("magpie")}>Magpie 目录</Button><Button type="button" aria-pressed={mode==="custom"} onClick={()=>setMode("custom")}>自定义模型</Button></div>
        {catalog?.url && <p>已缓存 {catalog.count} 个模型 · {catalog.stale?"目录待刷新":"目录已更新"}<br/>{catalog.fetchedAt && new Date(catalog.fetchedAt).toLocaleString()}<Button disabled={busy} onClick={()=>void refreshCatalog()}>刷新目录</Button></p>}
        <form
          key={mode}
          aria-label={mode==="magpie"?"连接 Magpie":"配置自定义模型"}
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget,
              data = new FormData(form);
            setError("");
            setBusy(true);
            try {
              if(mode==="magpie") await chatApi.connectMagpie(String(data.get("url")),String(data.get("key")));
              else await chatApi.configure(
                String(data.get("url")),
                String(data.get("model")),
                String(data.get("key")),
              );
              await onSaved();
              form.reset();
              dialog.current?.close();
            } catch (e) {
              setError(e instanceof Error ? e.message : "无法保存模型");
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            {mode==="magpie"?"Magpie 网关地址":"兼容 OpenAI 的接口地址"}
            <Input name="url" type="url" defaultValue={mode==="magpie"?(catalog?.url||"http://127.0.0.1:3425/v1"):""} placeholder="https://…/v1" required />
          </label>
          {mode==="custom" && <label>
            模型 ID
            <Input name="model" required />
          </label>}
          <label>
            {mode==="magpie"?"网关密钥（本机可选）":"API Key"}
            <Input
              name="key"
              type="password"
              autoComplete="off"
              placeholder="本机免密网关可留空"
            />
          </label>
          {error && <p role="alert">{error}</p>}
          <footer>
            <Button disabled={busy} onClick={() => dialog.current?.close()}>
              取消
            </Button>
            <Button type="submit" disabled={busy} variant="primary">
              {mode==="magpie"?"连接并读取目录":"保存模型"}
            </Button>
          </footer>
        </form>
        {!!models?.length && <section aria-label="模型用途"><h3>按用途选择模型</h3>{[{id:"chat",name:"默认聊天"},{id:"compaction",name:"整理上下文"},{id:"consolidation",name:"整理记忆"},{id:"proactivity",name:"主动关注"}].map(role=><form key={role.id} aria-label={role.name} onSubmit={async event=>{
          event.preventDefault();setBusy(true);setError("");try{await chatApi.setModelRole(role.id,roles[role.id]||"");await onSaved()}catch(error){setError(error instanceof Error?error.message:"保存失败")}finally{setBusy(false)}
        }}><label>{role.name}<select className="ui-field" name={role.id} value={roles[role.id]||""} onChange={event=>setRoles(current=>({...current,[role.id]:event.target.value}))}>
          <option value="">{role.id==="compaction"?"沿用本轮聊天模型":"沿用现有默认模型"}</option>{models.map(model=><option key={model.id} value={model.id}>{model.provider} · {model.label}</option>)}
        </select></label><Button type="submit" disabled={busy}>保存用途</Button></form>)}</section>}
        <form aria-label="记忆向量模型" onSubmit={async event=>{event.preventDefault();setBusy(true);setError("");try{await chatApi.setModelRole("embedding",roles.embedding||"");await onSaved()}catch(error){setError(error instanceof Error?error.message:"保存失败")}finally{setBusy(false)}}}>
          <label htmlFor="embedding-model">Magpie 向量模型 ID（可选）</label>
          <Input id="embedding-model" name="embedding" maxLength={300} spellCheck={false} autoCapitalize="none" autoCorrect="off" value={roles.embedding||""} onChange={event=>setRoles(current=>({...current,embedding:event.target.value}))} aria-describedby="embedding-help"/>
          <p id="embedding-help">填写网关支持的向量模型 ID。聊天目录不列出向量模型；留空使用词法搜索。保存后在后台重建索引，失败不会丢失记忆。</p>
          <Button type="submit" disabled={busy}>保存向量模型</Button>
        </form>
      </dialog>
    </>
  );
}
