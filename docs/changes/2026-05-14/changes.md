## Its Hover Animated Icons

- 时间：2026-05-14 12:08 +0800
- 改了什么：
  - 调研 `https://www.itshover.com/`，确认它是面向 React/shadcn registry 的动效 SVG 图标源码库。
  - 由于当前 shadcn CLI 无法解析仓库里的 `@renderer/*` aliases，未直接执行 registry 写入，改为按 registry JSON 手动落地等价源码。
  - 新增 Its Hover 的 `PlugConnectedIcon` 示例组件和共享动效图标类型，后续可继续按同目录追加其它图标。
  - 新增 `motion` 依赖以支持 `motion/react`。
- 为什么改：用户希望把 Its Hover 接入 Chela 项目，本轮先完成最小可用安装入口，避免全量引入未知组件或覆盖现有 UI。
- 涉及文件：
  - `package.json`
  - `pnpm-lock.yaml`
  - `src/renderer/src/components/hover-icons/types.ts`
  - `src/renderer/src/components/hover-icons/plug-connected-icon.tsx`
  - `src/renderer/src/components/hover-icons/index.ts`
  - `docs/changes/2026-05-14/changes.md`
- 验证结果：
  - `pnpm add motion` passed
  - `pnpm dlx shadcn@latest add https://itshover.com/r/plug-connected-icon.json --dry-run` blocked by local alias resolution, no files were written by CLI
- 未做：未运行 `pnpm build`、未运行 `pnpm check`；本轮只完成最小安装入口，尚未把图标替换到具体 UI 控件中。

## AGENTS 常驻规则瘦身与 Chela Skills 拆分

- 时间：2026-05-14 13:07 +0800
- 改了什么：
  - 将根 `AGENTS.md` 从全量长规则改成常驻硬约束、skill 路由和执行默认值。
  - 新增 Chela 项目专属 skills，把文档留痕、UI 规则、聊天区规则、Shell 分栏、renderer 共享状态、runtime harness、Electron IPC 边界拆成按需加载的说明。
  - 调整 `commit` skill，移除默认 `pnpm build` / `pnpm check` 的预检写法，改为遵守 Chela 的最小验证原则。
- 为什么改：用户指出当前 `AGENTS.md` 过于冗余，希望只保留必要常驻内容，其余通过 skills 联动触发，减少每次任务都加载无关上下文。
- 涉及文件：
  - `AGENTS.md`
  - `.agents/skills/chela-doc-trace/SKILL.md`
  - `.agents/skills/chela-ui-guidelines/SKILL.md`
  - `.agents/skills/chela-chat-surface/SKILL.md`
  - `.agents/skills/chela-shell-panels/SKILL.md`
  - `.agents/skills/chela-renderer-state/SKILL.md`
  - `.agents/skills/chela-runtime-harness/SKILL.md`
  - `.agents/skills/chela-electron-ipc/SKILL.md`
  - `.agents/skills/commit/SKILL.md`
  - `docs/changes/2026-05-14/changes.md`
- 验证结果：
  - 手动回读关键说明文件，确认 AGENTS 只保留常驻约束，场景细则已迁移到 skills。
- 未做：
  - 未运行 `pnpm build`，本轮是文档和 agent 指令整理，不需要构建。
  - 未运行 `pnpm check`，本轮未改 TypeScript 业务代码。

## UI 一致性治理基线

- 时间：2026-05-14 13:25 +0800
- 改了什么：
  - 新增 `scripts/audit-ui-consistency.ts`，扫描 renderer UI 里的裸 Tailwind 色值、裸 CSS 色值、任意圆角和默认 border。
  - 在 `package.json` 新增 `pnpm audit:ui`，作为 UI 改动前后的轻量一致性检查入口。
  - 新增 `src/renderer/src/components/assistant-ui/surface.tsx`，提供 `Surface` 和 `PreviewSurface`，统一面板、浮层和 preview 容器的圆角、背景和阴影入口。
  - 将 Browser preview 的主预览容器、页面批注浮层、截图批注浮层迁移到共享 surface primitive。
  - 收紧基础 `Button` 和 `Badge` 的圆角入口，避免 `rounded-md` / `rounded-full` 继续从基础组件扩散。
  - 更新 `docs/design-system-baseline.md` 和 `chela-ui-guidelines` skill，把 UI consistency contract、shared primitives 和审计流程沉淀为长期规则。
- 为什么改：用户指出现有页面在圆角、颜色和 preview 表现上与 Chela 设计要求不一致，本轮先把提示层规则落成可执行审计、共享组件和样板迁移。
- 涉及文件：
  - `package.json`
  - `scripts/audit-ui-consistency.ts`
  - `src/renderer/src/components/assistant-ui/surface.tsx`
  - `src/renderer/src/components/ui/button.tsx`
  - `src/renderer/src/components/ui/badge.tsx`
  - `src/renderer/src/components/browser-preview/BrowserPreviewPanel.tsx`
  - `docs/design-system-baseline.md`
  - `.agents/skills/chela-ui-guidelines/SKILL.md`
  - `docs/changes/2026-05-14/changes.md`
- 验证结果：
  - `pnpm audit:ui` passed，扫描 123 个文件，记录 212 个现有 UI 一致性漂移点。
  - 当前基线包含 `raw-tailwind-color: 72`、`raw-css-color: 66`、`radius-drift: 51`、`heavy-border-default: 23`。
- 未做：
  - 未运行 `pnpm build`，本轮是 UI 治理基础设施和局部样板迁移，不需要完整构建。
  - 未运行 `pnpm check`，本轮验证重点是新审计链路；后续批量迁移组件时再按实际改动跑目标检查。
  - 未一次性修完 212 个漂移点，本轮先建立治理基线和迁移样板，避免大面积视觉改动混在同一轮。

