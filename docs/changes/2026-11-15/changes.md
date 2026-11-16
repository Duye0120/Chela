# 2026-11-15

## 导入完整架构与重建基线

读取用户指定的分享对话，下载并校验架构 ZIP，将完整规格、契约、默认参数和验收矩阵保存到 `docs/architecture/chela-architecture-v1/`。新增 `docs/migration/workspace-baseline.md`，记录现有分支、未提交工作、实际入口、依赖、旧能力去向和本地回退副本。架构入口与 AGENTS 补充统一身份及跨会话心情约束。

现有 Chat、Work、Storage 的最小 Go 编译检查通过。架构包的 21 项长度与 SHA-256 校验通过。开始引入同版 Pi coding-agent SDK 和 Go SQLite 驱动，以建立持久核心和提交屏障。实际功能进度和验收结果继续在本文件记录。

## 持久聊天、Pi 提交屏障与安全恢复

- 时间：2026-11-15 +0800。
- Go 新增 SQLite 会话、分支、Run、输入队列、命令去重、领域事件及事务 outbox。旧聊天 JSON 按来源 ID 一次性原子导入，原文件保留。主进程启动时将遗留运行标为中断；未知工具副作用不自动重放。
- Node 使用锁文件中的 Pi coding-agent 1.5.2 `AgentSession`；每个活动会话独立 worker，前台最多两个。完整原始 header/entries/active leaf 持久化，恢复从 SessionManager 内存投影重建。底层 core listener 真正等待 Go checkpoint ack；最终状态等待 AgentSession idle 和最后一次提交。提供商内部自动重试关闭，重试由 Pi AgentSession 发起并重新经过 Go 请求记账。
- read_file/write_file 最终执行走 Go，路径由 `os.OpenRoot` 限定到当前项目。写入前保存绑定最终参数和文件版本的审批，界面展示将写入内容；批准后复核文件。结果先落库再交还 Pi。
- 压缩只由 Pi 执行。摘要前保存 SafeCut 的来源、前缀 hash、generation 和 erase epoch；摘要提交时复核并原子保存 compaction entry 与快照。最近用户轮次和完整工具批次必须保留，泛用 checkpoint 拒绝 context_edit。
- 恢复创建新分支和新 Run，引用原 Run，从最后安全边界重建，并携带工具真实回执。原始分支保留且可切换；已成功写入的相同动作复用回执，未知写入要求先核对。
- Chat 界面改为快速提交后查询事件/流式进度，支持切换会话、排队消息、取消、文件审批、手动整理上下文和安全恢复。主窗口关闭改为隐藏到系统托盘，托盘提供重新打开和显式退出；生成 bindings 时 Chat 构造器不启动数据库或 worker。
- 已验证：真实打包的 Node worker + 临时 Go 数据库 + 本地 SSE 模型，覆盖两轮对话及 host/worker 重启、稳定身份、重复 command、双工具批次、拒绝与延迟 checkpoint、文件批准前无写入、手动压缩、A 取消不影响 B、新恢复分支。`go -C native test ./internal/chat` 七项通过；Storage 事务回滚/身份测试通过。`pnpm exec tsc -p native/frontend --noEmit` 通过；Chat dev 入口与桌面 main 最小编译通过。
- 验证边界：上述模型为本地 fixture，未宣称真实上游模型、桌面托盘交互或浏览器流程已经验收。未运行全量 build/lint。尚未完成 memory、后台主动性、情绪、桌宠、扩展生态和 Work/Terminal 数据迁移；详见 [阶段状态](../../migration/runtime-progress.md)。

## 故障门禁、补充与编辑分支、Magpie 目录

