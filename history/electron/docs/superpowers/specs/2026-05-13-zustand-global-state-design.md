# Zustand Global State Migration Design

时间：2026-05-13 16:42:04

## Goal

把 renderer 内大范围共享状态迁移到 Zustand，减少 `App.tsx` 聚合状态、跨层 prop drilling 和局部 state 之间的同步竞态，为后续 Browser、聊天、右侧 panel、记忆等功能扩展提供稳定事实源。

## Current State Map

当前大范围状态集中在 `src/renderer/src/App.tsx`：

- Session domain：`summaries`、`archivedSummaries`、`groups`、`activeSession`、`sessionCache`、`runningSessionIds`。
- Browser context domain：`browserContextBySessionId`、`browserInteractionResetSignal`，需要和聊天附件、Browser panel marker 同步。
- Context / approval domain：`contextSummaryBySessionId`、`interruptedApprovalGroupsBySessionId`。
- Shell UI domain：`rightPanelState`、`terminalOpen`、`sidebarSize`、`sidebarCollapsed`、drag / animation flags。
- Settings domain：`settings`、`currentModelId`、`thinkingLevel`，同时驱动 UI theme、model routing 和 settings 页面。
- Git domain：`useAppGitState` 内维护 branch summary、diff snapshot、loading 和请求去重。

已有 React Context：

- `ModelSelectorContext` 只服务 ModelSelector 复合组件内部，不承载跨页面状态。
- `ThreadRunStatusContext` 只服务 Thread 子树内部状态读取，可在 run 状态迁移后改为 selector 读取。

## Migration Boundary

迁入 Zustand：

- 跨 session、跨面板、跨组件共享且需要联动的状态。
- 需要被多个组件读取，但当前由 `App.tsx` 逐层传递的状态。
- 需要原子更新、派生 selector 或跨事件同步的状态。

保留组件局部 state：

- 单个弹窗 / popover 的 `open`。
- 单个输入框草稿、hover、expanded、resizing 中间态。
- Browser webview 当前 URL、待编辑 pin、待编辑截图、页面 load state。
- 单个设置 section 的 search/filter/loading，除非后续需要跨 section 复用。

## Store Layout

新增目录：`src/renderer/src/stores/`

### `app-store.ts`

职责：

- boot 状态：`booting`、`bootError`。
- shell 状态：`terminalOpen`、`threadWorkspaceWidth`、sidebar 尺寸 / 折叠、right panel state、frame state、动画和拖拽 flag。
- settings 状态：`settings`、`currentModelId`、`thinkingLevel`。
- Browser interaction reset signal。

持久化：

- sidebar width / collapsed 继续写 localStorage。
- right panel state 继续通过 `desktopApi.ui.setRightPanelState` 持久化，store action 只更新 renderer 状态，IPC 调用由 action consumer 或 async action 显式执行。

### `session-store.ts`

职责：

- `summaries`、`archivedSummaries`、`groups`。
- `activeSessionId`、`activeSession`、`sessionCache`。
- `runningSessionIds`。
- `contextSummaryBySessionId`。
- `interruptedApprovalGroupsBySessionId`。
- `browserContextBySessionId`。

核心 actions：

- `hydrateSession(session)`：写 cache、active session、active id。
- `clearActiveSession()`：清 active session / id。
- `cacheSession(session)`。
- `persistSessionLocally(session)`：只更新 store 内状态；磁盘保存由 caller 调 `desktopApi.sessions.save`。
- `removeSessionState(sessionId)`：清 cache、context summary、approval groups、browser context、running flag。
- `upsertBrowserContextItem(sessionId, item)`：走 `compactBrowserContextItems`。
- `removeBrowserContextItem(sessionId, itemId)`。
- `clearBrowserContextItems(sessionId)`。
- `removeAttachmentLinkedBrowserContext(sessionId, browserContextItemId)`。

### `git-store.ts`

职责：

- `gitBranchSummary`、`gitOverview`、`gitOverviewLoading`。
- workspace scoped request de-dupe 和 request serial。

核心 actions：

