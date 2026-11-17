import { createInterface } from "node:readline";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { createAgentSession, SessionManager, SettingsManager, DefaultResourceLoader, ModelRuntime, createToolSearchExtension } from "@earendil-works/pi-coding-agent";
import { InMemoryCredentialStore, InMemoryModelsStore, AssistantMessageEventStream } from "@earendil-works/pi-ai";
import { streamSimple as completions } from "@earendil-works/pi-ai/api/openai-completions";
import { streamSimple as responses } from "@earendil-works/pi-ai/api/openai-responses";
import { streamSimple as anthropic } from "@earendil-works/pi-ai/api/anthropic-messages";
import { streamSimple as google } from "@earendil-works/pi-ai/api/google-generative-ai";
import { buildProviderModel, getApiKeyForSource } from "./provider-model-builder.ts";
import { capabilityResources, extensionUI, invocation } from "./capabilities.mjs";
import { relayFetch } from "./network.mjs";

const adapters = { "openai-completions": completions, "openai-responses": responses, "anthropic-messages": anthropic, "google-generative-ai": google };
const worker = process.env.CHELA_WORKER_ID;
if (!worker) throw new Error("Chela worker requires a host identity");
const pending = new Map();
let seq = 0;
let active;

function emit(kind, method, context, payload, requestId, error) {
  process.stdout.write(JSON.stringify({ protocol_version: 1, kind, method, worker_id: worker, epoch: 1, worker_seq: ++seq, request_id: requestId, correlation_id: context?.run_id, context: context || {}, payload, error }) + "\n");
}

