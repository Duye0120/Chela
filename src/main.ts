import "dotenv/config";
import type { AgentEvent } from "@mariozechner/pi-agent-core";
import { fixedUserPrompt, resolveRuntimeConfig } from "./config.js";
import { createAgent } from "./agent/createAgent.js";

function isTextBlock(block: { type: string }): block is { type: "text"; text: string } {
  return block.type === "text";
}

function getTextContent(content: Array<{ type: string }>): string {
  return content
    .filter(isTextBlock)
    .map((block) => block.text)
    .join("")
    .trim();
}

function logEvent(event: AgentEvent) {
  switch (event.type) {
    case "tool_execution_start":
      console.log("\n[assistant tool call]");
      console.log(`name: ${event.toolName}`);
      console.log(`arguments: ${JSON.stringify(event.args ?? {}, null, 2)}`);
      break;

    case "tool_execution_end": {
      const resultText = getTextContent(event.result.content);
      console.log("\n[tool result]");
      console.log(`name: ${event.toolName}`);
      console.log(`isError: ${event.isError}`);
      console.log(`content: ${resultText || "(empty)"}`);
      console.log(`details: ${JSON.stringify(event.result.details, null, 2)}`);
      break;
    }

    case "message_end": {
      if (event.message.role !== "assistant") {
        return;
      }

      const hasToolCall = event.message.content.some((block) => block.type === "toolCall");
      const text = getTextContent(event.message.content);

      if (!hasToolCall && text) {
        console.log("\n[assistant final answer]");
        console.log(text);
      }
      break;
    }
  }
}

async function main() {
  const runtimeConfig = resolveRuntimeConfig();
  const agent = createAgent(runtimeConfig);
  agent.subscribe(logEvent);

  console.log("[config]");
  console.log(`provider: ${runtimeConfig.provider}`);
  console.log(`model: ${runtimeConfig.modelId}`);
  console.log(`auth: ${runtimeConfig.apiKeySource}`);

  if (runtimeConfig.baseUrl) {
    console.log(`baseUrl: ${runtimeConfig.baseUrl}`);
  }

  console.log(`customModel: ${runtimeConfig.isCustomModel}`);

  console.log("\n[user message]");
  console.log(fixedUserPrompt);

  await agent.prompt(fixedUserPrompt);

  if (agent.state.error) {
    throw new Error(agent.state.error);
  }
}

main().catch((error) => {
  console.error("\n[error]");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

