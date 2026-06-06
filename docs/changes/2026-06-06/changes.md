## Optimization Report Agent Coverage Closure

- 时间：2026-06-06 12:05 +0800
- 改了什么：
  - 新增 `tests/vitest/agent-lifecycle.spec.ts`，用 Vitest mock Electron/main 运行态依赖，真实导入 `src/main/agent.ts` 并覆盖 run 完成、agent 销毁、MCP 断开和 parallel owner cleanup 行为。
  - `vitest.config.ts` 纳入 `tests/vitest/**/*.spec.ts`，保留旧 `tsx` 回归脚本对顶层 `.test.ts` 的兼容。
  - `tests/package-scripts-regression.test.ts` 增加 Vitest 专用 spec 路径守卫。
- 为什么改：优化报告中的 P2 核心盲区测试项需要对 `agent.ts` 做真实行为覆盖，原有 `agent-lifecycle-regression.test.ts` 主要是源码结构守卫。
- 涉及文件：
  - `tests/vitest/agent-lifecycle.spec.ts`
  - `vitest.config.ts`
  - `tests/package-scripts-regression.test.ts`
- 验证结果：
  - `pnpm exec vitest run tests/vitest/agent-lifecycle.spec.ts`
  - `pnpm exec tsx tests/package-scripts-regression.test.ts`
  - `pnpm test:vitest`
  - `pnpm test:coverage`
  - `pnpm exec tsc --noEmit -p tsconfig.renderer.json`
  - `pnpm exec tsc --noEmit -p tsconfig.json --allowImportingTsExtensions`
  - coverage 显示 `src/main/agent.ts` 已进入行为覆盖统计，当前为 9.87% statements / 14.28% funcs。
- 未做：
  - 未运行 `pnpm build` / `pnpm check`，原因是本轮只补 Vitest 专用行为测试和测试配置守卫，后续继续使用 targeted 验证。

## Optimization Report Module Split Closure

- 时间：2026-06-06 12:45 +0800
- 改了什么：
  - 拆出 `src/main/provider-model-builder.ts`，集中 provider model 构建、API Key 指纹、OpenAI-compatible 本地源判断和 runtime API 适配。
  - 拆出 `src/main/provider-persistence.ts`，集中 provider state 文件路径、凭据读取和异步落盘。
  - `src/main/providers.ts` 保留 source/entry 编排和 state cache，移除凭据加解密、模型构建和直接同步落盘职责。
  - 新增并接线 `src/renderer/src/hooks/use-session-operations.ts`，把 `App.tsx` 内的会话 CRUD、项目 CRUD、session hydration、context summary、interrupted approval 操作收拢到独立 hook。
  - `src/renderer/src/stores/app-store.ts` 和 `src/renderer/src/stores/session-store.ts` 导出 hook 需要的 action 类型。
  - `tests/module-split-regression.test.ts` 增加 provider 拆分和 `useSessionOperations` 拆分守卫，防止相关职责回流到大模块。
- 为什么改：优化报告里剩余的大模块问题集中在 `providers.ts` 和 `App.tsx`，需要继续按稳定职责边界拆分，并用回归测试固定拆分边界。
- 涉及文件：
  - `src/main/providers.ts`
  - `src/main/provider-model-builder.ts`
  - `src/main/provider-persistence.ts`
  - `src/renderer/src/App.tsx`
  - `src/renderer/src/hooks/use-session-operations.ts`
  - `src/renderer/src/stores/app-store.ts`
  - `src/renderer/src/stores/session-store.ts`
  - `tests/module-split-regression.test.ts`
- 验证结果：
  - `pnpm exec tsc --noEmit -p tsconfig.renderer.json`
  - `pnpm exec tsc --noEmit -p tsconfig.json --allowImportingTsExtensions`
  - `pnpm exec tsx tests/module-split-regression.test.ts`
  - `pnpm exec tsx tests/provider-state-cache-regression.test.ts`
  - `pnpm test:vitest`
  - `pnpm test:coverage`
  - 覆盖率命令通过 46 个 test files / 48 tests；全仓 statements 当前 17.81%，`src/main/agent.ts` 当前 9.87% statements，`src/main/chat/terminal-error.ts`、`src/main/session/transcript-materialize.ts`、`src/main/tools/fs-utils.ts` 等报告盲区已有 focused 行为覆盖。