## UI 一致性漂移归零

- 时间：2026-05-14 14:22 +0800
- 改了什么：
  - 将 `pnpm audit:ui` 里的产品 UI 漂移从 212 个收敛到 0 个。
  - 调整审计脚本，排除 theme / Tailwind 映射、webview inspector 注入脚本、头像天然圆形、markdown 内容分隔线和 diff 合法分栏线。
  - 收敛基础组件的裸色、任意圆角和默认 border，包括 `Button`、`Badge`、`Checkbox`、`Switch`、`Popover`、`HoverCard`、`Tabs`、`Tooltip`、`ResizableHandle`、markdown code、commit description editor。
  - 收敛高频页面和面板的漂移点，包括 Browser preview、App crash/error UI、Agent activity、Tool fallback、Skills settings、Keys settings、Runtime diagnostics、Logs、Workspace、Sidebar、Thread、Trace、Diff preview。
  - 将错误态、成功态、警告态、overlay、control surface、selection、反色文本全部切回 Chela semantic token。
- 为什么改：上轮建立了 UI 治理基线，本轮继续执行 superpowers 治理计划，把圆角、颜色、surface、状态和边界检查从“发现问题”推进到普通审计归零。
- 涉及文件：
  - `scripts/audit-ui-consistency.ts`
  - `src/renderer/src/App.tsx`
  - `src/renderer/src/main.tsx`
  - `src/renderer/src/components/TerminalTab.tsx`
  - `src/renderer/src/components/DiffView.tsx`
  - `src/renderer/src/components/browser-preview/BrowserPreviewPanel.tsx`
  - `src/renderer/src/components/assistant-ui/*`
  - `src/renderer/src/components/assistant-ui/settings/*`
  - `src/renderer/src/components/ui/*`
  - `docs/changes/2026-05-14/changes.md`
- 验证结果：
  - `pnpm audit:ui` passed，扫描 123 个文件，`Findings 0`。
  - `git diff --check` passed，仅输出 Windows CRLF 提示。
- 未做：
  - 未运行 `pnpm build`，本轮是 UI token/radius/border 收敛，不需要完整构建。
  - 未运行 `pnpm check`，本轮实际验证目标是 UI 一致性审计和 diff 卫生检查。

## UI 一致性真实窗口验收

- 时间：2026-05-14 17:48 +0800
- 改了什么：
  - 通过 `pnpm dev:renderer` 启动真实 Chela Electron renderer dev 窗口。
  - 使用 Electron 可控窗口截图验收主聊天 + Diff、Browser workspace、Trace 空态、Settings 通用页。
  - 清理本轮验收生成的 `tmp/ui-review` 临时截图目录，避免截图产物进入工作区 diff。
- 为什么改：用户希望这轮 UI 一致性治理直接完成，本轮补齐真实窗口视觉验收，覆盖此前仅靠审计脚本无法判断的预览和面板观感。
- 涉及文件：
  - `docs/changes/2026-05-14/changes.md`
  - `docs/superpowers/plans/2026-05-14-ui-consistency-governance.md`
- 验证结果：
  - 真实窗口截图确认主聊天 + Diff、Browser workspace、Trace 空态、Settings 通用页的圆角、背景层级、按钮选中态和面板边界与当前 Chela token 体系一致。
- 未做：
  - 未运行 `pnpm build`，本轮使用 dev renderer 真实窗口验收。
  - 未运行 `pnpm check`，本轮未新增 TypeScript 行为逻辑。

## Codex Theme v1 浅色主题落地

- 时间：2026-05-14 18:00 +0800
- 改了什么：
  - 将浅色主题主色从纯灰收敛到用户提供的 `codex-theme-v1` 方向。
  - 将 `#0169cc` 接入 accent、selection、focus、Browser 选区、thinking 和主要 action。
  - 将 `#00a240` / `#e02e2a` 接入 diff added / removed 与成功 / 错误状态。
  - 新增 skill 语义 token：`--chela-skill`、`--chela-skill-bg`、`--chela-skill-text`，并用于 skill usage strip 与 Skills 设置页 usage badge。
  - 更新 design baseline，记录浅色主题的默认色彩方向。
  - 通过真实 Electron renderer dev 窗口截图复核主聊天 + Diff、Browser workspace、Trace 空态、Settings 通用页。
- 为什么改：用户反馈当前 UI 仍偏灰、偏冷，提供了 `codex-theme-v1` 颜色方案；本轮把该方案落到 Chela semantic token，而不是在业务组件里散写颜色。
- 涉及文件：
  - `src/renderer/src/styles/theme.css`
  - `src/renderer/src/components/assistant-ui/skill-usage-strip.tsx`
  - `src/renderer/src/components/assistant-ui/settings/skills-section.tsx`
  - `docs/design-system-baseline.md`
  - `docs/changes/2026-05-14/changes.md`
- 验证结果：
  - `pnpm dev:renderer` 真实窗口验收通过，覆盖主聊天 + Diff、Browser workspace、Trace 空态、Settings 通用页。
  - 运行时 CSS vars 确认：accent `#0169cc`、skill `#751ed9`、diff added `#00a240`、diff removed `#e02e2a`。
  - `pnpm audit:ui` passed，扫描 123 个文件，`Findings 0`。
  - `git diff --check` passed，仅输出 Windows CRLF 提示。
  - 临时截图目录 `tmp/ui-review-theme` 已清理。
- 未做：
  - 未运行 `pnpm build`，本轮是主题 token 调整。
  - 未运行 `pnpm check`，本轮未改类型契约或运行时逻辑。
