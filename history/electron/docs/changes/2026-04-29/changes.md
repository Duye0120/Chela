## 修复自定义提供商保存时的 draft.id 校验报错

时间：2026-04-29 12:56:00

改了什么：
- 调整 provider IPC draft 校验，对可选字段 `id` / `baseUrl` 仅在显式传入非 `undefined` 时再做校验。
- 设置页统一通过一个 source draft helper 构造 `saveSource`、`testSource`、`fetchModels` 的 payload，未保存 provider 不再发送 `id: undefined`。

为什么改：
- 新建自定义提供商后，保存修改和拉取模型列表会被 `draft.id 必须是 非空字符串` 拦截，导致 provider 无法保存。
- 这次回归来自前端草稿态与 IPC 校验的可选字段约束不一致，需要两侧一起兜住。

涉及文件：
- `src/main/ipc/schema.ts`
- `src/renderer/src/components/assistant-ui/settings/keys-section.tsx`
- `docs/changes/2026-04-29/changes.md`

结果：
- 未保存 provider 现在可以正常保存，不会再直接报 `providers:save-source 参数无效：draft.id 必须是 非空字符串`。
- 测试连接和拉取模型列表也不再因为同一个 `draft.id` 校验问题被提前打断。

## 修复设置页保存时缺失 normalizeCapabilitiesOverride

时间：2026-04-29 13:05:00

改了什么：
- 将模型设置页使用的 `normalizeCapabilitiesOverride` 从 `keys-section-model.ts` 显式导出。
- 在 `keys-section.tsx` 中补上对应导入，保证保存模型条目时可正常归一化 capabilities。

为什么改：
- 保存 provider 时，前端运行到 `desktopApi.models.saveEntry(...)` 前会调用 `normalizeCapabilitiesOverride(entry.capabilities)`。
- 该 helper 在当前文件作用域内不存在，导致运行时报 `normalizeCapabilitiesOverride is not defined`，保存流程再次被打断。

涉及文件：
- `src/renderer/src/components/assistant-ui/settings/keys-section-model.ts`
- `src/renderer/src/components/assistant-ui/settings/keys-section.tsx`
- `docs/changes/2026-04-29/changes.md`

结果：
- 保存修改不再因为缺失 helper 而直接报前端运行时错误。

## 为测试连接结果补充时间显示

时间：2026-04-29 13:12:00

改了什么：
- 设置页的测试连接结果改为在本地记录 `testedAt` 时间戳。
- 在底部状态文案中为测试成功/失败结果追加 `HH:MM:SS` 时间显示，并复用当前设置时区格式化。

为什么改：
- 用户希望在“测试连接”结果旁边直接看到最近一次测试发生的时间，便于区分当前结果是不是刚刚测出来的。
- 这个信息属于纯展示态，放在 renderer 本地状态即可，不需要改主进程返回协议。

涉及文件：
- `src/renderer/src/components/assistant-ui/settings/keys-section.tsx`
- `docs/changes/2026-04-29/changes.md`

结果：
- “连接测试通过” / “连接测试失败” 现在都会在同一行追加测试时间。

## 修复测试时间格式导致的设置页渲染崩溃

时间：2026-04-29 13:18:00

改了什么：
- 为测试结果时间格式化增加 `system` 时区兼容和异常兜底。
- 仅在用户明确选择具体时区时才向 `Intl.DateTimeFormat` 传 `timeZone`，非法值统一回退到本地时区格式化。

为什么改：
- 当前设置里的时区值允许为 `system`，这不是合法 IANA time zone。
- 我前一轮直接把它传进 `Intl.DateTimeFormat`，导致设置页进入 provider 页面时触发 `RangeError` 并整页 render crash。

涉及文件：
- `src/renderer/src/components/assistant-ui/settings/keys-section.tsx`
- `docs/changes/2026-04-29/changes.md`

结果：
- 设置页不会再因为测试结果时间显示而整页崩溃。
- `system` 和异常时区值都会安全回退到本地时间显示。

## 将测试结果时间改为测试耗时毫秒数

时间：2026-04-29 13:24:00

