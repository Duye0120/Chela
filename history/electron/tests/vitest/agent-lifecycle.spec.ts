import assert from "node:assert/strict";
import { beforeAll, beforeEach, describe, it, vi } from "vitest";

const agentAbortCalls: string[] = [];
const unsubscribeCalls: string[] = [];
const disconnectedManagers: string[] = [];
const settingsWorkspace = "D:/chela-agent-vitest";
let completeRun: typeof import("../../src/main/agent.ts").completeRun;
let destroyAgent: typeof import("../../src/main/agent.ts").destroyAgent;
let parallelManager: typeof import("../../src/main/parallel-tools.ts").parallelManager;

vi.mock("@earendil-works/pi-agent-core", () => ({
  Agent: class {},
}));

vi.mock("electron", () => ({
  app: {
    getPath: () => settingsWorkspace,
  },
  shell: {
    openPath: vi.fn(async () => ""),
    showItemInFolder: vi.fn(),
  },
}));

vi.mock("../../src/main/settings.ts", () => ({
  getSettings: () => ({
    workspace: settingsWorkspace,
    thinkingLevel: "off",
  }),
}));

vi.mock("../../src/mcp/config.ts", () => ({
  getActiveServers: () => [],
  loadMcpConfig: () => ({ mcpServers: {} }),
}));

vi.mock("../../src/mcp/client.ts", () => ({
  McpConnectionManager: class {
    getStatuses(): unknown[] {
      return [];
    }
  },
}));

function createHandle(input: { sessionId: string; ownerId: string; runId?: string | null }) {
  const mcpManagerId = `${input.sessionId}:${input.ownerId}`;
  return {
    agent: {
      abort: () => {
        agentAbortCalls.push(mcpManagerId);
      },
      state: {
        tools: [],
      },
    },
    unsubscribe: () => {
      unsubscribeCalls.push(mcpManagerId);
    },
    adapter: {
      workspacePath: settingsWorkspace,
    },
    sessionId: input.sessionId,
    ownerId: input.ownerId,
    modelEntryId: "model:test",
    runtimeSignature: "runtime:test",
    thinkingLevel: "off",
    mcpManager: {
      disconnectAll: async () => {
        disconnectedManagers.push(mcpManagerId);
      },
    },
    workspacePath: settingsWorkspace,
    activeRunId: input.runId ?? null,
    initGeneration: 1,
    promptRuntime: {
      sourceName: "Test",
      providerType: "openai" as const,
      modelName: "Test model",
      modelId: "test-model",
      contextWindow: null,
      supportsVision: false,
      supportsToolCalling: true,
    },
  };
}

describe("agent lifecycle", () => {
  beforeAll(async () => {
    const agentModule = await import("../../src/main/agent.ts");
    const parallelToolsModule = await import("../../src/main/parallel-tools.ts");
    completeRun = agentModule.completeRun;
    destroyAgent = agentModule.destroyAgent;
    parallelManager = parallelToolsModule.parallelManager;
  }, 15_000);

  beforeEach(() => {
    agentAbortCalls.length = 0;
    unsubscribeCalls.length = 0;
    disconnectedManagers.length = 0;
  });

  it("clears active run state and parallel run cache when a run completes", async () => {
    const ownerKey = "agent-lifecycle-session:primary";
    const runId = "agent-lifecycle-run";
    const handle = createHandle({
      sessionId: "agent-lifecycle-session",
      ownerId: "primary",
      runId,
    });

    parallelManager.clearOwner(ownerKey);
    parallelManager.registerExecutors(ownerKey, [
      {
        toolName: "file_read",
        executor: async () => ({ type: "text", text: "cached" }) as any,
      },
    ]);
    parallelManager.registerBatch(
      runId,
      ownerKey,
      [
        { toolCallId: "agent-call-current", toolName: "file_read", args: {} },
        { toolCallId: "agent-call-next", toolName: "file_read", args: {} },
      ],
      new AbortController().signal,
    );
    parallelManager.startPreExecution(runId, "agent-call-current");

    assert.equal(parallelManager.hasCached("agent-call-next"), true);
    completeRun(handle as any, runId);
    assert.equal(handle.activeRunId, null);
    assert.equal(parallelManager.hasCached("agent-call-next"), false);

    parallelManager.clearOwner(ownerKey);
  });

  it("aborts agents, unsubscribes, disconnects MCP, and clears owner executors", async () => {
    const ownerKey = "agent-destroy-session:primary";
    const runId = "agent-destroy-run";
    const handle = createHandle({
      sessionId: "agent-destroy-session",
      ownerId: "primary",
      runId,
    });

    parallelManager.clearOwner(ownerKey);
    parallelManager.registerExecutors(ownerKey, [
      {
        toolName: "file_read",
        executor: async () => ({ type: "text", text: "stale" }) as any,
      },
    ]);
    parallelManager.registerBatch(
      runId,
      ownerKey,
      [
        { toolCallId: "destroy-call-current", toolName: "file_read", args: {} },
        { toolCallId: "destroy-call-next", toolName: "file_read", args: {} },
      ],
      new AbortController().signal,
    );
    parallelManager.startPreExecution(runId, "destroy-call-current");

    assert.equal(parallelManager.hasCached("destroy-call-next"), true);
    await destroyAgent(handle as any);

    assert.deepEqual(unsubscribeCalls, ["agent-destroy-session:primary"]);
    assert.deepEqual(agentAbortCalls, ["agent-destroy-session:primary"]);
    assert.deepEqual(disconnectedManagers, ["agent-destroy-session:primary"]);
    assert.equal(handle.activeRunId, null);
    assert.equal(parallelManager.hasCached("destroy-call-next"), false);

    parallelManager.clearOwner(ownerKey);
  });
});
