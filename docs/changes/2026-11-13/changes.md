## WebView 前端开发约定

2026-11-13，在项目 `AGENTS.md` 的 Skill 路由中加入 `modern-web-guidance`，用于前端实现前查询指南和交付前核对。

## Chela 原生桌面壳

2026-11-13，在 `codex/chela-figma-restart` 从 `main` 的 `3bc4297` 新建 Go/MyGo 主窗。Windows 使用系统 WebView2 加载嵌入 EXE 的 React、TypeScript 和 Vite 产物。窗口只显示壳层，五个工作区预留业务内容。

按 [Figma 对话主窗](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=161-7845) 和 [Dock 规范](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=186-23827) 实现 36 px 顶栏、可收起侧栏、48 px 底部 Dock 和 64 px 侧停靠。Chela 头像打开系统菜单，布局偏好保存在本机 WebView 配置。尚未接入的菜单项显示为禁用。

在项目根目录运行 `npm run dev` 启动壳，`npm run shell:build` 生成 `native/bin/Chela.exe`。这两个入口都先用 Vite 打包当前前端。原 Electron 开发入口为 `npm run dev:electron`。

Windows 隔离配置实测已打开独立 EXE，检查了默认布局、Dock 路由、系统菜单、左侧停靠、侧栏收起、最大化、还原和退出。业务页面、Pi、桌宠和生产安装包不在本次验收范围。

## 整理文档与历史资料

2026-11-13，根 README 改为当前桌面壳的开发入口。旧 README、规格、方案和此前的变更记录迁至 [history/electron](../../../history/electron/)，沿用原目录关系。散落在根目录的样稿、截图、检查输出与测试构建集中到 [history/artifacts](../../../history/artifacts/)。[归档索引](../../../history/README.md)列出了查找入口。

## 归档 Electron 工作台

2026-11-13，旧工作台的源码、测试、脚本、静态资源、vendor、构建配置和依赖清单归入 `history/electron/`，旧构建输出随目录保留在本机。根项目使用桌面壳自己的前端依赖和 pnpm 锁文件。`npm run build` 已生成 Windows 可执行文件；从根目录执行 `npm run dev` 后，WebView2 实际显示对话工作区，点击 Dock 成功切换到看板，关闭窗口后进程正常退出。

## React 基础组件和设计 token

在现有 Vite + React + TypeScript 入口接入 Radix Primitives。窗口按钮、Dock 和侧栏开关共用 IconButton，系统菜单使用 Radix 的键盘导航、浮层定位和单选子菜单。[组件使用说明](../../../native/frontend/src/ui/README.md) 列出按钮、输入框、多行输入、菜单和浅色主题 token。Windows WebView2 已实测右键打开、左侧停靠、Esc 收起和键盘进入子菜单，前端类型检查与 EXE 构建通过。输入控件暂未接入业务表单。

## 下拉选择、侧栏组件与通用 token

2026-11-13，补齐 Figma 的 98 个 Semantic 变量和 17 个 Window 变量。新增表单 Select、菜单单选组、侧栏与展开开关、折叠分组、列表行、搜索输入和状态标签。桌面壳复用侧栏，停靠位置菜单复用单选组。修正菜单调用方样式覆盖、菜单键盘焦点、字段边界和提示文字的对比度。

前端类型检查通过。用组件渲染结果核对了默认选项、表单属性、展开状态、侧栏关联、搜索输入和状态文字，另以脚本核对了变量覆盖、CSS 引用及明暗两套颜色的对比度。本轮未做 WebView2 实机验证。业务组合组件和主题预设的接入范围见[组件清单](../../../native/frontend/src/ui/README.md)。

## Figma 共用组合组件

2026-11-13，按「09 · 共用组件」新增模型与推理强度选择、权限选择、会话行操作与重命名、设置子导航。组件通过回调接收业务行为。本轮未改页面、路由或批准策略。新增 Radix Popover、Context Menu、Tabs 依赖，并记录调用约定。

类型检查通过。在独立的无头 Edge 样例实测模型搜索、收藏、跨模型强度回退、快速模式、嵌套权限选择、更多与右键菜单、键盘菜单、会话重命名确认与取消、失败重试、IME 合成事件防误提交、设置页签键盘导航和窄窗口浮层边界。核对了展开态截图，验证结束后已删除临时样例并关闭服务。

## 接入五个工作区并按模块整理源码

2026-11-13，Go 入口绑定对话、工作数据和 Windows 终端服务。对话将文本历史交给本机 Pi CLI；看板与日历共享任务，笔记正文和元数据独立保存，终端由 ConPTY 管理。浏览器预览复用 React 页面，使用当前标签页的预览数据。

