import { basename, extname } from "node:path";
import { readFile, stat } from "node:fs/promises";
import { dialog, type BrowserWindow } from "electron";
import type { FileKind, FilePreviewResult, SelectedFile } from "../shared/contracts.js";

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "ico"]);
const TEXT_EXTENSIONS = new Set([
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
const MAX_PREVIEW_CHARACTERS = 6_000;

function getExtension(filePath: string) {
  return extname(filePath).replace(/^\./, "").toLowerCase();
}

function inferFileKind(extension: string): FileKind {
  if (!extension) {
    return "unknown";
  }

  if (TEXT_EXTENSIONS.has(extension)) {
    return "text";
  }

  if (IMAGE_EXTENSIONS.has(extension)) {
    return "image";
  }

  return "binary";
}

export async function pickFiles(browserWindow: BrowserWindow) {
  const result = await dialog.showOpenDialog(browserWindow, {
    title: "选择要附加的本地文件",
    properties: ["openFile", "multiSelections"],
  });

  if (result.canceled) {
    return [];
  }

  const selectedFiles = await Promise.all(
    result.filePaths.map(async (filePath) => {
      const fileStat = await stat(filePath);
      const extension = getExtension(filePath);

      return {
        id: crypto.randomUUID(),
        name: basename(filePath),
        path: filePath,
        size: fileStat.size,
        extension,
        kind: inferFileKind(extension),
      } satisfies SelectedFile;
    }),
  );

  return selectedFiles;
}

export async function readFilePreview(filePath: string): Promise<FilePreviewResult> {
  const extension = getExtension(filePath);
  const kind = inferFileKind(extension);

  if (kind !== "text") {
    return {
      path: filePath,
      truncated: false,
      error: "当前文件类型暂不支持文本预览。",
    };
  }

  try {
    const content = await readFile(filePath, "utf8");
    const truncated = content.length > MAX_PREVIEW_CHARACTERS;

    return {
      path: filePath,
      previewText: truncated ? content.slice(0, MAX_PREVIEW_CHARACTERS) : content,
      truncated,
    };
  } catch (error) {
    return {
      path: filePath,
      truncated: false,
      error: error instanceof Error ? error.message : "读取文件预览失败。",
    };
  }
}
