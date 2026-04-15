import { completeSimple, type TextContent } from "@mariozechner/pi-ai";
import type { GenerateCommitMessageRequest } from "../shared/contracts.js";
import { resolveModelForRole } from "./model-resolution.js";

type GenerateSessionTitleInput = {
  userText: string;
  assistantText: string;
};

function extractText(content: Array<{ type: string }>): string {
  return content
    .filter((block): block is TextContent => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

function normalizeTitleLine(value: string): string {
  return value
    .split(/\r?\n/, 1)[0]
    ?.replace(/[。！？!?,，;；:：\s]+$/g, "")
    .trim()
    .slice(0, 24) ?? "";
}

async function generateText(prompt: string): Promise<string> {
  const resolved = resolveModelForRole("utility");

  const response = await completeSimple(
    resolved.model,
    {
      systemPrompt: "",
      messages: [{ role: "user", content: prompt, timestamp: Date.now() }],
      tools: [],
    },
    { apiKey: resolved.apiKey },
  );

  return extractText(response.content);
}

function buildCommitMessagePrompt(
  request: GenerateCommitMessageRequest,
): string {
  const fileList = request.selectedFiles
    .map((f) => `[${f.status}] ${f.path} (+${f.additions}/-${f.deletions})`)
    .join("\n");

  return [
    "You are a helpful assistant. Generate a concise git commit message based on the following file changes and diff content.",
    "Format:",
    "<title>",
    "<body>",
    "",
    "Requirements:",
    "- Use concise conventional-commit style for the title when appropriate.",
    "- Keep the title on one line.",
    "- Keep the body short and useful.",
    "",
    "Changes:",
    fileList,
    "",
    "Diffs:",
    request.diffContent,
  ].join("\n");
}

function buildSessionTitlePrompt(input: GenerateSessionTitleInput): string {
  return [
    "你是聊天标题生成器。",
    "请基于下面这一轮对话生成一个简洁中文标题。",
    "要求：",
    "- 只输出标题本身，不要解释。",
    "- 12 个字以内，最长 24 个字符。",
    "- 体现任务意图，不要写成口语句子。",
    "- 不要带书名号、引号、句号、冒号等结尾标点。",
    "",
    "[用户首条消息]",
    input.userText,
    "",
    "[助手首条回复]",
    input.assistantText,
  ].join("\n");
}

export class WorkerService {
  static async generateCommitMessage(
    request: GenerateCommitMessageRequest,
  ): Promise<string> {
    return generateText(buildCommitMessagePrompt(request));
  }

  static async generateSessionTitle(
    input: GenerateSessionTitleInput,
  ): Promise<string | null> {
    const title = normalizeTitleLine(
      await generateText(buildSessionTitlePrompt(input)),
    );
    return title || null;
  }
}
