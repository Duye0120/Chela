# 02 · Pi 运行时、跨进程协议与扩展兼容

本章是实现规格建议。标注“上游”的部分来自 2026-11-13 读取的官方文档和源码；标注“Chela”的部分需要项目实现与验证，本文没有运行兼容测试。旧 Chela 基线为 `3bc4297f5cddf8f26aa387dfaf0b477180ea3297`：`src/main/agent.ts` 直接创建 `@earendil-works/pi-agent-core` 的 `Agent`，使用自己的上下文、Harness、MCP 和并行工具管理。完整 Pi 扩展宿主属于新增范围，不能把它写成旧系统已经具有的能力。

## 1. 固定运行边界，保留唯一 Agent 循环

**最终推荐：Go 常驻宿主管理 Chela，应用自带 Node worker 嵌入 `pi-coding-agent` SDK，每个活动会话只有一个 `AgentSession`、一个内部 Agent 循环。** 不调用用户全局 `pi` 命令，不要求用户安装 Pi CLI，不在 WebView 内运行 Node。Codex/OpenCode 是独立执行者，通过 PTY 或各自稳定接口接入，不能代替 Chela 日常 Agent。

上游仓库的原 `badlogic/pi-mono` 地址现在解析到 `earendil-works/pi`。本次审计提交 `47e9d74f9186de37e700693fac0f6e56a499657a` 中，三个包均声明 `1.5.2`，Node 要求为 `>=22.19.0`；这是源码声明版本，发布实施时仍须核对实际可安装包与锁文件，不能直接宣称它就是 npm 最新版本。[P1–P3]

| 层 | 上游职责 | Chela 的职责 |
|---|---|---|
| `pi-ai` | 模型/提供商协议、流式消息与工具调用类型 | 接入 Magpie 解析后的模型与认证，记录实际请求模型 |
| `pi-agent-core` | 单次 Agent 循环、工具批次、事件、取消、steer/follow-up | 不另写平行 LLM 循环 |
| `pi-coding-agent` | `AgentSession`、SessionManager、压缩、资源加载、扩展生命周期 | 显式注入配置、资源、工具、UI 与持久化桥 |
| Go Harness | 无上游对应的完整产品宿主 | 会话/运行状态、调度、审批、执行日志、长期记忆、主动行为、窗口独立生命周期 |

迁移可以先将旧 core 包装进 `PiAdapter` 以保留行为，再完成 coding-agent 兼容适配；但同一会话只能选择一种 adapter。最终切换时移除旧重复循环、重复压缩、重复 MCP 注册。旧 `parallelManager` 改成资源额度与锁，不能看到 tool call 后再直接启动一份 executor：当前 agent-core 已默认并行执行工具，会造成重复副作用。[P2]

## 2. 唯一持久源与运行时上下文

**Go SQLite 保存唯一权威会话历史；worker 中的 SessionManager 是同一历史的可重建内存投影。** Pi entries 按 SDK/格式版本保存原始 payload，Go 另建会话、消息、工具索引。不让 SDK 默认写 `~/.pi/agent/sessions`，也不另维护一份有不同压缩结果的文本历史。

当前上游支持 `SessionManager.inMemory(cwd, options?, entries?: FileEntry[])`。恢复流程为：读取 Go 保存的原始 `SessionHeader + SessionEntry[]`，构造内存 manager，按保存的 active leaf 调用 `branch(leafId)` 或 `resetLeaf()`，再传给 `createAgentSession`。必须保存整棵 entry tree、活动叶子、格式版本及扩展自定义 entry。禁止只给 `session.agent.state.messages` 赋值：AgentSession 在请求边界会从 SessionManager 重建上下文，前者不是它的历史权威源。[P4–P6]

Go 为每个 conversation branch 设置单一 canonical writer/revision。worker 提交 `{base_revision, added_entries, active_leaf_id}`；Go 校验父节点、重复 ID、活动 run/epoch 后事务提交，返回新 revision。完整原始消息保留 provider 需要的签名、toolCallId、内容块与未知扩展字段；UI 显示对象另行派生，不能将简化后的聊天气泡重新当模型历史。

