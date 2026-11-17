import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  listPluginStatuses,
  setPluginEnabled,
} from "../src/main/plugins/service.ts";

function withTempDir(test: (dir: string) => void): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "chela-plugin-status-"));
  try {
    test(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

await withTempDir((dir) => {
  const rootDir = path.join(dir, "plugins");
  const statePath = path.join(dir, "plugin-state.json");
  const pluginDir = path.join(rootDir, "demo");
  fs.mkdirSync(pluginDir, { recursive: true });
  fs.writeFileSync(
    path.join(pluginDir, "plugin.json"),
    JSON.stringify({
      id: "demo-plugin",
      name: "Demo Plugin",
      version: "1.0.0",
      permissions: {
        tools: ["echo"],
        mcpServers: ["context7"],
        uiPanels: [],
        workflows: ["demo-workflow"],
      },
      workflows: [
        {
          id: "demo-workflow",
          name: "Demo workflow",
          steps: [{ id: "echo", type: "tool", toolName: "echo", input: {} }],
        },
      ],
    }),
    "utf-8",
  );

  fs.mkdirSync(path.join(rootDir, "broken"), { recursive: true });
  fs.writeFileSync(
    path.join(rootDir, "broken", "plugin.json"),
    JSON.stringify({ id: "bad plugin", name: "", version: "1.0.0" }),
    "utf-8",
  );
  fs.mkdirSync(path.join(rootDir, "duplicate"), { recursive: true });
  fs.writeFileSync(
    path.join(rootDir, "duplicate", "plugin.json"),
    JSON.stringify({
      id: "demo-plugin",
      name: "Duplicate Demo Plugin",
      version: "1.0.0",
      permissions: {
        tools: [],
        mcpServers: [],
        uiPanels: [],
        workflows: [],
      },
      workflows: [],
    }),
    "utf-8",
  );

  const first = listPluginStatuses({ rootDir, statePath });
  assert.equal(first.plugins.length, 1);
  assert.equal(first.plugins[0].id, "demo-plugin");
  assert.equal(first.plugins[0].enabled, true);
  assert.equal(first.plugins[0].toolCount, 1);
  assert.equal(first.plugins[0].mcpServerCount, 1);
  assert.equal(first.plugins[0].workflowCount, 1);
  assert.equal(first.errors.length, 2);
  assert.ok(first.errors.some((error) => error.message.includes("已被")));

  const updated = setPluginEnabled({
    rootDir,
    statePath,
    pluginId: "demo-plugin",
    enabled: false,
  });
  assert.equal(updated.plugins[0].enabled, false);
});

console.log("plugin status regression tests passed");
