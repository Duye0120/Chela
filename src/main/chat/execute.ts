import { promptAgent } from "../agent.js";
import { harnessRuntime } from "../harness/singleton.js";
import { appLogger } from "../logger.js";
import { reactiveCompact } from "../context/service.js";
import type { ChatRunContext } from "./types.js";

function isPromptTooLongError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes("prompt is too long") ||
    msg.includes("context_length_exceeded") ||
    msg.includes("maximum context length") ||
    msg.includes("too many tokens") ||
    msg.includes("prompt_too_long") ||
    msg.includes("request too large") ||
    msg.includes("请求过长") ||
    (msg.includes("context") && msg.includes("exceed"))
  );
}

function isMaxTokensTruncation(stopReason: string | undefined): boolean {
  if (!stopReason) return false;
  const normalized = stopReason.toLowerCase();
  return normalized === "max_tokens" || normalized === "length";
}

export async function executeChatRun(context: ChatRunContext): Promise<void> {
  if (!context.handle) {
    throw new Error("Agent handle 未就绪，无法执行聊天 run。");
  }

  try {
    await promptAgent(context.handle, context.input.text, context.input.attachments);
  } catch (promptErr) {
    if (
      isPromptTooLongError(promptErr) &&
      !harnessRuntime.isCancelRequested(context.runScope)
    ) {
      appLogger.warn({
        scope: "chat.send",
        message: "检测到 prompt-too-long，尝试反应式 compact 后重试",
        data: {
          sessionId: context.input.sessionId,
          runId: context.input.runId,
        },
      });
      const compacted = await reactiveCompact(context.input.sessionId);
      if (compacted) {
        await promptAgent(
          context.handle,
          context.input.text,
          context.input.attachments,
        );
      } else {
        throw promptErr;
      }
    } else {
      throw promptErr;
    }
  }

  const stopReason = context.adapter.getLastStopReason();
  if (
    isMaxTokensTruncation(stopReason) &&
    !harnessRuntime.isCancelRequested(context.runScope)
  ) {
    appLogger.info({
      scope: "chat.send",
      message: "检测到 max_output_tokens 截断，注入续写指令",
      data: {
        sessionId: context.input.sessionId,
        runId: context.input.runId,
        stopReason,
      },
    });
    try {
      await promptAgent(
        context.handle,
        "直接继续，不要道歉，不要回顾，从中断处接着写。",
        [],
      );
    } catch (contErr) {
      appLogger.warn({
        scope: "chat.send",
        message: "max_tokens 续写失败",
        error: contErr,
      });
    }
  }
}
