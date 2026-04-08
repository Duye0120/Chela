import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@mariozechner/pi-ai";

const parameters = Type.Object({});

type GetTimeDetails = {
  isoTime: string;
  localTime: string;
  timeZone: string;
};

export const getTimeTool: AgentTool<typeof parameters, GetTimeDetails> = {
  name: "get_time",
  label: "Get Time",
  description: "Get the current local time for the running environment.",
  parameters,
  async execute(_toolCallId, _params) {
    const now = new Date();
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    const localTime = now.toLocaleString("zh-CN", {
      hour12: false,
      timeZone,
    });

    return {
      content: [
        {
          type: "text",
          text: `当前本地时间是 ${localTime}，时区是 ${timeZone}。`,
        },
      ],
      details: {
        isoTime: now.toISOString(),
        localTime,
        timeZone,
      },
    };
  },
};