- 未做：
  - 未运行 `pnpm build` / `pnpm check`，原因是本轮是模块拆分收口，已使用 renderer/main TypeScript、拆分守卫、provider cache 回归和 Vitest 全量回归做 targeted 验证。

## Optimization Report Renderer Performance Closure

- 时间：2026-06-06 13:20 +0800
- 改了什么：
  - 新增 `src/renderer/src/components/assistant-ui/thread-runtime-layer.tsx`，把 `App.tsx` 内原有 thread runtime panel 编排抽离到 memoized 组件。
  - 在 `ThreadRuntimeLayer` 内新增 `MountedThreadSession` memoized 子组件，收束 per-session dismiss / browser context 回调，降低 active session 之外的重渲染压力。
  - `App.tsx` 改用稳定 handler 传给 `SettingsView`、`Sidebar`、`TitleBar`、终端按钮和 `TerminalDrawer`，移除报告点名的高频 JSX 内联回调残留。
  - `diff-panel-parts.tsx` 与 `branch-switcher.tsx` 复用 `@shared/text-utils` 的 `getErrorMessage`，减少 renderer 本地重复 helper。
  - `tests/renderer-performance-regression.test.ts` 增加 ThreadRuntimeLayer、MountedThreadSession 和 App 稳定回调守卫。
  - `tests/shared-utils-regression.test.ts` 增加 renderer 复用 shared text utils 的守卫。
- 为什么改：优化报告的 React 渲染性能项已完成 memo/lazy 基础修复，本轮继续收掉 `threadRuntimeLayer` 大依赖 useMemo、JSX 内联回调和重复 helper 尾项。
- 涉及文件：
  - `src/renderer/src/App.tsx`
  - `src/renderer/src/components/assistant-ui/thread-runtime-layer.tsx`
  - `src/renderer/src/components/assistant-ui/diff-panel-parts.tsx`
  - `src/renderer/src/components/assistant-ui/branch-switcher.tsx`
  - `tests/renderer-performance-regression.test.ts`
  - `tests/shared-utils-regression.test.ts`
- 验证结果：
  - `pnpm exec tsc --noEmit -p tsconfig.renderer.json`
  - `pnpm exec tsx tests/renderer-performance-regression.test.ts`
  - `pnpm exec tsx tests/module-split-regression.test.ts`
  - `pnpm exec tsx tests/shared-utils-regression.test.ts`
- 未做：
  - 未运行 `pnpm build` / `pnpm check`，原因是本轮范围集中在 renderer 性能结构和重复 helper，已用 renderer TypeScript 与相关回归测试验证。

## Electron Dev Startup Repair

- 时间：2026-06-06 13:48 +0800
- 改了什么：
  - 使用 `pnpm install --force` 重建本地 `node_modules` 安装产物，恢复 `electron@41.1.0` 包内缺失的 `cli.js`、`checksums.json`、`abi_version` 和 `path.txt`。
  - 清理本轮 dev 启动烟测产生的 `.tmp-dev-smoke.*.log` 临时日志。
- 为什么改：`pnpm run dev` 启动时报 `Error: Electron uninstall`，根因是 `node_modules/.pnpm/electron@41.1.0/node_modules/electron` 包内容损坏；`dist/electron.exe` 存在，但 `path.txt` 和 `cli.js` 缺失，导致 `electron-vite` 无法解析 Electron 可执行文件。
- 涉及文件：
  - `node_modules/.pnpm/electron@41.1.0/node_modules/electron`
  - `docs/changes/2026-06-06/changes.md`
- 验证结果：
  - `node -e "console.log(require('electron'))"` 输出 `D:\a_github\first_pi_agent\node_modules\.pnpm\electron@41.1.0\node_modules\electron\dist\electron.exe`
  - `pnpm exec electron --version` 输出 `v41.1.0`
  - `pnpm run dev` 已通过 main/preload 构建并启动 renderer dev server；日志显示 `electron main process built successfully`、`electron preload scripts built successfully`、`starting electron app...`
- 未做：
  - 未运行 `pnpm build` / `pnpm check`，原因是本轮是本地 Electron 安装产物修复，已用 Electron resolve、Electron CLI 和 dev 启动烟测验证。