- 时间：2026-11-15 +0800。
- 修复工具副作用已发生但回执写入失败仍能继续模型的路径；此时立即终止本轮并保留 `outcome_unknown`。文件审批等待移出写锁，避免用户迟迟未确认时锁住其他文件。
- 适配 Pi 1.5.2 自动重试的 append-only `context_edit`：只允许隐藏本分支失败/中止的 assistant 消息，保留原文；涉及被编辑前缀的压缩来源会失效。成功消息和跨分支编辑继续拒绝。
- 增加“补充本轮”持久输入与消费回执，普通消息仍由 Go 后续 Run 队列持有。未消费补充在终态显示未处理。历史消息编辑建立新分支，旧历史不覆盖；前端保留原草稿并刷新分支缓存。
- 接入 Magpie 官方目录及 native endpoint、缓存/ETag、离线保留、未知容量元数据、实际路由响应头、聊天/压缩用途绑定。凭据仍在本机加密保存；不改 Magpie 配置或启动它的网关。本机 CLI 0.1.4175 报告网关未运行。
- 验证：`go -C native test ./internal/chat ./internal/storage ./cmd/chat-dev -count=1 -timeout 90s` 通过；后续独立压缩模型与审批锁调整又跑对应场景通过。新增实际 Node crash、stdout 污染、checkpoint 同批回执重发/内容冲突、写入回执失败、自动重试、自动压缩提交拒绝、steer 去重与 follow-up 归属、编辑分支保留、Magpie ETag/离线/实际路由测试。`pnpm exec tsc -p native/frontend --noEmit` 通过。
- UI 继续沿用原表单和按钮；检索并读取 modern-web-guidance 的 forms / ime-safe-enter-submit，补充按钮显式 `type="button"`，保留既有输入法 Enter 防误发送逻辑。未做实际 UI/托盘验收、真实模型请求、全量 build/lint、提交或推送。

## 正式记忆、实际上下文与可中断整理

- 时间：2026-11-15 +0800。
- 新增 `internal/memory`，接入范围、来源原文跨度、版本和 slot CAS、候选/冲突、纠正、有效期、中文二字分词 FTS5、遗忘屏蔽。Chat 的记忆界面可查看、添加、纠正、遗忘和发起整理；模型的记忆工具通过 Go 提交屏障及事务回执。
- 每次模型调用由 Go 注入适用记忆并记录实际请求包、人格/删除版本、选中记忆及保守 UTF-8 字节预算。发现 Pi 1.5.2 provider 接口使用 normalized transcript 后，改为在首条 system message 的命名 section 中注入，实际 SSE 请求已核对。容量未知明确标本地上限，不伪称模型真实容量。
- 资格事件、整理任务、租约 fencing 和游标持久化；同一 Pi AgentSession 执行后台提取，后台不提供工具。候选/逐项结果/游标同事务，前台新消息会打断后台；失败不推进游标。前台并发最多 2、后台最多 1，空闲五分钟可自动整理，显式操作可提前排队。
- 验证：整个 `go -C native test ./internal/chat ./internal/storage ./cmd/chat-dev -count=1 -timeout 90s` 通过；新增实际 worker 记忆工具、跨会话称呼、项目隔离实际请求、中文搜索、纠正冲突、遗忘防复活、过大输入先于网络拒绝、整理候选与游标提交、前台抢占与迟到租约拒绝场景。前端 TypeScript 通过。
- 边界：尚无真实上游模型或桌面交互验收；向量索引、旧记忆分类导入、遗忘对派生摘要的完整清理和基于预算主动压缩尚未完成。遗忘当前会保守取消所有活动 Chat 运行，原聊天保持；已发出的外部请求无法撤回。未全量 build/lint、提交或推送。
- 按 modern-web-guidance 的 dialog/forms 使用已有原生 modal 和滚动隔离，不新增焦点 trap；表单有标签、必填约束和独立提交按钮。

## Planner SQLite 迁移进行中

- 已增加 `internal/work/repository.go`，复用同一 Store，旧 `work.json` 一次性事务导入并保留原件及 legacy 映射。任务、笔记使用正式 planner 表，任务版本冲突与笔记原 timestamp 校验保留；排期映射独立 ScheduleBlock，截止日期/截止时刻单列。删除记录清除正文并保留关联 ID 墓碑。
- 桌面和 dev 入口已传入共享 Store；浏览器 Work API 改走本机服务，不再把 sessionStorage 当业务数据源。当前仅编译和 TypeScript 检查通过，尚需完成 UI 字段、迁移/冲突/DST 验证及终端、提醒、计划接线；本节不代表 S06 已完成。