改了什么：
- 移除测试结果里的钟点时间展示与对应格式化逻辑。
- `测试连接` 现在在 renderer 侧记录整次请求的耗时，并在结果文案里显示 `xx ms`。

为什么改：
- 用户要的是“测试全程用了多久”，不是“测试发生在几点”。
- 用毫秒耗时更能直接反映 provider 连通性和响应速度，也避免再引入时区语义。

涉及文件：
- `src/renderer/src/components/assistant-ui/settings/keys-section.tsx`
- `docs/changes/2026-04-29/changes.md`

结果：
- 底部状态文案现在会显示类似 `连接测试通过 · 842 ms`。
- 失败结果也会同样带上本次测试耗时，方便判断是快速失败还是请求超时。

## 完善 MCP 与插件设置页管理闭环

时间：2026-04-29 13:20:53

改了什么：
- MCP 设置页新增状态摘要、更新时间展示和打开 `mcp.json` 配置入口；配置文件不存在时会创建空的 `mcpServers` 配置。
- 插件设置页新增插件扫描摘要、权限 / workflow / 目录明细，并补充打开插件根目录、单个插件目录和 `plugin.json` 的操作。
- 插件扫描器新增重复 plugin id 检测，重复项进入扫描错误，不再进入可启停列表。
- 新增 MCP / 插件打开操作的 IPC channel、preload API 和 DesktopApi 类型。
- 补充插件重复 id 回归断言和新插件 IPC channel 的 payload 校验断言。

为什么改：
- 4 月 28 日已把 MCP 与插件拆成独立设置入口，但页面还偏“只读状态展示”，缺少定位配置和 manifest 的管理动作。
- 重复 plugin id 会让启停状态复用同一个 key，也会让 renderer 列表 key 冲突，需要在扫描阶段拦住。

涉及文件：
- `src/shared/ipc.ts`
- `src/shared/contracts.ts`
- `src/preload/index.ts`
- `src/main/ipc/mcp.ts`
- `src/main/ipc/plugins.ts`
- `src/main/plugins/registry.ts`
- `src/main/plugins/service.ts`
- `src/renderer/src/components/assistant-ui/settings/mcp-section.tsx`
- `src/renderer/src/components/assistant-ui/settings/plugins-section.tsx`
- `tests/plugin-status-regression.test.ts`
- `tests/ipc-contract-regression.test.ts`
- `docs/changes/2026-04-29/changes.md`

结果：
- `pnpm exec tsx tests/plugin-status-regression.test.ts` 通过。
- `pnpm exec tsx tests/ipc-contract-regression.test.ts` 通过。
- `pnpm exec tsc --noEmit -p tsconfig.renderer.json` 通过。
- `pnpm exec tsc --noEmit -p tsconfig.json` 未通过，失败点在既有主进程类型错误（如 `src/main/agent.ts`、`src/main/context/snapshot.ts`、`src/main/harness/*`、`src/main/ipc/schema.ts`、`src/main/tools/code-analysis.ts`），本轮新增 MCP / 插件文件未被报错指中。

## MCP 设置页支持添加与编辑 server

时间：2026-04-29 16:06:11

改了什么：
- MCP 设置页改成左侧 server 列表、右侧详情配置面板；点击列表项即可编辑，空列表或“添加”按钮进入新增状态。
- 详情面板支持配置 `name`、`command`、逐行 `args`、`cwd`、`env`、停用开关，并保留重启、断开、删除等单项操作。
- 新增 `mcp:save-server` 与 `mcp:delete-server` IPC，preload 和 DesktopApi 类型同步暴露。
- 新增 `saveMcpServerConfig` / `deleteMcpServerConfig`，写入 workspace 根目录 `mcp.json` 后自动重载 MCP；编辑既有 server 时，未触碰 env 会保留原有环境变量。
- 将 IPC schema 的基础校验 helper 改成 TypeScript assertion 形式，避免本轮新增 MCP 入参校验继续放大旧的 `unknown` 窄化错误。
- 新增 MCP 配置回归测试，并将 `plugin-status-regression` 和 `mcp-config-regression` 纳入 `test:regression`。

