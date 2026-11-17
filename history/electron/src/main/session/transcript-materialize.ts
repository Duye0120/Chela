import type {
  ChatMessage,
  SessionTranscriptEvent,
} from "../../shared/contracts.ts";

export function countMaterializedMessages(
  events: SessionTranscriptEvent[],
): number {
  let count = 0;
  for (const event of events) {
    if (event.type === "user_message" || event.type === "assistant_message") {
      count += 1;
      continue;
    }

    if (
      event.type === "run_finished" &&
      event.finalState === "failed" &&
      event.reason === "app_restart_interrupted"
    ) {
      count += 1;
    }
  }
  return count;
}

export function materializeMessages(
  events: SessionTranscriptEvent[],
): ChatMessage[] {
  const messages: ChatMessage[] = [];

  for (const event of events) {
    if (event.type === "user_message" || event.type === "assistant_message") {
      messages.push(event.message);
      continue;
    }

    if (
      event.type === "run_finished" &&
      event.finalState === "failed" &&
      event.reason === "app_restart_interrupted"
    ) {
      messages.push({
        id: `system-${event.runId}-${event.seq}`,
        role: "system",
        content: "上次运行在应用退出或重启时中断，已标记为失败，可继续接着处理。",
        timestamp: event.timestamp,
        status: "done",
      });
    }
  }

  return messages;
}
