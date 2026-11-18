# 状态归属

更新时间为 2026-11-18（Asia/Singapore）。本轮从 `codex/chela-figma-restart` 的 `eea5383` 接续，整理当前 `native/` 实现中的任务共享读取与写后同步。详见 [state-refactor-progress.md](state-refactor-progress.md)。

## 基础约定

- Go 记录是业务事实；renderer 的查询结果只作可重新读取的镜像。Electron 持有原生窗口和浏览器，Pi AgentSession 保持唯一 Agent 内部循环。
- `native/frontend/src/state/` 存放有明确边界的同步 Zustand 状态；异步请求、文件读取、订阅启动/停止由 action/controller 编排。公共 API 位于 `src/data/`，仅依赖 `src/platform/bridge.ts`，不依赖 workspace。
- 不默认使用 persist。消息、运行、审批、凭据不写入浏览器主库。保留已有 UI 存储键；偏好入口负责读取、修改和通知。
- selector 返回已有引用或稳定空值，不在 selector 内创建数组/对象。DOM、FileReader、observer、计时器、Promise 和原生资源留在组件 ref 或 controller 闭包。
- 局部菜单、焦点、拖拽、错误对话框保留局部状态；未保存编辑值与已确认记录分开。一次操作在 await 前固定 session / branch / draft key / run，响应只能写回原目标。

## 全项目主要状态地图

表中的“本轮”所有者会随实施同步更新；未迁移领域仍按实际代码记载。

