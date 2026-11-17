---
name: chela-ui-guidelines
description: Use when changing Chela renderer UI, visual hierarchy, color tokens, selection states, rounded corners, borders, shadcn components, settings pages, diff panels, or React UI performance.
---

# Chela UI Guidelines

## 视觉层级

- Chela UI 默认谨慎使用 border，优先用背景色、明度、留白、分组和排版表达层级。
- 只有信息分区、可点击边界、输入区域、错误态等确有必要时才加 border。
- 必须使用 border 时，采用低对比轻描边，避免页面变成一堆边框盒子。
- 不要习惯性给开关、轻量按钮、标签、小型状态控件再套描边容器。

## 圆角

- UI 控件默认沿用项目 token，例如 `rounded-[var(--radius-shell)]`。
- 轻量按钮、下拉触发器、分支切换器也要使用统一圆角。
- 只有头像、进度环、状态点这类天然圆形元素才使用 `rounded-full`。

## 颜色 token

- 改颜色前先确认现有 token 的语义，优先复用已有 token。
- 同一界面、同一层级、同一语义的控件使用同一背景 / 文本 / hover token。
- 新增或调整颜色时，先归类为 shell、composer、control、selection、status、accent、message 等语义层。
- 只有确实存在新的 UI 语义时才新增 token，并说明用途、适用范围、不要和哪些现有 token 混用。
- 目标是减少同语义多 token、同层级多背景和散落硬编码颜色。

## 共享 primitives

- 新增面板、预览、浮层、控制面时先复用 `src/renderer/src/components/assistant-ui/surface.tsx`。
- 预览区域默认用 `PreviewSurface`，浮层默认用 `Surface tone="overlay"`，普通控制面默认用 `Surface tone="panel"`。
- 基础按钮、徽标、选择器这类入口组件必须承载圆角、焦点、hover、选中态的一致性，业务组件只传语义和内容。

## 选择态

- 下拉、列表、分支切换、模型选择等“已选中”状态，优先复用项目已有选中底色和反馈方式。
- 同一界面里不要发明多套选中色、选中徽标或强调色。
- 聊天区新增选择态时，默认对齐模型选择器已有选中底色。

## 审计流程

- UI 改动前先用 `pnpm audit:ui` 看漂移位置，按本次范围挑选样板修复点。
- 审计发现优先分批处理：先基础 primitives，再高频面板，再低频页面。
- 审计输出是迁移清单，局部任务只修本轮责任范围，避免一次性大面积改动。

## 表现和性能

- UI 改动同时关注观感、交互清晰度和运行性能。
- 不接受只提升视觉而牺牲渲染稳定性、响应速度或列表滚动性能的实现。
- 高频界面优先稳定 selector、减少无意义重渲染、控制派生对象创建。
- 改 React 组件时，优先贴合现有组件边界，不为了样式小改引入大范围重构。

## 间距与按钮防粘连

- 同组独立按钮、图标按钮、输入框与操作按钮之间默认 `gap/sm`（8px / `--chela-gap-sm`）；按钮内 padding 不能替代按钮外间距。
- 不同操作组、表单行、内容到页脚操作使用 `gap/lg`（16px）；内容区块之间使用 `gap/xl`（24px）。标签与输入框、帮助文字与输入框使用 4px。
- 带独立悬浮底色的模型与思考强度选项行使用 8px 间距；连续菜单可按现有组件使用 0–4px，不能据此把独立按钮贴在一起。分段控件明确采用连接结构时除外。
- Figma 用 Auto Layout 的 gap/padding 并绑定现有变量；代码用父容器 flex/grid gap，避免与子元素 margin 重复叠加。窄宽换行后保留 8px 行距，不能将间距压成 0。
- 同排同类控件等高，默认/hover/selected 不改变尺寸和间距；图标与文字内部默认 8px，紧凑短标签可用 4px。
- 视觉依据：Figma 基础规范「02B · 间距落地规范」，节点 `297:5`（文件 `COT3jrWrT1ZzmhfsuY7LR7`）。

## 基础组件成套维护

- UI 尺寸、字号、图标和间距以用户实际验收为准；未验收前不把统一数值写成全应用默认，也不批量套用到所有页面。先在用户正在调整的页面确认组合效果，再决定共用组件的规范。
- 字体设置沿用用户已确认的 T3 Code 结构：界面、代码、终端三组独立字体与字号，带即时的界面文字、彩色代码 Diff、终端预览；字体支持检索本机字体。不能退回只有输入框或没有颜色的静态样例。
- Select 弹层至少与触发器等宽，文本较长时按内容扩展并受视口约束；宽度计算包含内边距和勾选图标，不能靠逐字换行掩盖空间不足。交付前在实际 Electron 中展开字体、字号菜单核对。

- 基础表单按 Button / Input / Select / Checkbox / Radio / Switch 成套设计与复核，不只补用户刚指出的单个画面。新增或修改组件时检查完整值状态与 default / hover / pressed / focus / disabled 的适用组合。
- Checkbox 包含未选、已选、半选；Radio 同组互斥；Switch 包含关闭、开启。禁用保留值标记且无交互；hover 不改变值，状态变化不改变尺寸和间距。
- 组件状态矩阵之外，要在同一表单中组合检查字号、颜色、行高、标签对齐、帮助文字、焦点与操作间距。设计源用共享组件，页面用实例，避免每页重新画一套。
- Figma 六类基础表单组合稿：文件 `COT3jrWrT1ZzmhfsuY7LR7`，节点 `307:1105`。已完成设计规范不代表所有业务页面代码已符合；交付明确区分设计覆盖、原型验证与实际应用修复。
