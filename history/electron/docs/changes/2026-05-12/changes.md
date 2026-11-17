## Security hardening and dependency audit cleanup

时间：2026-05-12 12:22:45

改了什么：
- 加强 shell 安全策略，拦截常见 Windows 破坏性命令和带上级路径的递归删除命令。
- 加强 `web_fetch`，手动处理重定向并逐跳校验 URL 策略，防止外部 URL 重定向到本机、内网或 link-local 地址。
- 收紧 Browser 预览地址规范化，只允许 `http:` / `https:`，拒绝 `file:`、`javascript:` 等非网页协议。
- 通过 `pnpm.overrides` 固定存在漏洞的直接和传递依赖版本，并把项目未支持的 Mistral SDK 替换为本地禁用 stub，移除审计中的供应链风险。
- 补充安全回归与 Browser URL 规范化回归用例。

为什么改：
- 用户要求对项目代码做安全检查和修复。
- `pnpm audit` 初始报告 37 个漏洞，其中包括 critical 供应链风险；代码扫描同时发现重定向 SSRF、防危险命令覆盖面和 Browser 协议白名单存在可收紧空间。

涉及文件：
- `package.json`
- `src/shared/security.ts`
- `src/main/tools/web-fetch.ts`
- `src/renderer/src/lib/browser-interview.ts`
- `tests/security-regression.test.ts`
- `tests/browser-interview-regression.test.ts`
- `vendor/mistralai-disabled/package.json`
- `vendor/mistralai-disabled/index.js`
- `vendor/mistralai-disabled/index.d.ts`

说明：
- `pnpm-lock.yaml` 在当前仓库被 `.gitignore` 忽略，本轮通过 `package.json` 的 `pnpm.overrides` 固化依赖约束。

结果：
- `pnpm exec tsx tests/security-regression.test.ts` 通过。
- `pnpm exec tsx tests/browser-interview-regression.test.ts` 通过。
- `pnpm audit --audit-level moderate` 通过，结果为 `No known vulnerabilities found`。
- 按项目约束未运行 build。

## Browser pin annotation interaction cleanup

时间：2026-05-12 12:45:27

改了什么：
- Browser Pin 从面板顶部输入改为贴近被 pin 元素的就地浮层输入。
- 同一页面同一 selector 重复 pin 会复用原 marker 和原批注，保存时更新同一条记录。
- Review Queue 卡片改成可读批注卡片，直接展示目标元素和批注内容，并支持删除单条批注。
- 注入脚本新增 `removePin` / `updatePinComment`，取消未保存批注时同步移除页面 marker。
- Browser context 的 review queue 去重改为页面 + selector，避免同一元素因为批注文本变化生成多条。
- Review Queue 去重会规范化 URL 并移除 hash，避免同一页面锚点变化造成重复批注。
- 批注浮层定位加入面板边界夹取，窄面板和贴边元素也能留在可视区域内。
- 补充 Browser 回归测试，覆盖同一元素批注更新的去重语义。

为什么改：
- 实际使用中顶部输入和页面 pin 位置脱节，用户看不到批注内容，也能对同一个 div 重复打多个点。
- pin 交互应接近 Figma / 代码审阅一类 anchored comment 模式：标记在目标上，评论在目标附近，列表里能看见已写内容。

涉及文件：
- `src/renderer/src/components/browser-preview/BrowserPreviewPanel.tsx`
- `src/renderer/src/lib/browser-inspector-script.ts`
- `src/renderer/src/lib/browser-interview.ts`
- `tests/browser-interview-regression.test.ts`
- `docs/changes/2026-05-12/changes.md`

结果：
- `pnpm exec tsx tests/browser-interview-regression.test.ts` 通过。
- `pnpm exec tsx tests/security-regression.test.ts` 通过。
- `pnpm exec tsc --noEmit -p src/renderer/tsconfig.json` 通过。
- 按项目约束未运行 build。

## Composer placeholder Chinese copy

时间：2026-05-12 13:53:45

改了什么：
- 将聊天输入框 placeholder 从英文改为中文：`输入指令、询问 Chela，或描述附件要处理什么...`。

为什么改：
- 用户截图指出输入框仍显示英文占位文案，需要和中文界面保持一致。

涉及文件：
- `src/renderer/src/components/assistant-ui/thread.tsx`
- `docs/changes/2026-05-12/changes.md`

结果：
- `thread.tsx` TypeScript 诊断为 0 error。
- 按项目约束未运行 build。

## Browser pin numbering and context chip cleanup

时间：2026-05-12 14:03:58

改了什么：
- Browser Pin 编号改为按已保存批注重新计算，未保存的临时 pin 会在下次选择新元素前清理。
- 已保存批注继续保留原编号，同一元素重复点击仍然复用原批注。
- 底部 context chip 改为中文展示：`上下文 · N 项 · 约 N 字符`、`批注 · ...`、`元素 · ...`。
- 补充 Browser 回归测试，覆盖中文 chip 文案和未保存 pin 编号回收逻辑。

