# 第一轮状态与组件整理进度

更新时间：2026-11-17（America/Los_Angeles）。恢复工作时先读本文，再检查 `git status`、HEAD 与相关 diff。本次回归修复基线及新增验证见下方「2026-11-17：生命周期回归修复」；第一轮的验证记录保留其原范围。

## 实施基线

- 目标 / 当前分支：`codex/chela-figma-restart`。
- 开始 HEAD：`200d23b933781f4ba3268818ecaf24eb2b7e5104`；工作区干净。
- 不回退参考提交，不自动 commit / push / merge。修改仅限 renderer 与必要依赖、文档。
- 权威边界及生命周期见 [state-ownership.md](state-ownership.md)。现有草稿跨卸载、历史编辑工作区寿命、模型选择切 session 重置、hash 初始化、command ID 重试及阅读 DOM 锚点均须保留。

## 进度

- [x] A：读取当前入口和直接消费者，建立全项目状态地图与 Chat / Preview 合同。
- [x] B/C：公共 API 归位；同步 store 与异步 action 分开；草稿、快照、分支、运行设置、Git 资源、Preview 意图接入直接消费者，删除旧路径。
- [x] D：ChatSidebar / Transcript / Composer / Info / Toolbar 按边界拆分，保留 DOM、class、ARIA、ref、form 和 key；公共 Markdown 与 Sidebar 能力参数完成。
- [x] 收尾：必要类型/静态检查、行为不变量核对、实际检查与风险记录、变更日志。

## 当前代码与下一步

已接入的所有者：`state/chat.ts` + `chat-actions.ts` 持 snapshot/progress、按 session 的分支/运行设置；Observe 只由一个引用计数 controller 启动，最后消费者释放时停止计时器及兼容事件。`chat-drafts.ts` 替代草稿/附件手写订阅；`preview.ts` 持 Preview 开关/tab/diff 意图。`git.ts` + `git-actions.ts` 将 ProjectControls / GitChanges 接到同一 session/project/depth 资源，并合并在途请求；会话项目/分支变化、run 结束、配置变化、刷新及还原完成触发重读，最后消费者释放丢弃查询镜像。`preferences.ts` 统一本轮 Git 配置、编辑器、模型收藏入口，保留 Settings 自定义事件及 storage 通知。

已删除：两个 branchCache、两个独立 Git 列表和配置读取、草稿 listeners、Chat 内 Observe 轮询、Preview tab/open 分散写 sessionStorage 的 effect。公共客户端已移为 `data/chat.ts` / `data/preview.ts`，所有直接 import 已迁移；旧页面私有客户端文件删除。仓库选择实现归入 `state/repository-selection.ts`，存储键及事件不变。Markdown 已移到 `ui/markdown.tsx` / `.css`；Notes 保留 `notes/markdown.tsx` 链接适配，编辑保存机制未动。Sidebar 的 resizable / hotEdge 默认为 false，由 Chat 显式启用。

五个主要区域已拆分为模块顶层组件；Workspace 保留当前 session、临时模型、历史编辑、单一操作门闩与页面协调。Composer 只订阅当前 draft key，局部管理建议、拖拽和文件输入；`composer-actions.ts` 负责引用/附件 I/O，`submission-actions.ts` 负责发送、steer、再生成和 command ID 重试。Thought、ToolActivities、ContextControl、useReadingPosition 保留，阅读 hook 的 ref 传入 Transcript，DOM 锚点不变。没有给 Composer 添加 session key。

第一轮实施完成，依赖由 `pnpm add zustand` 添加 `^5.1.0` 并生成锁文件，未升级其他依赖；随后按用户 `cp` 指令提交并推送为 `f69b070`。没有启动后续领域重构。本次只修复下面列出的三类回归。

## 关键文件与职责

