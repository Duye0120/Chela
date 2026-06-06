import { existsSync, readFileSync } from "node:fs";
import type { SessionTranscriptEvent } from "../../shared/contracts.ts";
import { getTranscriptPath } from "./paths.ts";
export {
  countMaterializedMessages,
  materializeMessages,
} from "./transcript-materialize.ts";

export function loadTranscript(sessionId: string): SessionTranscriptEvent[] {
  const filePath = getTranscriptPath(sessionId);
  if (!existsSync(filePath)) {
    return [];
  }

  const lines = readFileSync(filePath, "utf-8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const events: SessionTranscriptEvent[] = [];
  for (const line of lines) {
    try {
      events.push(JSON.parse(line) as SessionTranscriptEvent);
    } catch {
      // Skip malformed event lines so valid events continue loading.
    }
  }

  return events;
}
