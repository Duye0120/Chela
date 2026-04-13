export type ChatRunStage =
  | "idle"
  | "sending"
  | "connecting"
  | "thinking"
  | "tool"
  | "responding"
  | "cancelling";

type RunStatusLabelOptions = {
  isSlowConnection?: boolean;
};

export function getRunStatusLabel(
  stage: ChatRunStage,
  options: RunStatusLabelOptions = {},
) {
  const { isSlowConnection = false } = options;
  const thinkingLabel = isSlowConnection
    ? "思考中…响应有点慢，你可以停止这次请求。"
    : "思考中…";

  switch (stage) {
    case "sending":
      return thinkingLabel;
    case "connecting":
      return thinkingLabel;
    case "thinking":
      return thinkingLabel;
    case "tool":
      return "正在调用工具…";
    case "responding":
      return thinkingLabel;
    case "cancelling":
      return "正在停止…";
    default:
      return "";
  }
}
