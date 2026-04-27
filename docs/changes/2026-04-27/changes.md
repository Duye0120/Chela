## 行动型 Agent 三阶段完善

时间：2026-04-27 11:57:58

改了什么：
- 新增 `code_inspect` / `code_diagnostics` 内置工具，支持 TS/TSX/JS/JSX 文件结构检查和目标诊断。
- 扩展 `file_edit` details，增加 changed ranges、行尾保留标记和诊断建议。
- 扩展 MCP 管理链路，支持读取状态、重载配置、重启和断开 server，并在设置页系统分区展示 MCP 状态。
- 扩展 context summary，加入 session todos、最近工具失败和可恢复 run 线索；context 展开卡片增加任务状态和恢复入口。
- 更新工具系统、内置工具和 MCP client 规格文档。
- 新增回归测试覆盖 MCP legacy 配置兼容、代码结构检查、目标诊断和 Harness safe policy。

为什么改：
- Chela 已有执行主干，这轮补强代码修改后的自检能力、MCP 运维可见性，以及长任务中断后的恢复线索。

涉及文件：
- `src/main/tools/code-analysis.ts`
- `src/main/tools/index.ts`
- `src/main/tools/file-edit.ts`
- `src/main/harness/policy.ts`
- `src/main/context/snapshot.ts`
- `src/main/agent.ts`
- `src/mcp/config.ts`
- `src/mcp/client.ts`
- `src/mcp/adapter.ts`
- `src/main/ipc/mcp.ts`
- `src/shared/contracts.ts`
- `src/shared/ipc.ts`
- `src/preload/index.ts`
- `src/renderer/src/components/assistant-ui/context-summary-trigger.tsx`
- `src/renderer/src/components/assistant-ui/thread.tsx`
- `src/renderer/src/components/assistant-ui/settings/mcp-section.tsx`
- `src/renderer/src/components/assistant-ui/settings/system-section.tsx`
- `tests/action-agent-regression.test.ts`
- `specs/04-tool-system.md`
- `specs/05-builtin-tools.md`
- `specs/06-mcp-client.md`

结果：
- 代码任务可以走“定位、结构检查、编辑、目标诊断”的闭环。
- MCP server 状态进入可见管理链路。
- 任务状态板和失败恢复线索可以进入 context UI 与 prompt。

## code inspect outline 收口

时间：2026-04-27 12:18:34

改了什么：
- 将 `code_inspect` 的 symbols 聚焦到顶层函数、类、类型、变量和类方法，减少函数内部临时变量噪音。
- 补充 `export default` 语句识别。
- 回归测试增加语法错误文件的 `code_diagnostics` 结构化错误断言。

为什么改：
- 代码结构检查用于改代码前快速定位，输出需要稳定、低噪音，并覆盖修改后诊断失败的关键路径。

涉及文件：
- `src/main/tools/code-analysis.ts`
- `tests/action-agent-regression.test.ts`
- `docs/changes/2026-04-27/changes.md`

结果：
- `code_inspect` 的 outline 更接近执行型 Agent 需要的局部结构摘要。
- `code_diagnostics` 对语法错误文件的测试覆盖已补齐。

## MCP config 纯 Node 化

时间：2026-04-27 12:32:08

改了什么：
- 移除 `src/mcp/config.ts` 对主进程 Electron logger 的直接依赖。
- MCP 配置解析 warning 改为轻量 `console.warn`，保持配置解析逻辑可在 Node 测试中直接 import。

为什么改：
- 新增回归测试需要直接验证 `loadMcpConfig`，该模块应保持纯配置解析能力，避免测试运行时加载 Electron-only 入口。

涉及文件：
- `src/mcp/config.ts`
- `docs/changes/2026-04-27/changes.md`

结果：
- MCP 配置兼容测试可以在 Node 22 测试进程中直接运行。

## Node 运行时版本固定

时间：2026-04-27 12:41:22

改了什么：
- 新增 `.nvmrc` 和 `.node-version`，固定项目本地 Node 版本为 `22.19.0`。
- 使用 Node 22.19.0 重新执行 `pnpm exec tsx tests\action-agent-regression.test.ts`，回归测试通过。

