## Runtime Diagnostics Display Harness

- 时间：2026-06-05 12:43 +0800
- 改了什么：
  - 新增 Runtime Diagnostics 展示模型纯函数，覆盖状态文案、状态色、服务排序、详情优先级、详情截断和汇总项构造。
  - System 设置页 Runtime Diagnostics 组件改为复用展示模型，保留原有 UI 结构和只读健康状态展示。
  - 新增 `tests/runtime-diagnostics-display-regression.test.ts`，并纳入 `test:regression` 脚本。
- 为什么改：把浏览器手工验证过的 Runtime Diagnostics 展示规则收进自动化 harness，降低模型输出或后续 UI 改动造成状态误读的风险。
- 涉及文件：
  - `src/renderer/src/lib/runtime-diagnostics-display.ts`
  - `src/renderer/src/components/assistant-ui/settings/runtime-diagnostics-section.tsx`
  - `tests/runtime-diagnostics-display-regression.test.ts`
  - `tests/package-scripts-regression.test.ts`
  - `package.json`
- 验证结果：
  - `pnpm exec tsx tests/runtime-diagnostics-display-regression.test.ts`
  - `pnpm exec tsx tests/runtime-diagnostics-regression.test.ts`
  - `pnpm exec tsx tests/package-scripts-regression.test.ts`
  - `pnpm exec tsc --noEmit -p tsconfig.renderer.json --pretty false`
  - `rg --files -g *.py` 没有输出，当前仓库没有 Python 文件。
- 未做：
  - 未运行 `pnpm build` / `pnpm check`，原因是本轮只改 Runtime Diagnostics 展示模型和 targeted 回归入口，仓库规则要求优先最小验证。

## 统一控件圆角与开关阴影

- 时间：2026-06-05 13:33 +0800
- 改了什么：
  - 新增 `--radius-control`、`--radius-panel`、`--radius-popover`，并让 `--radius-shell` 保持 6px 基础圆角。
  - `Switch` 轨道和 thumb 改为天然圆形并移除控件自身阴影，保留低对比边界和 `focus-visible` 反馈。
  - `Checkbox`、`Button`、`Select`、`Tabs` 和设置页共享输入/卡片改用语义圆角 token。
  - `Badge` / tag 基础组件改用 `--radius-control`，默认和次级状态移除控件阴影。
  - 模型设置页手动模型 `Manual` 标签对齐 `--radius-control`，移除标签阴影。
  - `scripts/audit-ui-consistency.ts` 放行新的 Chela 圆角 token 和 Switch 的天然圆形用法。
- 为什么改：统一基础控件圆角，并去掉设置页开关和标签外圈阴影造成的盒感。
- 涉及文件：
  - `src/renderer/src/styles/theme.css`
  - `src/renderer/src/components/ui/switch.tsx`
  - `src/renderer/src/components/ui/checkbox.tsx`
  - `src/renderer/src/components/ui/button.tsx`
  - `src/renderer/src/components/ui/tabs.tsx`
  - `src/renderer/src/components/ui/badge.tsx`
  - `src/renderer/src/components/assistant-ui/select.tsx`
  - `src/renderer/src/components/assistant-ui/settings/shared.tsx`
  - `src/renderer/src/components/assistant-ui/settings/keys-section.tsx`
  - `scripts/audit-ui-consistency.ts`
- 验证结果：
  - `pnpm audit:ui`
  - `pnpm exec tsc --noEmit -p tsconfig.renderer.json --pretty false`
- 未做：
  - 未运行 `pnpm build` / `pnpm check`，原因是本轮只改 renderer 控件样式和 UI 审计规则，仓库规则要求优先最小验证。

## Model Provider Settings Autosave

- 时间：2026-06-05 13:29 +0800
- 改了什么：
  - 模型提供商设置页新增 3 秒自动保存，Base URL、API Key、提供商信息和模型条目修改会在静默期后保存。
  - “测试连接”和“拉取模型列表”在当前配置已修改时会先保存当前输入，再发起测试或拉取请求。
  - 手动新增模型条目仍停留在 `new-model-id` 或空模型 ID 时暂停自动保存，并禁用测试、拉取和立即保存入口。
  - 新增 `tests/provider-autosave-ui-regression.test.ts`，并纳入 `test:regression` 脚本。
- 为什么改：模型列表拉取依赖 main 进程里持久化的 provider credentials；用户刚输入的新 API Key 需要先落盘，才能被拉取模型请求读取。
- 涉及文件：
  - `src/renderer/src/components/assistant-ui/settings/keys-section.tsx`
  - `src/renderer/src/components/assistant-ui/settings/keys-section-model.ts`
  - `tests/provider-autosave-ui-regression.test.ts`
  - `tests/package-scripts-regression.test.ts`
  - `package.json`
- 验证结果：
  - `pnpm exec tsx tests/provider-autosave-ui-regression.test.ts`
  - `pnpm exec tsx tests/package-scripts-regression.test.ts`
  - `pnpm exec tsc --noEmit -p tsconfig.renderer.json --pretty false`
- 未做：
  - 未运行 `pnpm build` / `pnpm check`，原因是本轮只改模型设置页 autosave 和 targeted 回归入口，仓库规则要求优先最小验证。