## Planner、提醒、计划草案与终端现场

- 时间：2026-11-15 +0800。接完任务/笔记 SQLite 迁移、排期与截止时间 UI，保留旧原件和模糊日期标记；补齐版本冲突、删除与导入回滚门禁。添加独立提醒规则、确定性到期处理、持久投递、稍后提醒和通知中心。
- 自然语言计划通过 Pi managed 工具保存草案，用户先在日历查看/修改，采用所见 revision 后才提交；“按这个来”只在原会话且版本/来源未变时有效。日期范围变化检查只涉及相关区间。当前是全天排期，多精确时间块仍待完成。
- 终端使用同库持久关联、状态、退出码和最近输出，重启可回到原归档；隐藏窗格不结束进程，明确结束保留输出。修复重定向宿主下 ConPTY 标准句柄继承错误；桌面退出先收尾终端再关闭 Chat/数据库。
- 实际验证：Work 的旧数据导入/重跑/回滚、任务和笔记 CAS、删除防复活、DST、提醒去重/snooze/错过补发/完成撤销、计划冲突/事务提交；真实 Windows ConPTY 的中文输出/退出码/归档；真实 Pi Node worker 的草案不写任务、确认后提交。整体相关 Go 检查和前端 TypeScript 通过。
- 仍未做真实上游模型、实际桌面 UI、全量 build/lint、提交/推送/发布；CLI 目前只有 terminal 级能力，不能识别可靠新回复或自动恢复外部 session。详细边界见 [实施状态](../../migration/runtime-progress.md)。
- 界面继续使用既有控件与原生 dialog；按 modern-web-guidance 的日期指南保持 date-only 数据，由 Go 承担有时区转换与 DST 检查，没有新增日期依赖。

## 持久关注、共享心情与免打扰

- 时间：2026-11-15 +0800。接入 `internal/companion`、迁移 009 和 outbox 消费；新增任务/期限/指定文件条件、来源复核、事实去重及基础晨报。语义关注使用原 Pi 后台 lane、无工具及独立额度，明确提醒不受额度限制。
- 共享心情由 Go 按原因和 accepted_seq 更新，带冷却、新颖度、迟到拒绝、六维衰减和原子回滚；人格版本、互动方式、心情及每 Run 表达快照分离。新增 managed 交流评估与关注提议工具。当前会话的明确安静指令直接生效。
- 提醒中心可查看/停止关注、设置免打扰和项目静默、编辑人格及查看晨报和心情依据；继续使用现有控件，按 modern-web-guidance forms 保留可见标签、独立提交、错误提示及按钮类型，按 mobile-responsive 处理窄容器与长内容。
- 验证过相关 Go 套件、实际 Node worker 的心情跨会话/同轮冻结/后台预算与前台继续、文件到齐/路径隔离/期限跨阈值/删除后撤销、静默收起/晨报去重/提醒例外；前端 TypeScript 与 main 编译通过。测试使用临时数据和本机 SSE fixture，不写真实用户 profile。
- 尚未验证真实上游模型与桌面 UI；下一步接独立桌宠、展示合并和全屏/锁屏检测。完整剩余范围保留在 `docs/migration/runtime-progress.md`，未宣称 S07–S10 全部完成。未全量 build/lint、提交、推送或发布。

## 独立桌宠与持久展示协调

