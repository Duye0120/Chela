import { completeSimple, type TextContent, type ThinkingContent } from "@earendil-works/pi-ai";
import { getSettings } from "./settings.ts";
import { resolveModelEntry } from "./providers.ts";
import { appLogger } from "./logger.ts";
import { getErrorMessage } from "../shared/text-utils.ts";

export type WorkerModelRole = "utility" | "chat" | "subagent";

export type TextGenerationResult = {
  text: string;
  usedModelRole: WorkerModelRole;
  fallbackUsed: boolean;
};

type CompletionResult = {
  text: string;
  fallbackText: string;
  thinking: string;
  stopReason: string;
  errorMessage?: string;
  content: Array<{ type: string }>;
  usage?: unknown;
};

function extractText(content: Array<{ type: string }>): string {
  return content
    .filter((block): block is TextContent => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

function extractToolCallText(content: Array<{ type: string }>): string {
  return content
    .filter(
      (
        block,
      ): block is { type: "toolCall"; arguments: Record<string, unknown> } =>
        block.type === "toolCall" && "arguments" in block,
    )
    .map((block) => JSON.stringify(block.arguments))
    .join("\n")
    .trim();
}

function extractThinking(content: Array<{ type: string }>): string {
  return content
    .filter((block): block is ThinkingContent => block.type === "thinking")
    .map((block) => block.thinking)
    .join("\n\n")
    .trim();
}

function resolveWorkerModel(role: WorkerModelRole) {
  const settings = getSettings();
  const entryId =
    role === "utility"
      ? settings.modelRouting.utility.modelId
      : role === "subagent"
        ? settings.modelRouting.subagent.modelId
        : settings.modelRouting.chat.modelId;

  if (!entryId) {
    throw new Error(
      role === "utility"
        ? "当前未配置工具模型。"
        : role === "subagent"
          ? "当前未配置 Sub-agent 模型。"
          : "当前未配置聊天模型。",
    );
  }

  return resolveModelEntry(entryId);
}

async function completeTextWithRole(
  role: WorkerModelRole,
  systemPrompt: string,
  userPrompt: string,
  options?: {
    logScope?: string;
    repairPromptBuilder?: (analysis: string) => {
      systemPrompt: string;
      userPrompt: string;
    };
  },
): Promise<string> {
  const resolved = resolveWorkerModel(role);
  const logScope = options?.logScope ?? "worker";

  const runCompletion = async (
    nextSystemPrompt: string,
    nextUserPrompt: string,
  ): Promise<CompletionResult> => {
    const response = await completeSimple(
      resolved.model,
      {
        systemPrompt: nextSystemPrompt,
        messages: [{ role: "user", content: nextUserPrompt, timestamp: Date.now() }],
      },
      { apiKey: resolved.getApiKey() },
    );

    const text = extractText(response.content);
    const toolText = extractToolCallText(response.content);
    const thinking = extractThinking(response.content);

    return {
      text,
      fallbackText: text || toolText || thinking,
      thinking,
      stopReason: response.stopReason,
      errorMessage: response.errorMessage,
      content: response.content,
      usage: response.usage,
    };
  };

  const primary = await runCompletion(systemPrompt, userPrompt);

  if (primary.text) {
    return primary.text;
  }

  if (primary.thinking && options?.repairPromptBuilder) {
    appLogger.info({
      scope: logScope,
      message: "模型生成收到 thinking-only 响应，开始二次收束",
      data: {
        role,
        modelEntryId: resolved.entry.id,
        modelId: resolved.entry.modelId,
        sourceId: resolved.source.id,
        stopReason: primary.stopReason,
      },
    });

    const repairPrompt = options.repairPromptBuilder(primary.thinking);
    const repaired = await runCompletion(repairPrompt.systemPrompt, repairPrompt.userPrompt);

    if (repaired.text) {
      return repaired.text;
    }

    if (repaired.fallbackText) {
      appLogger.warn({
        scope: logScope,
        message: "模型二次收束未返回 text，改用备用内容",
        data: {
          role,
          modelEntryId: resolved.entry.id,
          modelId: resolved.entry.modelId,
          sourceId: resolved.source.id,
          stopReason: repaired.stopReason,
          content: repaired.content,
          usage: repaired.usage,
          errorMessage: repaired.errorMessage,
        },
      });
      return repaired.fallbackText;
    }
  }

  if (!primary.fallbackText) {
    appLogger.warn({
      scope: logScope,
      message: "模型生成未返回可解析文本",
      data: {
        role,
        modelEntryId: resolved.entry.id,
        modelId: resolved.entry.modelId,
        sourceId: resolved.source.id,
        stopReason: primary.stopReason,
        content: primary.content,
        usage: primary.usage,
        errorMessage: primary.errorMessage,
      },
    });
  }

  return primary.fallbackText;
}

export async function generateTextWithFallback(input: {
  systemPrompt: string;
  userPrompt: string;
  logScope?: string;
  repairPromptBuilder?: (analysis: string) => {
    systemPrompt: string;
    userPrompt: string;
  };
}): Promise<TextGenerationResult> {
  let utilityError: unknown = null;

  try {
    return {
      text: await completeTextWithRole("utility", input.systemPrompt, input.userPrompt, {
        logScope: input.logScope,
        repairPromptBuilder: input.repairPromptBuilder,
      }),
      usedModelRole: "utility",
      fallbackUsed: false,
    };
  } catch (error) {
    utilityError = error;
  }

  try {
    return {
      text: await completeTextWithRole("chat", input.systemPrompt, input.userPrompt, {
        logScope: input.logScope,
        repairPromptBuilder: input.repairPromptBuilder,
      }),
      usedModelRole: "chat",
      fallbackUsed: true,
    };
  } catch (fallbackError) {
    const utilityMessage = getErrorMessage(utilityError, "工具模型生成失败。");
    const chatMessage = getErrorMessage(fallbackError, "聊天模型回退失败。");
    throw new Error(`${utilityMessage} 聊天模型回退也失败：${chatMessage}`);
  }
}

export async function generateSessionTitleTextWithFallback(input: {
  systemPrompt: string;
  userPrompt: string;
}): Promise<TextGenerationResult> {
  const roles: WorkerModelRole[] = getSettings().modelRouting.subagent.modelId
    ? ["subagent", "utility", "chat"]
    : ["utility", "chat"];
  const errors: string[] = [];

  for (const [index, role] of roles.entries()) {
    try {
      return {
        text: await completeTextWithRole(role, input.systemPrompt, input.userPrompt),
        usedModelRole: role,
        fallbackUsed: index > 0,
      };
    } catch (error) {
      errors.push(getErrorMessage(error, `${role} 模型生成失败。`));
    }
  }

  throw new Error(errors.join(" "));
}
