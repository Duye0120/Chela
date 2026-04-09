import { Agent } from "@mariozechner/pi-agent-core";
import type { AgentEvent as CoreAgentEvent } from "@mariozechner/pi-agent-core";
import type { ElectronAdapter } from "./adapter.js";
import {
  createTransformContext,
  ensureContextSnapshotCoverage,
  getSessionMemoryPromptSection,
} from "./context/service.js";
import { getSemanticMemoryPromptSection } from "./memory/service.js";
import {
  assemblePromptSections,
  buildPlatformConstitutionSection,
  buildRuntimeCapabilitySection,
  buildSemanticMemorySection,
  buildSessionSnapshotSection,
  buildTurnIntentPatchSection,
  buildWorkspacePolicySection,
} from "./prompt-control-plane.js";
import { getSettings } from "./settings.js";
import { resolveModelEntry } from "./providers.js";
import { buildToolPool } from "./tools/index.js";
import { buildSoulPromptSection } from "./soul.js";
import { buildAmbientContextSection } from "./ambient-context.js";
import { loadMcpConfig, getActiveServers } from "../mcp/config.js";
import { McpConnectionManager } from "../mcp/client.js";
import { wrapToolsWithHarness } from "./harness/tool-execution.js";
import { harnessRuntime } from "./harness/singleton.js";
import { parallelManager, SIDE_EFFECT_FREE_TOOLS } from "./parallel-tools.js";
import {
  buildUserPromptMessage,
  normalizePersistedSessionMessages,
} from "./chat-message-adapter.js";
import type { ChatMessage, SelectedFile } from "../shared/contracts.js";

export interface AgentHandle {
  agent: Agent;
  unsubscribe: () => void;
  sessionId: string;
  modelEntryId: string;
  runtimeSignature: string;
  thinkingLevel: string;
  mcpManager: McpConnectionManager;
  workspacePath: string;
  activeRunId: string | null;
  promptRuntime: {
    sourceName: string;
    providerType: "anthropic" | "openai" | "google" | "openai-compatible";
    modelName: string;
    modelId: string;
    contextWindow: number | null;
    supportsVision: boolean;
    supportsToolCalling: boolean;
  };
}

const handlesBySession = new Map<string, AgentHandle>();
const initGenerations = new Map<string, number>();

function subscribeToAgent(
  agent: Agent,
  adapter: ElectronAdapter,
  runId?: string | null,
): () => void {
  return agent.subscribe((event: CoreAgentEvent) => {
    // 检测 assistant 消息中的多工具调用，注册并行批次
    if (
      event.type === "message_end" &&
      "message" in event &&
      event.message &&
      typeof event.message === "object" &&
      "role" in event.message &&
      event.message.role === "assistant" &&
      "content" in event.message &&
      Array.isArray(event.message.content)
    ) {
      const toolCalls = event.message.content.filter(
        (c: any) => c.type === "toolCall",
      );
      if (toolCalls.length > 1 && runId) {
        const entries = toolCalls.map((tc: any) => ({
          toolCallId: tc.id as string,
          toolName: tc.name as string,
          args: (tc.arguments ?? {}) as Record<string, unknown>,
        }));
        // 使用 agent 的内部 abort signal（通过一个长期 controller）
        const controller = new AbortController();
        parallelManager.registerBatch(runId, entries, controller.signal);
      }
    }

    adapter.handleCoreEvent(event);
  });
}

/**
 * Create and initialize an Agent instance for a session.
 */
export async function initAgent(
  sessionId: string,
  adapter: ElectronAdapter,
  existingMessages?: ChatMessage[],
): Promise<AgentHandle> {
  const generation = (initGenerations.get(sessionId) ?? 0) + 1;
  initGenerations.set(sessionId, generation);

  const existingHandle = handlesBySession.get(sessionId);
  if (existingHandle) {
    await destroyAgent(existingHandle);
  }

  const settings = getSettings();

  let resolved;
  try {
    resolved = resolveModelEntry(settings.defaultModelId);
  } catch {
    resolved = resolveModelEntry("builtin:anthropic:claude-sonnet-4-20250514");
  }

  const normalizedMessages = await normalizePersistedSessionMessages(
    existingMessages ?? [],
    resolved.model,
  );

  // Load MCP tools
  const mcpManager = new McpConnectionManager();
  try {
    const mcpConfig = loadMcpConfig(adapter.workspacePath);
    const servers = getActiveServers(mcpConfig);
    for (const [name, cfg] of servers) {
      try {
        await mcpManager.connectServer(name, cfg);
      } catch {
        /* skip failing servers */
      }
    }
  } catch {
    /* MCP init failure is non-fatal */
  }

  const rawTools = await buildToolPool({
    workspacePath: adapter.workspacePath,
    sessionId,
    mcpManager,
  });

  // 注册只读工具的执行器供并行预执行使用
  for (const tool of rawTools) {
    if (SIDE_EFFECT_FREE_TOOLS.has(tool.name)) {
      parallelManager.registerExecutor(tool.name, (toolCallId, args, signal) =>
        tool.execute(toolCallId, args, signal, () => {}),
      );
    }
  }

  const tools = wrapToolsWithHarness(rawTools, {
    sessionId,
    workspacePath: adapter.workspacePath,
    adapter,
    runtime: harnessRuntime,
  });

  const promptRuntime = {
    sourceName: resolved.source.name,
    providerType: resolved.source.providerType,
    modelName: resolved.entry.name,
    modelId: resolved.entry.modelId,
    contextWindow: resolved.model.contextWindow ?? null,
    supportsVision: resolved.model.input.includes("image"),
    supportsToolCalling: resolved.entry.capabilities.toolCalling ??
      resolved.entry.detectedCapabilities.toolCalling ??
      false,
  } satisfies AgentHandle["promptRuntime"];

  const agent = new Agent({
    initialState: {
      systemPrompt: await buildSystemPrompt({
        workspacePath: adapter.workspacePath,
        sessionId,
        latestUserText: null,
        toolNames: tools.map((tool) => tool.name),
        thinkingLevel: settings.thinkingLevel,
        promptRuntime,
      }),
      model: resolved.model,
      thinkingLevel: settings.thinkingLevel,
      tools,
      messages: normalizedMessages,
    },
    getApiKey: () => resolved.apiKey,
    transformContext: createTransformContext(
      sessionId,
      resolved.model.contextWindow ?? null,
    ),
    sessionId,
  });

  const unsubscribe = subscribeToAgent(agent, adapter);

  const handle: AgentHandle = {
    agent,
    unsubscribe,
    sessionId,
    modelEntryId: resolved.entry.id,
    runtimeSignature: resolved.runtimeSignature,
    thinkingLevel: settings.thinkingLevel,
    mcpManager,
    workspacePath: adapter.workspacePath,
    activeRunId: null,
    promptRuntime,
  };

  if (initGenerations.get(sessionId) !== generation) {
    unsubscribe();
    agent.abort();
    await mcpManager.disconnectAll();
    throw new Error("Agent initialization superseded.");
  }

  handlesBySession.set(sessionId, handle);
  return handle;
}

