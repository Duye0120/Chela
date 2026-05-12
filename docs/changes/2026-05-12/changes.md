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
