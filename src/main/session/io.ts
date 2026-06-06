import {
  appendFileSync,
  existsSync,
  mkdirSync,
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
  appendFileSync(filePath, line + "\n", "utf-8");
}

export const readJsonFile = readJsonFileSync;
