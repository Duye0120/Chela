import assert from "node:assert/strict";
import { SETTINGS_SECTIONS } from "../src/shared/settings-sections.ts";

const sectionIds = SETTINGS_SECTIONS.map((section) => section.id);
const sectionLabels = Object.fromEntries(
  SETTINGS_SECTIONS.map((section) => [section.id, section.label]),
);

assert.deepEqual(sectionIds, [
  "general",
  "network",
  "ai_model",
  "workspace",
  "memory",
  "mcp",
  "plugins",
  "skills",
  "interface",
  "archived",
  "system",
]);

assert.equal(sectionLabels.mcp, "MCP");
assert.equal(sectionLabels.plugins, "插件");
assert.equal(sectionLabels.system, "系统");

console.log("settings navigation regression tests passed");