SDK 的一次 factory 创建也可能补写模型或 thinking 元数据，因此创建、工具批次、压缩、分支、资源重载和最终 settle 都要做 entry 差异检查。`getEntries()` 是浅拷贝，桥接时必须立即序列化/复制，而非异步保存仍可变化的对象引用。会话切换若通过 `AgentSessionRuntime` 替换了实例，重新绑定监听器，不能沿用旧引用。[P4–P6]

**压缩只保留一个执行者。** 建议 Pi 负责会话内 compaction 与合法的消息配对，Go Context Builder 提供身份、记忆检索、情绪快照和任务材料，制定预算/触发策略。Go 若需要定制摘要，走 Pi compaction 扩展钩子并提交对应 entry；不要同时从 Go 裁剪数组、Pi 自动压缩。会话摘要不自动成为长期记忆；长期记忆需独立提取、证据和合并规则。[P7]

## 3. Node worker pool 与会话隔离

Go 为每个 conversation branch 维护 actor/串行邮箱，同一分支同时只有一个运行写 canonical 历史。不同分支和 session 可并行；共享的是同一 Chela 身份和关系状态，不共享一个可随意写入的 `messages[]`。每次 run 获得带 revision 的人格/情绪/记忆快照，写回走 Go reducer。

首版一个 worker 同时承载一个活动 run，按工作区与扩展集合固定分配；空闲 worker 可回收，恢复依赖持久 entry。默认前台并发 2、后台 1，总计 3，均可配置；外部 PTY 执行者另设额度，不占这三个 Pi worker 名额。配套等待队列、模型并发限制、任务 deadline 和内存上限，前台优先且后台保留额度。这是初始调度策略，实际预算通过目标机器测量调整，不是性能基准承诺。同步阻塞扩展会阻塞所在进程，因此进程隔离比单进程堆多个会话更易治理。

worker 使用随应用发布的 Node 与依赖构建产物，启动时握手报告 SDK 版本、协议版本、能力、构建 hash、扩展清单。不要启动时在线安装最新依赖。源码依赖范围可保持用户偏好的更新策略，但每个正式构建必须有可复现锁文件。只有 idle 会话可切换扩展版本或 worker；活动中不热替换工具表。`cwd`、agentDir、SettingsManager、ResourceLoader、ModelRuntime 全部显式传入，不隐式继承用户 Pi 配置或通过全局 `process.chdir()` 切换工作区。[P4]

## 4. Go ↔ worker 协议

这是 Chela 私有协议，不是上游现成协议。使用专用 pipe/socket，或严格的 stdout JSONL；日志只进 stderr。包尺寸受限，大图片与大结果以受控 artifact 引用传递。

```json
{
  "protocol_version": 1,
  "kind": "request",
  "method": "session.checkpoint",
  "worker_id": "worker_2",
  "epoch": 7,
  "worker_seq": 18,
  "request_id": "request_example",
  "correlation_id": "command_example",
  "context": {
    "assistant_id": "assistant_id_example",
    "session_id": "session_id_example",
    "branch_id": "branch_id_example",
    "run_id": "run_id_example",
    "attempt_id": "attempt_id_example"
  },
  "payload": {
    "base_revision": 42,
    "branch_generation": 1,
    "lease_token": 4,
    "erase_epoch": 0,
    "active_leaf_id": "pi_entry_42",
    "added_entries": [],
    "boundary": "message",
    "batch_id": "batch_example"
  }
}
```

| 方向 | 命令/事件 |
|---|---|
| Go → Node | `session.open`、`run.start`、`run.steer`、`run.followUp`、`run.cancel`、`tool.request`的response、`ui.reply`、checkpoint的ack、`session.dispose` |
| Node → Go | `worker.ready`、`run.accepted`、`stream.delta`、`session.checkpoint`、`session.compaction_commit`、`model.request.prepare/finish`、`tool.request`、`tool.progress`、`ui.request`、`run.settled`、`worker.health`、`error` |

