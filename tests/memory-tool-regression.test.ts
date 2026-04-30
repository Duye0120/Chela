import assert from "node:assert/strict";
import { formatMemorySaveResultText } from "../src/main/tools/memory-result.ts";

{
  const text = formatMemorySaveResultText({
    summary: "用户偏好把长期约束写入 AGENTS.md",
    topic: "preferences",
    source: "agent",
    status: "saved",
    vector: { status: "written" },
  });

  assert.match(text, /状态：saved/);
  assert.match(text, /向量库：写入成功/);
  assert.match(text, /请继续完成用户请求/);
}

{
  const text = formatMemorySaveResultText({
    summary: "用户偏好把长期约束写入 AGENTS.md",
    topic: "preferences",
    source: "agent",
    status: "duplicate",
    matchedSummary: "用户偏好把长期约束写入 AGENTS.md",
    vector: { status: "skipped", reason: "duplicate 不重复写入向量库" },
  });

  assert.match(text, /状态：duplicate/);
  assert.match(text, /语义重复，保存已跳过/);
  assert.match(text, /向量库：已跳过/);
}

{
  const text = formatMemorySaveResultText({
    summary: "今天早上 8:30 在楼下买了个苹果",
    topic: "events",
    source: "agent",
    status: "merged",
    matchedSummary: "今天早上买了个苹果",
    vector: { status: "written" },
  });

  assert.match(text, /状态：merged/);
  assert.match(text, /升级为更完整版本/);
}

{
  const text = formatMemorySaveResultText({
    summary: "今天早上 9:30 在楼下买了个苹果",
    topic: "events",
    source: "agent",
    status: "conflict",
    matchedSummary: "今天早上 8:30 在楼下买了个苹果",
    vector: { status: "failed", error: "embedding provider failed" },
  });

  assert.match(text, /状态：conflict/);
  assert.match(text, /可能与相近记忆冲突/);
  assert.match(text, /向量库：写入失败/);
}

console.log("memory tool regression tests passed");
