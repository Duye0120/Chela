## Composer meta chips single row

时间：2026-05-13 11:28:58

改了什么：
- 聊天输入框 meta 区域改为单行横向滚动布局。
- 附件 chip 支持 inline 模式，和 browser 批注 chip 处在同一层级。
- 批注、README 等上下文项继续通过各自 icon 区分类型。

为什么改：
- 用户截图反馈批注和 README 附件属于同一层级，不需要分两行展示。
- 单行 chip 能减少输入框顶部占用，并保持类型识别清晰。

涉及文件：
- `src/renderer/src/components/assistant-ui/attachment.tsx`
- `src/renderer/src/components/assistant-ui/thread.tsx`
- `docs/changes/2026-05-13/changes.md`

结果：
- `pnpm exec tsc --noEmit -p src/renderer/tsconfig.json` 通过。
- `pnpm exec tsx tests/browser-interview-regression.test.ts` 通过。
- `git diff --check` 通过。
- 按项目约束未运行 build。

## Composer meta chip background alignment

时间：2026-05-13 11:33:10

改了什么：
- Browser 批注 chip 背景色从选中态底色调整为 `--color-control-bg`。
- 批注 chip 和 README 附件 chip 保持同一背景层级，通过 icon 区分类型。

为什么改：
- 同一行 meta chip 属于同一层级，背景色应保持一致。
- 用户截图指出 README 附件和批注 chip 背景色不一致。

涉及文件：
- `src/renderer/src/components/assistant-ui/thread.tsx`
- `docs/changes/2026-05-13/changes.md`

结果：
- `pnpm exec tsc --noEmit -p src/renderer/tsconfig.json` 通过。
- `git diff --check` 通过。
- 按项目约束未运行 build。

## UI color token governance note

时间：2026-05-13 11:38:00

改了什么：
- 在 `AGENTS.md` 新增 UI 颜色 token 统一约束。
- 明确同一界面、同一层级、同一语义的控件必须复用同一颜色 token。
- 明确新增颜色前先按 shell、composer、control、selection、status、accent、message 等语义层归类。
- 记录后续需要专项整理全项目颜色 token，消除同语义多 token 和硬编码颜色。

为什么改：
- 用户要求后续整理全项目颜色 token，避免再次出现同层级控件背景色不一致。
- 该要求属于长期 UI 设计约束，需要沉淀到项目规则。

涉及文件：
- `AGENTS.md`
- `docs/changes/2026-05-13/changes.md`

结果：
- `git diff --check` 通过。
- 按项目约束未运行 build。

## Browser panel redundant pin surfaces cleanup

时间：2026-05-13 12:06:58

改了什么：
- Browser panel 删除 webview 上方的页面标题 / URL / 最近上下文状态行。
- Browser panel 删除 webview 内顶部的已保存页面批注列表浮层。
- 页面标题和 URL 信息保留到地址栏 `title`，hover 时仍可查看。
- 保存批注后继续把批注加入聊天上下文，Browser panel 内只保留页面 marker 和就地编辑弹层。

为什么改：
- 用户截图指出 Browser panel 内的顶部批注栏和“多少条页面批注”浮层已经和聊天输入框里的上下文 chip 重复。
- `DAG 工作流画布 Demo · URL` 这类页面信息放在 webview 上方占用布局，和当前 Browser panel 的核心操作关系弱。

涉及文件：
- `src/renderer/src/components/browser-preview/BrowserPreviewPanel.tsx`
- `docs/changes/2026-05-13/changes.md`

结果：
- `pnpm exec tsc --noEmit -p src/renderer/tsconfig.json` 通过。
- `pnpm exec tsx tests/browser-interview-regression.test.ts` 通过。
- `git diff --check` 通过。
- 按项目约束未运行 build。

## Browser pin and element selection color split

时间：2026-05-13 12:25:18

改了什么：
- 新增 Browser 专用颜色 token：`--color-browser-pin-*` 和 `--color-browser-select-*`。
- Browser toolbar 中 Pin active 态改用 browser pin token，选元素 active 态改用 browser select token。
- Webview 内 hover 框根据当前模式切换颜色：Pin 使用批注色，选元素使用选择色。
- Pin 就地批注弹层的 pin icon 改用 browser pin token。
- 补充 Browser 回归测试，确保 inspector 脚本引用新的模式颜色 token。

为什么改：
- Pin 和选元素是两种不同交互模式，使用同一 accent 色会让状态含义混在一起。
- 项目已经要求颜色 token 按语义统一，Browser 模式颜色需要有明确语义边界。

