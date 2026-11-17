export const themePresets = [
  { id: "ink", name: "松烟墨青", bg: "#f4f6f6", accent: "#0f6e68", text: "#151c1b", muted: "#d7e3e1", dark: false },
  { id: "paper", name: "和纸陶釉", bg: "#f6f3ec", accent: "#b8512a", text: "#1f1c18", muted: "#dfd8ca", dark: false },
  { id: "blue", name: "冷杉暮蓝", bg: "#f4f6fa", accent: "#35599c", text: "#161a23", muted: "#d8e0f0", dark: false },
  { id: "classic", name: "晴海经典", bg: "#f7f7f5", accent: "#1d73c9", text: "#37352f", muted: "#dfdfd9", dark: false },
  { id: "forest", name: "森林青瓷", bg: "#f3f6f4", accent: "#398263", text: "#18241e", muted: "#d6e3dc", dark: false },
  { id: "iris", name: "暮光鸢尾", bg: "#f5f4f9", accent: "#7358b8", text: "#1f1b2c", muted: "#ddd6ee", dark: false },
  { id: "rose", name: "朱砂浅绯", bg: "#f8f4f5", accent: "#a6445e", text: "#251b1e", muted: "#e2d4d8", dark: false },
  { id: "obsidian", name: "曜石松烟", bg: "#141717", accent: "#3aa89f", text: "#eaefef", muted: "#2d3837", dark: true },
  { id: "night", name: "夜幕森绿", bg: "#121815", accent: "#4ba880", text: "#e8efea", muted: "#2c3c34", dark: true },
  { id: "violet", name: "暮紫幽夜", bg: "#15131b", accent: "#a893db", text: "#edebf5", muted: "#342f46", dark: true },
] as const;

export type Appearance = { mode: "system" | "light" | "dark"; preset: string; uiFont: string; uiSize: number; codeFont: string; codeSize: number; terminalFont: string; terminalSize: number; reducedMotion: boolean; dockAutoHide: boolean; dockHideDelay: number; iconExpressions: boolean };
const defaults: Appearance = { mode: "light", preset: "classic", uiFont: "system", uiSize: 14, codeFont: "Maple Mono NF CN", codeSize: 13, terminalFont: "Maple Mono NF CN", terminalSize: 13, reducedMotion: false, dockAutoHide: false, dockHideDelay: 5, iconExpressions: true };
const validFont = (font: unknown): font is string => typeof font === "string" && font.trim().length > 0 && font.length <= 200 && !/[\u0000-\u001f]/.test(font);
const validSize = (size: number, min: number, max: number) => Number.isInteger(size) && size >= min && size <= max;
export function readAppearance(): Appearance {
  try {
    const value = JSON.parse(localStorage.getItem("chela.shell.appearance") || "null");
    if (value?.preset === "macos") value.preset = "classic";
    if (!value || !["system", "light", "dark"].includes(value.mode) || !themePresets.some(p => p.id === value.preset)
      || !validFont(value.uiFont) || !validSize(value.uiSize, 12, 20)
      || !validFont(value.codeFont) || !validSize(value.codeSize, 10, 18)) return defaults;
    return { ...defaults, ...value, terminalFont: validFont(value.terminalFont) ? value.terminalFont : value.codeFont, terminalSize: validSize(value.terminalSize, 8, 20) ? value.terminalSize : value.codeSize, reducedMotion: value.reducedMotion === true, dockAutoHide: value.dockAutoHide === true, dockHideDelay: [3,5,10,30].includes(value.dockHideDelay) ? value.dockHideDelay : 5, iconExpressions: value.iconExpressions !== false };
  } catch { return defaults; }
}
export function applyAppearance(value: Appearance) {
  const preset = themePresets.find(p => p.id === value.preset) || themePresets[3];
  const root = document.documentElement;
  const dark = value.mode === "system" ? matchMedia("(prefers-color-scheme: dark)").matches : value.mode === "dark";
  root.dataset.theme = dark ? "dark" : "light";
  root.style.colorScheme = dark ? "dark" : "light";
  root.dataset.reducedMotion = String(value.reducedMotion);
  root.style.setProperty("--chela-color-accent-default", preset.accent);
  root.style.setProperty("--chela-color-text-on-accent", preset.dark ? "#000000" : "#ffffff");
  root.style.setProperty("--chela-color-accent-border", preset.accent);
  root.style.setProperty("--chela-color-accent-subtle", "color-mix(in oklab, var(--chela-color-accent-default) 10%, var(--chela-color-bg-surface))");
  root.style.setProperty("--chela-color-accent-subtle-hover", "color-mix(in oklab, var(--chela-color-accent-default) 18%, var(--chela-color-bg-surface))");
  for (const [key, color] of Object.entries({ "bg-canvas": preset.bg, "bg-subtle": preset.bg, "text-primary": preset.text })) {
    if (dark === preset.dark && preset.id !== "classic") root.style.setProperty(`--chela-color-${key}`, color);
    else root.style.removeProperty(`--chela-color-${key}`);
  }
  root.style.setProperty("--chela-type-family-ui", value.uiFont === "system" ? 'Inter, "Microsoft YaHei UI", "Segoe UI", sans-serif' : `${JSON.stringify(value.uiFont)}, "Segoe UI", sans-serif`);
  root.style.setProperty("--chela-type-family-code", `${JSON.stringify(value.codeFont)}, Consolas, monospace`);
  root.style.setProperty("--chela-type-family-terminal", `${JSON.stringify(value.terminalFont)}, Consolas, monospace`);
  root.style.setProperty("--chela-type-body-size", `${value.uiSize}px`);
  root.style.setProperty("--chela-type-control", `400 ${value.uiSize - 1}px/18px var(--chela-font-ui)`);
  root.style.setProperty("--chela-type-code-size", `${value.codeSize}px`);
  root.style.setProperty("--chela-type-terminal-size", `${value.terminalSize}px`);
}
