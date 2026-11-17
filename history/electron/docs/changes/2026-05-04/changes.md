## Browser Interview 功能实现

时间：2026-05-04 15:00:53

改了什么：
- 新增右侧 `Browser` 面板，支持输入 URL、加载 Electron `webview`、前进后退、刷新和 Inspector 元素选择。
- 新增页面注入脚本，开启选择后可 hover 高亮页面元素，点击后采集 selector、文本、HTML、尺寸和关键样式。
- 新增当前会话级 browser context chips，选中的元素会进入聊天输入区，发送、排队发送和引导发送都会把 DOM Context 组装进模型输入。
- 正常发送路径新增 `displayText`，模型输入可带 DOM Context，聊天历史保留用户原始指令。
- 扩展右侧面板状态，让 `diff`、`trace`、`browser` 三个视图都能通过同一套 open / activeView / width 状态工作。
- 开启主窗口 `webviewTag`，补充 renderer JSX 的 `webview` 类型声明。
- 新增 `tests/browser-interview-regression.test.ts` 覆盖 URL 规范化、元素标签和 DOM Context prompt 组装。

为什么改：
- 用户需要参考 Cursor 浏览器选中能力和 Codex 类似上下文注入能力，把已有 Browser Preview / DOM Inspector 方案落成可用功能。
- 选中元素需要成为用户可见、可移除、可发送的上下文，避免只停留在右侧预览面板内部。

涉及文件：
- `src/renderer/src/components/browser-preview/BrowserPreviewPanel.tsx`
- `src/renderer/src/lib/browser-interview.ts`
- `src/renderer/src/lib/browser-inspector-script.ts`
- `src/renderer/src/App.tsx`
- `src/renderer/src/components/AssistantThreadPanel.tsx`
- `src/renderer/src/components/assistant-ui/thread.tsx`
- `src/renderer/src/vite-env.d.ts`
- `src/main/chat/prepare.ts`
- `src/main/window.ts`
- `src/main/ui-state.ts`
- `src/shared/contracts.ts`
- `tests/browser-interview-regression.test.ts`

结果：
- `pnpm exec tsx tests/browser-interview-regression.test.ts` 通过。
- `pnpm exec tsc --noEmit -p tsconfig.renderer.json --pretty false` 通过。
- `pnpm exec tsx tests/ipc-contract-regression.test.ts` 通过。
- `pnpm exec tsc --noEmit -p tsconfig.json --pretty false` 暴露主进程既有类型错误，错误集中在 `src/main/agent.ts`、`src/main/context/snapshot.ts`、`src/main/harness/*`、`src/main/tools/code-analysis.ts`，本轮改动文件没有出现在该失败列表。

## Browser Preview WebView 未就绪崩溃修复

时间：2026-05-04 15:25:23

改了什么：
- 将 Browser 面板的前进 / 后退可用状态改为事件驱动的 React state。
- `dom-ready`、加载开始 / 结束、导航事件后再读取 `webview.canGoBack()` 和 `webview.canGoForward()`。
- render 阶段只读取 `navigationState`，避免 Electron `webview` 尚未完成 `dom-ready` 时抛出 render crash。

为什么改：
- 实测打开 Browser 面板时，Electron 报错 `The WebView must be attached to the DOM and the dom-ready event emitted before this method can be called.`，根因是组件渲染期间直接调用了 `canGoBack()`。

涉及文件：
- `src/renderer/src/components/browser-preview/BrowserPreviewPanel.tsx`
- `docs/changes/2026-05-04/changes.md`

结果：
- `pnpm exec tsx tests/browser-interview-regression.test.ts` 通过。
- `pnpm exec tsc --noEmit -p tsconfig.renderer.json --pretty false` 通过。

## Browser DOM Tag 可见化

时间：2026-05-04 15:33:18

改了什么：
- 将 browser context 元数据提升到 shared contract，用户消息可以持久化 `browserContextItems`。
- 带 DOM context 的发送路径改为手动 append user message，并写入 `metadata.custom.browserContextItems`。
- Composer 内的 DOM tag 改成 `dom-tag <label>` 样式，hover 展示 selector、文本、尺寸、页面和关键样式摘要。
- 用户消息气泡会渲染同一组 DOM tag，历史消息 reload 后也能显示。
- 模型输入继续通过 `Browser Context` 传完整 DOM 信息，聊天历史正文保留用户输入文本。
- `tests/browser-interview-regression.test.ts` 增加 DOM tag display text 和 hover 摘要函数覆盖。