export function bindHandleToRun(
  handle: AgentHandle,
  adapter: ElectronAdapter,
  runId: string,
): void {
  handle.unsubscribe();
  handle.unsubscribe = subscribeToAgent(handle.agent, adapter, runId);
  handle.activeRunId = runId;
}

/**
 * Send a user message to the agent and start the ReAct loop.
 */
export async function promptAgent(
  handle: AgentHandle,
  text: string,
  attachments: SelectedFile[],
): Promise<void> {
  handle.agent.setSystemPrompt(
    await buildSystemPrompt({
      workspacePath: handle.workspacePath,
      sessionId: handle.sessionId,
      latestUserText: text,
      toolNames: handle.agent.state.tools.map((tool) => tool.name),
      thinkingLevel: handle.thinkingLevel,
      promptRuntime: handle.promptRuntime,
    }),
  );
  await handle.agent.prompt(
    await buildUserPromptMessage(
      text,
      attachments,
      handle.agent.state.model.input.includes("image"),
    ),
  );
}

/**
 * Cancel the current agent execution.
 */
export function cancelAgent(handle: AgentHandle): void {
  handle.agent.abort();
}

export function completeRun(handle: AgentHandle, runId: string): void {
  if (handle.activeRunId === runId) {
    handle.activeRunId = null;
  }
  parallelManager.clearRun(runId);
}

/**
 * Destroy an agent handle and clean up resources.
 */
export async function destroyAgent(handle: AgentHandle): Promise<void> {
  handle.unsubscribe();
  handle.agent.abort();
  handle.activeRunId = null;
  if (handlesBySession.get(handle.sessionId) === handle) {
    handlesBySession.delete(handle.sessionId);
  }
  await handle.mcpManager.disconnectAll();
}

/**
 * Destroy all active agent handles.
 */
export async function destroyAllAgents(): Promise<void> {
  await Promise.allSettled(
    [...handlesBySession.values()].map((handle) => destroyAgent(handle)),
  );
}

/**
 * Get the current handle for a session (if any).
 */
export function getHandle(sessionId: string): AgentHandle | null {
  return handlesBySession.get(sessionId) ?? null;
}

async function buildSystemPrompt(input: {
  workspacePath: string;
  sessionId: string;
  latestUserText?: string | null;
  toolNames: string[];
  thinkingLevel: string;
  promptRuntime: AgentHandle["promptRuntime"];
}): Promise<string> {
  await ensureContextSnapshotCoverage(input.sessionId);
  const settings = getSettings();
  const workspacePolicy = buildSoulPromptSection(input.workspacePath);
  const snapshot = await getSessionMemoryPromptSection(input.sessionId);
  const semanticMemory = await getSemanticMemoryPromptSection({
    sessionId: input.sessionId,
    query: input.latestUserText ?? null,
  });

  return assemblePromptSections([
    buildPlatformConstitutionSection(),
    buildWorkspacePolicySection(workspacePolicy),
    buildRuntimeCapabilitySection({
      workspacePath: input.workspacePath,
      shell: settings.terminal.shell,
      sourceName: input.promptRuntime.sourceName,
      providerType: input.promptRuntime.providerType,
      modelName: input.promptRuntime.modelName,
      modelId: input.promptRuntime.modelId,
      contextWindow: input.promptRuntime.contextWindow,
      supportsVision: input.promptRuntime.supportsVision,
      supportsToolCalling: input.promptRuntime.supportsToolCalling,
      thinkingLevel: input.thinkingLevel,
      toolNames: input.toolNames,
    }),
    buildAmbientContextSection(input.workspacePath),
    buildSemanticMemorySection(semanticMemory),
    buildSessionSnapshotSection(snapshot),
    buildTurnIntentPatchSection(input.latestUserText),
  ]);
}
