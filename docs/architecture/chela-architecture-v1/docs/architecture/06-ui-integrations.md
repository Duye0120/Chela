# 06 · 界面、计划、终端、模型与能力集成

## 1. UI 的责任

已有 Figma 是视觉和布局来源，本章规定交互行为与数据关系，不另起一套视觉重设计。React 的职责是展示、输入、局部草稿、流式反馈和可恢复订阅；业务事实与长期状态由 Go 持有。

建议按现有稿映射以下功能区域：会话列表和对话；任务/看板/日历；终端现场；记忆查看与纠正；桌宠及通知历史；模型、扩展、权限与诊断设置。这不是要求新增六个固定导航页，最终布局沿用已有设计。

前端 store 分为 server state、ephemeral UI state、drafts。server state 有 revision/cursor；ephemeral state 包括展开、选中、滚动；草稿独立保存，不因新主动消息或会话切换丢失。流式文本以 stream_id 归属 message/run，重连后用已提交 message 替换，不能不断追加成重复内容。

## 2. 会话交互

发送消息时 UI 生成 command_id，立即显示发送态；Go 持久化后返回 message_id/run_id。若已有同分支 Run，默认新消息进入Go持久follow-up队列并建立下一Run，当前Run settled、提交完成并交接分支租约后再启动；用户明确“补充当前任务”则 steer。两者在输入区显示区别，可取消尚未消费的输入。普通后续消息不同时调用Pi followUp；Pi内部followUp只用于明确属于同一Run的续入，必须共用input_id消费记录，禁止再次启动同一输入。排队输入在UI中可见，但在被消费前不能追加到当前Pi执行历史。

Steer 只改变当前 Run 的意图和已允许范围内的信息；涉及另一个项目、新权限或新的输出目标时，Go 建立新 scope 的后续 Run，当前 Run 安全收口。编辑已提交旧消息会建立新分支，原运行不被悄悄挪到新历史。切模型默认从下一次推理安全边界生效，并记录实际模型；已经在执行的工具不因下拉框改变而重放。

工具展示使用 invocation_id，保留名称、关键参数、真实状态、耗时、结果摘要和“查看详情”。并行工具可以显示为同批，但审批逐项绑定最终参数。内部 prompt、完整工具 schema、hash 和 reducer 版本默认放诊断面板，不塞进普通用户流程。

## 3. Planner 的统一数据模型

| 实体 | 意义 | 不混用的状态 |
|---|---|---|
| `PlannerItem(kind=note)` | 备忘录与资料笔记，保留旧note、sourceUrl等 | active/archived，可读可编辑，不强迫转成任务 |
| `PlannerItem(kind=task)` | 想完成的事情，标题即可建立 | todo/doing/done/cancelled，完成要有明确完成动作或已约定的可靠规则 |
| `PlannerItem(kind=calendar_event)` | 会议、预约等本身占据时间的事件 | scheduled/cancelled；时间过去不等于某工作任务完成 |
| `ScheduleBlock` | 给某任务安排的一段时间 | start/end/timezone/locked；同一任务可有多个时间块 |
| `ReminderRule` | 希望何时得到提示 | 开启、暂停、重复规则；与任务完成分离 |
| `ScheduleOccurrence` | 一次具体提醒或计划触发 | pending/claimed/fired/skipped；幂等依据 |
| `ExecutionLink` | 任务与一个内部 Run 或外部终端的关系 | 记录执行现场，不能替代任务状态 |
| `Delivery` | 用户看到的那条提醒 | presented/seen/dismissed 等，与以上实体独立 |

列表、日历、看板只是这些记录的不同查询。看板的“有新回复/待查看”是基于可靠未读结果的派生徽标或列，保留 task 的原业务状态；不强制新增“待验收”阶段。任务执行可以多次，每次 ExecutionLink 保留来源。删除一条排期不自动删除任务；调整排期不自动改截止日；稍后提醒不自动挪动日历。

复杂的内部执行计划仍由 Run 维护，可以在详情展开。普通用户不需要填完成标准、交付物清单或审批模板才能创建一条待办。

## 4. 自然语言周计划

“帮我把这周排一下”产生 `PlanDraft`，不是立即写满日历。Go 先读取已有事件、任务、用户工作时间和锁定时间块；Pi 提议拆分与排期，输出引用现有 ID 或临时 ID 的 changes。估时必须标 estimated；不能把模型估算写成实际工时。

持续讨论和拖动草案更新同一 draft revision。用户说“按这个来”即提交所见 revision；Go 检查受影响对象及时间段是否改变，发现冲突给出可解释 diff。无关日历变更不必废掉整份草案。提交事务创建/更新任务与 ScheduleBlock，关联明确要求的提醒，再发布变更事件。

用户直接说“把周三这件事移到周四下午”且指向明确，可以直接执行该范围的修改；不为每次可逆编辑追加确认。草案确认是为了选择排期方案，也不等于授权计划中所有外部发送、发布或破坏性操作。