| 文件 | 当前职责 |
| --- | --- |
| `native/frontend/src/workspaces/chat/chat-workspace.tsx` | 工作区组合、hash/snapshot 初始化、会话选择、临时模型与历史编辑、共享操作门闩、会话操作的页面协调；不再持轮询、分支缓存或文件读取 |
| `chat-sidebar.tsx` / `chat-toolbar.tsx` | 会话列表搜索/分组/列表操作界面、顶部操作；Sidebar 的分组表单状态局部保留 |
| `chat-transcript.tsx` / `chat-info-panel.tsx` | 消息、thinking、工具活动、审批和阅读 DOM；会话信息、分支和 Memory/ModelSettings 入口 |
| `chat-composer.tsx` | 当前草稿订阅、输入/附件/建议/发送界面；输入与局部交互不驱动整个 Workspace 重绘 |
| `composer-actions.ts` / `submission-actions.ts` | 引用、FileReader/DOCX I/O；提交、steer、重生成及重试 command ID；副作用不写入 Zustand store 配置 |
| `native/frontend/src/state/chat*.ts` | Chat 查询镜像与生命周期、同步草稿；异步编排在 chat-actions，不能作为 Go 业务主库 |
| `state/git*.ts` / `state/repository-selection.ts` / `state/preferences.ts` | Git 查询资源、既有仓库选择、探测配置/编辑器/收藏来源及兼容订阅 |
| `state/preview.ts` / `workspaces/preview/preview-workspace.tsx` | 共享面板意图/tab；原生浏览器镜像、拾取、布局和清理仍在 Preview，原生资源仍在 Electron |
| `native/frontend/src/data/chat.ts` / `data/preview.ts` | 公共客户端和传输类型，调用合同与原文件一致 |
| `native/frontend/src/ui/markdown.tsx` / `.css`、`workspaces/notes/markdown.tsx` | 共用只读解析/渲染/样式；Notes 链接与导航薄适配；没有引入新解析器或语法 |

## 行为不变量核对

| 要求 | 核对结果与证据 |
| --- | --- |
| 状态寿命 | 草稿/附件和 reading Map 跨卸载保留；历史编辑仍是 Workspace 的 useState；choice 在 selectedId/modelRevision 改变时重置；初始 hash 与首个未归档会话规则保留；无 last-session key、persist 或 Composer session key。草稿独立性有断言，reading hook 源码与基线一致；实际卸载/滚动仍待运行验收 |
| 异步归属 | 分支、runtime、Git 使用请求身份拒绝失效结果；FileReader/引用/发送捕获原 session/key，写回按 attachment ID 匹配；新会话发送只在选择仍属发起目标时切入。断言覆盖过期响应、文件完成时另一草稿不受影响、runtime 旧读不覆盖确认写入 |
| 发送与编辑 | `new` 首发迁移、失败保留、成功文本比较后清理、原附件与编辑前草稿恢复、command ID 重试复用均有断言；编辑成功回调在刷新之前执行，即使刷新失败也不会恢复为待提交编辑。保留 20 MiB 单文件、128 KiB 文本、8 个 / 40 MiB 总量及视觉模型校验；文件边界有局部断言，真实 DOCX/图片链路未运行 |
| 运行中操作 | 所有子区共用 Workspace operation ref / busy；running 从 Go runs 派生；cancel、steer、submit/queue、approval/recover API 与条件保留。progress selector 只取当前 session，再匹配 active run_id；单 Observe、最后释放停止、迟到进度不写回均有断言。Go 队列、审批状态转移未改，未实跑 |
| 阅读与 DOM | useReadingPosition 文件不变；`.chat-history` ref、`.chat-message-list`、`.chat-reading-space`、data-message-id、key、form、ARIA 和快捷键保留。新对话、历史、运行/审批/队列、归档、历史编辑五种状态的静态 DOM 与基线完全一致（归一化 React 自动生成的 ID）；不代表滚动、focus 或流式场景已在 Electron 运行 |
| Notes / Go / 宿主 | useNotes 保存代码与基线一致；保留 drafts/base、ordered writes、updatedAt 校验、恢复副本和卸载 flush。Notes 只读适配与旧输出一致。Go、Electron、Pi 及 schema 无 diff，启动恢复、审批取消、worker/checkpoint 和退出顺序未改 |