涉及文件：
- `src/renderer/src/styles/theme.css`
- `src/renderer/src/components/browser-preview/BrowserPreviewPanel.tsx`
- `src/renderer/src/lib/browser-inspector-script.ts`
- `tests/browser-interview-regression.test.ts`
- `docs/changes/2026-05-13/changes.md`

结果：
- `pnpm exec tsc --noEmit -p src/renderer/tsconfig.json` 通过。
- `pnpm exec tsx tests/browser-interview-regression.test.ts` 通过。
- `git diff --check` 通过。
- 按项目约束未运行 build。

## Browser single annotation mode and region screenshot

时间：2026-05-13 13:08:49

改了什么：
- Browser toolbar 删除独立“选元素”入口，保留单一“批注”入口。
- 批注中左键点击页面目标会继续弹出就地批注框，保存后进入聊天上下文。
- 批注中左键拖拽框选区域会通过 webview `capturePage` 截图，并保存为图片附件加入当前聊天。
- 右键和 Esc 会取消当前批注 / 框选状态。
- 附件 hook 暴露 `appendAttachmentsToSession`，Browser panel 可复用现有 session 附件合并逻辑。
- 补充 Browser 回归测试，覆盖区域截图队列、取消信号、截图保存入口和“选元素”文案移除。

为什么改：
- 用户确认不再新增第三个截图按钮，批注模式同时承担 DOM 目标批注和区域截图。
- Pin 和选元素能力有重合，统一入口能降低操作冲突。
- 区域截图需要直接进入聊天附件，避免依赖系统截图工具。

涉及文件：
- `src/renderer/src/App.tsx`
- `src/renderer/src/hooks/use-session-attachments.ts`
- `src/renderer/src/components/browser-preview/BrowserPreviewPanel.tsx`
- `src/renderer/src/lib/browser-inspector-script.ts`
- `tests/browser-interview-regression.test.ts`
- `docs/changes/2026-05-13/changes.md`

结果：
- `pnpm exec tsx tests/browser-interview-regression.test.ts` 通过。
- `pnpm exec tsc --noEmit -p src/renderer/tsconfig.json` 通过。
- `git diff --check` 通过。
- 按项目约束未运行 build。

## Browser screenshot annotation save flow

时间：2026-05-13 13:22:35

改了什么：
- Browser 区域截图改为先生成待保存截图批注，不再框选后立即加入聊天附件。
- 截图框选完成后弹出就地批注浮层，展示截图预览和评论输入。
- 点击保存后才把截图 PNG 加入当前 session 附件，并同步加入一条 `screenshot` 类型 Browser 上下文。
- Browser 上下文、chip、prompt 和 compact 逻辑新增截图批注类型。
- 右键 / Esc 取消时，注入脚本会统一清理 hover 高亮、截图框、label、pending target 和 animation frame，并关闭选择模式，避免取消后残留黄色 DOM 高亮。
- 补充 Browser 回归测试，覆盖截图批注延迟保存、截图上下文 prompt、取消清理函数和旧“选元素”文案移除。

为什么改：
- 用户希望截图区域也能像 DOM 批注一样先评价，保存时再进入聊天 session。
- 右键取消后仍出现黄色边框，说明注入脚本内部视觉状态没有被完整清理。

涉及文件：
- `src/shared/contracts.ts`
- `src/shared/browser-context.ts`
- `src/renderer/src/lib/browser-interview.ts`
- `src/renderer/src/components/browser-preview/BrowserPreviewPanel.tsx`
- `src/renderer/src/lib/browser-inspector-script.ts`
- `tests/browser-interview-regression.test.ts`
- `docs/changes/2026-05-13/changes.md`

结果：
- `pnpm exec tsx tests/browser-interview-regression.test.ts` 通过。
- `pnpm exec tsc --noEmit -p src/renderer/tsconfig.json` 通过。
- `git diff --check` 通过。
- 按项目约束未运行 build。

## Browser screenshot composer interaction lock

时间：2026-05-13 13:34:34

改了什么：
- Browser 批注进入 DOM 批注编辑或截图评价编辑时，统一停止 webview inspector。
- 待编辑浮层存在期间停止批注轮询，并禁用顶部“批注”按钮。
- 区域截图生成待评价浮层后立即关闭页面 hover / 选择监听，避免评价截图时继续选中外部 DOM。
- 补充 Browser 回归测试，覆盖截图待评价时关闭 inspector、待编辑态停止轮询、批注按钮禁用。

