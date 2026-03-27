import type { AssistantMessage, SelectedFile, SendMessageInput } from "../shared/contracts.js";

type BuildMockReplyOptions = {
  input: SendMessageInput;
  attachments: SelectedFile[];
};

export function buildMockAssistantReply({ input, attachments }: BuildMockReplyOptions): AssistantMessage {
  const attachmentSummary =
    attachments.length > 0
      ? `我已经看见 ${attachments.length} 个本地附件：${attachments.map((file) => file.name).join("、")}。`
      : "这次消息里还没有附加本地文件。";

  const quotedPrompt = input.text.trim() ? `你刚才说的是：“${input.text.trim()}”。` : "你发送的是一条仅附件消息。";

  return {
    id: crypto.randomUUID(),
    role: "assistant",
    content: [
      "这是桌面壳 v1 的本地 mock 回复。",
      quotedPrompt,
      attachmentSummary,
      "下一步只需要把这里替换成真实 agent / model 调用，这个壳子就能继续进化。",
    ].join("\n\n"),
    timestamp: new Date().toISOString(),
    status: "done",
    meta: {
      source: "local-mock",
      stage: "desktop-shell-v1",
    },
  };
}