## 检查与实际结果

| 命令 / 方法 | 结果 / 范围 |
| --- | --- |
| `pnpm exec tsc -p native/frontend --pretty false` | 通过；仅前端类型检查，不是构建或运行验证 |
| `git diff --check` | 通过；含本轮新增文件的最终核对 |
| `node output/state-refactor-2026-11-16/check-state.mjs` | 通过；真实状态/action 模块配隔离 bridge、存储、effect 和计时器，覆盖请求合并/过期保护/释放、草稿与附件边界、提交迁移/重试/编辑恢复、cursor、Observe 和 Preview 存储键；不触及用户数据或模型 |
| `node output/state-refactor-2026-11-16/check-structure.mjs` | 通过；五种 Chat 状态的静态 HTML 和 Markdown/Notes 适配与参考提交对比；归一化 React ID，未执行 effects。CSS 原规则完整保留、Chat 布局 CSS 未改；未做 computed-style 或截图验收 |
| `node output/state-refactor-2026-11-16/check-boundaries.mjs` | 通过；客户端及仓库选择迁移保留原合同，阅读/Notes 保存 hook 未改，Go/Electron/Pi 无改动；本轮相关静态 import 图无循环，state/data 不反向依赖 workspace，没有旧客户端 import 或 Sidebar ID 能力特判 |

临时断言脚本、隔离 bundle、静态 HTML 保留在 `output/state-refactor-2026-11-16/`（Git 忽略的本地产物），没有新增常驻测试框架、测试依赖或测试套件。曾检索 modern-web-guidance 的外部状态订阅主题，无直接匹配的指南；没有套用无关 Web 平台改造。

未验证：没有启动应用、真实 Electron WebContentsView / Browser 布局遮挡与拾取、跨窗口 storage、菜单/键盘/focus/拖拽、真实阅读位置恢复/流式输出、真实文件与模型聊天、Go 的队列/审批/取消/恢复操作。未运行全量 build/test/lint。以上须后续在桌面环境按实际业务验收，不能由静态结果推断通过。

## 2026-11-17：生命周期回归修复

- 基线：`codex/chela-figma-restart` / `f69b070658e3b79380a0bbbb3930b4c8f42efade`，开始时工作区干净。
- 范围：保留现有组件拆分，仅修改 `state/chat-actions.ts`、`state/git-actions.ts`、`chat/chat-workspace.tsx`、`preview/preview-workspace.tsx` 及本文、状态归属、当日变更记录。用户已授权完成后 `cp`，沿用当前 checkout，不合并、不部署。
- 已完成：
  - refreshChat 捕获发起 epoch，在 acceptSnapshot 前校验；最后观察者释放时推进 epoch 并清除旧请求复用入口。保留 cursor >=，不会阻止相同 cursor 的模型配置更新。
  - Git acquire 即重新验证，即使 ProjectControls 仍持有该资源；同键在途 load 仍合并，缓存保留、最后读者清理及失效保护保持，不添加后台轮询。
  - Chat 快捷新建、Preview 新建/关闭与后续 act 刷新捕获各自实例代次；卸载递增代次，迟到响应不提交共享 UI，也不继续读取旧实例 tabs。正常实例行为及既有 diff/requestedTab 重放顺序不变；不回滚或主动关闭 Electron 持有的迟到标签。

### 聚焦回归与证据

`node output/lifecycle-fixes-2026-11-17/check-lifecycle.mjs` 修复前复现 6 个失败，修复后下列 10 个场景全部通过：

