# Chela 架构实施状态

更新时间：2026-11-15。目标仍为导入的完整架构包；本文件仅记录当前实现和已执行的证据，不能以 schema 中存在表代替业务已完成。

| 阶段 | 当前状态 | 下一门禁 |
|---|---|---|
| S00 | 分享与 ZIP 已读取，21 个文件校验通过；工作区/旧能力/数据基线及本地回退副本已保存；Magpie 0.1.4175 CLI 和官方目录契约已核验 | 本机 Magpie 网关未运行；真实外部 CLI capabilities 尚需核验 |
| S01 | SQLite、稳定身份、会话/分支、Run、command receipt、event/outbox、原子快照与游标；Work/Terminal 同库、统一 outbox 消费 | 完整服务启动失败回滚和慢消费者压力验收 |
| S02 | AgentSession、原始 entries、awaited checkpoint、工具网关、模型清单、压缩提交、安全恢复；新增 crash、checkpoint 回执重发/冲突、stdout 污染、Pi 自动重试、自动压缩原子回滚和副作用回执失败门禁均通过 | 更广的真实上游协议和断电/资源耗尽尚未验收 |
| S03 | 双会话独立 worker、Go 后续输入队列、显式 steer、独立取消、历史编辑建立新分支、UI 快速提交、托盘生命周期；补充消费去重与原分支保留通过 | 当前编辑要求先结束本会话运行/队列；实际桌面窗口行为未验收，后台/child lane 未完成 |
| S04 | 项目读写工具、持久审批、文件复核、回执及已知结果复用；Magpie 目录缓存/ETag/离线保留、按原生 endpoint 选择协议、实际响应模型记录、聊天与压缩模型绑定已接入 | 本机网关离线，只有 fixture 集成证据；完整预算、更多旧工具与 unknown reconciliation 待接入 |
| S05 | 正式记忆、来源/范围/版本、纠正/遗忘、中文 BM25/向量融合、模型换代索引、旧记忆待分类、实际请求清单、可中断整理与游标、派生摘要清理/Pi 重建和预算压缩已实现 | 完整原文删除传播、逐段依赖、真实模型语义质量与桌面流程仍需验收 |
| S06 | 多个精确/全天 ScheduleBlock、锁定/冲突检查、计划草案、独立提醒、晨报分组、终端持久现场与版本限定的 CLI 结构化结果已接入 | 真实上游 CLI observe/resume、日历及原现场返回的实际 UI 验收 |
| S07 | 持久关注、同事实去重、Pi 后台判断、免打扰、完整晨报分组、共享六维心情、固定表达快照及独立陪伴邀请已接入 | 真实模型的语义质量、长期使用效果及实际弹出验收 |
| S08 | 独立 MyGo 桌宠、持久展示协调、投递合并/回执、来源复核、Windows 静默信号、穿透区域/拖动/靠边/暂停已接线 | 实际桌面、多屏/DPI/键盘与原现场返回验收；完整表情资源仍待对照 Figma |
| S09 | 本地包 manifest/hash/作用域/依赖、A–C 支持子集、rpc UI、managed skill 读取、Go 唯一 MCP owner 和延迟发现已接入并烟测 | 广泛第三方扩展兼容、真实 MCP 服务和实际 WebView 交互；D/E 明确不支持 |
| S10 | 一致备份/校验/副本恢复、最新遗忘登记合并、旧 Planner/终端/模式迁移、schema 升级前备份及真实资料副本对账已接入 | 完整 A01–A46、正文擦除传播、干净机器安装、实际桌面及发布门禁仍未完成 |

## 当前检查命令

```powershell
node native/scripts/build-agent.mjs
go -C native test ./internal/chat ./internal/storage ./cmd/chat-dev
go -C native test . -run '^$'
pnpm exec tsc -p native/frontend --noEmit
```

