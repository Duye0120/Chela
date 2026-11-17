import type {
  GenerateCommitPlanRequest,
  GenerateCommitPlanResult,
  GenerateCommitMessageRequest,
  GenerateCommitMessageResult,
} from "../shared/contracts.ts";
import {
  generateCommitMessage,
  generateCommitPlan,
} from "./worker-commit.ts";
import {
  generateSessionTitleTextWithFallback,
} from "./worker-runtime.ts";

type GenerateSessionTitleInput = {
  userText: string;
  assistantText: string;
};

function normalizeTitleLine(value: string): string {
  return value
    .split(/\r?\n/, 1)[0]
    ?.replace(/[。！？!?,，;；:：\s]+$/g, "")
    .trim()
    .slice(0, 24) ?? "";
}

function buildSessionTitlePrompt(input: GenerateSessionTitleInput): {
  systemPrompt: string;
  userPrompt: string;
} {
  return {
    systemPrompt: [
      "你是聊天标题生成器。",
      "只输出标题本身，不要解释。",
    ].join("\n"),
    userPrompt: [
      "请基于下面这一轮对话生成一个简洁中文标题。",
      "要求：",
      "- 12 个字以内，最长 24 个字符。",
      "- 体现任务意图，不要写成口语句子。",
      "- 不要带书名号、引号、句号、冒号等结尾标点。",
      "",
      "[用户首条消息]",
      input.userText,
      "",
      "[助手首条回复]",
      input.assistantText,
    ].join("\n"),
  };
}

export class WorkerService {
  static generateCommitMessage(
    request: GenerateCommitMessageRequest,
  ): Promise<GenerateCommitMessageResult> {
    return generateCommitMessage(request);
  }

  static generateCommitPlan(
    request: GenerateCommitPlanRequest,
  ): Promise<GenerateCommitPlanResult> {
    return generateCommitPlan(request);
  }

  static async generateSessionTitle(
    input: GenerateSessionTitleInput,
  ): Promise<string | null> {
    const prompt = buildSessionTitlePrompt(input);
    const result = await generateSessionTitleTextWithFallback(prompt);
    const title = normalizeTitleLine(result.text);
    return title || null;
  }
}
