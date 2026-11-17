# Chela Agent Instructions

本文件只保留每次进入仓库都必须常驻的规则。场景化、细节化的工作方法放到 `.agents/skills/`，按任务触发加载。

## 常驻硬约束

- 如无必要，不要 build；哪怕改了代码也不要习惯性运行 `pnpm build`。
- 如无必要，不要 check；验证优先选择和本次改动直接相关的最小命令。
- 把握执行节奏：按任务风险做最小可靠改动，先完成可用闭环，不为假设场景穷举方案、扩展范围或反复查资料。必要验证通过后及时收尾，仅在新改动、失败或未解决的具体问题出现时追加检查；信任边界校验、业务校验与防止数据丢失的错误处理不能省略。
- 项目 / 产品对外名称统一为 `Chela`。
- 除历史文档、旧路径兼容、数据迁移场景外，不再新增 `first_pi_agent` / `first-pi-agent` 作为产品名。
- 涉及包名、窗口标题、README、UI 展示、运行时 client 标识时，默认优先使用 `Chela`；必须兼容旧存储键或旧 userData 目录时，要显式标注 legacy。
- 每轮有效改动都必须留下文档记录，默认追加到 `docs/changes/YYYY-MM-DD/changes.md`；格式和细节使用 `chela-doc-trace` skill。
- 用户多次确认过的偏好、禁忌或长期约束，要沉淀成稳定规则，优先写进本文件或对应 skill，不写成一次性聊天记录。
- 回答和诊断要基于证据；证据不足时要说明边界，不要把推测说成事实。
- 沟通默认克制、礼貌、直接；不使用黑化、毒舌、阴阳怪气或带冒犯感的表达，除非用户明确要求。

## Skill 路由

开始任务时先判断是否需要加载 Chela 专属 skill。多个场景同时出现时，只加载当前必要的最小集合。

- `modern-web-guidance`：修改 WebView 前端的 HTML、CSS 或客户端交互前，先按具体功能搜索并读取匹配的指南，交付前核对实现。
- `chela-doc-trace`：写改动记录、整理变更摘要、回看某天 `docs/changes` / `docs/todos`、沉淀长期规则。
- `chela-ui-guidelines`：改 renderer UI、颜色 token、选择态、圆角、border、设置页、diff panel、shadcn 组件或 React 性能。
- `chela-chat-surface`：改聊天区、composer、context、thinking、消息发送、附件、多模态、分支切换、模型选择、队列/续写文案。
- `chela-shell-panels`：改左侧 sidebar、右侧 Browser / diff / trace 工作区、分栏宽度、拖拽或 `webview` 相关布局。
- `chela-renderer-state`：改跨 session、跨 panel、聊天 / Browser / settings 共享状态、附件 marker、Zustand store。
- `chela-runtime-harness`：讨论或修改 harness runtime、context engine、memory、transcript、readiness、observability。
- `chela-electron-ipc`：改 Electron main/preload/IPC、MCP/plugins 设置、`shell.openPath`、Node-side test 会导入的 service 模块。
- `commit`：用户提到 `/commit`、提交消息、Conventional Commits、自动提交时使用；仍然遵守“不默认 build/check”。

## 执行默认值

- Chela 默认使用 Electron 桌面壳与 React 界面；Go 继续持有业务、数据、权限、调度与本机服务，Pi SDK 保持唯一 Agent 内部循环。Electron 主进程只承接宿主能力，不重复实现 Go 业务。直接 npm 依赖使用当前稳定版本的 `^` 范围，实际解析版本由 pnpm 锁文件记录。
- Chela 只有一个持续身份，人格与短期心情可跨会话延续。会话的上下文、工具、审批和取消按 session/branch/run 隔离。重建遵循 `docs/architecture/chela-architecture-v1/`，Go 持有唯一持久源，Pi AgentSession 承担唯一内部循环。
- Electron 宿主放在 `native/electron/`，main/preload 与远程网页的权限分离；Go 服务按职责放在 `native/internal/`，`native/main.go` 负责启动与 stdio 服务分发。宿主边界以 `docs/architecture/electron-host.md` 为准。React 工作区放在 `native/frontend/src/workspaces/<模块>/`，页面私有组件、样式和资源跟随模块；共用 UI、窗口壳、数据接口和宿主桥接分别放在 `src/ui`、`src/app`、`src/data` 和 `src/platform`。

- 检索、扫描、批量处理优先使用快工具或成熟现成包，不为了语言统一牺牲性能。
- 搜索类能力交付前要做真实烟测；不能只看类型或静态检查。
- 代码改动保持小范围、贴合现有架构；不要顺手做无关重构。
- 遇到用户正在进行的本地改动，默认保留并协作，不要回滚未确认的变更。
