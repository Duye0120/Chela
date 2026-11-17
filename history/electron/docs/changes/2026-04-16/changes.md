# 2026-04-16 变更记录

## 模型目录即时刷新

**时间**: 11:42

### 改了什么

1. 给 renderer 侧的 provider directory 缓存补了失效与广播机制。
2. 模型配置页保存、删除 provider 或模型条目后，会主动广播“模型目录已更新”。
3. 设置页和首页线程里的模型选择器都订阅这个广播，并强制重载最新模型目录。

### 为什么改

- 用户在模型配置页新增模型后，希望设置页和首页的模型选择器立刻同步。
- Electron 桌面壳没有面向用户的刷新入口，模型目录需要在保存后立即生效。

### 涉及文件

- `src/renderer/src/lib/provider-directory.ts`
- `src/renderer/src/components/assistant-ui/settings-view.tsx`
- `src/renderer/src/components/assistant-ui/settings/keys-section.tsx`
- `src/renderer/src/components/assistant-ui/thread.tsx`

### 结果

- 新增、删除、启用或禁用模型条目后，设置页和首页的模型下拉都会即时刷新。

## Diff Panel 工具模型提交生成链路

**时间**: 09:55-13:13

### 改了什么

1. 修正了 diff-panel 生成按钮的可用条件，并补上面板内可见错误提示。
2. 提交信息生成链路改成读取 `.agents/skills/commit/SKILL.md`，优先使用工具模型，失败后回退聊天模型。
3. 生成上下文补充了当前分支、最近一次提交标题和实际 diff。
4. main 进程提交链路改成按选中文件执行 `git add -- <paths>` 再提交，提交失败会在面板内直接报错。
5. 解析逻辑兼容 JSON、标签式标题/描述、heading 和列表前缀。
6. 当模型只返回 `thinking` 或空文本时，主进程会先做二次收束，再回退到本地启发式兜底。
7. 标题、说明、按钮和 tooltip 文案统一成中文，标题输入框支持自动换行和自动增高。
8. 上下文摘要里的 `词元` 统一改成 `token`。

### 为什么改

- 用户要求 commit 生成遵循 `.agents/skills/commit`，并由工具模型承担这类杂活。
- 原链路里存在静默失败、空响应、解析过严、选中文件范围未进入主进程的问题。
- diff-panel 中文界面里混用英文按钮和占位文案，理解成本偏高。

### 涉及文件

- `src/main/worker-service.ts`
- `src/main/ipc/worker.ts`
- `src/main/git.ts`
- `src/main/providers.ts`
- `src/shared/contracts.ts`
- `src/preload/index.ts`
- `src/main/ipc/workbench.ts`
- `src/renderer/src/components/assistant-ui/diff-panel.tsx`
- `src/renderer/src/components/ui/commit-description-editor.tsx`
- `src/renderer/src/components/assistant-ui/context-summary-trigger.tsx`

### 结果

- diff-panel 的提交信息生成已经稳定接入 commit skill，工具模型异常时也会继续给出可用结果。
- 提交动作会按当前勾选文件执行，错误会直接反馈到面板里。
- 中文文案和标题展示行为已经统一。

## 右侧工作区布局改造

**时间**: 13:12-17:18

### 改了什么

1. 把线程页的 Diff 抽屉改成右侧工作区布局，状态升级为正式的 `rightPanel` 结构。
2. 宽屏场景下，右侧工作区和聊天区进入同一个壳层；窄屏场景继续保留抽屉回退。
3. 修复了 `panelWidth`、拖拽回调和窗口扩宽的运行时引用问题。
4. 打开 Diff 时主窗口会向右扩宽，关闭时恢复原始 bounds；连续点击时增加了互斥保护。
5. 中间分割线改成只调内部比例，不再同步修改主窗口总宽。
6. 右侧工作区改成 panel-only，刷新后继续按 panel 恢复；显隐只影响 content 区，不联动 `session_list`。
7. sidebar 拖拽只记录宽度，折叠继续只由左上角按钮和 `Ctrl+B` 控制。
8. 双栏打开态下恢复两侧圆角，并修复 `shell-main` 左侧内容列未撑满导致的底部空白。

### 为什么改

- 用户希望 Diff 工作区像 IDE 侧边区一样从右侧展开，并为后续浏览器等功能预留统一容器。
- 当前实现里存在重复扩宽、布局回弹、刷新退回抽屉、sidebar 体验生硬等问题。

### 涉及文件

