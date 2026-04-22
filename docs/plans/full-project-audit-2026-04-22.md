# Chela 项目全量静态审查与调整计划

**生成时间**：2026-04-22
**审查范围**：`src/main`、`src/renderer`、`src/shared`、`src/preload`、`src/mcp`、顶层配置（vite/tailwind/tsconfig/package）、`public/`
**统计**：致命 6 / 严重 13 / 中等 28 / 轻微 16 / 建议 12  ≈ **75 条**

> 本文档供后续 AI 执行修复使用。每条问题都标注：**文件 / 现状 / 影响 / 修复方向**。
> 优先级建议从「P0 必修」往下做，能并行的会标 ⚡。

---

## 🔴 P0 — 致命/必修（6 条）

会直接导致数据丢失、消息丢失、安全绕过、长时崩溃。

### M1. `terminalEventFlushed` 单发布缺陷导致最后一条消息可能丢失 ⚡
- **文件**：[src/main/adapter.ts](src/main/adapter.ts#L128) `terminalEventFlushed` 字段；`flushTerminalEvent` (L532+)
- **现状**：实例变量一旦置 true 永不重置；同一 session 复用 adapter / hot-reload 边界场景下 run2 的 `agent_end` 会被拦截。
- **影响**：连续对话最后一条 assistant 消息可能不送达 renderer。
- **修复方向**：把 flag 改成 `Map<runId, boolean>`，或每个 run 创建新 adapter / 在 `setScope(runId)` 时重置 flag。

### M2. session/transcript 文件并发写入竞态 → 数据丢失 ⚡
- **文件**：[src/main/session/io.ts](src/main/session/io.ts#L16)、`transcript-writer.ts`
- **现状**：`atomicWrite` 是 write→rename，多个 async 同时调同一文件会互相覆盖；transcript append 路径无锁。
- **影响**：会话历史 / transcript JSONL 行丢失或损坏，用户消息记录可能消失。
- **修复方向**：按 `sessionId` 加 Mutex（如 `p-queue` / 自实现简单锁队列）；transcript 改纯 append-only fd（一直持有写句柄）+ 顺序写。

### M3. BrowserWindow 销毁后仍 send，dev hot-reload / 用户关窗时崩 ⚡
- **文件**：[src/main/adapter.ts](src/main/adapter.ts#L143)、[src/main/terminal.ts](src/main/terminal.ts#L36)
- **现状**：虽有 `isDestroyed()` 检查，但 callback 与 send 之间窗口可能销毁；adapter 的 send 没有 try/catch。
- **影响**：开发模式频繁报错，生产关窗时后台抛未捕获异常。
- **修复方向**：所有 `webContents.send` 包 try/catch；先把要发送的事件入队，window 就绪/重连后再发。

### S1. `security.ts` 路径白名单可被符号链接绕过
- **文件**：[src/main/security.ts](src/main/security.ts#L8)
- **现状**：`path.resolve` 不解析 symlink。
- **影响**：用户可放符号链接绕开工作区限制读写任意文件。
- **修复方向**：改 `fs.realpathSync`（或 `realpath` async）；并在白名单匹配前一律 normalize。

### S2. `shell.ts` PowerShell 命令拼接存在 CR/LF 注入
- **文件**：[src/main/shell.ts](src/main/shell.ts#L150)
- **现状**：构造命令时未转义 `\r`、`\n`，攻击 payload 可追加额外指令。
- **影响**：命令注入 / 任意代码执行。
- **修复方向**：转义换行；使用参数数组形式 spawn，避免拼接；对入参做白名单校验。

### S3. API Key 可能被 dump 到日志
- **文件**：[src/main/providers.ts](src/main/providers.ts#L189)、[src/main/logger.ts](src/main/logger.ts)
- **现状**：handle 对象里直接持有原始 apiKey；日志脱敏只看顶层 key 名。
- **影响**：app.log / failover 日志可能泄露 API Key。
- **修复方向**：handle 内只存 getter，不暴露原值；logger 递归遍历对象，对 base64/sk-/AIza/eyJ 等模式打码。

---

## 🟠 P1 — 严重（13 条）

会导致明显 UX 退化、内存泄漏、长时崩溃、违反 AGENTS.md 既定约束。

### M4. EventBus 监听器永不清理 → 长时内存泄漏
- **文件**：[src/main/metrics.ts](src/main/metrics.ts#L131)、[src/main/emotional/state-machine.ts](src/main/emotional/state-machine.ts#L328)、[src/main/learning/engine.ts](src/main/learning/engine.ts#L219)
- **修复方向**：返回 unsubscribe 函数集中管理，应用退出 / `stopBackgroundServices` 时全部 off。

### M5. `cancel.ts` 取消语义可能重复触发 `cancelAgent`
- **文件**：[src/main/chat/cancel.ts](src/main/chat/cancel.ts#L1)
- **修复方向**：用 `Set<runId>` 记录已取消，幂等化。

### M6. `chat/execute.ts` failover 重复初始化主模型
- **文件**：[src/main/chat/execute.ts](src/main/chat/execute.ts#L81)
- **修复方向**：候选列表去重 / 跳过当前 entryId。

### M7. IPC handler 抛出错误序列化失败
- **文件**：[src/main/ipc/handle.ts](src/main/ipc/handle.ts#L8)
- **修复方向**：统一封装为 `{ code, message }` 后再 throw。

### M8. `gitPull` IPC 通道死链路
- **文件**：[src/shared/ipc.ts](src/shared/ipc.ts#L100)、[src/preload/index.ts](src/preload/index.ts#L171)、`src/main/ipc/workbench.ts`
- **现状**：契约 + preload 都暴露了，main 没注册 handler。
- **修复方向**：补 handler 或从契约/preload 中移除。

### M9. `webPreferences.sandbox: false` + DevTools 生产可开
- **文件**：[src/main/window.ts](src/main/window.ts#L143)、L154
- **修复方向**：开 sandbox（与 contextIsolation 配套）；F12/Ctrl+Shift+I 加 `if (!isDev)` 拦截；生产 `devTools: false`。

### R1. 渲染端订阅 `desktopApi.agent.onEvent` 未清理 → 内存泄漏
- **文件**：[src/renderer/src/components/AssistantThreadPanel.tsx](src/renderer/src/components/AssistantThreadPanel.tsx#L1072)（旧报告位置；最新在 cleanup/handleEvent 链路上）
- **现状**：unsubscribe 现在只在 `agent_end/agent_error` 触发；如果 session 被切换、组件 unmount 时正在跑，订阅可能残留。
- **修复方向**：`useEffect` 返回值统一 unsubscribe；`SessionRuntime` unmount 时强制清理所有 ref 内挂的 cancelRun/unsubscribe。

### R2. App.tsx 快速切 session 状态竞态丢 draft / attachments
- **文件**：[src/renderer/src/App.tsx](src/renderer/src/App.tsx#L388)
- **修复方向**：sessionCache 与 activeSession 用 reducer 串行更新；切换前先 flush 当前 session 的 draft。

### R3. `AssistantThreadPanel` callback 闭包仍有持旧 sessionId 风险
- **文件**：[AssistantThreadPanel.tsx](src/renderer/src/components/AssistantThreadPanel.tsx#L577)
- **修复方向**：run 入口先 snapshot `currentSession = latestSessionRef.current`，整条 run 链路只用 snapshot。

### R4. provider-directory 加载无超时 / Abort
- **文件**：[src/renderer/src/lib/provider-directory.ts](src/renderer/src/lib/provider-directory.ts)
- **修复方向**：包 AbortController + 默认 5s 超时；UI 给重试入口。

### R5. branch-switcher 未走缓存（违反 AGENTS.md 约束）⚡
- **文件**：[branch-switcher.tsx](src/renderer/src/components/assistant-ui/branch-switcher.tsx#L138)
- **修复方向**：加 `branchCacheRef + lastQueryAt`；切换/创建分支后才清缓存；同时防双 fetch。

### R6. context 圆环缺失「0% 灰环」状态（违反 AGENTS.md）⚡
- **文件**：[context-usage-indicator.tsx](src/renderer/src/components/assistant-ui/context-usage-indicator.tsx)
- **修复方向**：区分 `hasInitializedUsage` vs 真实 0%，前者用灰色空环；hover/click 各自分工别打架。

### R7. approval 卡片错误文案泄露 `runId / runKind`（违反 AGENTS.md）⚡
- **文件**：[approval-notice-bar.tsx](src/renderer/src/components/assistant-ui/approval-notice-bar.tsx)
- **修复方向**：UI 只显示产品级中文文案，内部 id 仅写日志。

---

## 🟡 P2 — 中等（28 条）

按子领域分组，便于分配。

### A. 主进程 — 资源生命周期 / 一致性
- **M10** parallel-tools 的 `activeSignals` / cache Map 不会清理：在 `harnessRuntime.finishRun` 时按 runId 删。[parallel-tools.ts](src/main/parallel-tools.ts#L45)
- **M11** prompt-too-long 自动 compact 没有记录 `compactAttempted`，可能重复尝试。[chat/execute.ts](src/main/chat/execute.ts#L44)
- **M12** session schema 迁移时 snapshot 版本号冲突。[session/service.ts](src/main/session/service.ts#L200)
- **M13** scheduler.stop 没 `clearInterval(dailyCheckTimer)`。[scheduler.ts](src/main/scheduler.ts#L146)
- **M14** model-resolution fallback 列表硬编码，过期模型无法替换。[model-resolution.ts](src/main/model-resolution.ts#L7)
- **M15** finalize cancel 路径与 terminalEventFlushed 撞车（依赖 M1 的修复）。[chat/finalize.ts](src/main/chat/finalize.ts#L195)
- **M16** `destroyAgent` 没显式关 MCP connection。[agent.ts](src/main/agent.ts#L281)
- **M17** logger 用同步 `appendFileSync` 阻塞主线程；高频日志时影响性能。[logger.ts](src/main/logger.ts#L260)
- **M18** emotional 订阅注册顺序在 IPC handler 之后，首条 run 的事件可能漏。[emotional/state-machine.ts](src/main/emotional/state-machine.ts#L300)
- **M19** event-bus wildcard handler 抛错被吞。[event-bus.ts](src/main/event-bus.ts#L127)
- **M20** Window bounds 计算可能负数。[window.ts](src/main/window.ts#L92)

### B. 主进程 — 安全/契约
- **M21** preload 缺少 sender frame 校验。[ipc/handle.ts](src/main/ipc/handle.ts#L8)
- **M22** `MemoryMetadata = Record<string, unknown>` 过宽，建议缩紧 + 长度校验。[shared/contracts.ts](src/shared/contracts.ts#L747)
- **M23** `customTheme: Record<string, string>` 允许任意 CSS 变量名，建议白名单 token。[shared/contracts.ts](src/shared/contracts.ts#L176)
- **M24** `terminal.shell` 未校验合法可执行文件。[shared/contracts.ts](src/shared/contracts.ts#L172)
- **M25** `ProviderSourceDraft.baseUrl` 缺 URL 校验。[shared/contracts.ts](src/shared/contracts.ts#L89)
- **M26** MCP serverName 未规范化，工具命名可能冲突。[src/mcp/adapter.ts](src/mcp/adapter.ts#L14)
- **M27** MCP 配置 JSON 解析失败静默；用户配置错时无反馈。[src/mcp/config.ts](src/mcp/config.ts#L17)

### C. 渲染端 — 性能与生命周期
- **R8** `useAuiState` 多处 selector 未稳定，重渲染广播过宽。[thread.tsx](src/renderer/src/components/assistant-ui/thread.tsx#L150)
- **R9** `App.tsx` `resolvedRightPanelWidth` useMemo 依赖过多。[App.tsx](src/renderer/src/App.tsx#L348)
- **R10** ModelSelector 每次重建 selectedModel；缓存。[model-selector.tsx](src/renderer/src/components/assistant-ui/model-selector.tsx)
- **R11** settings-view loadDirectory 每次创建新函数。[settings-view.tsx](src/renderer/src/components/assistant-ui/settings-view.tsx#L30)
- **R12** branch-switcher loadBranches 重复订阅。[branch-switcher.tsx](src/renderer/src/components/assistant-ui/branch-switcher.tsx#L126)
- **R13** context-summary-trigger hover 监听未对应 remove。[context-summary-trigger.tsx](src/renderer/src/components/assistant-ui/context-summary-trigger.tsx)

### D. 渲染端 — 竞态与并发
- **R14** `refreshPendingApprovalGroups` 可能频繁循环触发（confirmation_request 风暴），加去重。[AssistantThreadPanel.tsx](src/renderer/src/components/AssistantThreadPanel.tsx#L730)
- **R15** gitBranchSummary / gitOverview 双请求竞态，加 request id guard。[App.tsx](src/renderer/src/App.tsx)
- **R16** diff-panel 切换 unstaged/staged/all 时 loading 状态错位，加 sourceId tag。[diff-panel.tsx](src/renderer/src/components/assistant-ui/diff-panel.tsx)

### E. 渲染端 — UX / 缺失能力
- **R17** message-end 兜底缺失（违反 AGENTS.md），断网时 finalText/thinking 不完整。[AssistantThreadPanel.tsx](src/renderer/src/components/AssistantThreadPanel.tsx#L800)
- **R18** Composer IME composing 未处理，中文输入边打字边 Enter 会发不完整字符。[thread.tsx](src/renderer/src/components/assistant-ui/thread.tsx#L600)
- **R19** queue auto-dispatch / manual cancel 边界 case 状态机需要表格化文档化。[thread.tsx](src/renderer/src/components/assistant-ui/thread.tsx)
- **R20** 缺局部 ErrorBoundary，子组件崩塌全局冻结。[App.tsx](src/renderer/src/App.tsx#L30)
- **R21** Composer 底部 gap-2/gap-3 切换 terminalOpen 时跳跃。[thread.tsx](src/renderer/src/components/assistant-ui/thread.tsx#L450)
- **R22** branch 列表搜索未 debounce。[branch-switcher.tsx](src/renderer/src/components/assistant-ui/branch-switcher.tsx#L80)

---

## 🔵 P3 — 轻微（16 条）

### 主进程
- **M28** harness/audit 日志无轮转。[harness/audit.ts](src/main/harness/audit.ts)
- **M29** metrics.jsonl 无轮转。[metrics.ts](src/main/metrics.ts#L60)
- **M30** session 搜索索引未增量。[session/search.ts](src/main/session/search.ts)
- **M31** `as any` 滥用：[providers.ts](src/main/providers.ts#L707)、[harness/runtime.ts](src/main/harness/runtime.ts#L507)
- **M32** Background services 启动失败无 UI 提示。[bootstrap/services.ts](src/main/bootstrap/services.ts)
- **M33** 命名一致性：仍有少量 `first_pi_agent` 残留，按 AGENTS.md 统一为 `Chela`（兼容路径标 legacy）。
- **M34** Provider credential 未加密；建议接 Electron `safeStorage`。[providers.ts](src/main/providers.ts#L48)

### 渲染端
- **R23** ThreadScrollToBottom tooltip 仍是英文，改"滚至底部"。
- **R24** 大附件预览未 lazy load，加 `loading="lazy"`/限制尺寸。[attachment.tsx](src/renderer/src/components/assistant-ui/attachment.tsx)
- **R25** sidebar legacy localStorage key 启动时清理一次。[App.tsx](src/renderer/src/App.tsx#L140)
- **R26** terminal-drawer resize 缺 min/max 约束。[terminal-drawer.tsx](src/renderer/src/components/assistant-ui/terminal-drawer.tsx)
- **R27** 浅色模式 context 浮层阴影过重（违反 AGENTS.md「浅色不要发黑发重的阴影」）。[context-summary-trigger.tsx](src/renderer/src/components/assistant-ui/context-summary-trigger.tsx)
- **R28** 模型选择器选中色应复用项目既有 `--color-selection-bg`，避免新发明色。[model-selector.tsx](src/renderer/src/components/assistant-ui/model-selector.tsx)
- **R29** diff-panel tree/list 切换按钮 border 偏重，改背景色分层。[diff-panel.tsx](src/renderer/src/components/assistant-ui/diff-panel.tsx)
- **R30** approval-bar kind labels 重复定义，合并 enum。[approval-notice-bar.tsx](src/renderer/src/components/assistant-ui/approval-notice-bar.tsx)
- **R31** Composer 主错误文案"Agent 执行失败"+原始 error 直接展示，改成产品级 + 内部错误只写日志。[AssistantThreadPanel.tsx](src/renderer/src/components/AssistantThreadPanel.tsx#L870)

---

## 🟢 P4 — 建议（12 条）

- **M35** ChatRunContext 加全局 AbortController，简化层层取消。[chat/prepare.ts](src/main/chat/prepare.ts)
- **M36** 事件名建 const 常量统一管理。[event-bus.ts](src/main/event-bus.ts)
- **M37** preload 加 IPC 超时与重试封装。
- **M38** credentials.json 文件权限校验（应 600）。
- **R32** SVG viewBox 用 `0 0 100 100` 百分比，确保多 size 一致。[context-usage-indicator.tsx](src/renderer/src/components/assistant-ui/context-usage-indicator.tsx)
- **R33** 圆环加 `role="img" aria-label`，可访问性。
- **R34** 重要按钮加 `aria-keyshortcuts`。
- **R35** 文案集中到 i18n key，便于维护。
- **shared/preload/config**：tsconfig 双份注释说明 lib 划分；electron.vite.config 注释 CSP 策略位置；postcss.config 自定义插件评估是否还需要；components.json path alias 与 tsconfig 同步。
- **public/widget.html** 加 CSP meta、禁用内联脚本。

---

## ⚡ Top 10 推荐执行顺序（≈ 20 工时）

| # | 项 | 估时 |
|---|----|------|
| 1 | M1 + M15 — `terminalEventFlushed` 改 per-runId | 2h |
| 2 | M2 — session/transcript 写入加锁 / append-only fd | 3h |
| 3 | M3 — webContents.send 安全包裹 | 2h |
| 4 | S1 + S2 — security 用 realpath、shell 修注入 | 2h |
| 5 | S3 — API Key 不入 handle，logger 递归脱敏 | 2h |
| 6 | M4 — EventBus 订阅可清理 | 2h |
| 7 | R1 + R3 — agent.onEvent unsubscribe + sessionId snapshot | 2h |
| 8 | R5 + R6 + R7 — 三项 AGENTS.md 违规修复（缓存 / 灰环 / 文案） | 3h |
| 9 | R17 — message-end 兜底 | 1.5h |
| 10 | M9 — sandbox + DevTools 生产关闭 | 0.5h |

**总计**：约 20 工时；建议 2 人并行，可在 2-3 天内拿下 P0+P1 关键项。

---

## 后续 AI 执行须知

1. **改完每一项必须留痕**：在 `docs/changes/YYYY-MM-DD/changes.md` 追加二级标题，写明「时间 / 改了什么 / 为什么改 / 涉及文件 / 结果」。
2. **不要习惯性 build / check**；改完用 `get_errors` 看 TS 报错即可。
3. **commit 不带 `Co-Authored-By`**。
4. **遇到 UI 改动**：参考 AGENTS.md 的「少 border / 选择态统一 / 浅色克制阴影」三条。
5. **遇到聊天链路改动**：必须回归 context 圆环、hover/click、`compact` 入口、思考展示、消息发送、分支切换、附件、引导/发送/停止 这些通路。
6. **命名**：除了 legacy 兼容点，新增代码统一 `Chela`，不再写 `first_pi_agent`。
