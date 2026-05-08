import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { ReadinessTraceEvent } from "./types.ts";

export class ReadinessTraceStore {
  readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async appendEvent(event: ReadinessTraceEvent): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(event)}\n`, { flag: "a" });
  }

  async readRecentEvents(limit: number): Promise<ReadinessTraceEvent[]> {
    if (limit <= 0) {
      return [];
    }

    const events = await this.readAllEvents();
    return events.slice(-limit);
  }

  async readAllEvents(): Promise<ReadinessTraceEvent[]> {
    const content = await this.readFileIfExists();
    if (content.trim() === "") {
      return [];
    }

    const events: ReadinessTraceEvent[] = [];
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed === "") {
        continue;
      }

      try {
        const parsed = JSON.parse(trimmed) as unknown;
        if (isReadinessTraceEvent(parsed)) {
          events.push(parsed);
        }
      } catch {
        continue;
      }
    }

    return events;
  }

  private async readFileIfExists(): Promise<string> {
    try {
      return await readFile(this.filePath, "utf8");
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return "";
      }
      throw error;
    }
  }
}

function isReadinessTraceEvent(value: unknown): value is ReadinessTraceEvent {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<ReadinessTraceEvent>;
  return (
    candidate.schemaVersion === 1 &&
    typeof candidate.traceId === "string" &&
    typeof candidate.runId === "string" &&
    typeof candidate.sessionId === "string" &&
    typeof candidate.eventId === "string" &&
    typeof candidate.eventType === "string" &&
    typeof candidate.component === "string" &&
    typeof candidate.ts === "number"
  );
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error;
}