- `src/renderer/src/App.tsx`
- `src/renderer/src/components/assistant-ui/diff-panel.tsx`
- `src/shared/contracts.ts`
- `src/shared/ipc.ts`
- `src/preload/index.ts`
- `src/main/ui-state.ts`
- `src/main/window.ts`
- `src/main/ipc/window.ts`
- `src/main/ipc/workbench.ts`

### 结果

- Diff 已经稳定进入右侧 panel 工作区。
- 右侧显隐、窗口扩宽、内部比例拖拽和 sidebar 交互都更接近预期。

## Diff 工作区草稿保留与首次打开填充

**时间**: 15:42

### 改了什么

1. 给 Diff 工作区增加了挂载外草稿状态，保留提交标题、描述、布局、视图、来源、活动文件和分栏尺寸。
2. 右侧 dock 打开过渡阶段提前渲染占位宽度，首次打开时直接填满新增区域。
3. Diff 内容区边距收紧，让内容更贴合容器。

### 为什么改

- 用户希望关闭再打开时，已经生成的内容继续保留。
- 首次打开时，右侧容器边缘还有细小空隙，视觉上像没有撑满。

### 涉及文件

- `src/renderer/src/components/assistant-ui/diff-panel.tsx`
- `src/renderer/src/App.tsx`

### 结果

- 已生成内容会跟随工作区草稿继续保留。
- 首次打开右侧工作区时，新增区域会直接填满。

## Diff Panel 分组提交计划

**时间**: 18:36-19:44

### 改了什么

1. 新增 `workerGenerateCommitPlan` IPC 和 `generateCommitPlan` worker 能力，按 `.agents/skills/commit` 规则生成多组提交计划。
2. 分组计划结果支持 `title / description / filePaths / reason`，主进程会校验文件覆盖率并为缺失文件补兜底分组。
3. diff-panel 的底部提交区改成提交计划卡片，只在点击生成时分析当前勾选文件。
4. 每组计划都支持编辑标题、说明、暂存本组、提交本组；提交成功后会立刻从列表里移除。

### 为什么改

- 用户希望 diff-panel 的提交体验对齐 `/commit` 的分组提交流程，不再把所有文件揉成一个模糊提交。
- 选中文件、计划分组、逐组提交三件事需要在同一个面板里被直接看见和控制。

### 涉及文件

- `src/shared/contracts.ts`
- `src/shared/ipc.ts`
- `src/preload/index.ts`
- `src/main/ipc/worker.ts`
- `src/main/worker-service.ts`
- `src/renderer/src/components/assistant-ui/diff-panel.tsx`

### 结果

- diff-panel 已经支持按当前勾选文件生成分组提交计划。
- 每组计划都能独立编辑、暂存和提交，已提交项会自动退出计划列表。

## Diff Panel 提交计划 UI 文案与样式收口

**时间**: 19:02-19:37

### 改了什么

1. 去掉了提交计划面板里的批量 `全部暂存` 和 `依次提交全部` 按钮，保留逐组动作。
2. 把提交计划容器、卡片、输入区和焦点态对齐到全局控制面板样式。
3. “未生成计划”区域改成轻提示条，提示稳定显示为两行。
4. 空提示第二行文案改成“计划会按当前勾选的文件生成”。
5. 标题信息拆成独立头部行，标题输入框独占整行宽度。
6. 标题输入框支持自动增高，文件路径标签改成更克制的面板标签样式并在超长路径时截断。
7. 给标题、说明和文件跳转按钮补了可访问性标签。

### 为什么改

- 用户希望这块 UI 保持更轻、更清楚的层级，避免重复操作和粗糙的表单堆叠。
- 空提示块、标题宽度和标题截断都直接影响观感。

### 涉及文件

- `src/renderer/src/components/assistant-ui/diff-panel.tsx`

### 结果

- 提交计划区的主次已经更清楚。
- 空提示、标题输入和卡片结构都更接近全局 UI 风格。

## Diff Panel 自动刷新自激修复

**时间**: 19:56

### 改了什么

1. 去掉了 `DiffWorkbenchContent` 内部“`overview` 为空时自动 `onRefresh()`”的 effect。
2. 刷新职责统一留在 `App` 上层的 Git 概览刷新链路。

### 为什么改

- 右侧 panel 打开时，上层已经会自动拉取 Git 概览。
- `diff-panel` 内部再补一层空态自动刷新，会和上层形成重复触发，表现成疯狂刷新。

### 涉及文件

- `src/renderer/src/components/assistant-ui/diff-panel.tsx`

### 结果

- 进入 diff-panel 时只走一套刷新链路，不再重复自激。