传输 `kind` 固定为 `request|response|event|ack|cancel`，业务动作放在 `method`。`request_id` 去重并配对响应，`correlation_id` 串联因果；`run_id` 是产品层用户任务，`attempt_id` 绑定一次 worker epoch 的执行尝试。Pi 内部网络重试另记 `provider_request_id/retry_index`，不能混成重启恢复。`epoch` 拒绝重启前迟到事件；`worker_seq` 用于进程内流顺序，Go 提交后的领域事件获得持久 `event_id/seq`。跨 session 的事实顺序由 Go 提交序号决定，不能拿墙上时间排序。

流式 delta 可以合并、限速并在重连后由最终消息替代；checkpoint、审批、工具结果和最终状态不可丢弃，使用 ack、重发和接收端幂等处理。UI 断开只解除订阅。慢 UI 不得无限缓冲，也不能令工具执行日志丢失；提供 `GetSnapshot + Subscribe(afterCursor)` 恢复显示。

## 5. 必须真正等待的持久化屏障

这是本次源码核验发现的重要差异：**`Agent.subscribe` 会依次 await listener；`AgentSession.subscribe` 的 listener 类型是 `void`，实现没有 await，且公开 `message_end` 事件先于 SessionManager 的 append。** 所以 `session.subscribe(async e => saveToGo(e))` 不能保证写盘后才调用工具。[P5, P8]

由唯一 `PiBridge` adapter 集中实现屏障：在 `createAgentSession` 完成后，向 `session.agent.subscribe` 注册持久化监听器；此时内部 SessionManager listener 已先注册。遇到 finalized message、turn 等边界，将新增 entries 提交 Go，等待 ack 后才返回。所有经管理工具还须在执行前复核对应 assistant/tool-call checkpoint 已提交。对 compaction、扩展追加 entry、模型变化等非 core-event 写入，补充请求前、变更 API 返回后、最终 settle 的检查。Go按attempt+batch_id保存checkpoint回执和request hash，与entries/leaf同事务；重发先查回执，避免ack丢失被旧base_revision误拒绝。新增entries按批内顺序由Go分配session级entry_ordinal，重建按该序恢复。generic checkpoint拒绝未经专用门禁的compaction/context_edit。每次模型请求包括工具后续轮、重试和摘要，另经model.request.prepare/finish持久化最终ContextManifest并分配预算与网络permit，run.start的一次seed不能替代后续审计。具体 hook 顺序属于版本适配层的契约与集成测试门禁，业务模块不得自行用临时 subscribe 替代。

默认用户后续输入由Go持久队列创建下一Run，原Run settled并交接租约后才调用prompt；不能同时送Pi followUp。内部同Run续入如使用Pi队列则共用input_id消费记录。Go 收到用户输入先事务创建 command/run，再回复 runId。worker 得到确认后的上下文和 run lease 才开始。最终“完成”应等待 Pi `agent_settled`/idle、所有 checkpoint ack、所有工具日志收敛。`agent_end` 只代表底层一次循环结束，Pi 可能还要自动重试、压缩恢复或处理队列，不能据此关闭运行。[P4–P5]

## 6. 工具、审批和并行的唯一执行路径

每次执行遵循以下协议：

1. Pi 形成完整 assistant tool-call 消息，Go 先提交该消息及 invocation 记录。
2. Pi 扩展完成合法参数变换；Chela 在最终参数上重新 schema 校验，计算规范化参数 hash。
3. Go policy 根据工具、参数、workspace、能力、run 状态决定允许/拒绝/待确认。审批绑定 `runId + toolCallId + argsHash + policyRevision + resourceRevision`，参数或文件前提变化则重新评估。
4. 执行器取得相应资源锁和限额，记录 executing，检查取消令牌后执行一次。只读操作可并行；同一路径修改、同一终端输入等按资源序列化。
5. 先保存结果与可验证副作用，再返回 Pi。Pi 保持 toolCallId 配对；同批工具可按完成顺序显示，但进入模型的结果须保持上游协议顺序。

