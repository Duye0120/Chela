import { Agent } from "@mariozechner/pi-agent-core";
import type { AgentRuntimeConfig } from "../config.js";
import { getTimeTool } from "../tools/getTime.js";

export function createAgent(runtimeConfig: AgentRuntimeConfig) {
  return new Agent({
    initialState: {
      systemPrompt: [
        "You are a helpful assistant.",
        "When the user asks for the current time, you must call the get_time tool before answering.",
        "Keep the final answer short and reply in Chinese.",
      ].join(" "),
      model: runtimeConfig.model,
      thinkingLevel: "off",
      tools: [getTimeTool],
      messages: [],
    },
    getApiKey: () => runtimeConfig.apiKey,
  });
}
