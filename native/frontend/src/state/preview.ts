import { createStore } from "zustand/vanilla";

export const previewState = createStore<{
  open: boolean;
  tab: string;
  changeRequest: { path: string; key: number } | null;
  requestedTab: string;
}>(() => ({ open: sessionStorage.getItem("chela.preview.open") === "true",
  tab: sessionStorage.getItem("chela.preview.tab") || "browser", changeRequest: null, requestedTab: "" }));

export function setPreviewOpen(value: boolean | ((open: boolean) => boolean)) {
  const open = typeof value === "function" ? value(previewState.getState().open) : value;
  sessionStorage.setItem("chela.preview.open", String(open));
  previewState.setState({ open });
}
export function setPreviewTab(value: string | ((tab: string) => string)) {
  const tab = typeof value === "function" ? value(previewState.getState().tab) : value;
  if (tab === previewState.getState().tab) return;
  sessionStorage.setItem("chela.preview.tab", tab);
  previewState.setState({ tab });
}
export function openDiff(path: string) {
  previewState.setState({ changeRequest: { path, key: performance.now() } });
  setPreviewOpen(true);
}
export function openBrowserTab(id: string) { previewState.setState({ requestedTab: id }); setPreviewOpen(true); }