为什么改：
- 当前 PATH 下的 Node 24.13.0 在本机执行 `node -p`、`tsx` 等运行时代码时触发 `ncrypto::CSPRNG(nullptr, 0)` 原生断言。
- Node 22.19.0 可以稳定启动项目测试链路，适合作为当前 Chela 开发和验证版本。

涉及文件：
- `.nvmrc`
- `.node-version`
- `docs/changes/2026-04-27/changes.md`

结果：
- 新增行动型 Agent 回归测试已在 Node 22.19.0 下通过。
- 后续本地开发工具可以按版本文件切换到稳定 Node。

## IPC 错误结构化与回归入口

时间：2026-04-27 13:08:46

改了什么：
- 新增共享 IPC 错误 payload 类型和错误消息前缀。
- `handleIpc` 将 handler 异常统一编码为 `{ code, message }`，包含非主 frame 调用拒绝。
- `preload` 新增统一 `invokeIpc`，解码主进程错误并向 renderer 抛出带 `code` 的 Error。
- 抽出 `src/main/log-sanitize.ts` 作为纯 Node 日志脱敏模块，避免安全测试加载 Electron logger。
- 新增 `test:regression` 脚本，串行运行安全回归和行动型 Agent 回归。
- 更新 TODO 索引，将 M7 标记为已修复。

为什么改：
- 后续功能会持续增加 IPC 面，统一错误结构能让 UI、恢复、诊断和日志都依赖稳定协议。
- 回归测试入口需要摆脱 Electron-only import，方便基础设施变更后快速自检。

涉及文件：
- `src/shared/ipc.ts`
- `src/main/ipc/handle.ts`
- `src/preload/index.ts`
- `src/main/log-sanitize.ts`
- `src/main/logger.ts`
- `tests/security-regression.test.ts`
- `package.json`
- `docs/todos/README.md`
- `docs/changes/2026-04-27/changes.md`

结果：
- IPC handler 错误会在 renderer 侧表现为带 `code` 和 `message` 的 Error。
- 安全回归和行动型 Agent 回归可以通过 `pnpm run test:regression` 统一执行。

## P1 基建项收口

时间：2026-04-27 13:24:36

改了什么：
- 确认 `branch-switcher` 分支缓存已从模块级变量改为组件实例级 `useRef`，避免跨实例共享状态。
- 确认主窗口 `webPreferences.sandbox` 已改为 `!isDev`，生产环境启用 renderer sandbox，开发环境保留调试能力。
- 更新 TODO 索引，将 P1 严重项标为已完成。

为什么改：
- 聊天区和主窗口安全配置属于后续扩展反复依赖的基础层，需要先把高优先级历史缺口收口。

涉及文件：
- `src/renderer/src/components/assistant-ui/branch-switcher.tsx`
- `src/main/window.ts`
- `docs/todos/README.md`
- `docs/changes/2026-04-27/changes.md`

结果：
- P1 基建风险项完成状态已和当前代码对齐。
- 分支切换缓存和生产窗口隔离策略进入稳定基线。

## Foundation 回归测试补齐

时间：2026-04-27 13:36:11

改了什么：
- 新增 `tests/foundation-regression.test.ts`，覆盖 provider directory 的请求超时和缓存复用行为。
- `test:regression` 纳入 foundation 回归测试。
- TODO 索引补充 R1-R4 的当前验证结论。

为什么改：
- provider directory、订阅清理、session ref 防竞态这类基础行为后续会被模型选择、设置页、聊天区持续复用，需要有轻量回归测试保护。

涉及文件：
- `tests/foundation-regression.test.ts`
- `package.json`
- `docs/todos/README.md`
- `docs/changes/2026-04-27/changes.md`

结果：
- 基础回归测试覆盖范围从安全和行动型 Agent 扩展到 renderer 侧 provider directory 基础能力。

## Memory/RAG 基线对齐

时间：2026-04-27 13:54:29

改了什么：
- 新增 `tests/memory-regression.test.ts`，覆盖 memory metadata 归一化、余弦相似度、语义排序、query vector cache，以及原生依赖可用时的 SQLite store 写入/统计。
- `MemoryStore` 增加 `close()`，便于测试和后续生命周期管理释放 SQLite 句柄。
- `test:regression` 纳入 memory 回归测试。
- 更新 `specs/07-memory-architecture.md`，对齐当前 T0/T1/T2 baseline、memdir、SQLite 语义记忆和 session todos。
- 更新 `specs/09-rag-and-embedding.md`，对齐当前 `Xenova/bge-small-zh` 本地默认、远程 provider、SQLite 存储、worker、query cache 和原生 ABI 约束。
- 更新 TODO 索引，移除 specs 07/09 过时描述。