function host(state, method, payload, timeout = 30000) {
  if (state.fatal) return Promise.reject(state.fatal);
  if (state.cancelled) return Promise.reject(new Error("运行已取消"));
  return new Promise((resolve, reject) => {
    const id = randomUUID();
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method}: host acknowledgement timed out`)); }, timeout);
    pending.set(id, { state, method, resolve, reject, timer });
    emit("request", method, state.context, payload, id);
  });
}

function errorMessage(model, error) {
  return { role: "assistant", content: [], api: model.api, provider: model.provider, model: model.id, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: "error", errorMessage: String(error?.message || error), timestamp: Date.now() };
}

async function run(state, request) {
  const { source, entry, key, snapshot, text } = request;
  const model = buildProviderModel(source, entry);
  const apiKey = getApiKeyForSource({ [source.id]: { apiKey: key } }, source);
  if (!apiKey || !adapters[model.api]) throw new Error("模型配置或协议不可用");
  const cwd = resolve(request.workspace || request.agent_dir);
  const manager = SessionManager.inMemory(cwd, undefined, snapshot.header ? [snapshot.header, ...snapshot.entries] : undefined);
  if (snapshot.header) {
    if (snapshot.active_leaf_id) manager.branch(snapshot.active_leaf_id); else manager.resetLeaf();
  }
  for (const message of snapshot.legacy_messages || []) {
    manager.appendCustomMessageEntry("chela-legacy-import", `[旧会话导入 / ${message.role}]\n${message.content}`, false, { legacy_message_id: message.id });
  }
  if (snapshot.handoff) manager.appendCustomMessageEntry("chela-recovery", snapshot.handoff, false, { recovery: true });
  let revision = snapshot.revision;
  const committed = new Set(snapshot.entries.map(e => e.id));
  let chain = Promise.resolve();
  const checkpoint = (boundary) => {
    chain = chain.then(async () => {
      if (state.fatal) throw state.fatal;
      const entries = JSON.parse(JSON.stringify(manager.getEntries())).filter(e => !committed.has(e.id));
      if (!entries.length && state.initialized) return;
      const compaction = entries.some(e => e.type === "compaction");
      const payload = { batch_id: randomUUID(), base_revision: revision, branch_generation: request.branch_generation, lease_token: request.lease_token, header: JSON.parse(JSON.stringify(manager.getHeader())), added_entries: entries, active_leaf_id: manager.getLeafId(), boundary, safe_cut_token_id: compaction ? state.safeCut : undefined };
      const ack = await host(state, compaction ? "session.compaction_commit" : "session.checkpoint", payload);
      revision = ack.revision;
      for (const e of entries) committed.add(e.id);
      state.initialized = true;
      if (compaction) state.safeCut = undefined;
    }).catch(error => { state.fatal = error; state.session?.agent.abort(); throw error; });
    return chain;
  };
  if (snapshot.rebuild_context) {
    await checkpoint("before_context_rebuild");
    const first = manager.getBranch()[0]?.id;
    const cut = await host(state, "context.safe_cut", { first_kept_entry_id: first, rebuild: true });
    state.safeCut = cut.safe_cut_token_id;
    manager.appendCompaction("旧派生记忆已清理；以下原始对话保留，不代表允许重新记忆。", first, 0);
    await checkpoint("context_rebuild");
  }
  const credentials = new InMemoryCredentialStore();
  await credentials.modify(model.provider, async () => ({ type: "api_key", key: apiKey }));
  const runtime = await ModelRuntime.create({ credentials, modelsStore: new InMemoryModelsStore(), modelsPath: null, refreshOnCreate: false, allowModelNetwork: false });
  const guardedStream = (resolvedModel, context, options = {}) => {
    const output = new AssistantMessageEventStream();
    (async () => {
      try {
        await checkpoint("before_model");
        const selected = state.safeCut && request.compaction_model ? request.compaction_model : {source,entry,key};
        if (state.safeCut && request.compaction_model) resolvedModel=buildProviderModel(selected.source,selected.entry);
        const selectedKey=getApiKeyForSource({[selected.source.id]:{apiKey:selected.key}},selected.source);
        const id = randomUUID();
        let actualModel = "";
        const maxTokens=request.operation==="review"?512:options.maxTokens || resolvedModel.maxTokens;
        const prepared = await host(state, "model.request.prepare", { provider_request_id: id, model: `${resolvedModel.provider}/${resolvedModel.id}`, context_window: resolvedModel.contextWindow, capacity_source: selected.entry.limits?.contextWindow || selected.entry.detectedLimits?.contextWindow ? "catalog" : "local_limit_unknown_capacity", max_output_tokens: maxTokens, request_kind: state.safeCut ? "compaction" : "agent", context });
        if (state.cancelled || options.signal?.aborted) throw new Error("运行已取消");
        const upstream = adapters[resolvedModel.api](resolvedModel, prepared.context, { ...options, fetch:request.network?relayFetch(request.network.address,request.network.token):options.fetch, maxTokens, apiKey:selectedKey, maxRetries: 0, onPayload:async(payload,model)=>{if(request.fast_mode&&!state.safeCut)payload.service_tier="priority";return await options.onPayload?.(payload,model)??payload}, onResponse: async response => {
          actualModel = response.headers["x-magpie-model"] || "";
          await options.onResponse?.(response,resolvedModel);
        } });
        for await (const event of upstream) {
          if (event.type === "done" || event.type === "error") {
            const message = event.message || event.error;
            await host(state, "model.request.finish", { provider_request_id: id, status: event.type === "done" ? "succeeded" : message.stopReason === "aborted" ? "cancelled" : "failed", actual_model:actualModel, usage: {...message.usage,cost:selected.entry.providerOptions?.pricing ? message.usage.cost : {}} });
          }
          output.push(event);
        }
      } catch (error) {
        if (!String(error.message).startsWith("CONTEXT_COMPACTION_REQUIRED:")) state.fatal = error;
        output.push({ type: "error", reason: "error", error: errorMessage(resolvedModel, error) });
      }
    })();
    return output;
  };
  runtime.registerProvider(model.provider, { baseUrl: model.baseUrl, api: model.api, models: [model], streamSimple: guardedStream });
  const inputBudget = model.contextWindow - model.maxTokens - Math.max(1024, model.contextWindow*.02) - Math.max(2048, model.contextWindow*.05);
  const threshold = Number.isFinite(request.compaction_threshold) && request.compaction_threshold >= .5 && request.compaction_threshold <= .9 ? request.compaction_threshold : .72;
  // shortcut: Go caps uploads; enable SDK resizing when its worker is packaged.
  const settings = SettingsManager.inMemory({ images: { autoResize: false }, compaction: { enabled: request.auto_compaction !== false, reserveTokens: Math.ceil(model.contextWindow-inputBudget*threshold), keepRecentTokens: Math.max(2048,Math.floor(inputBudget*.55/4)-2048) }, retry: { enabled: true, maxRetries: 2, baseDelayMs: 1000 }, cacheWarming: "off" });
  const installed=request.capabilities||[];
  const capabilities=capabilityResources(installed,
    async tool=>{await checkpoint("before_extension_tool");return host(state,"extension.tool.start",tool)},
    async tool=>{try{await host(state,"extension.tool.finish",tool)}catch(error){state.fatal=error;state.session?.agent.abort();throw error}},
  );
  const rulePrompt=(snapshot.settings?.rules||[]).map(rule=>`\n\n工作区协作规则（${rule.path}，版本 ${rule.hash}）：\n${rule.text}`).join("");
  const resources = new DefaultResourceLoader({ cwd, agentDir: request.agent_dir, settingsManager: settings, noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true, ...capabilities.options, systemPrompt: snapshot.persona.system_prompt+rulePrompt, extensionFactories: [pi => {
    pi.on("session_before_compact", async event => {
      await checkpoint("before_compaction");
      const cut = await host(state, "context.safe_cut", { first_kept_entry_id: event.preparation.firstKeptEntryId, automatic: event.reason !== "manual" });
      state.safeCut = cut.safe_cut_token_id;
    });
    pi.on("session_compact", async () => { await checkpoint("compaction"); });
  },...(request.mcp_tools?.length?[createToolSearchExtension()]:[])] });
  await resources.reload();
  for(const m of installed)await host(state,"extension.report",{id:m.id,problem:capabilities.problems.get(m.id)||""});
  if(capabilities.problems.size)throw new Error("扩展加载失败，已保存原因；该扩展在重新加载前不会再次运行");
  const tools = (["consolidate","review"].includes(request.operation) ? [] : [
    {name:"appraise_interaction",label:"记录交流感受",description:"只在用户明确肯定、善意调侃或纠正时提议一次简短感受。必须引用本轮用户原文；含糊时 confidence 低于 0.65。不能改绝对分数，不能以情绪影响事实、权限或投入，不要为普通任务请求调用。",parameters:{type:"object",properties:{message_id:{type:"string"},semantic_label:{type:"string",enum:["praise","friendly_teasing","correction"]},intensity:{type:"number",minimum:0,maximum:1},confidence:{type:"number",minimum:0,maximum:1},evidence:{type:"string"}},required:["message_id","semantic_label","intensity","confidence","evidence"],additionalProperties:false}},
    {name:"attention_save",label:"关注后续进展",description:"根据本轮用户安排提议持续关注；仅观察已有任务，不授予外部执行权限。goal 尽量逐字引用用户目标，非原文提议会待确认。condition 支持 task_status、deadline_approaching、semantic_review、all_artifacts_present；文件关注需当前项目和 paths 相对路径，始终先待用户确认；指定 itemId 时只能使用 planner_read 返回的真实 ID。",parameters:{type:"object",properties:{message_id:{type:"string"},id:{type:"string"},revision:{type:"integer"},goal:{type:"string"},expires:{type:"string"},condition:{type:"object",properties:{kind:{type:"string",enum:["task_status","deadline_approaching","semantic_review","all_artifacts_present"]},itemId:{type:"string"},status:{type:"string",enum:["todo","doing","done","cancelled"]},minutesBefore:{type:"integer",minimum:1,maximum:10080},paths:{type:"array",minItems:1,maxItems:20,items:{type:"string"}}},required:["kind"],additionalProperties:false}},required:["message_id","goal","condition"],additionalProperties:false}},
    { name:"planner_read",label:"查看待办与排期",description:"读取当前项目及未归属项目的任务与排期，返回真实 ID 和版本。其他项目不会返回。制定计划前先读取。",parameters:{type:"object",properties:{},additionalProperties:false} },
    { name:"planner_propose",label:"保存计划草案",description:"把自然语言计划保存为可审阅草案，不会立即改变日历。可以按全天日期或 blocks 拆分多个时间块；blocks 提供完整目标列表，已有块携带 id/revision。locked 块必须原样保留；本地时间格式 YYYY-MM-DDTHH:mm，全天 localEnd 不含当天，必须有 IANA timezone。估时是估计。请告知用户到日历的计划草案中调整并采用，或回复按这个来。修改同一草案传 id 和 revision。",parameters:{type:"object",properties:{id:{type:"string"},revision:{type:"integer"},changes:{type:"array",minItems:1,maxItems:40,items:{type:"object",properties:{itemId:{type:"string"},title:{type:"string"},date:{type:"string"},endDate:{type:"string"},timezone:{type:"string"},estimateMinutes:{type:"integer",minimum:0,maximum:10080},blocks:{type:"array",minItems:1,maxItems:80,items:{type:"object",properties:{id:{type:"string"},revision:{type:"integer"},localStart:{type:"string"},localEnd:{type:"string"},startAt:{type:"string"},endAt:{type:"string"},timezone:{type:"string"},binding:{type:"string",enum:["floating_local","zoned_local","absolute_instant"]},allDay:{type:"boolean"},locked:{type:"boolean"},estimateSource:{type:"string",enum:["model","user"]}},required:["timezone"],additionalProperties:false}}},required:["timezone"],additionalProperties:false}}},required:["changes"],additionalProperties:false} },
    { name:"planner_commit",label:"采用已确认计划",description:"仅在用户明确回复按这个来、确认计划、采用这个计划或就按这个计划后提交本会话已展示的草案版本；发现冲突必须重新查看。不会执行计划中的外部动作。",parameters:{type:"object",properties:{id:{type:"string"},revision:{type:"integer"}},required:["id","revision"],additionalProperties:false} },
    { name: "memory_search", label: "查询适用记忆", description: "搜索本轮允许范围内已生效的记忆，含来源、版本、冲突。", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"], additionalProperties: false } },
    { name: "memory_save", label: "提议记忆", description: "根据本轮用户来源提议记忆。只有以记住、以后等明确请求开头的原文才能直接保存，其余为待确认候选。项目内容不能自动存为全局。先搜索现有主题版本，遇到冲突请报告，不要更换键绕过冲突。", parameters: { type: "object", properties: { message_id: {type:"string"}, scope_type: {type:"string",enum:["assistant","project","session"]}, subject:{type:"string"},slot:{type:"string"},kind:{type:"string",enum:["preference","fact","decision","procedure","episode"]},content:{type:"string"},expected_slot_revision:{type:"integer"},valid_until:{type:"string"} }, required:["message_id","scope_type","subject","slot","kind","content","expected_slot_revision"],additionalProperties:false } },
    { name: "read_file", label: "读取项目文件", description: "读取当前项目内 UTF-8 文本文件，最多返回 128 KiB。", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false } },
    ...(resources.getSkills().skills.length ? [{ name: "read", label: "读取技能资料", description: "读取本轮已安装 skill 的文件及其包内引用，path 使用 skill location 或包内引用的绝对路径。最多返回 128 KiB。项目文件使用 read_file。", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false } }] : []),
    { name: "write_file", label: "写入项目文件", description: "经过用户审批后写入当前项目内的 UTF-8 文本文件。", parameters: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"], additionalProperties: false } },
    ...(request.mcp_tools||[]).map(tool=>({...tool,label:tool.name,exposure:"deferred"})),
  ]).filter(tool=>snapshot.settings?.policy.memoryEnabled!==false||tool.name!=="memory_save").map(tool => ({ ...tool, execute: async (id, args) => {
    await checkpoint("before_tool");
    try { return await host(state, "tool.request", { ...invocation(id), name: tool.name, arguments: args }, 6 * 60 * 1000); }
    catch (error) {
      if (String(error.message).startsWith("TOOL_OUTCOME_UNKNOWN:")) { state.fatal = error; state.session?.agent.abort(); }
      if (state.fatal || state.cancelled) throw error;
      return { content: [{ type: "text", text: String(error.message || error) }], details: {}, isError: true };
    }
  } }));
  const extensionTools=resources.getExtensions().extensions.flatMap(e=>[...e.tools.keys()]);
  const { session } = await createAgentSession({ cwd, agentDir: request.agent_dir, modelRuntime: runtime, settingsManager: settings, resourceLoader: resources, sessionManager: manager, model, thinkingLevel: model.reasoning ? request.effort || "off" : "off", tools: [...tools.map(t => t.name),...extensionTools], customTools: tools, noTools: true });
  state.session = session;
  if(request.mcp_tools?.length)session.setActiveToolsByName([...tools.filter(t=>t.exposure!=="deferred").map(t=>t.name),...extensionTools]);
  const uiPending=[];
  const reportError=error=>{const owner=capabilities.owner(error.extensionPath);if(owner){const task=host(state,"extension.report",{id:owner.id,problem:`${error.event}: ${error.error}`});uiPending.push(task);task.catch(()=>{})}};
  const steered = new Set();
  const queueSteers = async () => {
    for (const message of await host(state,"input.pending",{})) {
      if (steered.has(message.id)) continue;
      steered.add(message.id);
      session.agent.steer({role:"user",content:[{type:"text",text:message.content}],timestamp:Date.parse(message.createdAt),chelaInputId:message.id});
    }
  };
  let settled = false;
  session.subscribe(event => { if (event.type === "agent_settled") settled = true; });
  // Pi 1.5.2 awaits core listeners after AgentSession has appended each finalized entry.
  const unsubscribe = session.agent.subscribe(async event => {
    if (event.type === "message_update") {
      const e = event.assistantMessageEvent;
      if (e.type === "text_delta" || e.type === "thinking_delta") emit("event", "stream.delta", state.context, { type: e.type, delta: e.delta });
    }
    if (["message_end", "turn_end", "agent_end"].includes(event.type)) await checkpoint(event.type);
    if (event.type === "message_end" && request.operation === "prompt") await queueSteers();
  });
  try {
    await session.bindExtensions({mode:"rpc",uiContext:extensionUI(state,host,uiPending),onError:reportError});
    await checkpoint("extensions_bound");
    await host(state,"extension.report",{tools:session.getAllTools()});
    if (state.cancelled) throw new Error("运行已取消");
    if (request.operation === "compact") {
      await session.compact("保留当前目标、用户最新要求与纠正、已确认决定、未完成事项、证据引用和未知副作用。不要把模型提议写成已完成事实。");
      await checkpoint("manual_compaction");
      return;
    }
    const command=text.startsWith("/")&&session.extensionRunner.getCommand(text.slice(1).split(/\s/,1)[0]);
    await session.prompt(text, { expandPromptTemplates: true, images: request.images || [] });
    if(command){await checkpoint("extension_command");await Promise.all(uiPending);return}
    await session.waitForIdle();
    if (!settled) throw new Error("AgentSession did not settle");
    await checkpoint("settled");
    if (state.fatal) throw state.fatal;
    const final = manager.getBranch().findLast(e => e.type === "message" && e.message.role === "assistant")?.message;
    if (!final || final.stopReason === "error" || final.stopReason === "aborted") throw new Error(final?.errorMessage || "模型没有返回回复");
    await Promise.all(uiPending);
  } finally {
    try { await session.extensionRunner.emit({type:"session_shutdown",reason:"quit"}); if(!state.fatal&&!state.cancelled)await checkpoint("extensions_shutdown"); }
    finally { unsubscribe(); session.dispose(); }
  }
}

const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on("line", line => {
  let request;
  try {
    if (line.length > 16 * 1024 * 1024) throw new Error("Oversized IPC message");
    request = JSON.parse(line);
    if (request.protocol_version !== 1 || request.worker_id !== worker || request.epoch !== 1) throw new Error("Protocol mismatch");
    if (request.kind === "response") {
      const reply = pending.get(request.request_id);
      if (!reply || reply.method !== request.method || reply.state.context.attempt_id !== request.context.attempt_id) throw new Error("Unknown host response");
      pending.delete(request.request_id); clearTimeout(reply.timer);
      if (request.error) reply.reject(new Error(request.error)); else reply.resolve(request.payload);
      return;
    }
    if (request.method === "run.cancel" && active?.context.run_id === request.context.run_id) {
      active.cancelled = true;
      active.session?.agent.abort();
      active.session?.abortRetry(); active.session?.abortCompaction();
      return;
    }
    if (request.method !== "run.start" || active) throw new Error("Worker already owns a run");
    const state = { context: request.context, cancelled: false };
    active = state;
    run(state, request.payload).then(() => emit("event", "run.settled", state.context, {})).catch(error => {
      let message = String(error?.message || error);
      if (request.payload.key) message = message.replaceAll(request.payload.key, "[redacted]");
      if (request.payload.compaction_model?.key) message=message.replaceAll(request.payload.compaction_model.key,"[redacted]");
      emit("event", "run.failed", state.context, {}, undefined, message);
    }).finally(() => { active = undefined; });
  } catch (error) { process.stderr.write(String(error) + "\n"); input.close(); }
});
input.on("close", () => { active?.session?.agent.abort(); process.exit(0); });
process.stdin.on("error", () => input.close());
process.stdout.on("error", () => input.close());
emit("event", "worker.ready", undefined, { sdk_version: "1.5.2", protocol_version: 1, capabilities: ["canonical_entries", "awaited_checkpoint", "managed_tools"] });