为什么改：
- 只打开 `mcp.json` 不够顺手；用户期望先看到 MCP 列表，再点某个 server 做配置。
- 当前 Chela MCP 运行时主要支持 stdio，因此本轮先把 stdio 的添加、编辑、删除闭环做完整，避免一次性扩到 HTTP/SSE 造成过大改动。

涉及文件：
- `package.json`
- `src/shared/ipc.ts`
- `src/shared/contracts.ts`
- `src/preload/index.ts`
- `src/main/ipc/mcp.ts`
- `src/main/ipc/schema.ts`
- `src/mcp/config.ts`
- `src/renderer/src/components/assistant-ui/settings/mcp-section.tsx`
- `tests/mcp-config-regression.test.ts`
- `tests/ipc-contract-regression.test.ts`
- `docs/changes/2026-04-29/changes.md`

结果：
- `pnpm exec tsx tests/mcp-config-regression.test.ts` 通过。
- `pnpm exec tsx tests/ipc-contract-regression.test.ts` 通过。
- `pnpm exec tsx tests/plugin-status-regression.test.ts` 通过。
- `pnpm exec tsx tests/package-scripts-regression.test.ts` 通过。
- `pnpm exec tsc --noEmit -p tsconfig.renderer.json` 通过。
- `pnpm exec tsc --noEmit -p tsconfig.json` 仍未通过，剩余为既有主进程类型错误（如 `src/main/agent.ts`、`src/main/context/snapshot.ts`、`src/main/harness/*` 和 `src/main/tools/code-analysis.ts`），本轮新增 MCP 配置读写、IPC schema 和 renderer 文件未被报错指中。

## MCP 配置补齐 STDIO 与 Streamable HTTP

时间：2026-04-29 16:16:47

改了什么：
- MCP 配置模型新增 transport 类型，兼容 legacy stdio 配置，并支持 `type: "streamable-http"` 的远端 MCP。
- MCP 连接层新增 `StreamableHTTPClientTransport`，HTTP server 支持 URL、静态 headers、bearer token env var、headers from env。
- MCP 设置页的详情表单改为 Codex 风格的 `STDIO / Streamable HTTP` 分段：STDIO 展示 command、args、env、env passthrough、cwd；HTTP 展示 URL、bearer token env var、headers、headers from env。
- 状态列表展示 transport 类型；HTTP server 用 URL 作为主要连接信息，stdio server 保留 command + args。
- MCP 配置回归补充 Streamable HTTP 保存、headers 和 env-derived headers 断言。

为什么改：
- 用户反馈 Codex 的 MCP 添加体验更完整，需要同时覆盖本地 `npx`/stdio 与远端 HTTP MCP。
- 只做 UI 分段不够，运行时也必须真正能用 HTTP transport 连接 MCP server。

涉及文件：
- `src/shared/contracts.ts`
- `src/main/ipc/schema.ts`
- `src/mcp/config.ts`
- `src/mcp/client.ts`
- `src/renderer/src/components/assistant-ui/settings/mcp-section.tsx`
- `tests/mcp-config-regression.test.ts`
- `tests/ipc-contract-regression.test.ts`
- `docs/changes/2026-04-29/changes.md`

结果：
- `pnpm exec tsx tests/mcp-config-regression.test.ts` 通过。
- `pnpm exec tsx tests/ipc-contract-regression.test.ts` 通过。
- `pnpm exec tsx tests/package-scripts-regression.test.ts` 通过。
- `pnpm exec tsc --noEmit -p tsconfig.renderer.json` 通过。
- `pnpm exec tsc --noEmit -p tsconfig.json` 仍未通过，剩余为既有主进程类型错误（`src/main/agent.ts`、`src/main/context/snapshot.ts`、`src/main/harness/*`、`src/main/tools/code-analysis.ts`），本轮 MCP STDIO/HTTP 文件未被报错指中。

## 聊天发送显式绑定当前 UI 模型

时间：2026-04-29 17:20:46