为什么改：
- 用户截图显示正在评价截图时，页面外部 DOM 仍会出现黄色选择框。
- 编辑浮层是一个独占交互状态，保存或取消前需要锁住页面选择能力。

涉及文件：
- `src/renderer/src/components/browser-preview/BrowserPreviewPanel.tsx`
- `tests/browser-interview-regression.test.ts`
- `docs/changes/2026-05-13/changes.md`

结果：
- `pnpm exec tsx tests/browser-interview-regression.test.ts` 通过。
- `pnpm exec tsc --noEmit -p src/renderer/tsconfig.json` 通过。
- `git diff --check` 通过。
- 按项目约束未运行 build。

## Browser screenshot attachment comment binding

时间：2026-05-13 13:55:18

改了什么：
- Browser 截图批注保存后，把评论写入截图附件的 `description`，并把附件显示名改为 `截图 · 评论内容`。
- 截图附件和对应 Browser screenshot context 通过 `browserContextItemId` 绑定；输入区和已发送用户消息隐藏已绑定的截图 context chip，只保留一个截图附件 chip。
- 附件 hover 和点击预览展示同一段截图评论，删除截图附件时同步移除对应截图上下文。
- 发送给模型的图片内容前增加 `图片说明：...` 文本块，保证截图和评价在模型输入里保持绑定。
- 补充 Browser 回归测试，覆盖截图附件 displayName、description、context 绑定和图片说明 prompt。

为什么改：
- 用户指出截图和评论分开成两个 chip 时，多个附件并存会让评论归属变得模糊。
- 截图评价属于截图本身的描述，需要跟截图预览、删除和发送生命周期绑定。

涉及文件：
- `src/shared/contracts.ts`
- `src/main/chat-message-adapter.ts`
- `src/renderer/src/App.tsx`
- `src/renderer/src/components/assistant-ui/attachment.tsx`
- `src/renderer/src/components/assistant-ui/thread.tsx`
- `src/renderer/src/components/browser-preview/BrowserPreviewPanel.tsx`
- `src/renderer/src/lib/assistant-ui-attachments.ts`
- `tests/browser-interview-regression.test.ts`
- `docs/changes/2026-05-13/changes.md`

结果：
- `pnpm exec tsx tests/browser-interview-regression.test.ts` 通过。
- `pnpm exec tsc --noEmit -p src/renderer/tsconfig.json` 通过。
- `git diff --check` 通过。
- `pnpm exec tsc --noEmit -p tsconfig.json` 未通过，命中既有主进程类型错误：`src/main/agent.ts`、`src/main/context/snapshot.ts`、`src/main/harness/*`、`src/main/tools/code-analysis.ts`。
- 按项目约束未运行 build。

## Browser screenshot clean capture and modal radius alignment

时间：2026-05-13 14:18:59

改了什么：
- Browser 区域截图在调用 webview `capturePage` 前，会通过 inspector `prepareCapture` 隐藏 hover 高亮、框选层、label、已保存 pin marker 和截图 marker。
- 截图完成后通过 `restoreCaptureVisuals` 恢复页面上已有标记，截图图片本身只保留真实页面内容。
- 截图批注保存后，在页面上留下独立的蓝色截图区域标记；取消待评价截图时同步移除该标记。
- 附件图片预览 modal、图片本体、关闭按钮统一改用 `--radius-shell` 及 `calc(var(--radius-shell)+4px)`，移除局部 `20px` / `rounded-full` 半径。
- 补充 Browser 回归测试，覆盖截图清理协议、截图标记 API、附件预览 modal 半径 token。

为什么改：
- 用户截图反馈截图预览中带有黄色 DOM hover 辅助线，说明截图把调试辅助层一起拍进了图片。
- 用户指出图片预览 modal 与截图评价组件圆角不一致，违反项目内统一使用 radius token 的长期约束。

涉及文件：
- `src/renderer/src/lib/browser-inspector-script.ts`
- `src/renderer/src/components/browser-preview/BrowserPreviewPanel.tsx`
- `src/renderer/src/components/assistant-ui/attachment.tsx`
- `src/renderer/src/components/ui/dialog.tsx`
- `tests/browser-interview-regression.test.ts`
- `docs/changes/2026-05-13/changes.md`

结果：
- `pnpm exec tsx tests/browser-interview-regression.test.ts` 通过。
- `pnpm exec tsc --noEmit -p src/renderer/tsconfig.json` 通过。
- `git diff --check` 通过，仅有既有 CRLF 提示。
- 按项目约束未运行 build。

