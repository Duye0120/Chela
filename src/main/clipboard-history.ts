import { createHash } from "node:crypto";
import type { ClipboardShelfItem } from "../shared/clipboard-shelf.ts";

const MAX_ITEMS = 30;
const MAX_TOTAL_BYTES = 16 * 1024 * 1024;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_TEXT_LENGTH = 100_000;

// Session-only history: never persist clipboard contents or send them to the agent.
export class ClipboardHistory {
  private items: ClipboardShelfItem[] = [];
  private lastId = "";

  list(): ClipboardShelfItem[] {
    return this.items.map((item) => ({ ...item }));
  }

  captureText(text: string): boolean {
    if (!text || text.length > MAX_TEXT_LENGTH) return this.ignoreCurrent();
    return this.add("text", text);
  }

  captureImage(bitmap: Buffer, size: { width: number; height: number }, encodePng: () => Buffer): boolean {
    if (!bitmap.length) return this.ignoreCurrent();
    const id = createHash("sha256").update(`image:${size.width}x${size.height}:`).update(bitmap).digest("hex");
    if (id === this.lastId) return false;
    const png = encodePng();
    if (!png.length || png.length > MAX_IMAGE_BYTES) {
      this.lastId = id;
      return false;
    }
    return this.add("image", png.toString("base64"), id);
  }

  ignoreCurrent(): false {
    this.lastId = "";
    return false;
  }

  private add(kind: ClipboardShelfItem["kind"], value: string, id = createHash("sha256").update(kind).update(value).digest("hex")): boolean {
    if (id === this.lastId) return false;
    this.lastId = id;
    this.items = this.items.filter((item) => item.id !== id);
    this.items.unshift({
      id,
      kind,
      text: kind === "text" ? value : "图片",
      ...(kind === "image" ? { imageDataUrl: `data:image/png;base64,${value}` } : {}),
      createdAt: new Date().toISOString(),
    });
    let bytes = 0;
    this.items = this.items.filter((item, index) => {
      bytes += Buffer.byteLength(item.imageDataUrl ?? item.text, "utf8");
      return index < MAX_ITEMS && bytes <= MAX_TOTAL_BYTES;
    });
    return true;
  }

  get(id: unknown): ClipboardShelfItem {
    if (typeof id !== "string") throw new Error("剪贴板记录 ID 无效。");
    const item = this.items.find((entry) => entry.id === id);
    if (!item) throw new Error("剪贴板记录已移除，请刷新后重试。");
    return { ...item };
  }

  markCopied(id: string): void {
    this.get(id);
    this.lastId = id;
  }

  remove(id: unknown): void {
    const item = this.get(id);
    this.items = this.items.filter((entry) => entry.id !== item.id);
  }

  clear(): void {
    this.items = [];
    // Keep the current fingerprint so clearing does not immediately re-record it.
  }
}