| 场景 | 隔离 JavaScript 执行结果 |
| --- | --- |
| 旧 Chat 读取 → 释放 → 配置改变 → 新 Chat 同 cursor 新模型先返回 → 旧读取迟到 | 新模型不被旧快照覆盖 |
| 旧读取释放后、尚未重新挂载时返回更大 cursor | 不修改保留的快照缓存 |
| 当前生命周期内同 cursor 模型刷新 / 更小 cursor 结果 | 同 cursor 更新生效，更小 cursor 被拒绝 |
| 底栏读者先加载 → 外部文件变化 fixture → 打开/重新打开变更面板 | 两次打开均重新读取共享资源并展示 fixture 的新文件 |
| 底栏与变更面板在同键请求仍在途中同时挂载 | 仍然只有一个在途读取 |
| 快捷新建标签未返回 → 旧 Chat 卸载 → 新 Chat 选择页签 → 旧创建完成 | 不重开 Preview，不覆盖新 requestedTab/tab |
| 当前 Chat 的快捷新建完成 | 正常打开 Preview 并发出 requestedTab |
| Preview 新建未返回 → 卸载/新实例 → 旧创建完成 | 不覆盖新 tab，不触发旧 act 的额外 Snapshot |
| Preview 关闭未返回 → 卸载/新实例 → 旧关闭完成 | 不覆盖新实例 tab |
| 有效 Preview 新建/关闭，以及关闭面板后保留请求的重放 | 正常切换页签，原请求重放顺序保持 |

脚本执行真实状态/action 与组件回调代码；bridge、浏览器存储、计时器和 hook 挂载/清理由隔离 harness 模拟，JSX 不渲染。它不是 React DOM 挂载、实际磁盘 Git、Electron 或真实模型验收。复现脚本和隔离 bundle 位于 Git 忽略的 `output/lifecycle-fixes-2026-11-17/`，未新增测试框架或依赖。

静态验证：`pnpm exec tsc -p native/frontend --pretty false` 通过；`git diff --check` 通过。Go、Electron、Pi、公共 API/IPC、schema、CSS 和 JSX 结构没有改动。未运行全量 build/test/lint，未启动应用或真实模型请求；真实窗口切换、原生标签资源和真实文件变化仍待桌面集成验收。

modern-web-guidance：已查阅 `js` 的异步协调指南；IPC 无 AbortSignal 取消合同，产品实现只校验 UI 提交代次。临时脚本用 Promise.withResolvers 控制返回顺序，遵循指南“Use Promise.withResolvers()”的外部 resolve/reject 约定，没有引入新的取消或重试框架。

三类回归已修复，下一阶段任务范围与依赖保持下方原记录，不在本次继续实施。

## 后续独立任务（本轮只记录）

1. Work 查询镜像：从 `data/work.ts` 和 Board / Calendar / Terminal 的任务写入口开始；统一 task 列表、写后失效与 Notes 关联索引，保留 Calendar revision、有序保存及草稿恢复。依赖本轮同步 store / 异步 action 约定，不依赖 Chat UI。
2. Notes：单独处理 useNotes 的 drafts/base、模块 writes、恢复副本与编辑块；先列清冲突与卸载 flush 合同，不能用一个 persisted store 替换保存队列。共享 Markdown 完成后只读渲染已可独立复用。
3. Settings：按 Go 运行配置、provider/MCP/capability 配置、纯 UI 偏好拆领域；逐个迁移写入口和既有通知消费者，不整页搬进万能 hook。
4. Go 应用层：从 `main.go` 的 ready barrier、`chat/runs.go` 的 Start/startLocked 与 `chat/pi_worker.go` 的 shutdown 出发，保护启动恢复、schedule/indexMemories 与退出语义，再独立抽应用服务；不让服务分发绕过 ready 屏障。
5. Go Chat 领域组织：在上项完成后按 session/transcript、run/queue/approval、context/memory、worker/checkpoint、配置/扩展梳理，不改 wire 和数据库合同。

保留的体验事项：Preview 在本工作区内打开过 diff / 快捷新建标签后，关闭再打开会按原 effect 顺序重放请求。是否消费后清理请求应作为独立体验决定，本轮未混入修改。
