import type { Settings } from "@shared/contracts";

export function applyAppearance(
  { theme, customTheme, ui }: Pick<Settings, "theme" | "customTheme" | "ui">,
  previousKeys: string[],
): string[] {
  const root = document.documentElement;
  previousKeys.forEach((key) => root.style.removeProperty(key));
  root.dataset.theme = theme;
  root.style.setProperty("--app-ui-font-family", ui.fontFamily);
  root.style.setProperty("--app-ui-font-size", `${ui.fontSize}px`);
  root.style.setProperty("--app-code-font-family", ui.codeFontFamily);
  root.style.setProperty("--app-code-font-size", `${ui.codeFontSize}px`);

  const keys: string[] = [];
  if (theme === "custom" && customTheme) {
    for (const [rawKey, value] of Object.entries(customTheme)) {
      const key = rawKey.startsWith("--") ? rawKey : `--${rawKey}`;
      root.style.setProperty(key, value ?? null);
      keys.push(key);
    }
  }
  return keys;
}