| 状态 / 实体 | 权威来源 | renderer 镜像 / 消费者 / 订阅 | 写入入口 | 范围 / 生命周期 | 持久化 | 刷新、失效、清理 |
| --- | --- | --- | --- | --- | --- | --- |
| Chat 会话、消息、模型目录、runs、approvals | Go Chat + storage | 本轮统一 Chat snapshot；Sidebar / Transcript / Composer / Info | `chatApi`，成功后合并会话或刷新 snapshot | 应用数据镜像；请求归属发起时的观察生命周期 | Go profile `chela.db`；模型配置沿用 Go 目录 | 接收前先检查生命周期，再以 cursor 防回退；允许同 cursor 的合法模型配置更新；最后消费者释放使旧请求失效 |
| Chat progress | Go `sending` / Pi 输出 | 本轮统一 progress；只取 selected session 且 run_id 匹配 activeRun | Observe controller | session / run，易失 | 无前端持久化 | 单一 Observe 循环，卸载停止；不把其他 run 的输出显示在当前 run |
| 对话分支列表 | Go Chat.Branches | 本轮按 session 共用缓存；ProjectControls / Info | 分支查询 action；switch/edit/regenerate 后失效 | session；可丢弃查询镜像 | Go DB | 当前 branch 改变、分支操作、会话删除 |
| 运行设置 | Go RuntimeSettings（全局默认 + session 设置） | 本轮按 session 镜像；Composer；Settings 仍独立读取全局值 | runtime action / Settings 现有 API | session；未选择使用空 session 默认值 | Go DB / 现有配置 | session 改变、`chela-runtime-settings-changed`；过期请求不覆盖新值 |
| 临时模型 / effort | ChatWorkspace | Composer props | 本地选择 | 工作区，切换 session / 模型配置刷新重置 | 无 | 保持原重置条件；模型目录源于 snapshot |
| 文本草稿、附件 | renderer 本轮 draft store | 按 session 或 `new` 订阅；Composer / Preview 引用动作 | 同步 draft 动作 + 文件读取 action | renderer 进程；跨工作区卸载保留 | 无（不新增重启恢复） | 首次发送迁移 `new`；成功清理、失败保留；编辑取消/成功恢复原草稿与附件；删除清理 |
| command ID 重试 | renderer action 内存映射 | 发送 / steer | 内容和目标固定的提交 action | 重试期间，跨 Chat 卸载保持 | 无 | 同一 payload 重用；成功删除 |
| 历史编辑状态 | ChatWorkspace | Composer / Transcript | 编辑准备、取消、成功 | 工作区挂载期；不是所有 session 的持久草稿 | 无 | 保留 previousDraft / previousContexts；卸载释放 |
| 当前 session / 路由 | hash + 首次 snapshot 的现有规则 | ChatWorkspace 选择并传递子区与 Preview | 初始 load、选择、新建、删除、hashchange | 工作区挂载期 | hash；不新增 last-session 存储 | 有 hash 时按引用定位，否则首个未归档；不存在保留提示 |
| Preview 开关、当前 tab、打开 diff 意图 | renderer UI | 本轮 Preview UI store；ChatToolbar / Preview | 同步 UI 动作；异步标签回调先校验发起实例代次 | 开关/tab 按现有 sessionStorage；diff 请求为工作区意图 | `chela.preview.open` / `.tab` | 卸载使旧实例的 UI 提交失效并清理工作区请求；有效实例仍按原顺序重放请求；不关闭 Electron 持有的迟到新标签 |
| Git 仓库列表 / 文件状态 | Go Git 读取磁盘 | 本轮按 session + project + 有效 depth 共用资源；ProjectControls / GitChanges | repository 查询/刷新 action | 可丢弃镜像，无独立轮询 | 无 | 新读者首次/重新挂载即重新验证，包括底栏仍订阅时打开变更；同键在途读取合并；项目/配置/分支/刷新/还原规则保留 |
| Git 当前仓库 | 浏览器 UI 偏好 | 现有 `repository-selection.ts` 统一读取/订阅；两个入口 | `selectRepository` | session，跨卸载 | `chela.git.selection.<session>` | 同窗口自定义事件 / 跨窗口 storage；仓库失效回退 all |
| 阅读位置 / 问题锚定 | renderer hook | `useReadingPosition` 的模块 Map / DOM ref | scroll / layout effect | session + branch；跨卸载 | 内存 | 新问题锚定、同问题恢复 top；流式输出不自动滚底；observer / rAF 随组件清理 |
| busy / 操作互斥 / 错误 | ChatWorkspace 操作 controller；`chatState.error` 是共享展示错误 | 所有操作区共享门闩；删除对话框等局部表单错误独立 | `run` / rename、资源 action | 工作区；busy 与 Go running 不同 | 无 | finally 释放；最后观察者卸载重置 loading/error；不按组件各建一份发送门闩 |
| Browser tabs / WebContentsView | Electron `browser.mjs` Map | Preview 当前挂载期的 tabs 镜像；700ms 观察 | Browser.* 经 bridge | Electron 窗口寿命；renderer 关闭 Preview 仅隐藏原生视图 | 浏览器 partition `persist:chela-browser` | 标签操作后刷新；卸载停止观察/拾取/布局；原生对象不进入 store |
| 已保存的 WorkTask | Go Work | `workTasks` 内存镜像供 Board、Calendar、Terminal 和 Notes 任务关联使用 | `saveWorkTask` / `deleteWorkTask`，采用计划确认后调用 `invalidateWorkTasks` | Renderer 持有最后确认的列表，监听仅在有消费者时存在 | Go DB | 挂载、重新聚焦、页面重新可见、手动重试、写后重新验证。读失败保留已有数据，最后读者释放时撤销在途读结果的写回资格 |
| Board / Calendar 编辑会话 | 各编辑器持有自己的草稿和 revision 基线 | Board 按任务 ID 初始化。Calendar 持有 latest / saved / queue 和待恢复草稿 | 编辑器将完整 WorkTask 交给任务 action | 任务编辑会话 | Calendar 沿用 `chela.calendar.draft.*` sessionStorage | 同任务刷新保留输入。Calendar 的 500ms 自动保存和卸载保存沿用本会话已确认的版本。恢复旧草稿使用草稿原 revision，由 Go 拒绝冲突 |
| Notes 笔记 / 草稿 / 对话关联 | Go WorkNote，未保存草稿归编辑器 | `useNotes` 本地镜像、草稿 ref、模块 writes 队列。NotesWorkspace 挂载时读取对话关联，任务关联从共享列表派生 | useNotes update / flush / create / remove | note 草稿跨卸载，编辑 UI 局部 | `chela.notes.drafts.v1`（desktop localStorage / web sessionStorage）及 Go DB | 650ms 保存、有序 writes、updatedAt 冲突检测、恢复副本，卸载 flush / beforeunload |
| Settings 配置与编辑值 | Go 配置或 UI 偏好，按字段区分 | SettingsWorkspace 局部镜像/表单 | chatApi / serviceCall / UI 偏好入口 | 设置页挂载期；表单局部 | Go DB / provider 文件；已有 localStorage UI 键 | `chela-models-changed` / `chela-runtime-settings-changed` / `chela-workspace-settings`；本轮保留兼容通知 |
| Shell 路由、侧栏开关、dock、外观、预览 | hash / Shell | Shell 局部 state；dock 截图/ref、title 事件 | Shell 动作、设置回调 | 应用挂载期；hover/timer 局部 | `chela.shell.appearance` / `.dock`；sidebar width 现有键 | hash / matchMedia / resize / title 事件；effect 清理 |
| 通知、计划草案、companion / pet | Go Work / companion / pet | `app/notifications.tsx`、`calendar/plan-drafts.tsx`、companion / pet 各局部查询 | workApi / companionApi / Pet.* | 应用或对应弹层挂载期 | Go DB | 既有观察与动作后重读；本轮不合并这些领域的缓存 |
| 终端进程 / 输出 / 执行结果 | Go terminal | TerminalInfo 镜像、xterm/DOM/ref、输出读取控制器 | Terminal.* | 进程寿命独立于页面；视图 effect 挂载期 | Go 记录；UI selected/layout 现有 sessionStorage | list / read / end 后刷新；卸载清理 xterm 与读循环，不将进程句柄转前端 |
| 启动屏障 / 恢复 / 后台监督 | `native/main.go` ready + `chat.Start` | 错误/只读诊断 | Go 启动与 shutdown | 应用进程 | Go DB / checkpoint / event 记录 | 所有分发等待 ready；退出先取消服务，沿用现有顺序；后续独立拆职责 |
| Harness / context / memory / transcript | Go Chat + storage；Pi 唯一内部循环 | snapshot、MemoryPanel、ContextControl、诊断镜像 | Go API / worker wire | assistant / project / session / branch / run 分开 | DB 与现有 checkpoint / provider 配置目录 | Go 监督队列/审批/取消/恢复；Pi checkpoint ack，不从前端推断业务成功 |