- `refreshGitBranchSummary(desktopApi, workspace)`。
- `refreshGitOverview(desktopApi, workspace)`。
- action 内验证 response workspace 与当前 workspace 匹配后再写入。

### `provider-directory-store.ts`

职责：

- `sources`、`entries`、`loading`、`lastLoadedAt`。
- Provider directory refresh 和 subscription 共享，避免 Thread、Memory settings 等各自维护重复目录状态。

核心 actions：

- `refreshProviderDirectory(desktopApi, options)`。
- `replaceProviderDirectory(snapshot)`。
- `clearProviderDirectory()`。

## Data Flow

1. App boot 从 IPC 加载 settings、sessions、groups、ui state。
2. boot result 写入 `app-store` 和 `session-store`。
3. `App.tsx` 使用 selectors 读取需要渲染 shell 的状态。
4. session 选择、保存、归档、删除继续由 `App.tsx` 负责 IPC 编排，store action 负责 renderer 内同步。
5. Browser panel 保存截图时：
   - `appendAttachmentsToSession` 更新 active session attachments。
   - `upsertBrowserContextItem` 写 session browser context。
   - Browser panel selector 收到当前 session context，调用 webview marker sync。
6. 删除截图附件时：
   - `removeAttachment` 更新 active session attachments。
   - `removeAttachmentLinkedBrowserContext` 删除对应 Browser context。
   - Browser panel marker 根据 context 派生同步删除。

## Selector Rules

- 组件使用 selector 订阅最小字段，避免整个 store 更新导致无关重渲染。
- 聚合对象用 `useShallow`。
- action 从 store 中导出稳定函数，组件内不重新包多层匿名更新。
- 大列表数据保持引用稳定：无变化时 action 返回原对象 / 原数组。

## Testing Strategy

新增 / 扩展回归测试：

- `tests/renderer-zustand-store-regression.test.ts`
  - session hydrate / persist / remove。
  - browser context add / compact / remove / clear。
  - 删除 attachment linked context 时只移除绑定项。
  - right panel partial update 保留 active view fallback。
  - running session id 增删保持幂等。
- `tests/browser-interview-regression.test.ts`
  - 更新 `App.tsx` 断言为 store selector / action 路径。
- renderer TypeScript：
  - `pnpm exec tsc --noEmit -p src/renderer/tsconfig.json`。

不默认执行完整 build，遵守项目约束。

## Rollout Plan

阶段 1：建立 store 与 reducer 测试。

- 新建 store 文件，先迁纯 reducer/action。
- `App.tsx` 仍可通过 hooks 读取 store，降低一次性改动风险。

阶段 2：迁 App shell 和 session domain。

- 移除 `App.tsx` 对 session/browser/right panel/settings 的大部分 `useState`。
- 保留 drag cleanup refs、keyboard refs、DOM refs。

阶段 3：迁 Git 和 Provider directory。

- `useAppGitState` 改成 store-backed hook。
- Thread 和 Memory settings 共用 provider directory store。

阶段 4：清理 Context / prop drilling。

- Thread run status 可改为 prop 或 store selector，按改动风险决定。
- ModelSelector 复合组件 Context 保留。

## Risks

- 一次性迁移过多状态会增加回归面，执行时按阶段提交和验证。
- `App.tsx` 有大量 IPC 编排和 ref 防竞态逻辑，迁移 store 时保留 ref 语义，避免异步回调读到旧 session。
- Provider directory 涉及 abort / subscription，迁移时保留取消语义。
- Zustand store 不承接主进程持久化职责，持久化仍由 IPC service 管理。

## Acceptance Criteria

- 大范围共享状态有明确 Zustand store 事实源。
- Browser context、聊天附件、Browser marker 删除 / 保存联动仍然有效。
- Settings、model routing、thinking level、right panel、sidebar 现有行为保持。
- Git branch summary 和 diff panel 自动刷新保持。
- Provider directory 在 Thread 和 Memory settings 内复用同一份 renderer 状态。
- 回归测试和 renderer typecheck 通过。