前端工作区按对话、看板、日历、笔记和终端分别放入 `native/frontend/src/workspaces`，窗口壳、共用组件、数据接口、资源和宿主桥接按职责归入 `src` 下相应目录。Go 代码拆入 `native/internal/chat`、`work`、`terminal` 和 `storage`。项目 README 和组件文档链接已更新，后续新增文件按根 AGENTS.md 的目录约定放置。

迁移后从 Vite 入口在无头 Edge 走通五个 Dock 工作区，验证了对话创建和重命名、跨页保留草稿、看板创建事项、日历打开与返回同一事项、关联终端表单、笔记摘录、标题保存及 Ctrl+P 搜索。修复了搜索词非空时 Esc 只清空输入的问题。此次没有运行完整构建、类型检查或桌面端，Pi 实际模型回复、Go 磁盘持久化和 ConPTY 进程生命周期尚待桌面联调。
## 新壳接回 Chela 的 Pi 对话核心

2026-11-13。React 经 MyGo IPC 将对话交给 Go，Go 将模型配置和文字历史传入随应用交付的 Agent 进程。Agent 直接使用根依赖 `@earendil-works/pi-agent-core` 与 `@earendil-works/pi-ai`，本次解析为 1.5.2。移除了上一版的 Pi CLI、临时 Pi 会话和 PATH 查找。开发页的 Vite 服务也通过独立的 Go 入口调用相同 Chat 服务。开发入口只接受本机同源请求。

| 旧 Chela 的职责 | 新 Chat 的实际状态 |
| --- | --- |
| 模型来源、路由 | 沿用旧 Chela 的来源和条目字段、模型兼容选项，支持切换和自定义端点。新增密钥由 Windows DPAPI 保护，旧 Electron 加密密钥需重新录入。 |
| 会话、上下文 | Go 存储文本消息、模型、推理、用量和会话分组。桌面首次读取可投影旧会话目录中的文字消息。Pi 调用复用了旧上下文预算裁剪和工具循环保护。完整的旧附件、快照、压缩与分支语义仍待迁移。 |
| Chat 界面 | 依据新对话和进行中画板调整侧栏、输入框、模型选择及用量。支持文本附件、真实回复增量、停止生成、回复复制、文件夹和项目信息。 |
| Harness、工具、记忆 | 本轮为文本聊天。旧审批和中断恢复、工具与 MCP 执行、长期记忆、反思、插件与 trace 的代码仍在历史目录，尚未接入当前 Agent。 |

全部直接 npm 依赖按当前稳定版使用 `^` 范围并更新锁文件。经过前端类型检查及 Windows 构建。在浏览器里使用 Go、Pi 和 Magpie 的 `codex/gpt-6.1-sol` 实测双轮上下文、真实发送和刷新恢复，隔离 MyGo 桌面窗口也实测收到模型回复。画板尺寸下实测侧栏 280 px、新对话输入框 760 × 132 px。本文覆盖前一条记录中的 CLI 和浏览器 Chat 预览说明。

## 恢复按会话存储与旧事件导入

2026-11-13。Go Chat 按会话原子写盘，重命名、置顶与保存回复只更新目标文件。首次将新壳旧总表或 Electron 的文字投影写入临时目录，全部成功后才切换，保留原始资料。恢复旧 JSONL 阅读器逐行跳过损坏事件的行为，并修正 Agent 分块读取中文的问题。

隔离 profile 中经 chat-dev、Pi SDK 和本机模拟模型，验证了导入失败重试、两轮历史、长中文与 emoji、重启读取、删除后不重新导入，以及损坏行之后的旧消息仍能恢复。未接触实际用户资料。

## 整体架构与未来方向

2026-11-13。[整机架构图与迁移说明](../../architecture/chela.md) 对照现有 React / MyGo / Pi 入口、旧 Electron 实现和工作台规划，记录桌面入口、Go 应用服务、Pi 执行、数据归属与目标工具调用顺序。标出待接回的 Harness、上下文、记忆和任务验收链，并给悬浮助手、外部执行者、Notion、Drop、产品内委派及离线评估列出接入点。可单独打开 [SVG 原图](../../architecture/chela-system.svg)。

## 上下文设计讨论稿

2026-11-13。更新整机 SVG 和说明开头，记录 Magpie 模型目录、Go 调度、会话隔离、在线压缩与空闲整理的职责。并发参数、记忆评分及情绪策略保留为讨论项。