当前 Pi 的 `tool_call` handler 可原地修改输入，且之后不自动重新验证。因此宿主审批必须发生在所有此类变换之后。[P9] Chela 官方或已适配的 `managed` 工具，其最终 `execute` 必须进入 Go stub，由 Go 校验活跃 run、attempt、epoch、分支写入租约与最终参数。上层工具可纯计算或编排，但所有文件、进程、网络、MCP、领域写入等受治理能力都须经该路径。`ctx.executeTool()` 只有在最终目标也是受管理 stub 时，才继承这项保证；nested ID 是父 ID 加子序号，须记入调用树并逐项治理。

正常嵌套调用在当前上游会经过内部 `runToolCall` 与私有 `_beforeToolCall/_afterToolCall`，但不经过外部覆写的 public `agent.beforeToolCall`；直接函数调用或 Node I/O 不经过上述边界。策略 extension 的 `tool_call` hook 可协助展示与审计，不能作为授权边界。未完成适配、直接执行本地能力的插件列为 `trusted-native`：保留兼容性，但明确 Go 无法保证其全部副作用经过策略、审批、取消或幂等日志。[P5, P13]

插件可直接访问 Node filesystem、网络和进程，Pi 扩展不是权限沙箱。`managed` 是已审核代码遵守执行协议的兼容声明，不是约束任意 JavaScript 的沙箱权限。Go 能保证的是经过其执行网关的操作；MCP 和 SDK 原生文件/命令工具也必须适配到该路径才能标为 managed，单纯不把工具显示给模型不构成权限撤销。需要运行不可信扩展时另加 OS 级隔离，这是独立工程范围；普通 worker pool 仅提供崩溃/资源隔离，不能对外承诺它限制了插件权限。[P9]

## 7. 取消、挂起与重启恢复

`run.cancel` 持久化后，Go 撤销 run lease、取消执行器 context，Node 调用 `session.abort()`；等待 idle 与工具收敛后进入终态。忽略取消的子进程按平台结束整个进程组，宽限期后回收 worker。取消不等于撤销已发生的文件修改、网络请求或发送行为。

审批等待可以在存活 worker 中挂起 Promise，并释放模型网络额度；warm worker 只限时保留，等待者数目另有限额。首版不把“待确认”自动变成可跨进程迁移 continuation：重启保存了历史，不代表保存了 JavaScript Promise、工具调用栈或扩展内存。回收后原 run 标记 interrupted，新建恢复 run 引用 `recovery_of_run_id`，不把新进程伪装成原栈继续运行。长时间等待不能耗尽前台 worker。

| 崩溃时刻 | 恢复策略 |
|---|---|
| 模型只产生未完成 delta | 保存可见草稿为 interrupted 展示；从最后已提交边界重新请求，记录可能重复计费 |
| 工具已计划但未执行 | 重新校验参数/资源/审批，决定继续或取消 |
| 工具 executing，结果不明 | 标记 outcome unknown，检查外部副作用；没有幂等键或可验证结果时禁止盲目重放 |
| 结果已提交但 Pi 未收到 | 使用同一 invocation ID 返还已有结果；实际续接仍要通过已验证的工具批次恢复适配 |
| 只剩已完成历史 | 由原始 entries、leaf 和配置重建新 session，然后开始新的 run |

首版承诺“历史可恢复、已知工具不重复执行、运行中断可解释”；不要承诺“任意指令断电后精确续跑”。若未来做工具批次续接，必须保存整批原始 assistant、每个结果状态、provider 不透明字段和配置 fingerprint，补齐配对后在新 attempt 上恢复；这属于 Chela 新增协议，本文未验证其精确可行实现。

新建恢复 Run 不能自动修复悬空 tool calls。恢复入口在第一次 provider 请求前验证完整配对；没有已验证的批次恢复 adapter 时，转到最后完整安全边界建立恢复分支，以显式 handoff 引用 Go 工具日志中的已证实、未证实和不可重放操作，原始中断记录保留。不得把未知副作用伪装成成功 tool result，也不得将未配对历史原样送入模型。

