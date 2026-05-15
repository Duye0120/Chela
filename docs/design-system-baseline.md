# Design System Baseline

> 更新时间：2026-05-14 18:00 +0800

## 目标

- 以 `src/renderer/src/styles/theme.css` 中的 `Chela` theme token 作为设计 token 单一事实源
- 以 `tailwind.config.ts` 暴露可复用的语义化颜色、圆角、阴影和动效配置
- 保持现有 `shadcn + Tailwind v4 + CSS variables` 技术栈，不额外引入重型设计系统工具链

## 背景

- 用户给出的 [awesome-design-systems](https://github.com/alexpate/awesome-design-systems) 是设计系统案例索引，不是可直接安装的 npm 包
- 当前项目已经具备 `Chela + 语义 token + 深浅主题 + shadcn` 组件基础，更适合补齐本地 baseline，而不是强接外部框架
- 项目现有长期约束已经明确：谨慎使用 border、统一选择态视觉语言、优先用背景层级和留白表达结构
- 2026-05-14 起，默认浅色主题采用 `codex-theme-v1` 方向：白色 surface、`#0d0d0d` ink、`#0169cc` accent、`#00a240` diff added、`#e02e2a` diff removed、`#751ed9` skill

## 当前落地

### Token Source

- `src/renderer/src/styles/theme.css`
- 统一维护颜色、圆角、阴影、焦点态和动效 token
- 以 `Chela` 主题 token 为底座，再补 `selection / focus / shadow / radius / motion` 基础变量，供后续组件复用
- 浅色主题的 accent、selection、focus、browser selection、thinking、primary action 默认走 `#0169cc`
- diff added / removed 默认走 `#00a240` / `#e02e2a`
- skill 语义默认走独立紫色 token：`--chela-skill`、`--chela-skill-bg`、`--chela-skill-text`

### Tailwind Mapping

- `tailwind.config.ts`
- 暴露 `selection-*`、`focus-ring`、`shell-overlay`
- 暴露 `xs/sm/md/lg/xl/pill/shell` 圆角 token
- 暴露 `subtle / flyout / inset-soft` 阴影 token
- 暴露 `fast / base / slow` 动效时长与 `standard / emphasized` easing

### Global Usage

- `src/renderer/src/styles.css`
- 全局 focus ring 改为走语义 token
- 公共按钮 / 状态胶囊的圆角、内阴影、过渡时间改为走 design token
- `Select / ModelSelector / BranchSwitcher` 的选中态统一走 `selection-*` token，而不是各自写死颜色
- 分支切换器与 Context 摘要浮层优先用背景层级和信息分组表达结构，不再堆叠厚边框和盒中盒
- 分支切换器与 Context 浮层的内容卡、输入框和面板圆角统一对齐到 `8px`
- `Context` 详情面板优先收成少量高信息密度分组，不再把每组信息都做成一块独立厚卡

### UI Consistency Contract

- 基础控件圆角统一落在入口组件上，默认使用 `rounded-[var(--radius-shell)]`。
- 状态点、头像、进度环这类天然圆形元素使用 `rounded-full`。
- 新增预览、面板、浮层先复用 `src/renderer/src/components/assistant-ui/surface.tsx`。
- `PreviewSurface` 承载预览容器的圆角、裁切和背景；业务组件只负责内容和交互。
- `Surface tone="panel"` 承载普通控制面，`Surface tone="overlay"` 承载悬浮批注、弹出编辑器和轻量浮层。
- 基础 `Button`、`Badge`、`Select` 负责统一圆角、focus ring、hover、选中反馈；业务组件避免重复写裸色、任意圆角和厚边框。

### Audit Guardrail

- `pnpm audit:ui` 扫描 renderer UI 中的裸色、任意圆角和默认 border。
- 审计输出作为迁移清单使用，每轮 UI 任务按当前范围处理对应项。
- `--strict` 可用于把现有漂移收敛完成后的阻断式检查。

## 使用规则

- 新组件默认优先使用语义 token，不直接写新的裸色值、阴影值和过渡曲线
- 选择态优先复用 `selection-bg / selection-fg / selection-muted-bg`
- 浮层优先复用 `shadow-flyout`，轻表面优先复用 `shadow-subtle`
- 输入、按钮、标签等轻量控件优先通过背景分层表达层级，不新增重边框
- 若已有 `Chela` 控件 token 可表达同一语义，优先复用 `Chela`，不要再发明第二套颜色系统
- 新 UI 面板和 preview 容器优先使用 `Surface` / `PreviewSurface`
- UI 交付前运行 `pnpm audit:ui`，记录本轮处理项和剩余漂移规模

## 暂不引入

- 不引入 `storybook`、`style-dictionary`、`figma token sync` 等额外工具链
- 不做大规模组件视觉重写
- 不改现有聊天链路交互行为