## 5. 晨报与日终整理

晨报由事实快照和可选建议组成。事实由 Go 查询：昨天完成按真实 completed_at；昨天遗留按昨天排期且尚未完成；今天安排按 ScheduleBlock/日历事件/明确期限；CLI 新结果单独列为待查看。Pi 可以总结与建议顺序，不能把无回执工作润色成“昨天做完了”。模型离线时事实清单照常存在。

`report_key=(assistant_id,local_date,timezone)` 用于同日主动投递去重；重新打开可更新内容版本，不重复弹窗。多天未启动只主动展示当前有效概览，历史进展可用“上次使用以来”单独展开，不补弹多份过期晨报。

日终整理可以更新解释性工作快照、提出记忆与关注事项，不能自动把未完成任务改成 done，也不要求用户填写一套复盘表。是否出现日终提示取决于用户设置和打扰预算。

## 6. 外部 Codex / OpenCode 执行器

`ExecutionAdapter` 接口统一为 `ProbeCapabilities / Launch / Attach / SendInput / Cancel / Resume / Observe`，每个适配器声明版本与支持等级。

| 等级 | 可靠知道什么 | 产品表现 |
|---|---|---|
| terminal | PID、PTY输出、退出状态、cwd、用户输入 | 可以回到现场；显示运行/退出；不猜业务完成 |
| observable | CLI 官方事件或结构化输出可提供 session、turn、reply ID | 可标有新回复、需输入或失败；保留原始事件证据 |
| resumable | 官方支持按已知 session ID 恢复，参数和版本已验证 | 重新打开原会话；恢复失败时保留历史并解释 |
| controllable | 官方接口支持可靠发送输入、取消、结果读取 | 可编排受授权执行，仍按该CLI自身能力边界 |

表中能力分别用flags声明，不假设支持resume就必然支持结构化observe。能力是每个安装版本的实测结果，不能因为品牌名就默认全部支持。完整终端文本可以用于展示，不能用匹配“done/完成”正则来宣布任务结束。结构化输出解析器必须版本化；未知格式降为 terminal 等级，不能错误猜测。

Chela 记录 `terminal_session_id, executor_kind, adapter_version, external_session_id?, cwd, process_ownership, started_at, process_state, last_result_ref?, task_id?`。Task 与终端关系通过 ExecutionLink，既允许同任务多次执行，也允许一个终端独立存在。

结果提醒动作是稳定 route：`terminal_session_id + result_ref + result_version`。点击打开原 tab 并定位可识别结果；关闭 tab 只释放视图，重开连接原 PTY。进程已结束时打开归档输出，并提供在能力支持时恢复；不把一个新空终端伪装成原现场。

普通终端只有滚动位置和聚焦，无法证明用户看见了某条回复；只有可靠 result ID、对应区域已展示后的客户端 ack 或明确用户动作，才能发 `reply_seen`。这仍不改变 task.done。“标记完成”是单独明确动作。

PTY 由 Go 的平台适配层拥有，Unix 使用 PTY/进程组，Windows 使用 ConPTY/进程树机制；发布前验证目标 OS。为保留旧版能力，迁移初期可以将已有 node-pty 封装为独立 terminal worker，契约保持一致；最终是否替换底层库取决于兼容验证，不为了语言纯度破坏中文输入、resize 和恢复输出。

启动参数使用 argv 和经校验的 cwd，避免把用户内容直接插入 shell 命令。用户明确需要 shell 表达式时以专门 shell 能力执行，展示真实命令与边界。CLI 凭据由其自身或明确配置管理，Chela 不复制所有认证配置到 Pi worker。

## 7. Magpie 与模型角色

Magpie 的具体 API 在当前仓库审计时确认；本架构只规定 Chela 侧 adapter，不编造不存在的上游路由。接口至少包含 `FetchCatalog(etag?) → CatalogSnapshot` 与 `ResolveRoute(model_ref, role, required_capabilities) → ResolvedModel`。若 Magpie 同时提供推理网关，返回网关 endpoint/credential reference；若仅提供目录，返回 provider adapter 所需配置。

模型记录的最小能力：provider/model ID、上下文窗口、最大输出、文本/图像输入、tool calling、流式、结构化输出、推理选项、已知价格及时间戳。未知值必须标 unknown，不填推测默认值伪装准确。Chela 可以保存用户本地 override，但显示其来源与过期时间，不覆盖 Magpie 上游事实。

角色建议为 `chat / compaction / memory_extract / consolidation / proactive / embedding`。多个角色可绑定同一模型；角色不对应多个永久 agent 人格。用户明确选的模型是主要偏好，自动降级只在预设策略允许时进行，事件中记录 requested 与 actual。需要图像或工具的 Run 不能静默降到不具备对应能力的模型。

网络断开时使用最后成功目录快照并标记过期；能否调用模型取决于真实 endpoint 是否可用。无缓存时可以使用用户明确配置的模型记录，不能编一个目录。“模型不可用”不阻塞本地日历、确定性提醒、已有记忆浏览或外部终端。