运行顶层状态统一为 `queued/starting/running/waiting_approval/waiting_input/cancelling/succeeded/failed/cancelled/interrupted`；`thinking/tool/compacting` 是 phase，不额外扩张状态机。UI 显示状态只来自 Go reducer 的已提交事件，worker 自报 completed、连接断开或某条文字说“完成”都不能直接改变任务终态。

## 8. Pi 插件兼容分级

| 等级 | 范围 | 承诺 |
|---|---|---|
| A | skills、prompt templates、`pi.extensions` 资源清单 | 解析/选择资源，明确项目与用户作用域 |
| B | 无界面的生命周期、工具、命令、custom entries | 经固定 SDK 版本测试后兼容；另声明执行边界 managed 或 trusted-native，不能将行为兼容等同权限受控 |
| C | select/confirm/input/editor/notify/status 等简单 UI | `bindExtensions({mode: "rpc", uiContext})` 映射到 Go/React；必须关联会话、run、请求 ID、取消和超时 |
| D | `ctx.ui.custom()`、TUI component factory、终端输入/绘制 | 需要单独 WebView 适配，或明确标注不支持 |
| E | 任意私有 API、独立 Pi 运行时依赖、未验证提供商扩展 | 不承诺自动兼容；逐项迁移 |

上游 loader 已为常用 `@mariozechner/*` 导入提供到 `@earendil-works/*` 的 aliases，并有 `pi-ai` compat view；这不能替代行为测试。插件不应自带另一份宿主 Pi 包，否则可能绕过映射形成重复类/注册表。使用 package manifest 的资源声明，安装/升级/启停由 Chela 管理，不要求用户运行 Pi CLI。[P10–P11]

`ctx.hasUI` 只说明有对话 UI，不能等价于终端能力；上游 mode 只有 `tui/rpc/json/print`，WebView 桥采用 rpc 语义，不伪造 tui。SDK 不自动装入 CLI 的 MCP、codemode、tool_search；需要显式加载 factory、注册工具并调用 `bindExtensions`。Chela 自有 MCP 与 Pi MCP 二选一拥有每个连接，不能双重注册同名工具。扩展安装清单、hash、错误、兼容等级和停用原因应在设置里可见。[P4, P9]

## 9. MyGo 与 React/WebView 边界

上游 MyGo 使用 macOS WKWebView、Linux WebKitGTK、Windows WebView2，支持 Go 服务绑定、生成 TypeScript 客户端、事件和流式 channel；它不把 Pi 的 Node runtime 变成 Go runtime。[M1–M3]

React 仅调用 Go 产品服务，例如 `SubmitMessage`、`CancelRun`、`ResolveApproval`、`ListSessions`、`SubscribeSession`。绑定方法的 context 随页面导航/窗口关闭取消，所以 `SubmitMessage` 应在落库后快速返回 runId，由应用 supervisor 持有 Run context；关闭 UI channel 只取消显示订阅。显式取消才停止运行。

外部网页与生成 HTML 使用 `PageOptions.Untrusted` 或不可信 origin，不开放 Go 特权桥；官方文档说明只有受信顶层页面可调用 Go。WebView 不是每次 render 重建；隐藏标签保留页面。原生控件/终端与 WebView 混用时验证焦点、中文 IME、剪贴板、拖拽、滚动和无障碍，不把上游某个 hello-world 的内存数字当 Chela 性能指标。[M2–M3]

## 10. 实施验收门槛

本章只定义门槛，没有执行测试。进入功能扩展前应证明：

1. 同一 session 不会双写；两个 session 并行时历史、cwd、工具、审批和取消互不串线。
2. host checkpoint 延迟期间工具绝不提前执行；公开 session listener 的异步返回不会被误认为屏障。
3. 一个双工具批次只执行两次；恢复、重连、重发不增加执行次数；managed 嵌套目标同样进入 Go 政策，trusted-native 不错误宣称此保证。
4. tool-call/结果、provider 字段、custom entry、compaction 和分支叶子重建后保持；未知格式升级失败时保留原数据。
5. agent_end 后自动重试仍显示运行中；agent_settled 后最终 checkpoint 成功才完成；取消一个 run 不影响另一个。
6. 杀 worker 发生在 planned/executing/result-committed 各阶段都产生确定、可解释状态，未知副作用不自动重放。
7. 插件 A/B/C/D 分级真实；禁用/重载不会双注册或遗留计时器；未信任项目内容不自动获得代码执行授权。
8. UI 页面关闭后授权运行继续、重新打开可恢复显示；不可信网页不能调用 Go；目标平台 WebView 关键交互通过验证。