改了什么：
- 排查 17:10 左右的会话记录，确认当时 `run_started/run_finished` 的 requested/resolved model 都是小米 `mimo-v2.5-pro`，没有 prepare 或 execute failover 到百炼。
- `SendMessageInput` 新增可选 `modelEntryId`，renderer 发消息时携带当前模型选择器的 `currentModelId`，主进程创建聊天 run 时优先使用该值，再回退 settings。
- Runtime Capability Manifest 增加模型身份回答约束：当用户询问当前模型、source、provider 或是否切换时，只能依据本轮 manifest 的当前模型与 source。
- 新增 `model-routing-regression`，覆盖 manifest 不混入旧的 `qwen3.5-plus`，并将其纳入 `test:regression`。

为什么改：
- 本次问题不是小米切换失败，而是模型自述被旧上下文/模型自称误导；同时发送链路存在“UI 已切换但 settings 异步写入未落盘”这一理论 race，需要把用户当前选择随消息一起送到主进程。

涉及文件：
- `package.json`
- `src/shared/contracts.ts`
- `src/renderer/src/components/AssistantThreadPanel.tsx`
- `src/main/chat/prepare.ts`
- `src/main/prompt-control-plane.ts`
- `tests/model-routing-regression.test.ts`
- `docs/changes/2026-04-29/changes.md`

结果：
- `pnpm exec tsx tests/model-routing-regression.test.ts` 通过。
- `pnpm exec tsx tests/ipc-contract-regression.test.ts` 通过。
- `pnpm exec tsx tests/package-scripts-regression.test.ts` 通过。
- `git diff --check` 通过，仅输出既有 Windows LF/CRLF 换行提示。
- 未运行 build，也未运行全量 check。

## 去掉底部重复运行状态

时间：2026-04-29 17:25:25

改了什么：
- 移除 composer 底部状态栏右侧的运行状态 badge，不再在底部重复显示“思考中...”。
- 保留消息区内的运行状态提示，以及 composer 内的停止按钮和停止中状态文案。

为什么改：
- 用户标注底部位置 2 的“思考中...”与上方位置 1 重复，底部保留 token/context/branch 信息即可。

涉及文件：
- `src/renderer/src/components/assistant-ui/thread.tsx`
- `docs/changes/2026-04-29/changes.md`

结果：
- `git diff --check` 通过，仅输出既有 Windows LF/CRLF 换行提示。
- 未运行 build，也未运行全量 check。

## 修正 run 变更摘要串到其他聊天

时间：2026-04-29 17:33:46

改了什么：
- run 结束生成 `runChangeSummary` 时，不再把全局 Git diff 前后差异全部归到当前聊天。
- 新增当前 run 触达路径收集，只从成功的 `file_edit` / `edit_file` / `file_write` 工具步骤里提取文件路径，并用这些路径过滤 diff 摘要。
- 完成、取消、失败三类收尾流程都改为先构建当前 assistant message，再根据该消息的 steps 计算并写入当前 run 的变更摘要。
- 新增回归测试覆盖：其他会话产生的 diff 不进入当前摘要、空触达路径不生成摘要、Windows 路径与绝对路径会规范化。

为什么改：
- 用户反馈某些并非当前聊天新增的变更，刷新后会出现在当前聊天的变更摘要里；根因是旧逻辑用工作区全局 diff 时间窗推断归属，无法区分其他 session 或外部工具同时产生的改动。

涉及文件：
- `src/main/chat/run-change-summary.ts`
- `src/main/chat/finalize.ts`
- `tests/run-change-summary-regression.test.ts`
- `package.json`
- `docs/changes/2026-04-29/changes.md`

结果：
- `pnpm exec tsx tests/run-change-summary-regression.test.ts` 通过。
- `git diff --check -- src/main/chat/finalize.ts src/main/chat/run-change-summary.ts tests/run-change-summary-regression.test.ts package.json docs/changes/2026-04-29/changes.md` 通过，仅输出既有 Windows LF/CRLF 换行提示。
- 未运行 build，也未运行全量 check。

## 隐藏历史消息里不属于当前 run 的变更摘要

时间：2026-04-29 17:39:36