## Browser screenshot marker session sync

时间：2026-05-13 14:31:27

改了什么：
- Browser panel 接收当前 session 的 Browser context 列表，并把其中的截图批注同步投影为 webview 内的蓝色区域 marker。
- 注入脚本新增 `syncScreenshotMarkers`，按传入的截图批注列表新增、更新或删除页面上的截图 marker。
- Browser inspector 每次注入完成后会立即按当前 session context 同步截图 marker，覆盖 webview 刷新、重新打开 panel 后的首帧状态。
- 聊天输入区删除截图附件时，既有逻辑会删除绑定的 Browser screenshot context；Browser panel 现在会收到 context 变更并同步删除蓝色框。
- 修正 Browser panel 传参中的 `activeSessionId` 空值类型问题。
- 在 `AGENTS.md` 新增跨面板状态同步治理约束，记录后续评估 Zustand 或等价轻量状态层的方向。
- 补充 Browser 回归测试，覆盖 `syncScreenshotMarkers`、注入后立即同步 marker、Browser panel context 传入和 null-safe session 传参。

为什么改：
- 用户反馈聊天里删除了截图评论 session / 附件后，Browser panel 仍保留蓝色框。
- 蓝色框属于 webview 内部派生 UI，需要跟聊天 session 的 context / attachment 状态联动。
- 跨面板同步点继续增多，需要把全局状态治理方向沉淀为长期规则。

涉及文件：
- `AGENTS.md`
- `src/renderer/src/App.tsx`
- `src/renderer/src/components/browser-preview/BrowserPreviewPanel.tsx`
- `src/renderer/src/lib/browser-inspector-script.ts`
- `tests/browser-interview-regression.test.ts`
- `docs/changes/2026-05-13/changes.md`

结果：
- `pnpm exec tsx tests/browser-interview-regression.test.ts` 通过。
- `pnpm exec tsc --noEmit -p src/renderer/tsconfig.json` 通过。
- `git diff --check` 通过，仅有既有 CRLF 提示。
- 按项目约束未运行 build。

## Zustand global state migration

时间：2026-05-13 16:42:04

改了什么：
- 新增 renderer Zustand store 分层：app、session、git、provider directory。
- 将 `App.tsx` 内大范围共享状态迁移到 store selector/action，保留 DOM refs、drag cleanup refs 和局部交互 state。
- Browser context、聊天附件、Browser marker 继续以 session browser context 为事实源同步。
- `useAppGitState` 改为 Git store-backed hook，保留 diff panel 自动刷新和请求去重。
- Provider directory 改为共享 store，减少 Thread 与 Memory settings 重复加载。
- 补充 Zustand store 回归测试和 Browser 回归断言。
- 在 `AGENTS.md` 补充 renderer 大范围共享状态默认使用 Zustand store 的长期约束。

为什么改：
- 用户要求大范围状态统一迁移到 Zustand，降低后续功能开发和跨面板同步成本。
- 当前 `App.tsx` 聚合过多共享状态，继续增加 Browser / memory / context 功能会放大 prop drilling 和同步竞态。

涉及文件：
- `AGENTS.md`
- `src/renderer/src/stores/app-store.ts`
- `src/renderer/src/stores/session-store.ts`
- `src/renderer/src/stores/git-store.ts`
- `src/renderer/src/stores/provider-directory-store.ts`
- `src/renderer/src/App.tsx`
- `src/renderer/src/hooks/use-app-git-state.ts`
- `src/renderer/src/components/assistant-ui/thread.tsx`
- `src/renderer/src/components/assistant-ui/settings/memory-section.tsx`
- `src/renderer/src/lib/app-session-state.ts`
- `tests/renderer-zustand-store-regression.test.ts`
- `tests/browser-interview-regression.test.ts`
- `docs/superpowers/specs/2026-05-13-zustand-global-state-design.md`
- `docs/superpowers/plans/2026-05-13-zustand-global-state-migration.md`
- `docs/changes/2026-05-13/changes.md`

结果：
- `pnpm exec tsx tests/renderer-zustand-store-regression.test.ts` 通过。
- `pnpm exec tsx tests/browser-interview-regression.test.ts` 通过。
- `pnpm exec tsc --noEmit -p src/renderer/tsconfig.json` 通过。
- `git diff --check` 通过。
- 按项目约束未运行 build。
