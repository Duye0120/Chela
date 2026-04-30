import type { MemorySaveStatus } from "../memory/dedupe.js";
import type { MemoryVectorPersistResult } from "./memory-vector.js";

export type MemorySaveResultView = {
  summary: string;
  topic: string;
  source: string;
  status: MemorySaveStatus;
  matchedSummary?: string;
  reason?: string;
  vector?: MemoryVectorPersistResult;
};

export function formatMemorySaveResultText(entry: MemorySaveResultView): string {
  const location = `位置：[${entry.topic}] ${entry.summary}`;
  const matched = entry.matchedSummary
    ? `相近记忆：${entry.matchedSummary}`
    : "";
  const vectorLine = formatVectorPersistResult(entry.vector);

  switch (entry.status) {
    case "duplicate":
      return [
        "状态：duplicate。",
        location,
        matched,
        "结果：语义重复，保存已跳过。",
        vectorLine,
        "下一步：memory_save 本次已完成，请继续完成用户请求。",
      ].filter(Boolean).join("\n");

    case "merged":
      return [
        "状态：merged。",
        location,
        matched,
        "结果：已将相近记忆升级为更完整版本。",
        vectorLine,
        "下一步：memory_save 本次已完成，请继续完成用户请求。",
      ].filter(Boolean).join("\n");

    case "conflict":
      return [
        "状态：conflict。",
        location,
        matched,
        "结果：已保留新记忆，并标记为可能与相近记忆冲突。",
        vectorLine,
        "下一步：memory_save 本次已完成，请继续完成用户请求；需要时再向用户确认冲突事实。",
      ].filter(Boolean).join("\n");

    case "saved":
      return [
        "状态：saved。",
        location,
        "结果：记忆写入已完成。",
        vectorLine,
        "下一步：memory_save 本次已完成，请继续完成用户请求。",
      ].filter(Boolean).join("\n");
  }
}

function formatVectorPersistResult(
  result: MemoryVectorPersistResult | undefined,
): string {
  if (!result) {
    return "";
  }

  switch (result.status) {
    case "written":
      return "向量库：写入成功。";
    case "skipped":
      return `向量库：已跳过，${result.reason}。`;
    case "failed":
      return `向量库：写入失败，${result.error}。`;
  }
}