- 时间：2026-11-15 +0800。新增独立 MyGo 透明置顶桌宠窗口，复用 Chela 图形和现有 UI 控件；主窗口隐藏后仍保留。托盘可显示/隐藏，拖动、靠边探头、点击原事项、状态文案、静态默认及可暂停待机动作接通。命中区域使用 MyGo `SetInputRegion`，不让透明空白覆盖后方应用；显示用 `ShowInactive`，点击后才聚焦主窗口。
- Presentation Coordinator 使用 SQLite 保存单个活动 presentation、绑定投递及展示回执。普通进展合并，明确提醒优先；paint 后才 ack，重连沿用 ID，收起只改投递；低置信工作区提示不会升格为桌宠气泡。共享表情在该 presentation 中冻结，活动用户 Run 使用原表达快照。
- 接入 Windows `SHQueryUserNotificationState` 及 MyGo 锁屏事件，锁屏不呈现，全屏/演示/游戏/免打扰下遵循用户的提醒例外；输入忙碌时暂缓气泡。投递前再核对来源和提醒规则，已删除、处理或过期的不重弹。
- 验证：Companion/Work/Storage 相关 Go 套件通过；新增合并、静默、丢失 offer/ack 后重启、明确提醒抢占、锁屏与全屏例外、工作区提示不升级、来源删除和不改任务完成态场景。前端 TypeScript、main/Pet 最小编译、临时 profile 下 MyGo bindings 生成通过；未打开实际桌面窗口。
- 按 modern-web-guidance `motion` 使用静态默认、可见暂停控制及 `prefers-reduced-motion`，本地动画不调用模型。尚未实际验收多屏/DPI/穿透/拖动效果，没有新增语音或重绘全套表情资源；非 Windows 的全屏检测不宣称已支持。未全量 build/lint、真实上游、提交推送或发布。

## 遗忘传播与预算触发压缩

- 时间：2026-11-15 +0800。遗忘事务同步清理派生快照、实际请求副本、记忆工具回执和内部整理副本，保留原用户聊天；旧来源在后续整理输入中替换为屏蔽标记，游标仍可前进。缺少逐段依赖时保守清理同身份全部摘要，代码已标注边界。
- 清理后的上下文由 Pi SessionManager 生成保留全部原始历史的重建 compaction，Go 使用独立 SafeCut purpose 校验来源 hash、完整工具对、删除版本和固定重建说明；提交成功后才能请求模型。原始条目 ID 与父子拓扑不变，迟到的旧运行因 erase epoch 被拒绝。
- 统一 UTF-8 保守预算达到 72% 输入额度时进入 Pi 自带一次压缩重试；88% 时先移除可选记忆，整理后仍过阈值明确停止。压缩请求不额外注入长期记忆或心情；连续三个已取得 SafeCut 的失败自动整理会暂停，手动入口保留。当前压缩目标使用 Pi 的近似计数，不声称固定比例保证语义无损。
- 验证：真实 Node worker 的遗忘后实际请求、原聊天保留、预算先于上游压缩、手动压缩、上游溢出重试和拒绝提交已通过；相关 Chat/Storage/chat-dev 全部检查通过。未做真实上游、桌面 UI、全量 build/lint、提交或推送。

## 向量检索与旧记忆分类

