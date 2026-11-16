type DesktopBridge = {
  call<T>(method: string, ...args: unknown[]): Promise<T>;
  window: {
    minimize(): Promise<void>;
    toggleMaximize(): Promise<void>;
    isMaximized(): Promise<boolean>;
    close(): Promise<void>;
  };
};

declare global {
  interface Window { mygo?: DesktopBridge }
}

export const desktop = window.mygo;

export async function serviceCall<T>(method:string,...args:unknown[]):Promise<T>{
  if(desktop)return desktop.call<T>(method,...args);
  const response=await fetch("/__chela/chat",{method:"POST",headers:{"Content-Type":"application/json","X-Chela-Chat":"1"},body:JSON.stringify({method:method.startsWith("Chat.")?method.slice(5):method,args})});
  if(!response.headers.get("content-type")?.includes("application/json"))throw Error("当前页面未连接 Chela 本地服务");
  const result=await response.json();if(!response.ok||result.error)throw Error(result.error||"本地服务不可用");return result.value;
}

export type WorkspaceProps = { sidebarOpen: boolean; onToggleSidebar: () => void };

// Keep browser preview records in this tab, separate from the desktop profile.
export function previewCollection<T extends { id: string }>(name: string) {
  const key = "chela.preview." + name;
  function list(): T[] {
    const data: unknown = JSON.parse(sessionStorage.getItem(key) ?? "[]");
    if (!Array.isArray(data)) throw new Error("无法读取预览数据");
    return data;
  }
  function save(item: T): T {
    const rows = list();
    const index = rows.findIndex(row => row.id === item.id);
    if (index === -1 && item.id) throw new Error("记录已不存在");
    const saved = { ...item, id: item.id || crypto.randomUUID() };
    if (index === -1) rows.push(saved);
    else rows[index] = saved;
    sessionStorage.setItem(key, JSON.stringify(rows));
    return saved;
  }
  function remove(id: string) {
    sessionStorage.setItem(key, JSON.stringify(list().filter(item => item.id !== id)));
  }
  function replace(rows: T[]) {
    sessionStorage.setItem(key, JSON.stringify(rows));
  }
  return { list, save, remove, replace };
}
