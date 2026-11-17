## Chela ASCII 启动动画

时间：2026-05-05 18:20:50

改了什么：
- 新增 `ChelaAsciiBoot` 启动组件，用三段 ASCII 图形组成 Chela 蟹钳启动图案。
- 启动页改为居中展示 ASCII 动画、`Booting Chela` 和启动状态文案。
- 新增 CSS-only 动效：左右钳子开合、主体轻微呼吸、扫描线扫过，并支持 `prefers-reduced-motion`。
- ASCII 字号使用固定值和窄屏断点，避免按 viewport 连续缩放。

为什么改：
- 用户希望 Chela 进入应用时的“正在启动”状态更有产品记忆点，展示一个 Web ASCII 动态启动项。

涉及文件：
- `src/renderer/src/components/assistant-ui/chela-ascii-boot.tsx`
- `src/renderer/src/components/assistant-ui/app-shell-states.tsx`
- `src/renderer/src/styles.css`
- `docs/changes/2026-05-05/changes.md`

结果：
- `pnpm exec tsc --noEmit -p tsconfig.renderer.json --pretty false` 通过。
- `git diff --check` 通过。

## Chela ASCII 启动页预览停留

时间：2026-05-05 18:26:56

改了什么：
- 将 ASCII 蟹钳开合、主体呼吸和扫描线动画整体放慢。
- 应用启动完成后继续停留在启动页，显示 `进入 Chela` 按钮。
- `AppBootingScreen` 和 `ChelaAsciiBoot` 增加 `ready` / `onContinue` 接口，用于启动完成后的预览停留。

为什么改：
- 用户希望先卡在启动页观察动画效果，并继续调整启动页细节。

涉及文件：
- `src/renderer/src/App.tsx`
- `src/renderer/src/components/assistant-ui/chela-ascii-boot.tsx`
- `src/renderer/src/components/assistant-ui/app-shell-states.tsx`
- `src/renderer/src/styles.css`
- `docs/changes/2026-05-05/changes.md`

结果：
- `pnpm exec tsc --noEmit -p tsconfig.renderer.json --pretty false` 通过。
- `git diff --check` 通过。

## Chela 启动页大钳子主视觉

时间：2026-05-05 18:29:33

改了什么：
- 根据用户手绘参考，在启动页中心内容背后新增一个大尺寸蟹钳轮廓。
- 大钳子轮廓使用慢速描边和呼吸动效，中心启动卡片保留 ASCII Chela 信息。
- 调整轮廓 viewBox，让钳子主体包住中心启动卡片。

为什么改：
- 用户期望启动页主视觉是“大钳子包住启动内容”的样子，并减少小型蟹钳 ASCII 对主视觉的干扰。

涉及文件：
- `src/renderer/src/components/assistant-ui/chela-ascii-boot.tsx`
- `src/renderer/src/styles.css`
- `docs/changes/2026-05-05/changes.md`

结果：
- 后续已替换为大号 ASCII 钳子实现，见下一条记录。

## Chela 大号 ASCII 钳子动画

时间：2026-05-05 18:33:28

改了什么：
- 移除启动页的大钳子 SVG 线稿。
- 改为多个大尺寸 `<pre>` ASCII 字符块拼出上钳、下钳、把手和纹理。
- 上钳、下钳、把手和纹理分别使用慢速 CSS transform 动画，形成大号 ASCII 钳子开合效果。
- 中心启动卡片改为简化的 ASCII boot core，避免小钳子和大钳子抢视觉重点。

为什么改：
- 用户明确希望大钳子本身是 ASCII 动画，SVG 线稿背景已移除。

涉及文件：
- `src/renderer/src/components/assistant-ui/chela-ascii-boot.tsx`
- `src/renderer/src/styles.css`
- `docs/changes/2026-05-05/changes.md`

结果：
- `pnpm exec tsc --noEmit -p tsconfig.renderer.json --pretty false` 通过。
- `git diff --check` 通过。

## Chela 圆润蟹钳 ASCII 主体

时间：2026-05-05 19:00:34

改了什么：
- 将启动页大号 ASCII 从分散的上钳、下钳、把手字符块，改为三帧完整蟹钳轮廓。
- 新轮廓参考用户给出的蟹钳图片，强化左侧圆掌、右侧上钳、右侧下钳和钳口小齿。
- 调整 CSS 动画为慢速帧切换，让钳口在张开、半合、夹合之间切换。
- 调整大号 ASCII 的尺寸和移动端规则，让主体在启动页更明显。

为什么改：
- 用户希望启动页主体更接近圆润的大蟹钳形体，并明确要求钳子本体使用 ASCII 动画。

涉及文件：
- `src/renderer/src/components/assistant-ui/chela-ascii-boot.tsx`
- `src/renderer/src/styles.css`
- `docs/changes/2026-05-05/changes.md`

结果：
- `pnpm exec tsc --noEmit -p tsconfig.renderer.json --pretty false` 通过。
- `git diff --check` 通过。

## Chela 中央点阵蟹钳启动页

时间：2026-05-05 19:14:32

改了什么：
- 根据用户提供的 `D:\BroswerDownload\pattern.svg`，新增点阵蟹钳 mask 数据文件。
- 启动页改为渲染中间的点阵蟹钳主体，移除全屏黑底点阵背景。
- 页面背景恢复为 Chela 项目底色，文案层改为轻量项目样式。
- 点阵主体按掌部、上钳、下钳分组，使用慢速 CSS 动画表现轻微开合。

为什么改：
- 用户期望参考 SVG 中间的蟹钳形状，启动页视觉聚焦在中央蟹钳本体。

涉及文件：
- `src/renderer/src/components/assistant-ui/chela-ascii-boot.tsx`
- `src/renderer/src/components/assistant-ui/chela-dot-claw-pattern.ts`
- `src/renderer/src/components/assistant-ui/app-shell-states.tsx`
- `src/renderer/src/styles.css`
- `docs/changes/2026-05-05/changes.md`

结果：
- 后续验证已通过，见“Chela 启动停留移除与 Logo 资产”记录。

## Chela 启动停留移除与 Logo 资产

时间：2026-05-05 19:19:57

改了什么：
- 移除启动完成后的预览停留状态，初始化完成后直接进入主界面。
- 删除启动页 `进入 Chela` 按钮和对应的 ready/onContinue 传参。
- 从用户提供的 `D:\BroswerDownload\pattern.svg` 提取中央蟹钳亮点，生成透明背景 `chela-logo.svg`。
- Logo SVG 保留点阵蟹钳主体，移除黑底和背景散点，适配浅色和深色系统配色。

为什么改：
- 用户确认启动动画效果可用后，希望恢复正常进入主界面流程，并把蟹钳 SVG 沉淀成项目 logo 资产。

涉及文件：
- `src/renderer/src/App.tsx`
- `src/renderer/src/components/assistant-ui/app-shell-states.tsx`
- `src/renderer/src/components/assistant-ui/chela-ascii-boot.tsx`
- `src/renderer/src/styles.css`
- `src/renderer/src/assets/chela-logo.svg`
- `docs/changes/2026-05-05/changes.md`

结果：
- `pnpm exec tsc --noEmit -p tsconfig.renderer.json --pretty false` 通过。
- `git diff --check` 通过。
