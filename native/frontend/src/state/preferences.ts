import { useEffect } from "react";
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

export const readEditor = () => localStorage.getItem("chela.workspace.editor") || "system";
export function readGitDepth() {
  const depth = Number(localStorage.getItem("chela.git.depth") ?? 2);
  return localStorage.getItem("chela.git.detect") === "false" ? 0 : Number.isInteger(depth) && depth >= 0 && depth <= 4 ? depth : 2;
}
function readFavorites(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem("chela.chat.favorites") || "[]");
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch { return []; }
}
function read() { return { gitDepth: readGitDepth(), editor: readEditor(), favorites: readFavorites() }; }
export const preferencesState = createStore(read);
let users = 0;
function refresh() { preferencesState.setState(read()); }
function subscribe() {
  if (++users === 1) {
    refresh();
    window.addEventListener("chela-workspace-settings", refresh);
    window.addEventListener("storage", refresh);
  }
  return () => {
    if (--users) return;
    window.removeEventListener("chela-workspace-settings", refresh);
    window.removeEventListener("storage", refresh);
  };
}
export function usePreferences<T>(selector: (state: ReturnType<typeof read>) => T) {
  useEffect(subscribe, []);
  return useStore(preferencesState, selector);
}
export function saveWorkspacePreference(key: string, value: string) {
  localStorage.setItem(key, value);
  window.dispatchEvent(new Event("chela-workspace-settings"));
}
export function setFavorite(id: string, on: boolean) {
  const favorites = readFavorites().filter(value => value !== id);
  if (on) favorites.push(id);
  localStorage.setItem("chela.chat.favorites", JSON.stringify(favorites));
  preferencesState.setState({ favorites });
}
