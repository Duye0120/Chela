import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// shortcut: compare normalized directory text, upgrade to filesystem identity for linked directories.
export function directoryKey(directory: string): string {
  return directory.replace(/[\\/]+/g, "/").replace(/\/$/, "").toLowerCase();
}
