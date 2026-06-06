import { extname } from "node:path";

export const IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
  "svg",
  "ico",
]);

export const TEXT_EXTENSIONS = new Set([
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "json",
  "md",
  "txt",
  "yml",
  "yaml",
  "toml",
  "html",
  "css",
  "scss",
  "less",
  "py",
  "java",
  "go",
  "rs",
  "sh",
  "ps1",
  "xml",
  "csv",
  "env",
]);

export function getExtension(filePath: string): string {
  return extname(filePath).replace(/^\./, "").toLowerCase();
}
