import {
  appendFileSync,
  closeSync,
  existsSync,
  fstatSync,
  mkdirSync,
  openSync,
  readSync,
} from "node:fs";
import { dirname } from "node:path";
import {
  atomicWriteTextSync,
  readJsonFileSync,
} from "../json-file.ts";

export function ensureDir(dirPath: string): void {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

export function atomicWrite(filePath: string, data: string): void {
  atomicWriteTextSync(filePath, data);
}

export function appendLine(filePath: string, line: string): void {
  ensureDir(dirname(filePath));
  const fd = openSync(filePath, "a+");
  try {
    const size = fstatSync(fd).size;
    const tail = Buffer.alloc(1);
    const needsNewline =
      size > 0 && readSync(fd, tail, 0, 1, size - 1) === 1 && tail[0] !== 10;
    // Keep a crash-truncated last line from swallowing the next event.
    appendFileSync(fd, (needsNewline ? "\n" : "") + line + "\n", "utf-8");
  } finally {
    closeSync(fd);
  }
}

export const readJsonFile = readJsonFileSync;