模型选择必须和上下文预算协作：切到较小窗口先重新装配/压缩，不直接复用大窗口 prompt；切换 embedding 使用新 encoder 版本重建索引，不能混算相似度。

## 8. 工具、MCP、skill、插件的职责

| 类型 | 内容 | 谁执行/解释 | 生命周期 |
|---|---|---|---|
| 内建能力 | 文件、系统、planner、memory、终端等稳定 API | Go ToolGateway | 随应用发布，可模块化启停 |
| MCP server | 外部工具/资源与连接 | 唯一 MCP adapter，工具映射进网关 | 显式连接配置、能力变更与重连 |
| skill | 操作说明、模板、脚本引用 | Pi 按任务加载，脚本仍通过实际执行能力 | 有来源与版本，不因文档内容扩大权限 |
| Pi extension | 生命周期、工具、命令、custom entry、UI请求 | PiExtensionHost | 兼容等级 + 执行信任类别 |
| 外部执行器 | Codex/OpenCode等完整会话运行时 | ExecutionAdapter | 独立会话与进程，不嵌入第二份内部Pi循环 |

为每项能力保存 manifest：ID、版本/hash、入口、依赖、配置 schema、工具命名空间、权限说明、兼容等级、信任类别、启动/停止能力、健康状态。名字采用稳定 namespace，避免两个来源同名覆盖。启用和重载前校验依赖环、缺失依赖、重复注册；失败回滚已经启动的资源。保存每个注册的 dispose 回调，防止重复定时器和事件监听。

工具发现分两层：常用少量工具直接进入 prompt，其他能力通过目录搜索获得名称/schema，再装入当前会话。不能只让模型看到名字却无法获知参数格式；加载后的版本固定到本轮调用。MCP 连接只能由一个层拥有，禁止 Go 和 Pi extension 同时连同一服务又注册重复工具。

安装后的普通第三方 Pi extension 默认 `trusted-native`；只有经过适配、所有受治理操作确实走 Go stub 的官方或审核实现，标 `managed`。兼容等级 A–E 与信任类别是两个维度。前者回答“能不能工作”，后者回答“哪些行为经过 Chela 的运行管理”。所有模式都不把插件输出当新的用户指令。

首版允许运行时启停已验证的模块，但不要求在活动 Run 中热替换任意代码。新增核心模块随安装器更新是正常扩展路径；工具或schema变化在 idle 边界生效，需要时重建 worker。未完成兼容的插件显示明确状态，不以静默忽略代替支持。

## 9. 桌宠与展示仲裁

桌宠是独立窗口，主窗口隐藏后仍可存在。首选通过 MyGo 的轻量原生绘制视图承载小圆脸与本地动画；定义 `PetSurface` 接口隔离绘制实现，如果目标平台透明窗口、命中区域或合成效果无法满足稿件，再切专用 WebView 视图。变更渲染适配器不改变桌宠的状态和交互。

桌宠窗口负责位置、靠边停驻、探头、拖动、点击和展示；表情资源来自已有设计资产。透明、置顶、点击穿透、屏幕缩放、多显示器、任务栏/全屏遮挡要逐平台实测，不能从窗口 API 名称推断效果相同。

Presentation Coordinator 决定当前 surface owner；用户直接交互优先于明确提醒，普通主动提示其次，空闲动作最后。一个气泡、声音、动作共用 presentation_id。动画只读取有限 ExpressionPlan 和本地时间；眨眼、呼吸、回弹不调用模型。降低动态效果和静音设置立即生效。

桌宠默认不抢键盘焦点，不覆盖用户正在输入的草稿；点击后才进入对话输入或原任务。多个 Run 的更新合并成合适摘要，不能同时让桌宠说三句话。

## 10. 关闭、取消、已读的精确语义

| 用户动作 | 系统行为 |
|---|---|
| 主窗口 X | 隐藏到托盘；宿主、授权 Run、桌宠继续 |
| 切页面/关任务抽屉 | 仅解除/变更 UI 订阅 |
| 对话“停止” | 显式 CancelRun，不撤销已发生副作用 |
| 气泡“收起” | dismiss 本次事实的投递，不偷偷预约重弹 |
| “稍后提醒” | 设置明确 snooze，保留原任务和截止日 |
| “以后别提醒这件事” | 更新对应 Attention/Reminder 范围并撤销待投递意图 |
| 隐藏桌宠 | 禁用该 surface，工作区未读和后台任务保留 |
| “标记完成” | 单独提交 planner 完成命令，留完成时间和来源 |
| 托盘“退出 Chela” | 持久化、结束应用拥有的 worker/PTY，标中断并退出 |
| 重新启动 | 恢复记录与窗口，按 catch-up 规则补有效事项 |

仅附着、由用户独立启动的外部进程不因 Chela 退出而被杀。应用退出后或电脑关机时没有后台处理；下次启动只是按真实事件和时间补查，不声称离线期间一直在工作。
