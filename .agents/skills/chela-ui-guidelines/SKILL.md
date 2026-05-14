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