为什么改：
- 记忆/RAG 是后续智能化能力的基础层，spec 和测试必须反映真实实现，避免后续新功能基于旧架构假设继续扩展。

涉及文件：
- `src/main/memory/store.ts`
- `tests/memory-regression.test.ts`
- `package.json`
- `specs/07-memory-architecture.md`
- `specs/09-rag-and-embedding.md`
- `docs/todos/README.md`
- `docs/changes/2026-04-27/changes.md`

结果：
- memory 纯逻辑回归已进入统一回归入口。
- 当前本地 `better-sqlite3` 二进制仍按 Node 24 ABI 编译，Node 22 下 store 子测试会明确跳过并提示需要重建原生依赖。

## 底层基建完善路线图

时间：2026-04-27 15:11:47

改了什么：
- 新增 `docs/todos/foundation-hardening-roadmap.md`，把剩余底层基建工作拆成 6 个阶段：环境 Doctor、IPC 契约校验、Memory 管理闭环、Provider / 模型目录稳定性、Harness / 长任务恢复、插件 / 扩展底座。
- 每个阶段补充预计轮次、任务清单和完成标准，方便后续按 TODO 逐项实施。
- 更新 `docs/todos/README.md`，把基建路线图挂到 TODO 索引顶部。

为什么改：
- Chela 后续会持续增加功能，底层基建需要先形成明确的执行队列和验收标准，避免后续改动分散推进。

涉及文件：
- `docs/todos/foundation-hardening-roadmap.md`
- `docs/todos/README.md`
- `docs/changes/2026-04-27/changes.md`

结果：
- 后续基建工作有了可直接执行的阶段化 TODO 文档。
- TODO 索引和变更留痕已同步更新。

## Phase 1 环境 Doctor

时间：2026-04-27 15:20:19

改了什么：
- 新增 `src/main/doctor.ts`，提供纯 Node 环境诊断入口，输出结构化 `ok`、`counts`、`checks`。
- 覆盖 Node 版本文件、`pnpm`、`tsx`、`@vscode/ripgrep`、`better-sqlite3`、`node-pty` 和 Electron 主进程关键依赖检查。
- 原生模块加载失败时解析 `NODE_MODULE_VERSION`，返回当前 Node ABI、模块 ABI 和明确修复命令；`better-sqlite3` 会打开内存库做真实 smoke。
- 新增 `tests/doctor-regression.test.ts`，覆盖 Node 版本匹配、版本不匹配、native ABI 解析和结构化汇总。
- `package.json` 新增 `doctor`、`test:doctor`，并把 doctor 回归测试纳入 `test:regression`。
- 新增 `docs/doctor.md` 记录结构化输出和常见修复路径。
- 更新底层基建路线图和 TODO 索引，将 Phase 1 标为完成。

为什么改：
- Phase 1 目标是把本地环境问题变成可诊断、可复现、可修复的结构化结果，减少后续 IPC、Memory、Provider 等阶段的环境噪音。

涉及文件：
- `src/main/doctor.ts`
- `tests/doctor-regression.test.ts`
- `package.json`
- `docs/doctor.md`
- `docs/todos/foundation-hardening-roadmap.md`
- `docs/todos/README.md`
- `docs/changes/2026-04-27/changes.md`

结果：
- `doctor` 可以识别 Node 22/24 ABI 风险和当前本地 `better-sqlite3` ABI mismatch，并给 native 依赖提供 `pnpm rebuild <package>` 修复命令。
- 诊断结果统一为结构化 JSON，便于后续 UI 或 CI 复用。

## better-sqlite3 ABI 重建收口

时间：2026-04-27 16:00:27

改了什么：
- 将 `better-sqlite3` 加入 `package.json` 的 `pnpm.onlyBuiltDependencies`，允许 pnpm 执行 native build 脚本。
- 使用 Node 22.19.0 并设置 `SystemRoot=C:\Windows` 后重新执行 `pnpm rebuild better-sqlite3`。
- 更新 `docs/doctor.md`，记录 Windows 下 `SystemRoot` 缺失会导致 node-gyp Visual Studio 探测失败。