为什么改：
- 用户期望选中 DOM 后在输入框里像 tag 一样可见，悬浮可看内容，并且发送后的聊天框也能看到该 DOM tag。

涉及文件：
- `src/shared/contracts.ts`
- `src/main/chat/prepare.ts`
- `src/main/session/transcript-writer.ts`
- `src/renderer/src/lib/browser-interview.ts`
- `src/renderer/src/components/AssistantThreadPanel.tsx`
- `src/renderer/src/components/assistant-ui/thread.tsx`
- `tests/browser-interview-regression.test.ts`
- `docs/changes/2026-05-04/changes.md`

结果：
- `pnpm exec tsx tests/browser-interview-regression.test.ts` 通过。
- `pnpm exec tsc --noEmit -p tsconfig.renderer.json --pretty false` 通过。
- `pnpm exec tsx tests/ipc-contract-regression.test.ts` 通过。
- `pnpm exec tsc --noEmit -p tsconfig.json --pretty false` 仍暴露主进程既有类型错误，错误文件与前一轮一致。

## Browser DOM Tag 渲染循环修复

时间：2026-05-04 16:45:23

改了什么：
- 将 `BrowserContextItem` 的类型校验和裁剪逻辑收进 `browser-interview.ts`，复用同一套 helper。
- `UserMessage` 的 `useAuiState` 只读取原始 `browserContextItems` 元数据，过滤和裁剪改到 `useMemo` 内完成。
- 给 `Thread` 的空 DOM context 默认值使用稳定数组引用，减少无意义派生回调变化。
- 回归测试补充 DOM context item 校验和过滤覆盖。

为什么改：
- 截图里的 `Maximum update depth exceeded` 来自订阅快照持续返回新数组。`useAuiState` 选择器里直接 `filter().slice()` 会让快照引用每次变化，引发 React external store 更新循环。

涉及文件：
- `src/renderer/src/lib/browser-interview.ts`
- `src/renderer/src/components/AssistantThreadPanel.tsx`
- `src/renderer/src/components/assistant-ui/thread.tsx`
- `tests/browser-interview-regression.test.ts`
- `docs/changes/2026-05-04/changes.md`

结果：
- `pnpm exec tsx tests/browser-interview-regression.test.ts` 通过。
- `pnpm exec tsc --noEmit -p tsconfig.renderer.json --pretty false` 通过。
- `git diff --check` 通过。

## Browser DOM Tag 聊天气泡展示修复

时间：2026-05-04 17:26:27

改了什么：
- 空闲状态按 Enter 且存在 DOM tag 时，改为手动 append 带 `metadata.custom.browserContextItems` 的 user message。
- 发送按钮复用同一条 append 路径，用户消息正文保持用户输入，DOM tag 作为消息 metadata 渲染。
- queued / guided 消息新增 `displayText` 和 `browserContextItems`，排队后派发到聊天时继续保留 DOM tag。
- 将 DOM context item 校验工具下沉到 `src/shared/browser-context.ts`，renderer 和 main/session 复用同一套过滤逻辑。

为什么改：
- 用户截图显示 composer 里有 `dom-tag`，发送后的用户聊天气泡只显示文本。根因是空闲 Enter 走 assistant-ui 默认发送，默认 append 没有写入 DOM tag metadata。

涉及文件：
- `src/shared/browser-context.ts`
- `src/shared/contracts.ts`
- `src/main/chat/service.ts`
- `src/main/session/facade.ts`
- `src/main/session/meta.ts`
- `src/main/session/service.ts`
- `src/renderer/src/lib/browser-interview.ts`
- `src/renderer/src/components/AssistantThreadPanel.tsx`
- `src/renderer/src/components/assistant-ui/thread.tsx`
- `docs/changes/2026-05-04/changes.md`

结果：
- `pnpm exec tsx tests/browser-interview-regression.test.ts` 通过。
- `pnpm exec tsc --noEmit -p tsconfig.renderer.json --pretty false` 通过。
- `pnpm exec tsx tests/ipc-contract-regression.test.ts` 通过。
- `git diff --check` 通过。
- `pnpm exec tsc --noEmit -p tsconfig.json --pretty false` 仍只报既有主进程类型错误，错误文件为 `src/main/agent.ts`、`src/main/context/snapshot.ts`、`src/main/harness/*`、`src/main/tools/code-analysis.ts`。
