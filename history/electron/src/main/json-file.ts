import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";

export function ensureParentDirSync(filePath: string): void {
  const parent = dirname(filePath);
  if (parent && !existsSync(parent)) {
    mkdirSync(parent, { recursive: true });
  }
}

export function readJsonFileSync<T>(filePath: string, fallback: T): T {
  if (!existsSync(filePath)) {
    return fallback;
  }

  try {
    return JSON.parse(readFileSync(filePath, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

export function readRequiredJsonFileSync(filePath: string): unknown {
  return JSON.parse(readFileSync(filePath, "utf-8")) as unknown;
}

export function atomicWriteTextSync(filePath: string, data: string): void {
  ensureParentDirSync(filePath);
  const tmpPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(tmpPath, data, "utf-8");
  renameSync(tmpPath, filePath);
}

export function writeJsonFileSync(filePath: string, data: unknown): void {
  atomicWriteTextSync(filePath, JSON.stringify(data, null, 2));
}

export async function readJsonFile<T>(
  filePath: string,
  fallback: T,
): Promise<T> {
  try {
    await access(filePath);
    return JSON.parse(await readFile(filePath, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

export async function writeJsonFile(
  filePath: string,
  data: unknown,
): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(tmpPath, JSON.stringify(data, null, 2), "utf-8");
  await rename(tmpPath, filePath);
}
