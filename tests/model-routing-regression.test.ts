import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

{
  const promptControlPlane = readFileSync(
    new URL("../src/main/prompt-control-plane.ts", import.meta.url),
    "utf-8",
  );
  const assistantPanel = readFileSync(
    new URL("../src/renderer/src/components/AssistantThreadPanel.tsx", import.meta.url),
    "utf-8",
  );
  const prepareChat = readFileSync(
    new URL("../src/main/chat/prepare.ts", import.meta.url),
    "utf-8",
  );

  assert.match(
    promptControlPlane,
    /询问当前模型、source、provider 或是否发生模型切换/,
  );
  assert.match(promptControlPlane, /不要猜测“底层模型”/);
  assert.match(promptControlPlane, /mimo-v2\.5-pro/);
  assert.match(assistantPanel, /modelEntryId: currentModelId/);
  assert.match(prepareChat, /input\.modelEntryId\?\.trim\(\) \|\| settings\.modelRouting\.chat\.modelId/);
  assert.match(prepareChat, /isHandlePromptRuntimeCurrent/);
  assert.match(prepareChat, /handle\.promptRuntime\.modelId === resolvedModel\.entry\.modelId/);
}

console.log("model routing regression tests passed");
