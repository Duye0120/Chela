import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createCodeDiagnosticsTool, createCodeInspectTool } from "../src/main/tools/code-analysis.ts";
import { evaluateToolPolicy } from "../src/main/harness/policy.ts";
import { loadMcpConfig } from "../src/mcp/config.ts";

function withTempWorkspace(test: (workspacePath: string) => Promise<void> | void): Promise<void> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "chela-action-agent-"));
  const workspacePath = path.join(root, "workspace");
  fs.mkdirSync(workspacePath, { recursive: true });

  return Promise.resolve(test(workspacePath)).finally(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });
}

await withTempWorkspace(async (workspacePath) => {
  fs.writeFileSync(
    path.join(workspacePath, "sample.tsx"),
    [
      'import React from "react";',
      "export type Props = { title: string };",
      "export function Card({ title }: Props) {",
      "  return <div>{title}</div>;",
      "}",
      "const helper = 1;",
    ].join("\n"),
  );

  const inspect = createCodeInspectTool(workspacePath);
  const inspected = await inspect.execute("tool-1", { path: "sample.tsx" });
  assert.equal(inspected.details.language, "tsx");
  assert.equal(inspected.details.imports[0]?.source, "react");
  assert.ok(inspected.details.symbols.some((symbol) => symbol.name === "Card"));

  const diagnostics = createCodeDiagnosticsTool(workspacePath);
  const diagnosed = await diagnostics.execute("tool-2", {
    paths: ["sample.tsx"],
    mode: "auto",
  });
  assert.deepEqual(diagnosed.details.filesChecked, ["sample.tsx"]);

  fs.writeFileSync(
    path.join(workspacePath, "broken.ts"),
    "export const broken = ;\n",
  );
  const broken = await diagnostics.execute("tool-3", {
    paths: ["broken.ts"],
    mode: "typescript",
  });
  assert.equal(broken.details.errorCount, 1);
  assert.equal(broken.details.diagnostics[0]?.filePath, "broken.ts");
});

await withTempWorkspace((workspacePath) => {
  fs.writeFileSync(
    path.join(workspacePath, "mcp.json"),
    JSON.stringify({
      servers: {
        demo: {
          command: "node",
          args: ["server.js"],
        },
      },
    }),
  );

  const config = loadMcpConfig(workspacePath);
  assert.equal(config.mcpServers.demo?.command, "node");
});

{
  const inspectPolicy = evaluateToolPolicy({
    workspacePath: process.cwd(),
    toolName: "code_inspect",
    args: { path: "src/main/agent.ts" },
  });
  assert.equal(inspectPolicy.decision.type, "allow");

  const diagnosticsPolicy = evaluateToolPolicy({
    workspacePath: process.cwd(),
    toolName: "code_diagnostics",
    args: { paths: ["src/main/agent.ts"] },
  });
  assert.equal(diagnosticsPolicy.decision.type, "allow");
}

console.log("action agent regression tests passed");
