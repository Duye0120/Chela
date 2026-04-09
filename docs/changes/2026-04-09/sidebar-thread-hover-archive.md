# 侧边栏线程悬浮归档交互重构

- 时间：2026-04-09 16:20
- 原因：线程项旧的悬浮菜单在鼠标移出再移回时容易再次展开，交互太飘，不像 Codex 这种稳一点的列表操作。
- 改了什么：
  - 把线程项悬浮操作改成左侧固定操作图标、右侧归档图标。
  - 点击右侧归档图标后，原地切成 `确认` 按钮，再点才真正归档。
  - 保留原来的重命名/分组能力，改成点左侧操作图标后再展开，不再靠悬浮直接冒出来。
  - 补了隐藏态禁点和拖拽时自动收起，避免误触。
- 涉及文件：
  - `src/renderer/src/components/assistant-ui/sidebar.tsx`
  - `docs/changes/2026-04-09/sidebar-thread-hover-archive.md`

## 补充调整

- 时间：2026-04-09 16:29
- 原因：右侧时间和归档应该共用同一个最右槽位，icon 也不能太抢位置。
- 改了什么：
  - 去掉左右 icon 的悬浮底色，只保留由浅到深的颜色反馈。
  - 右侧默认显示时间，悬浮后直接切成归档 icon，不再同时占位。
  - 左右 icon 都缩到更紧的尺寸，减少标题被挤压。
- 涉及文件：
  - `src/renderer/src/components/assistant-ui/sidebar.tsx`
  - `docs/changes/2026-04-09/sidebar-thread-hover-archive.md`

## 继续调整

- 时间：2026-04-09 16:42
- 原因：归档确认不该把行高撑高；左侧图标应负责置顶，其他操作改成右键菜单更顺手。
- 改了什么：
  - 归档确认改成右侧绝对定位浮层，不再挤高线程行。
  - 左侧 `pin` 图标改成真正的置顶开关，并补上会话 `pinned` 持久化。
  - 线程菜单改成右键触发，保留重命名和分组。
  - 置顶后的线程按“置顶优先、再按更新时间”排序。
- 涉及文件：
  - `src/renderer/src/components/assistant-ui/sidebar.tsx`
  - `src/renderer/src/App.tsx`
  - `src/shared/contracts.ts`
  - `src/shared/ipc.ts`
  - `src/preload/index.ts`
  - `src/main/index.ts`
  - `src/main/store.ts`
  - `src/main/session/service.ts`
  - `docs/changes/2026-04-09/sidebar-thread-hover-archive.md`

## 小回归修正

- 时间：2026-04-09 16:49
- 原因：置顶后左侧图标常驻占位，导致标题和时间一直错位，看起来像“时间丢了”。
- 改了什么：
  - 左侧置顶图标恢复成仅在 hover / focus 时出现。
  - 置顶状态只影响排序，不再永久占住左侧位置。
- 涉及文件：
  - `src/renderer/src/components/assistant-ui/sidebar.tsx`
  - `docs/changes/2026-04-09/sidebar-thread-hover-archive.md`

## 固定区位置修正

- 时间：2026-04-09 16:55
- 原因：固定线程应该独立放在线程列表上方，不该继续混在线程区内部。
- 改了什么：
  - 新增顶部固定区，所有 `pinned` 线程单独显示在“线程”标题上面。
  - 普通线程区改成只渲染未固定线程，避免重复出现。
- 涉及文件：
  - `src/renderer/src/components/assistant-ui/sidebar.tsx`
  - `docs/changes/2026-04-09/sidebar-thread-hover-archive.md`

## 顶部布局收紧

- 时间：2026-04-09 17:02
- 原因：`新线程` 入口太亮太重，抢过了列表本身，不像 Codex 那种轻一点的侧栏节奏。
- 改了什么：
  - `新线程` 从高亮主按钮改成轻量行按钮，只保留 hover 背景反馈。
  - 收紧顶部与固定区间距，让顶部布局更接近 Codex 的纵向节奏。
- 涉及文件：
  - `src/renderer/src/components/assistant-ui/sidebar.tsx`
  - `docs/changes/2026-04-09/sidebar-thread-hover-archive.md`

## 新线程图标替换

- 时间：2026-04-09 17:07
- 原因：`新线程` 的加号太像普通新增，不像“新开一条对话/草稿”的语义。
- 改了什么：
  - 把 `新线程` 图标从 `Plus` 换成更接近 Codex 语义的 `PencilSquare`。
  - 不额外引新 icon 库，继续复用项目现有 `heroicons`，避免无必要增实体。
- 涉及文件：
  - `src/renderer/src/components/assistant-ui/sidebar.tsx`
  - `docs/changes/2026-04-09/sidebar-thread-hover-archive.md`