- 时间：2026-11-15 +0800。接入 Magpie `/v1/embeddings`，沿用已加密的网关凭据。网关[当前目录实现](https://github.com/yetone/magpie/blob/main/internal/gateway/gateway.go)只列聊天、图像和视频模型，故向量用途允许填写网关支持的模型 ID，不另建本地目录。
- 索引使用持久 outbox、租约和 fencing；网络在事务外，提交时复核记忆 revision、删除版本、实际模型和维度。切换模型先建立新 generation，全部当前记忆覆盖后切换读取，旧索引保留；查询超时/服务失败回退词法。按允许范围先筛选，再算余弦并与 BM25 做 RRF；上限 40 候选、20 融合结果，最终上下文仍最多 12 项。余弦 0.5 是首版过滤默认值，不等同事实可信度。
- 中文单字回退限制为适用范围内最近 100 条；增加主题、键、稳定 ID 精确匹配。记忆面板显示索引状态，模型设置可选填向量用途。按 modern-web-guidance forms 使用独立表单、可见标签与显式提交，不随选择变化自动保存。
- 旧 memdir 索引/主题和旧 SQLite 向量库只读导入待分类表，同内容合并来源，记录逐项 hash/legacy 映射和原子导入回执。疑似凭据不复制正文；旧向量仅在原库归档，不参与新空间检索。用户在记忆界面核对内容和范围后才发布；遗忘同时清除对应待分类副本，不能重新导入复活。
- 验证：实际本机 HTTP 向量请求的同义检索、项目隔离、单字/ID 搜索、故障回退、不同模型/维度切换与遗忘通过；旧文件+SQLite 的导入回滚、重跑去重、来源合并、分类与原文件保留通过。Chat/Storage/chat-dev 全部检查与前端 TypeScript 通过。未调用真实上游、打开桌面 UI、修改真实用户 profile、全量 build/lint、提交或推送。
## 多时间块、晨报分组与外部 CLI 结果

- 时间：2026-11-15 06:56 +0800
- 改了什么：
  - 任务增加多个独立 ScheduleBlock，保留原全天排期入口。每块保存本地输入、IANA 时区、UTC 时刻、绑定方式、revision、锁定和估时来源；删除排期不删除任务，排期不修改 deadline。看板和日历共用编辑器，月/周视图显示每块，允许拖动未锁定的本地时间块。
  - Pi 计划工具可提议多个时间块，继续使用一个 draft revision。采用前检查事项版本、相关时间范围和重叠，展示具体冲突；保存草案修改会重新采集相关版本，确认前不创建正式排期。锁定块必须原样保留。
  - 晨报分为昨天按 completed_at 真正完成、昨天排期遗留、今天排期/期限、可靠 CLI 新回复。重新打开刷新当前版本，不重复投递，不自动完成任务。
  - 增加可选结构化 CLI 执行：Codex 0.168.0 app-server、OpenCode 1.19.5 run --format json。只有已核验版本及有效事件才声明 observable/resumable；controllable 保持 false。未知格式降级，不以终端中的 done/完成识别结果。
  - 原始事件、会话/轮次/回复 ID、结果、已读回执持久保存。恢复使用原 terminal_session_id、原 external_session_id 和新执行 generation；原输出保留。稳定结果入口可定位原回复，标为已读与任务完成分开；看板新回复为派生徽标。
  - Windows 结构化进程使用隐藏窗口、独立标准流、受限句柄继承和创建时 Job Object 绑定，停止/退出覆盖子进程。没有自动批准 CLI 的交互权限请求；需交互的请求保留提示，普通终端入口仍可使用。
- 依据：本机 Codex 导出的 JSON Schema 与无模型 initialize 握手；[OpenCode 1.19.5 官方 run 实现](https://github.com/anomalyco/opencode/blob/v1.19.5/packages/opencode/src/cli/cmd/run.ts)。未复制外部 CLI 的认证文件，也未调用真实上游模型。
- 验证结果：Work/Terminal/Companion/Storage 相关套件通过；Windows 实际匿名管道过程覆盖中文回复、重复事件去重、原 ID 重启恢复和已读/任务隔离；Codex 本机 initialize 握手及 stdin 关闭退出通过。真实私有 Pi worker 提议两个时间块并确认提交通过。DST 23 小时全天、gap/fold 拒绝、锁定/过期版本/冲突、晨报分组与刷新去重通过。前端 TypeScript 通过。
- 未做：实际桌面拖动、多屏、真实 CLI 模型任务/授权/恢复业务、未知版本兼容；没有全量 build/lint、提交、推送或发布。草案时间通过表单修改，尚未实现把草案作为日历覆盖层拖拽。
## 陪伴邀请的独立开关与额度

- 时间：2026-11-15 07:01 +0800
- 改了什么：设置新增默认关闭的“偶尔聊两句”。开启后使用本地规则发出简短邀请，不读跨会话正文、不调用模型；每天最多一次、距普通展示至少四小时，只在最近两小时有互动且已停顿五分钟、没有前台运行、非专注/游戏/免打扰时考虑。七天内两次未在原会话回应后降低频率。关闭立即撤销待展示邀请，其他工作提醒保留。
- 为什么改：补齐陪伴主动开口的独立配额与关闭语义，避免与任务关注共用额度或形成无回应压力。
- 涉及文件：`companion/companionship.go`、`events.go`、`settings.go`、`delivery.go` 与 `app/companion-panel.tsx`。
- 验证结果：临时 SQLite 验证默认关闭、专注抑制、开启投递、重复 Tick 去重、关闭撤销与两次未回应后的降频；前端 TypeScript 通过。
- 未做：真实桌面弹出与文案体验验收；没有新增模型调用、全量 build/lint、提交或发布。

## 扩展、技能与 MCP 接入

- 时间：2026-11-15
- 改了什么：新增 capability manifest/版本/hash/作用域/依赖和 idle 启停重载；A 资源、B 生命周期/custom entry/tool、C rpc UI 接入真实 Pi worker。native 包的信任边界明确，每轮后销毁 worker；失败包停止当轮并排除，重载前不再执行。新增扩展与 MCP 设置面板、会话绑定的交互请求。
- MCP 由 Go 管理单连接和 Job Object 下的 helper，支持 stdio/HTTP、加密凭据、延迟发现和资源读取；固定 schema/version、最终参数校验、默认逐调用授权、持久回执和 unknown 门禁。恢复 Run 复用同参数/版本的已知成功结果，避免重复副作用。
- 实测发现 Pi 在缺少 `read` 工具时不展示 skill。增加只读技能入口，Go 按本轮固定 manifest 限定包内访问；实际模型请求包含技能和提示模板，包外路径被拒绝。项目读写工具仍保持原范围。
- 验证：真实 Node worker 覆盖 TypeBox alias、生命周期 entries、select 回答/错误会话拒绝、managed 嵌套回执、UI 取消/超时、失败包后续隔离；HTTP/stdio fixture 覆盖单连接、发现 schema、授权前零执行、资源和模板读取、恢复结果复用。包作用域、hash 改动、重复 ID/依赖环、D/E 拒绝通过。
- 限制：第三方 native 代码没有 OS 沙箱；D/E 明确不支持；未运行真实外部 MCP、真实上游模型或实际 WebView 交互。仅提升本机已安装的 pi-mcp 1.5.2 为直接依赖，未在线新增依赖。

## 一致备份、旧资料迁移与恢复防复活

- 时间：2026-11-15
- 改了什么：新增 `chela-data backup/verify/preview/restore`。SQLite 使用 VACUUM INTO 捕获 WAL；清单记录 SHA-256/长度、schema、Pi 格式、SQLite version/source ID 和计数。恢复只写新目录，先合并最新遗忘/删除登记，再关闭旧运行、审批、MCP/扩展和投递。数据库升级前保存一致 DB 副本，高于当前程序的 schema 拒绝写入。
- 旧 Electron Planner 的笔记、状态、排期、绝对提醒、原始字段和终端链接保留；旧结果文本归档到原 terminal ID，进程明确中断、不虚构 resume。旧模式与锁定导入，旧信号不映射为新心情。历史任务导入不再制造当前完成时间或新的心情加分事件。
- 实际资料副本预览位于 `%LOCALAPPDATA%/Chela-rebuild-checkpoints/20261115-migration-preview`：14 个资料文件，1 个会话、0 条消息；源 transcript 确实为空，重复导入计数一致，原 profile 未切换。SQLite 内核 3.54.1，source ID 随报告保留。
- 验证：临时资料覆盖活跃 WAL 备份、遗忘/删除后恢复不复活、pending 不执行、损坏/覆盖/高版本拒绝、重复迁移、旧终端 done 文本不完成任务、原提醒毫秒不变、quiet/locked 保留、升级前 v15 快照。相关 Go 业务检查、前端 TypeScript、main/Pet 编译通过；压缩 fixture 原本依赖固定第 4 次请求，工具 schema 增长后先碰到本地阈值，已减小测试种子以继续验证上游溢出，不调整生产预算。
- 未做：全量 build/lint、安装包/发布/真实桌面验收、全部 A01–A46。原文 `erase_payload` 恢复暂不支持并明确拒绝；原文件与开工副本保留。详细完成边界见 `docs/migration/acceptance-status.md`。
