export type PreviewPreferences = { picker: boolean; ports: string[] };
export function localPreviewURL(raw: string) {
  const url = new URL(raw.trim());
  if (!["http:", "https:"].includes(url.protocol) || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.username || url.password || url.search || url.hash || url.pathname !== "/") throw Error("请输入本机 HTTP / HTTPS 地址，例如 http://localhost:5173");
  return url.origin;
}
export function readPreviewPreferences(): PreviewPreferences {
  const defaults = { picker: true, ports: ["http://localhost:5173", "http://localhost:3000"] };
  try {
    const raw = JSON.parse(localStorage.getItem("chela.preview.preferences") || "null");
    if (!raw || typeof raw.picker !== "boolean" || !Array.isArray(raw.ports) || raw.ports.length > 8) return defaults;
    return { picker: raw.picker, ports: [...new Set<string>(raw.ports.map(localPreviewURL))] };
  } catch { return defaults; }
}
export function savePreviewPreferences(value: PreviewPreferences) {
  if (value.ports.length > 8) throw Error("最多保存 8 个本机地址");
  const saved = { picker: value.picker, ports: [...new Set(value.ports.map(localPreviewURL))] };
  localStorage.setItem("chela.preview.preferences", JSON.stringify(saved));
  window.dispatchEvent(new Event("chela-workspace-settings"));
  return saved;
}