改了什么：
- renderer 在把历史 `ChatMessage` 转成 assistant-ui 消息时，会重新用该消息自己的 steps 校验 `meta.runChangeSummary`。
- 只有摘要文件路径能匹配当前消息里成功完成的 `file_edit` / `edit_file` / `file_write` 触达路径时，才继续展示变更摘要。
- 如果旧 transcript 里残留了全局 diff 误归属的摘要，但消息本身没有对应文件修改步骤，刷新后会直接隐藏。

为什么改：
- 用户反馈旧聊天里“明明什么都没干”仍然显示之前串进去的 `thread.tsx` 摘要；生成端修复只能保护后续 run，展示端还需要兜住已经写进历史消息的错误 metadata。

涉及文件：
- `src/renderer/src/components/AssistantThreadPanel.tsx`
- `docs/changes/2026-04-29/changes.md`

结果：
- `git diff --check -- src/renderer/src/components/AssistantThreadPanel.tsx docs/changes/2026-04-29/changes.md` 通过，仅输出既有 Windows LF/CRLF 换行提示。
- 未运行 build，也未运行全量 check。

## 聊天消息变更摘要复用 diff panel 展开视图

时间：2026-04-29 19:15:37

改了什么：
- `RunChangeSummaryFile` 增加可选 `patch`、`kind`、`previewPath` 字段，用于把 run 结束时已有的 Git diff 渲染信息带到聊天消息 metadata。
- run 变更摘要构建时保留对应文件的 patch 与文件类型；新增、更新、恢复场景都会带上可展示的 diff 数据。
- 聊天页的 session 变更摘要在有 patch 时复用 `DiffFileCard`，支持逐文件展开并使用和右侧 diff panel 一致的 diff 渲染；旧历史消息没有 patch 时继续回退到原摘要列表。
- 回归测试补充断言，确认 run 摘要会保留 diff patch 与文件类型。

为什么改：
- 用户反馈 session 修改文件后聊天消息里展示的 diff 只是普通文字列表，不能像 diff panel 一样展开查看具体差异。

涉及文件：
- `src/shared/contracts.ts`
- `src/main/chat/run-change-summary.ts`
- `src/renderer/src/components/assistant-ui/thread-run-change-summary.tsx`
- `tests/run-change-summary-regression.test.ts`
- `docs/changes/2026-04-29/changes.md`

结果：
- `git diff --check -- src/shared/contracts.ts src/main/chat/run-change-summary.ts src/renderer/src/components/assistant-ui/thread-run-change-summary.tsx tests/run-change-summary-regression.test.ts` 通过，仅输出既有 Windows LF/CRLF 换行提示。
- 尝试运行 `pnpm exec tsx tests/run-change-summary-regression.test.ts`，但当前 Codex 桌面环境的 Node 初始化触发 `Assertion failed: ncrypto::CSPRNG(nullptr, 0)`，测试进程未进入断言阶段。
- 未运行 build，也未运行全量 check。

## 过程摘要等 run 完成后再进入已处理态

时间：2026-04-29 17:52:06

改了什么：
- `buildAssistantParts` 增加当前 run 状态参数，运行中的 assistant 消息会把 process group 强制保持为 running。
- 即使某段 thinking 已结束，只要整轮 run 还没收到最终收尾，外层过程块就不会提前显示“已处理 · Ns”。
- 历史已完成消息仍按完成态展示；失败消息按 error 态展示。

为什么改：
- 用户反馈过程块在 thinking 结束后过早折叠成“已处理 · 5s”，但后面可能还有工具调用、下一段思考和最终回复；体验应该与 Codex 一致，等所有步骤和最终回复完成后才显示外层完成摘要。

涉及文件：
- `src/renderer/src/components/AssistantThreadPanel.tsx`
- `docs/changes/2026-04-29/changes.md`

结果：
- `git diff --check -- src/renderer/src/components/AssistantThreadPanel.tsx docs/changes/2026-04-29/changes.md` 通过，仅输出既有 Windows LF/CRLF 换行提示。
- 未运行 build，也未运行全量 check。
