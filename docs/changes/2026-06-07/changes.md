## 修复 sidebar 打开和 Git diff 卡顿

- 时间：2026-06-07 18:51 +0800
- 改了什么：
  - 在 shell sidebar 和主区域之间恢复 `ResizableHandle`，让左侧栏折叠后可以从边缘拖拽打开。
  - 为 Git diff 快照增加每个来源的完整 patch 预览上限，超出部分保留文件行和状态，延迟完整 diff 读取。
  - 增加 sidebar 拉手结构回归测试，以及大量未跟踪文件的 Git diff 快照性能回归测试。
  - 更新 `docs/todos/2026-06-07.md`，标记昨天记录的两项已处理。
- 为什么改：
  - 左侧 shell sidebar 缺少 `react-resizable-panels` 拉手，边缘拖拽打开路径失效。
  - 大 dirty tree 下 Diff/Git 打开会为所有文件逐个生成 patch，未跟踪文件还会同步读文件内容，容易造成明显卡顿。
- 涉及文件：
  - `src/renderer/src/App.tsx`
  - `src/main/git.ts`
  - `tests/renderer-performance-regression.test.ts`
  - `tests/git-regression.test.ts`
  - `docs/todos/2026-06-07.md`
- 验证结果：
  - `pnpm exec tsx tests/renderer-performance-regression.test.ts`
  - `pnpm exec tsx tests/git-regression.test.ts`
  - `pnpm exec tsc --noEmit -p tsconfig.renderer.json`
  - `pnpm exec tsc --noEmit -p tsconfig.json --allowImportingTsExtensions`
- 未做：
  - 未运行 `pnpm build` / `pnpm check`，原因是本轮只改 shell 布局和 Git diff 快照路径，已用针对性回归测试和 TypeScript 检查覆盖。

## 补修 sidebar 展开后回缩

- 时间：2026-06-07 18:52 +0800
- 改了什么：
  - 新增 `toSidebarPixelSize()`，把程序化展开恢复宽度限制到 `220px` 到 `350px`。
  - `Ctrl+B` / 顶部按钮展开 sidebar 时，使用像素宽度恢复，避免旧的 `4%` 之类持久化宽度低于最小面板宽度后被判回折叠。
  - 增加回归断言，锁定程序化展开不能继续复用旧百分比。
- 为什么改：
  - 用户截图显示左侧按钮能触发展开，但 sidebar 随后缩回；根因是恢复宽度可能低于 `MIN_SIDEBAR_WIDTH`，`react-resizable-panels` 会按 collapsible 规则重新折叠。
- 涉及文件：
  - `src/renderer/src/App.tsx`
  - `src/renderer/src/lib/app-shell.ts`
  - `tests/renderer-performance-regression.test.ts`
- 验证结果：
  - `pnpm exec tsx tests/renderer-performance-regression.test.ts`
  - `pnpm exec tsx tests/git-regression.test.ts`
  - `pnpm exec tsc --noEmit -p tsconfig.renderer.json`
  - `pnpm exec tsc --noEmit -p tsconfig.json --allowImportingTsExtensions`
- 未做：
  - 未运行 `pnpm build` / `pnpm check`，原因是本轮继续遵守项目约束，只跑直接覆盖 sidebar/Git 的最小验证。