为什么改：
- 用户已执行 rebuild，但 doctor 仍检测到 `better-sqlite3` ABI 145 与 Node 22 ABI 127 不匹配；根因是 pnpm build 许可和 shell 环境变量问题。

涉及文件：
- `package.json`
- `docs/doctor.md`
- `docs/todos/foundation-hardening-roadmap.md`
- `docs/changes/2026-04-27/changes.md`

结果：
- `pnpm run doctor` 输出 11 项通过。
- SQLite native 模块可在 Node 22.19.0 下打开内存库。

## Phase 2 settings:update IPC 契约校验

时间：2026-04-27 16:00:27

改了什么：
- 新增 `src/main/ipc/schema.ts`，提供 IPC payload schema 校验和统一 `INVALID_IPC_PAYLOAD` 错误。
- `settings:update` 在进入 `updateSettings` 前校验 payload、顶层字段、嵌套对象和基础类型。
- 新增 `tests/ipc-contract-regression.test.ts`，覆盖非法 payload、未知字段、空 workspace、嵌套类型错误、嵌套布尔字段错误和合法 partial。
- `test:regression` 纳入 IPC 契约回归测试。

为什么改：
- Phase 2 目标是把 renderer 到 main 的数据边界稳定下来，先保护最频繁的 `settings:update`，避免脏数据进入主进程设置写入链路。

涉及文件：
- `src/main/ipc/schema.ts`
- `src/main/ipc/settings.ts`
- `tests/ipc-contract-regression.test.ts`
- `package.json`
- `docs/todos/foundation-hardening-roadmap.md`
- `docs/todos/README.md`
- `docs/changes/2026-04-27/changes.md`

结果：
- `settings:update` 错误输入会得到稳定 `{ code: "INVALID_IPC_PAYLOAD", message }`。
- IPC 契约测试进入统一回归入口。

## Phase 2 providers IPC 契约校验

时间：2026-04-27 16:14:01

改了什么：
- 扩展 `src/main/ipc/schema.ts`，新增 provider source draft、sourceId、apiKey 校验。
- `providers:save-source`、`providers:test-source`、`providers:fetch-models` 进入 provider 主逻辑前会校验 draft。
- `providers:get-source`、`providers:delete-source`、`providers:get-credentials`、`providers:set-credentials` 会校验 sourceId。
- `providers:set-credentials` 会校验 apiKey 为字符串，保留空字符串用于清除凭据。
- 扩展 `tests/ipc-contract-regression.test.ts`，覆盖 provider 非法 payload、非法 providerType、enabled 类型错误、sourceId 为空、apiKey 类型错误和合法 draft。

为什么改：
- provider 配置、测试连接、拉取模型和凭据写入都属于主进程边界输入；先在 IPC 层拒绝脏数据，后续 provider 错误分类和 UI 展示可以依赖稳定错误协议。

涉及文件：
- `src/main/ipc/schema.ts`
- `src/main/ipc/providers.ts`
- `tests/ipc-contract-regression.test.ts`
- `docs/todos/foundation-hardening-roadmap.md`
- `docs/changes/2026-04-27/changes.md`

结果：
- providers 关键写入和网络动作入口已有结构化 IPC 契约校验。

## 修复 TypeScript 编译器被打进 main bundle

时间：2026-04-27 16:20:10

改了什么：
- 在 `electron.vite.config.ts` 的 main rollup 配置里将 `typescript` 标记为 external。

为什么改：
- `src/main/tools/code-analysis.ts` 需要 TypeScript compiler API 做代码分析；main 打包时如果把 `typescript` 整包打进 `out/main/index.js`，esbuild 会在转译 TypeScript 编译器源码时触发 `Unterminated string literal`，导致项目无法启动。
- `typescript` 作为 external 后，主进程运行时直接从 `node_modules` 加载，避免把庞大的编译器源码塞进 main bundle。

涉及文件：
- `electron.vite.config.ts`
- `docs/changes/2026-04-27/changes.md`

结果：
- `pnpm exec electron-vite build` 通过。
- `pnpm run test:regression` 通过。