为什么改：
- 用户发现未保存第一个 pin 后继续点下一个元素，编号直接跳到 2。
- 原 context chip 混用 `Context`、`chars`、`light`、`pin` 等内部文案，在中文界面里阅读负担偏重。

涉及文件：
- `src/renderer/src/lib/browser-inspector-script.ts`
- `src/renderer/src/lib/browser-interview.ts`
- `src/renderer/src/components/assistant-ui/thread.tsx`
- `tests/browser-interview-regression.test.ts`
- `docs/changes/2026-05-12/changes.md`

结果：
- `pnpm exec tsx tests/browser-interview-regression.test.ts` 通过。
- `pnpm exec tsc --noEmit -p src/renderer/tsconfig.json` 通过。
- 按项目约束未运行 build。

## Browser pin floating context cleanup

时间：2026-05-12 14:35:45

改了什么：
- 聊天输入框聚焦时向 Browser 面板发送交互重置信号，自动关闭 Pin / 选元素模式和 pending pin 输入。
- Browser 面板移除顶部 `加入 Review 上下文` 入口，保存单条 pin 即作为上下文来源。
- Browser 面板的已保存批注列表改为覆盖在 webview 上方的悬浮层，避免挤占浏览器内容布局。
- 聊天输入框的 browser context chips 改为 composer 上方悬浮层，避免占用输入框内部空间。
- 补充 Browser 回归测试，覆盖 browser context chips 应使用悬浮展示的语义。

为什么改：
- 用户反馈保存 pin 后回到聊天输入框，Browser 顶部仍保持 `正在注释` 状态。
- 用户反馈批注列表和 context chips 会侵占浏览器区域或聊天输入区域，应采用悬浮 UI。
- Browser 面板顶部 Review 入口和保存 pin 后的上下文行为重复。

涉及文件：
- `src/renderer/src/App.tsx`
- `src/renderer/src/components/AssistantThreadPanel.tsx`
- `src/renderer/src/components/assistant-ui/thread.tsx`
- `src/renderer/src/components/browser-preview/BrowserPreviewPanel.tsx`
- `src/renderer/src/lib/browser-interview.ts`
- `tests/browser-interview-regression.test.ts`
- `docs/changes/2026-05-12/changes.md`

结果：
- `pnpm exec tsx tests/browser-interview-regression.test.ts` 通过。
- `pnpm exec tsc --noEmit -p src/renderer/tsconfig.json` 通过。
- 按项目约束未运行 build。

## Browser review queue duplicate guard

时间：2026-05-12 14:14:27

改了什么：
- Review Queue 上下文去重改为稳定签名：同一页面、同一组 pin 只保留一条队列。
- context compaction 同 key 项按优先级和时间选择最新项，避免旧队列覆盖新队列。
- Browser 面板接收当前 session 的 browser context，已加入同一组 Review Queue 时按钮显示 `已加入上下文` 并禁用。
- 补充 Browser 回归测试，覆盖重复 Review Queue 点击后的去重语义。

为什么改：
- 用户发现 `加入 Review 上下文` 可以无限点击，底部 context 会堆出多条相同 review chip。
- Review Queue 的 `queueId` 每次点击都会变化，原去重 key 把相同队列当成不同上下文。

涉及文件：
- `src/shared/browser-context.ts`
- `src/renderer/src/App.tsx`
- `src/renderer/src/components/browser-preview/BrowserPreviewPanel.tsx`
- `src/renderer/src/lib/browser-interview.ts`
- `tests/browser-interview-regression.test.ts`
- `docs/changes/2026-05-12/changes.md`

结果：
- `pnpm exec tsx tests/browser-interview-regression.test.ts` 通过。
- `pnpm exec tsc --noEmit -p src/renderer/tsconfig.json` 通过。
- 按项目约束未运行 build。

## Composer browser context chips inline cleanup

时间：2026-05-12 14:46:21

改了什么：
- 聊天输入框里的 browser context 区域去掉 `上下文 · 1 项 · 约 N 字符` 汇总 chip。
- browser context chip 放回 composer 内部 meta 行，和附件展示共用同一个输入框区域。
- context chip 保留具体批注、元素、页面快照和清空动作。
- 删除悬浮展示 helper 和对应回归断言。

为什么改：
- 用户截图反馈汇总 chip 占位置且信息重复，真正需要看到的是具体批注内容。
- 用户要求批注上下文属于聊天输入框内部信息区。

涉及文件：
- `src/renderer/src/components/assistant-ui/thread.tsx`
- `src/renderer/src/lib/browser-interview.ts`
- `tests/browser-interview-regression.test.ts`
- `docs/changes/2026-05-12/changes.md`

结果：
- `pnpm exec tsx tests/browser-interview-regression.test.ts` 通过。
- `pnpm exec tsc --noEmit -p src/renderer/tsconfig.json` 通过。
- `git diff --check` 通过。
- 按项目约束未运行 build。