## Diff Panel 打开态刷新节流收口

**时间**: 20:18

### 改了什么

1. 把 `App` 里 diff-panel 的自动刷新 effect 改成“关闭到打开”沿触发。
2. 打开态期间改用 ref 锁住自动刷新，面板内部重渲染、尺寸变化和普通状态更新都不会再次触发 Git 概览请求。

### 为什么改

- 右侧 panel 打开后，聊天区和工作区还会持续发生布局与状态更新。
- 自动刷新跟随渲染周期会让 Git 概览请求被反复拉起，体验上就是面板一开就疯狂刷新。

### 涉及文件

- `src/renderer/src/App.tsx`

### 结果

- diff-panel 现在只会在每次打开时自动刷新一次。
- 后续刷新入口只保留用户主动点击刷新，或显式的 Git 状态变更回调。

## Electron 控制台告警收口

**时间**: 20:46

### 改了什么

1. 把 `webContents.on("console-message")` 改成 Electron 41 的事件对象签名。
2. 日志级别映射改成字符串级别，继续保留 `warning` 和 `error` 两档。
3. 给 PostCSS 链路补了 `from` 兜底插件，缺省场景下会回填当前 CSS 输入路径。

### 为什么改

- Electron 41 已经把旧的 `console-message` 多参数签名标记为废弃。
- Tailwind v4 的 PostCSS 插件在缺少 `from` 时会触发开发期 warning，终端噪音很重。

### 涉及文件

- `src/main/logger.ts`
- `postcss.config.cjs`

### 结果

- Electron 控制台废弃提示会消失。
- PostCSS 的 `from` warning 会被收口，终端输出更干净。

## Diff Panel 文件列表折叠展示

**时间**: 21:04

### 改了什么

1. 提交计划卡片里的文件标签改成默认展示前 4 个。
2. 文件数量超过 4 个时，底部增加“展开其余 N 个文件 / 收起文件列表”的轻量开关。

### 为什么改

- 现在每天的改动会合并进单日 `changes.md`，同一组提交里出现很多文件是常态。
- 文件标签全部铺开会把卡片高度拉得很长，浏览和编辑标题都很吃力。

### 涉及文件

- `src/renderer/src/components/assistant-ui/diff-panel.tsx`

### 结果

- 提交计划列表的默认高度更稳定。
- 文件多的时候依然可以展开查看完整列表。

## Diff Panel 空态垂直居中

**时间**: 21:10

### 改了什么

1. 把 Diff 主内容区的两种空态包进 `flex-1` 居中容器。
2. 空态卡片现在会在内容区剩余高度里垂直居中显示。

### 为什么改

- 当前没有改动时，空态卡片贴在顶部，右侧大片留白显得很飘。
- 空态信息属于主内容反馈，居中后视线落点更稳定。

### 涉及文件

- `src/renderer/src/components/assistant-ui/diff-panel.tsx`

### 结果

- “暂无改动”和“来源为空”两种状态都会在右侧内容区中间展示。

### 补充修正

- 清掉了 `src/renderer/src/components/assistant-ui/diff-panel.tsx` 顶部重复的 `useState` 导入，恢复 Vite 编译通过。

## Diff Panel 批量提交按钮

**时间**: 21:22

### 改了什么

1. 在提交计划头部新增了图标按钮，tooltip 文案为“依次提交全部”。
2. 当计划组数大于 1 时，按钮会按当前卡片顺序逐组提交。
3. 批量提交流程会展示 `n / total` 进度，失败时停在当前组，成功组会继续从列表移除。

### 为什么改

- 多组计划时逐个点“提交本组”操作偏重，批量场景体验会断。
- 头部图标按钮更轻，和当前工具位风格一致。

### 涉及文件

- `src/renderer/src/components/assistant-ui/diff-panel.tsx`

### 结果

- 提交计划区现在支持一键顺序提交全部分组。

## Sidebar 收起后无法展开修复

**时间**: 21:31

### 改了什么

1. 修正了侧栏展开时的 `panel.resize` 入参格式。
2. 展开侧栏时，恢复宽度现在明确按百分比字符串写回。

### 为什么改

- `react-resizable-panels` 的 `panel.resize(number)` 会按像素处理。
- 侧栏历史宽度在当前实现里存的是百分比数值，直接传 `18` 会被当成 `18px`，视觉上就像完全没有展开。

### 涉及文件

- `src/renderer/src/App.tsx`

### 结果

- 现在通过左上角按钮和 `Ctrl+B` 都能把侧栏正常展开回原宽度。