## 新线程图标二次调整

- 时间：2026-04-09 17:10
- 原因：上一版 `heroicons` 还是偏钝，不够像 Codex 那种干净利落的线性图标。
- 改了什么：
  - 改用项目已安装的 `lucide-react`。
  - `新线程` 图标换成 `SquarePen`，线条更轻，语义也更接近“新建草稿 / 新开线程”。
- 涉及文件：
  - `src/renderer/src/components/assistant-ui/sidebar.tsx`
  - `docs/changes/2026-04-09/sidebar-thread-hover-archive.md`

## 分组悬浮新建线程

- 时间：2026-04-09 17:18
- 原因：分组 hover 态需要像 Codex 一样，右侧直接给“在该分组中开新线程”的快捷入口。
- 改了什么：
  - 分组 hover 时右侧显示 `...` 和新建线程 icon。
  - 点击新建 icon 后，直接在当前分组里创建新线程并切过去。
  - tooltip 改成 `在 {分组名} 中开始新线程`。
- 涉及文件：
  - `src/renderer/src/components/assistant-ui/sidebar.tsx`
  - `src/renderer/src/App.tsx`
  - `docs/changes/2026-04-09/sidebar-thread-hover-archive.md`

## 侧栏 tooltip 补齐

- 时间：2026-04-09 17:23
- 原因：侧栏纯 icon 按钮只有 hover 态没有 tooltip，交互信息太黑盒。
- 改了什么：
  - 给线程置顶、线程归档、分组新建、分组操作、分组内新线程补上真正的 tooltip。
  - 不再只靠原生 `title`。
- 涉及文件：
  - `src/renderer/src/components/assistant-ui/sidebar.tsx`
  - `docs/changes/2026-04-09/sidebar-thread-hover-archive.md`

## Tooltip 颜色统一

- 时间：2026-04-09 16:58
- 原因：tooltip 是橙底，右键菜单是白底，同一块侧栏里出现两套浮层颜色，割裂。
- 改了什么：
  - 全局 tooltip 改成和菜单一致的浅色面板底。
  - 文字也跟着切到侧栏正文色，避免继续像强调按钮。
- 涉及文件：
  - `src/renderer/src/components/ui/tooltip.tsx`
  - `docs/changes/2026-04-09/sidebar-thread-hover-archive.md`

## 侧栏收起展开

- 时间：2026-04-09 17:19
- 原因：需要像 Codex 一样快速收起 / 展开 sidebar，给主内容更大空间。
- 改了什么：
  - 给侧栏面板加了真正的 collapse / expand。
  - 左上角新增切换按钮；收起后按钮留在主区左上角，方便再展开。
  - 补了 `Ctrl+B` 快捷键和 tooltip。
  - 给展开态侧栏留了顶部空位，避免按钮压到第一行内容。
- 涉及文件：
  - `src/renderer/src/App.tsx`
  - `docs/changes/2026-04-09/sidebar-thread-hover-archive.md`

## 侧栏按钮位置修正

- 时间：2026-04-09 17:29
- 原因：收起/展开按钮不该挂在 sidebar 或 content 自己内部，而该挂在整个 layout 左上角。
- 改了什么：
  - 去掉面板内部的两处按钮。
  - 改成 layout 级绝对定位按钮，统一固定在左上角。
  - 收起和展开都复用同一个位置，只切换 icon。
- 涉及文件：
  - `src/renderer/src/App.tsx`
  - `docs/changes/2026-04-09/sidebar-thread-hover-archive.md`

## 侧栏按钮改到窗口左上角

- 时间：2026-04-09 17:34
- 原因：按钮应该挂在整个窗口 layout 左上角，不该跟随内容区那层定位。
- 改了什么：
  - 把侧栏切换按钮提到 `main` 根层绝对定位。
  - 移除原来内容层那颗按钮。
  - 去掉侧栏顶部为了让按钮让位的额外 padding。
- 涉及文件：
  - `src/renderer/src/App.tsx`
  - `docs/changes/2026-04-09/sidebar-thread-hover-archive.md`

## 侧栏按钮点击修正

- 时间：2026-04-09 17:39
- 原因：按钮虽然挪到左上角了，但被标题栏拖拽层盖住，hover 和 click 都失效。
- 改了什么：
  - 把侧栏切换按钮正式并入 `TitleBar` 组件。
  - 按钮放进 `no-drag` 可交互区域，恢复 hover 和 click。
  - `App` 只负责传递折叠状态和切换动作，不再自己浮一颗按钮。
- 涉及文件：
  - `src/renderer/src/components/assistant-ui/title-bar.tsx`
  - `src/renderer/src/App.tsx`
  - `docs/changes/2026-04-09/sidebar-thread-hover-archive.md`