## 官方来源与版本

读取日期：2026-11-13。以下均为上游官方仓库/文档，不使用第三方 fork 作为接口依据。

- P1 包声明：https://github.com/earendil-works/pi/blob/47e9d74f9186de37e700693fac0f6e56a499657a/packages/coding-agent/package.json
- P2 agent-core：https://github.com/earendil-works/pi/blob/47e9d74f9186de37e700693fac0f6e56a499657a/packages/agent/README.md
- P3 pi-ai：https://github.com/earendil-works/pi/blob/47e9d74f9186de37e700693fac0f6e56a499657a/packages/ai/package.json
- P4 SDK：https://github.com/earendil-works/pi/blob/47e9d74f9186de37e700693fac0f6e56a499657a/packages/coding-agent/docs/sdk.md
- P5 AgentSession：https://github.com/earendil-works/pi/blob/47e9d74f9186de37e700693fac0f6e56a499657a/packages/coding-agent/src/core/agent-session.ts
- P6 SessionManager：https://github.com/earendil-works/pi/blob/47e9d74f9186de37e700693fac0f6e56a499657a/packages/coding-agent/src/core/session-manager.ts
- P7 compaction：https://github.com/earendil-works/pi/blob/47e9d74f9186de37e700693fac0f6e56a499657a/packages/coding-agent/docs/compaction.md
- P8 Agent 实现：https://github.com/earendil-works/pi/blob/47e9d74f9186de37e700693fac0f6e56a499657a/packages/agent/src/agent.ts
- P9 扩展：https://github.com/earendil-works/pi/blob/47e9d74f9186de37e700693fac0f6e56a499657a/packages/coding-agent/docs/extensions.md
- P10 loader：https://github.com/earendil-works/pi/blob/47e9d74f9186de37e700693fac0f6e56a499657a/packages/coding-agent/src/core/extensions/loader.ts
- P11 package manifest：https://github.com/earendil-works/pi/blob/47e9d74f9186de37e700693fac0f6e56a499657a/packages/coding-agent/docs/packages.md
- P12 SDK factory：https://github.com/earendil-works/pi/blob/47e9d74f9186de37e700693fac0f6e56a499657a/packages/coding-agent/src/core/sdk.ts
- P13 扩展 handler 顺序：https://github.com/earendil-works/pi/blob/47e9d74f9186de37e700693fac0f6e56a499657a/packages/coding-agent/src/core/extensions/runner.ts
- P14 资源加载顺序：https://github.com/earendil-works/pi/blob/47e9d74f9186de37e700693fac0f6e56a499657a/packages/coding-agent/src/core/resource-loader.ts
- M1 MyGo 架构：https://github.com/egoist/mygo/blob/d5c76cf8a0986cc8b3e12671d068a8d9d510b6c7/docs/architecture.md
- M2 WebView：https://github.com/egoist/mygo/blob/d5c76cf8a0986cc8b3e12671d068a8d9d510b6c7/docs/ui/web-view.md
- M3 Go/TS binding：https://github.com/egoist/mygo/blob/d5c76cf8a0986cc8b3e12671d068a8d9d510b6c7/docs/bindings.md
- M4 MyGo 工具链声明：https://github.com/egoist/mygo/blob/d5c76cf8a0986cc8b3e12671d068a8d9d510b6c7/go.mod

MyGo 审计 ref 为 `d5c76cf8a0986cc8b3e12671d068a8d9d510b6c7`；其 `go.mod` 声明 Go 1.27.3。实施时根据锁定 MyGo 版本选择工具链，不将本文读取 main 的版本当永久最低版本。