## 实施边界

第一轮迁移了 Chat / Preview 共享资源。本轮迁移 Board、Calendar、Terminal 和 Notes 的已保存任务读写。Companion 和聊天补全仍直接读取任务。Notes 正文、Settings、终端进程、提醒、计划草案列表及 Go 应用层各自管理原有状态。

## Chat、Preview 与任务的资源合同

| 所有者 | 消费者 / 入口 | 失效与退出 |
| --- | --- | --- |
| `state/chat.ts` / `chat-actions.ts` | Workspace 订阅 snapshot、当前 session progress、loading 和 modelRevision；Composer 订阅展示错误；Info / ProjectControls 共享 branches；runtime 按 session 订阅 | Observe 200ms，只有一个循环；最后释放取消计时器/事件、清理 progress/branches/runtime 并推进 epoch，清除在途 snapshot 的复用入口。refreshChat 在调用时捕获 epoch，在 acceptSnapshot 前拒绝已释放代次，迟到 finally 不能清除新请求。保留 snapshot_cursor 的 >= 保护，相同 cursor 可更新模型配置。重新挂载仍重新读取并按 hash/snapshot 初始化，不恢复上次选择；观察读取可合并，写后读取新发请求 |
| `state/chat-drafts.ts` | Composer 只订阅当前 session 或 `new` 的文本/附件；Workspace 提交时读取；Preview 引用按开始拾取时的回调固定目标 | 不随 Workspace 卸载清空，不持久化；删除会话清除文本和附件；FileReader 在 action 闭包内，进度和完成只更新原 key / attachment ID |
| `state/git.ts` / `git-actions.ts` | ProjectControls 和 GitChanges 使用同一 session/project/depth 查询；`preferences.ts` 提供有效探测深度 | 每次 acquire 都调用共用 load：已有读者或缓存不阻止新挂载的重新验证；已有同键在途请求则合并。重新验证保留缓存数据，所有消费者接收同一确认结果。请求身份拒绝失效/释放后的响应；项目/深度改键，分支/run 结束/手动刷新/还原规则不变。无后台 Git 轮询；最后读者卸载丢弃该键。无项目时保留 Go 原错误 |
| `state/preview.ts` | Toolbar、Workspace 快捷键、共享 Markdown 发出 open/diff/tab 意图；Preview 消费请求并修改共享 tab | 快捷新建标签捕获 Chat 实例代次；Preview 新建/关闭及 act 捕获 Preview 实例代次。卸载递增各自代次；每个 await 后写 open/requestedTab/tab 或刷新 tabs 前检查归属。原生操作可以完成，Electron 继续持有资源，旧实例只放弃 UI 提交。open/tab 存储键、diff/requestedTab 的工作区寿命、原 effect 顺序与重开重放不变 |
| `state/work-tasks.ts` / `state/work-task-actions.ts` | Store 保存任务和读取状态。Action 统一查询、确认写入、删除和失效，`data/work.ts` 提供传输 | 通过请求身份合并有效在途读取。保存直接返回并写入 Go 确认的记录，随后独立重新验证。删除成功先移除已确认删除的 ID，再重新读取 Go 更新的子任务关系和 revision。读取接收完整结果，允许同 revision 的 `replyPending` 变化。最后读者卸载清理焦点与可见性监听，清除在途读取，已确认写入仍可更新内存 |
| `state/preferences.ts` / `repository-selection.ts` | 模型收藏、编辑器、Git 深度及仓库选择；Settings 调用相同写入口 | 保留 localStorage 键、workspace-settings / git-scope 兼容通知和 storage 跨窗口订阅；偏好监听引用计数，最后消费者卸载移除。仓库选择仍以 localStorage 为单一来源，不另建副本 |
| `chat/submission-actions.ts` / `composer-actions.ts` | 发送、steer、再生成、引用查询、附件读取；由 Workspace 的同一 run 门闩协调 | 目标和 payload 在调用时固定；command ID 只在成功后删除；失败草稿保留。历史编辑成功先恢复原草稿/附件并结束编辑，再刷新快照，刷新失败不重新进入已完成的编辑 |

UI 偏好的其余所有者本轮不迁移：Preview 的 picker/ports 仍由 `preview/preferences.ts` 负责；Shell 外观/dock 和字体沿用当前设置入口；侧栏宽度仍为 `chela.sidebar.<id>`，Preview 宽度仍为 `chela.preview.width`。这些是 UI 偏好，Go 的 runtime/provider 等业务配置不会落入此 store。

任务确认写入时若没有活跃读者，下次挂载读取 Go 数据。列表仅保存在内存中。窗口持续停留前台时，外部 Go / CLI 修改和终端结果确认产生的派生标记暂不保证实时推送，可在重新进入页面、重新聚焦或页面重新可见时读到。

Go 的后续拆分入口已复核为 `native/internal/chat/runs.go` 的 Start/startLocked：恢复中断 run、失效审批和租约后启动 schedule/indexMemories；关闭入口在 `pi_worker.go` 的 shutdown。`main.go` ready 屏障仍拦住所有服务调用。`generation` 的短期输出是 run 内存；session/branch transcript 与 checkpoint 是接续记录；长期 semantic memory 及索引/整理作业另由 Go 管理，不能把活动 run 映射当成整个记忆系统。