runtime 测试依赖上一步的私有 Node 打包产物，所有业务数据使用临时 profile、本机模拟 SSE 服务和临时项目目录，不写真实 `%APPDATA%\Chela`。验证过的“重启”包括正常结束宿主后从已提交原始历史重建；它不能代替在任意工具指令中间断电的证明。

S02 阶段增补证据：`runtime_test.go` 当时的 16 个测试函数（自动压缩含成功/拒绝两个子场景）通过，后续阶段继续增加了对应业务场景。突发退出用实际 Node 进程终止，之后恢复相同写入调用，手工改变的文件保持不变。写入回执失败用 SQLite trigger 注入，实际文件已写、调用保持 `outcome_unknown`、后续模型请求数为零。聊天和压缩选择不同 fixture 模型，压缩完成后聊天模型偏好不变。模型角色、审批锁范围已做对应检查，前端 TypeScript 通过；不代表所有架构验收已通过。

Magpie 接口来源：[官方说明](https://github.com/yetone/magpie/blob/main/docs/reference.md#providers-and-the-gateway) 与 [目录实现](https://github.com/yetone/magpie/blob/main/internal/gateway/gateway.go)。只读取官方 `/v1/models` 目录和响应的 `X-Magpie-Model`，不接管 Magpie 的 provider/账号配置。未声明的窗口/输出容量保留未知；worker 仍使用明确的本地运行默认上限，完整预算校验待补。

## 数据与回退

SQLite 文件位于当前 profile 的 `chela.db`；旧 `chat-sessions/`、`chat.json` 等导入来源保留，导入记录与 legacy ID 映射同事务提交。schema migration 校验原始文件 hash，未知旧数据库不会被直接覆盖。回退到开工源码前应先停止当前宿主，并保留新 `chela.db` 和原始用户数据；开工副本位置见 [工作区基线](workspace-baseline.md)。

当前不支持把新 Run/分支逆导出成旧 Electron 的完整运行状态，回退前新数据需单独保管。没有进行生产切换、提交、推送或发布。

## 2026-11-15 Planner 与终端补充

- `internal/work` 复用共享 Store，`work.json` 一次性原子导入、保留原文件与 ID 映射；重复/空 ID 会回滚。任务 revision、笔记 timestamp 防止旧编辑覆盖；删除保留关联墓碑且不能由旧草稿复活。旧 `endDate` 按现有日历范围保留，不猜成 deadline。
- Board/Calendar 共用排期和期限编辑，日期保持 date-only；精确 deadline 由 Go 按 IANA 时区转换，DST gap/fold 拒绝。全天 ScheduleBlock 用本地相邻日期计算，DST 日可为 23/25 小时。
- `reminders.go` 接到 Go 调度器，与模型调用无关。once/daily/weekly、独立 Rule/Occurrence/Intention/Delivery、用户操作幂等、snooze generation、错过后补发/跳过、跨天快进、到期前复核任务/规则版本。默认界面是提醒中心，尚未实现普通气泡投递与免打扰设置。
- `plans.go` 保存来自当前会话的计划草案；读取当前项目和未归属任务。采用前检查受影响任务 revision 与时间范围中的排期快照；无关变更不废弃草案。通过日历 UI 采用，或本会话明确回复“按这个来”等受限确认文本；提交只改变排期/创建任务，不执行外部工作。当前仅支持一个全天日期范围，不能视为完整精确周计划已完成。
- `internal/terminal` 保存 TerminalSession/ExecutionLink/Observation，保留最近 1 MiB 输出，活动时每 500ms 保存、正常退出再保存。重启标记中断，原输出按需加载；点击原 ID 返回原现场，不伪装成新进程。窗格关闭只隐藏，明确“结束终端”才停止进程，任务完成仍独立。最多四个活动外部 PTY。突发断电可能损失最后 500ms 未保存输出；尚未做更强输出日志保证。
- 本机 Codex CLI 0.168.0 与 OpenCode 1.19.5 的版本和帮助已读取；虽有 resume/session 参数，当前适配器只声明 terminal 能力，没有可靠外部 session/reply ID 前不宣称 observable/resumable。未启动真实模型任务。
- 实际 Windows ConPTY 测试发现标准流重定向宿主会把 stdin/stdout 传给子进程；按 [Microsoft Terminal 说明](https://github.com/microsoft/terminal/discussions/15814) 设置空标准句柄并启用 STARTF_USESTDHANDLES。中文输入输出、exit 7、归档恢复、结束不完成任务已验证。
- 验证：整体 Chat/Storage/Work/Terminal/chat-dev 必要检查通过；随后 Plan Draft 单元场景与真实 Node worker 的提议/确认提交场景通过，前端 TypeScript 通过。尚无实际桌面 UI、真实上游 API、安装包或发布验收。未运行全量 build/lint，未提交推送。

## 2026-11-15 关注与共享心情

- `internal/companion` 消费同事务 outbox，白名单接收真实任务完成、聚合失败和用户交流评估；自身的表情/投递输出不触发新推理。来源事件处理回执和 outbox 完成同事务，启动不会重复加分。
- Attention 支持任务状态、临近期限、指定项目文件到齐、语义审视。保存原用户消息/事项/项目引用，删除、编辑分支替代、项目变更或归档时复核；文件仅对显式相对路径做 root 限制下的 stat，不遍历目录或读取文件正文。文件提议需在界面确认，外部文件变化由最长十五分钟兜底扫描发现。
- 语义审视采用同一个 Pi worker 协议、独立内部 session/branch 和后台 lane；不提供工具，单次 4000 保守输入/512 输出，每小时最多 4 次、滚动 24 小时最多 12 次，相同事实不重复调用。前台可打断后台；显式提醒独立于此额度。语义发布使用保存点，来源 revision/指纹变化会拒绝旧结果。
- 持久 Intention/Delivery 采用事实指纹去重；静默、游戏模式和范围明确的项目静默会推迟或撤销普通投递。用户可单独处理本次投递、停止关注或关闭项目主动提示。基础晨报按本地日期/时区去重，离线模型仍有事实列表。
- Affect 使用 accepted_seq 串行增量、原因唯一键、30 秒簇冷却、10 分钟新颖度/迟到窗口、六维半衰期及非负离线衰减。低置信调侃保持中性；单次纠正限幅；保存基础变化、缩放和来源用于诊断。人格版本、互动方式和短期心情分开；同一 Run 使用固定表达快照，跨会话只传简短状态标签，不传其他会话原文。明确“安静/严肃一点/恢复正常”作用于当前会话。
- 提醒入口新增关注、人格、免打扰、项目提示和晨报设置；模型用途增加主动关注。复用现有 Button/Input/Select、原生表单和 dialog；窄容器使用自动换行与自适应表单列，未运行实际浏览器/桌面交互。
- 验证：相关 Go 全套（Chat/Storage/Work/Companion/chat-dev）曾通过，后续文件/期限、来源删除和作用域修正再跑对应场景通过。实际打包 Node worker 验证跨会话心情、同轮快照冻结、后台无工具/512 输出、相同事实零重复请求、额度耗尽后前台仍能回复。Companion 测试覆盖回滚、重启衰减、模糊评估、静默/收起、删除后撤销、文件到齐及路径越界、期限跨过阈值、晨报/提醒例外。前端 TypeScript 与 main 最小编译通过。
- 当前没有独立桌宠窗口或实际弹出验收；呈现合并、全屏/锁屏检测、陪伴闲聊配额、晨报完整分组、旧模式迁移还在后续范围。有限事实输入最多 20 个任务、描述取前 500 字；超预算明确失败，不偷偷扩大模型上限。未运行真实上游、全量 build/lint、提交推送或发布。

## 2026-11-15 桌宠与展示协调

- `internal/pet` 与 `workspaces/pet` 是独立窗口的宿主和视图；共享已有 Store/Work/Companion，不创建第二套 Agent。透明窗口使用 MyGo 现成 input region，显式点击才打开主窗口里的持久 route；托盘隐藏只改变 surface 偏好。固定窗口区内命中矩形按实际 DOM 及视口裁切，DIP 位置按当前显示器工作区限制。
- `presentations` 和关联表提供同一身份最多一条气泡、持久 ID、paint 后回执、重复回执幂等。普通投递合并，明确提醒可抢占；被抢占且已显示的普通提示留在未读中心，不再次弹出。低置信 workspace-only 提示保留在工作区。隐藏/锁屏/输入忙碌不标 presented；展示前重新检查源事实与提醒规则。
- Windows 只读取 [系统通知状态](https://learn.microsoft.com/en-us/windows/win32/api/shellapi/ne-shellapi-query_user_notification_state)，不读取应用文本或键盘内容；MyGo 锁屏事件立即隐藏，全屏状态由轮询补查。配置允许的提醒例外可越过普通免打扰，锁屏无例外。其他 OS 目前只有 MyGo 锁屏能力，未实现其全屏检测。
- `TestPresentationMergeReconnectPriorityAndRevocation` 覆盖静默、合并、workspace-only、丢失回执重连、原 ID 恢复、重复 ack、提醒优先、删除和主窗口处理，验证提示不修改 task.done。相关套件、TypeScript、main/Pet 编译与临时 MyGo bindings 生成通过。没有实际启动桌面 UI，不能把以上当成透明穿透、多屏/DPI、拖拽及无障碍验收证据。
- 当前沿用 Chela 图形、简短状态和本地待机动作；完整情绪资源、语音、陪伴主动闲聊及真实桌面流程仍未完成。当前代码和文档不宣称 A35–A36 全部通过。

本节记录的是 S08 当时的边界；最新阶段状态以本文首表及 [验收状态](acceptance-status.md) 为准。完整规格仍在架构包中，不因基础链路通过而缩减目标。

## 2026-11-15 多时间块与 CLI 可定位结果

- S06 已增加多个精确/全天 ScheduleBlock、单块锁定与删除、三种时间绑定、DST 拒绝、日历显示/本地时间拖动；Pi 草案保存多个时间块，相关范围快照/事项版本/重叠在采用前复核，锁定块不可覆盖。相关业务测试及实际 Pi 提议/确认通过。草案覆盖层拖拽未做，使用表单编辑草案时间。
- 晨报已按真实完成时间、昨日遗留、今日安排/期限、可靠 CLI 未读结果分组；打开后更新当前版本且不重发。覆盖分组、已读后刷新、投递唯一性及任务状态不变。
- Terminal 增加可选结构化模式，严格核验 Codex 0.168.0 / OpenCode 1.19.5；Codex 使用本机生成的 app-server schema，OpenCode 使用对应 tag 官方事件契约。未知版本保留普通 terminal 模式；未知事件停止结果推断。两个能力分别依据已知版本和实际收到的关联 ID；未声明 controllable。
- 原始事件写 executor_events，可靠结果/已读写 execution_observations，新回复进入统一 Delivery；恢复同一终端与外部会话 ID，generation 区分进程尝试。用户可明确标为已读，Task.done 不变；看板显示派生新回复徽标。
- 已执行本机 Codex initialize 握手（无 thread/start、无模型请求）、真实 Windows 管道 fixture 和重启恢复；实际 CLI 向上游发出模型请求后的 observe/resume 仍待用户环境验收。权限请求不自动批准，需要交互时应使用普通 CLI 现场。

## 2026-11-15 陪伴邀请

独立开关默认关闭；本地规则邀请无模型调用、无跨会话正文。近期互动、前台空闲、模式/静默、每日一次、四小时展示间隔、长期不回应降频与关闭撤销已接通并通过临时数据测试。工作关注额度和明确提醒保持独立。完整对话仍由用户点击后在原会话发起。
