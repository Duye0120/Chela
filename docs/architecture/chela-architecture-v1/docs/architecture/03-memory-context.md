# 03 · 记忆、上下文与连续性

本章的产品约束是：Chela 始终是同一个助手；会话隔离工作现场，人格与适用的长期记忆可以跨会话延续。Go 是正式状态的唯一写入方，Pi `AgentSession` 是唯一 Agent loop，worker 内会话及消息只是可重建投影。下面的阈值都是**首版可调默认值，不是已验证的最佳值或性能承诺**。

## 1. 旧实现审计与继承

本节依据旧 Electron main，commit `3bc4297f5cddf8f26aa387dfaf0b477180ea3297`，实际读取 `src/main/memory/pipeline.ts`、`store.ts` 及 `src/main/context/engine.ts`、`budget-transform.ts`、`snapshot.ts`。它不代表未推送的 Go 分支。

| 旧实现中已确认的能力 | 新实现处理 |
|---|---|
| memdir 先保存、向量写入失败仍保留正式内容；查询改写失败回退；双检索独立降级 | 保留思想，正式记忆、版本与索引任务改成同一个 SQLite 事务；向量成为可重建索引 |
| 候选提取、长期价值过滤、`sessionId/sourceRunId`、刷新报告 | 保留并增加来源事件、作用域、版本、有效时间、删除依赖 |
| 同 session/run 的内存 Promise 去重 | 改为持久幂等键、租约与游标，覆盖重启和重复投递 |
| 快照含当前任务、决策、未闭环、重要文件；模型摘要失败可用启发式摘要 | 保留结构与降级；任务和审批的真实状态每次从领域表读取 |
| 裁剪前检查快照覆盖；保护最近六次用户输入；revision 竞争检查；三次自动压缩失败后阻止重复尝试 | 保留覆盖检查与退避，改用完整工具组、安全切点及分支前缀校验；六轮只是候选策略，不能成为数据安全条件 |
| 旧预算使用字符估算，系统段约占窗口 18%、消息约占 70% | 改为一次调用的统一总预算，覆盖系统提示、工具定义、消息、图片和输出预留 |

已读代码中，旧向量合并按摘要文本匹配旧条目，再尽力删除；新版本必须用稳定 ID 关联。`confidence_desc` 实际按命中次数与反馈排序，不能被迁移成事实可信度。`0.72`、`0.65`、`6000` 字符仅是旧默认参数。本次读到的文件没有 T0/T1/T2 的完整定义；**保留已验证功能，按实际语义迁移旧数据，不按层级名称猜测含义**。

## 2. 六种内容必须有不同所有者

| 内容 | 意义与所有者 | 能否被摘要改写 |
|---|---|---|
| 原始事件 | 用户说了什么、工具请求及回执、状态迁移；Go 事件服务保存 Pi 原始 entries 与检索索引 | 不改历史；编辑形成新版本或分支，删除有专门流程 |
| 正式领域状态 | 任务、计划、审批、发送结果、文件版本、日程；相应领域服务持有 | 不能；摘要只能引用记录 ID 和读取时版本 |
| 长期记忆 | 有来源的偏好、事实主张、项目决策、操作经验、经历 | 可以提议更新，经规则校验后发布新版本 |
| 持续关注事项 | 需要继续留意、适时行动的事情；Attention/任务服务持有 | 不能由“记住了”代替登记，也不能由摘要自动完成 |
| 工作现场快照 | 某一分支的目标、解释性进展、未解决问题及证据引用 | 可以重建；不具有执行授权或领域状态权威 |
| 单次调用上下文 | 一次模型请求实际看见的输入及其清单 | 固化供诊断；下一次调用重新构建 |

人格定义、长期记忆和当前情绪分别版本化。全局人格描述 Chela 的身份与稳定表达方式；当前情绪由情绪状态机维护；某项目的秘密或争论不能通过“人格总结”进入所有会话。情绪可以影响表达，不参与记忆真实性评分。模型说“已完成”不等于任务完成；发送是否成功必须有工具回执，计划进度必须来自任务服务。

## 3. 记忆记录及作用域契约

一条记忆表达一个可单独纠正的主张，不保存大段无边界聊天。根文档可调整表名，但必须保留下列语义字段。

| 维度 | 必须字段与规则 |
|---|---|
| 身份 | `memory_id, revision, assistant_id, kind, subject_id, slot_key`；kind 为 preference/fact/decision/procedure/episode，slot_key 用于同一主题的版本竞争 |
| 范围 | `scope_type, scope_id`：assistant 全局、project 项目、session 会话；conversation 仅作产品语义，不是额外枚举值。事件来源的 session/run/branch 独立保存，来源不等于适用范围 |
| 可见性 | `disclosure_class` 与可见范围；本轮可访问 scope 集由 Go 根据会话项目、授权和用户当前请求计算，模型不能自行扩大 |
| 时间 | `recorded_at, valid_from, valid_until, last_verified_at`；记录时间与事实生效时间不同；期限到达后立即退出当前事实检索 |
| 来源 | `source_type, source_event_id, source_revision, span_start/end, source_hash, source_actor`；多条证据用独立关联表 |
| 可信性 | explicit_user / observed_receipt / imported_claim / model_inference；再存 asserted/corroborated/uncertain，不伪装成校准过的概率 |
| 生命周期 | candidate / active / disputed / superseded / expired / erased；`supersedes_id/revision, conflict_group_id, erase_epoch` |

“用户说 API 地址是 X”可以可靠记录为用户主张，但不证明 X 当前可用。工具成功回执证明那个操作的结果，不自动证明回执正文里的所有外部说法。外部网页、文件与历史消息始终以资料身份进入上下文，不因被存入记忆而获得系统指令权限。

全局范围用于用户明确的跨场景称呼、稳定习惯，以及明确允许跨项目使用的事实。若某偏好键已有 identity/settings 正式设置，该键只有一个当前值：自然语言明确更改由 Go 转为对应设置命令，记忆保存来源与设置版本引用，不再维护竞争的第二个值；其余长期偏好由 Memory 持有。项目配置与决策默认项目范围；本轮临时目标默认会话范围；“这周用短回答”附有效期，不替换永久偏好。用户明确要求跨项目引用时，该请求可建立新的适用范围，无需机械追问；已固定的 RunScope 不原地扩大，由 Go 建立带新 scope 的后续 Run。系统不能仅因向量相近自动搬运其他项目内容。凭据原文不进入自动记忆，只保留凭据管理器中的安全引用。

## 4. 写入、纠正与冲突

写入路径固定为：原始事件提交 → 提取候选 → 确定性校验 → 短事务发布 → 异步索引。模型只返回有来源的 `MemoryProposal`，不直接执行 SQL、不直接编辑人格，也不自报“已经记住”。

确定性校验检查事件存在且未撤回、来源跨度正确、范围可用、期限合法、类型允许、删除屏蔽规则以及期望版本。用户明确的“记住”“以后都这样”可以直接发布到适用范围；一般推断先进入 candidate，不因为重复生成同一句摘要就升级。相同源事件的转述不算独立证据。

发布事务包含：写新 revision、更新当前版本、标记明确被取代的版本、登记 provenance、递增范围 epoch、更新词法检索投影、写向量 outbox。用户的显式纠正优先于旧推断，但仍检查范围和有效时间。“这个项目用 pnpm”不会覆盖其他项目的 npm 决策。

对同一 `scope + subject + slot_key` 使用唯一memory_slots记录和`expected_slot_revision`，覆盖首次创建；具体memory头更新再校验`expected_revision`，不同新memory_id不能绕过同slot竞争；事务发现版本已变化则返回 conflict，由调用方重新读取。两个会话同时给出不兼容事实时保留冲突证据，不用最后完成的模型调用覆盖前一个。用户明确说“改为 X”且引用相同适用对象时可以 supersede；无法确定是否替代时标 disputed，检索时展示双方与日期，只有影响当前决策时才需要澄清。

命中次数、反馈、最近使用时间只影响检索效用，不修改事实可信性。正式记忆成功而 embedding 失败时，仍通过词法检索可用，outbox 重试；模型提取失败不影响已经提交的对话与工具结果。

## 5. 检索与中文搜索

`Retrieve(Query, ScopeSet, AtTime, TokenBudget)` 返回 `EvidenceBundle`，每项带 memory/version、来源、适用范围、有效时间、冲突标记和可重新读取的引用。

检索顺序固定：先计算允许范围，排除删除、过期、被取代和未发布候选；再做实体/路径/明确 ID 精确查询、词法查询及向量查询；融合后按当前正式版本复核，最后做去重和 token 裁切。不能先全库向量召回，再把泄露的结果交给模型自行忽略。

首版采用 SQLite FTS5，并由 Go 写入预分词后的 `search_tokens`：拉丁词与代码标识保留；连续汉字生成二字词元，查询端使用相同算法。精确项目名、实体和路径另有规范字段查询。单字检索只在已确定的范围内做有界回退，最多 100 个候选；不是全库扫描常规路径。分词器版本入库，升级后可完整重建。这个方案是首版工程选择，不宣称语义质量已验证。

SQLite 官方明确：trigram 查询少于三个 Unicode 字符不能匹配，因此不能拿它直接承担所有中文短词搜索。外部内容 FTS 表需要应用维护一致性；首版使用事务内触发器同步，迁移旧数据后显式 rebuild，并做一致性检查。[S2]

词法与向量各取最多 40 个允许候选，使用 RRF 融合，初始常数 60；最多 20 个进入重排，最终通常不超过 12 条、4,000 tokens。没有相关记忆就返回空。以上均可调。检索改写失败回退原问题；embedding 不可用回退词法；某一路超时不阻塞另一条有效结果。

向量键必须包含 `memory_id, revision, encoder_id, encoder_revision, dimension`。不同模型空间不混排；换模型时建立新索引批次，完成后切换读版本。索引返回的 ID 必须重新查询正式表，失效 revision 即使尚未物理删向量也不得出现在提示中。第一版可以在允许候选范围内计算余弦；达到实测瓶颈后再替换向量后端，接口不变。

## 6. 一次调用的上下文与预算

上下文从同一逻辑快照构建：Go 组装平台硬约束、人格版本、会话与项目规则、实时领域状态、适用记忆及工具证据；Pi 根据正式 entries、工作快照对应的 compaction entry 与 active leaf 构建合法消息历史。两者通过 PiBridge 合成同一次模型请求，Go 不维护另一份自行裁剪的消息数组。稳定段尽量保持内容和顺序稳定；与当前请求无关的长期内容不常驻窗口。Anthropic 的资料支持“有限注意力预算、相关核心信息加按需检索，以及压缩可能丢失细节”；它不为本章的具体阈值背书。[S1]

窗口 W 与能力来自 Magpie/模型适配器；Chela 不另养模型目录。输入可用量 `B = W - output_reserve - protocol_guard - estimation_margin`。首版 guard 为 `max(1024, 2%W)`，估算余量为 `max(2048, 5%W)`，输出预留按本次模型参数取值。模型窗口未知时采用连接配置中的本地上限，并明确标 unknown，不能伪称模型实际容量。B 不够容纳强制内容时停止这次请求并报告容量原因，不静默丢弃用户约束。

计数包含工具 schema、消息封装、文本、媒体和输出预留；有准确 tokenizer 时使用它，否则使用 UTF-8 字节数加协议预留的保守估算，并与返回 usage 校准。估算不是精确保证。当前用户输入、有效禁止事项、未决审批、工具调用及对应结果属于强制内容；可选记忆、旧工具大输出、过期探索优先缩减。不得把固定比例或“最后六轮”当作强制内容一定能放下的证明。

首版在已用输入达到 72%B 时于安全边界准备压缩；达到 88%B 时必须成功压缩或减少可选材料，再发下一次请求；目标回到约 55%B。完整工具输出另存 blob，提示中保留调用参数、成功/失败、关键数据和 blob 引用。不能一律只留首尾字符，导致错误码、文件路径或结果语义消失。

每次调用持久化 `ContextManifest`：run/attempt/session/branch、head seq、scope epochs、persona/mood 版本、规则及工具版本、选中记忆 ID/revision、快照 ID、原文引用及哈希、预算估算、最终 packet hash、erase epoch。短只读事务取得这些 ID 与版本，事务外读取大 blob 并组装；发出前复核 branch generation 与 erase epoch。它记录模型实际看到了什么；不要求另存模型内部思考。普通记忆更新在下一步生效，删除触发受影响 attempt 取消与重建。执行工具前仍按当前领域状态、权限和删除版本复核。

## 7. 在线压缩：覆盖正确，才能移出原文

**Pi `AgentSession` 是 compaction 唯一执行者。** Go Context Engine 负责预算、触发政策、输入组装、覆盖校验和持久化；Chela 通过 Pi compaction hook 生成结构化摘要。手动压缩、阈值触发及 prompt-too-long 恢复均进入同一 PiBridge 协议，不并行保留“Go 裁剪 messages”和“Pi 自动压缩”两条实现。

每条 branch 有一个 canonical writer。Go 发出 `CompactRequest`，携带 branch/generation、canonical revision、base snapshot revision、候选源 entry 清单、前缀哈希、cut seq、erase epoch。Pi 在允许区间内计算合法切点：一条 assistant 的全部 tool calls 与对应终态结果属于同组；pending 工具、未决审批、当前用户纠正及未收口动作不能被切开。取消/失败取自真实记录，不为凑合法消息而伪造成功回执。

hook 生成受 schema 限制的摘要：目标、已确认决定、解释性进展、未知项、待继续事项、实体/文件引用、错误与避坑、来源映射。用户有效约束与真实任务/审批状态由 Go 直接组装，不依赖模型复述。“完成”必须附领域记录或工具回执引用，否则只表示“助手曾声称完成”。摘要模型调用在数据库事务外执行。

提交顺序必须完整实现：

1. PiBridge 将该 attempt 标成 `compaction_pending`，阻止普通模型调用、自动重试与工具继续；仅放行本次受控摘要请求及 checkpoint 协议。新增用户输入仍可落盘排队。
2. Pi 生成摘要和对应 compaction entry。Bridge 提交原始 entry、期望 active leaf、coverage 与源引用；Go 检查 JSON、必保留约束、完整工具组、entry 与摘要一致性，以及 branch generation、前缀哈希、base revision 和 erase epoch。
3. Go 在**同一个短事务**提交 Pi compaction entry、active leaf、新 canonical revision、工作快照及 `SafeCutToken`。令牌绑定 branch、cut、snapshot revision、Pi entry ID 与校验信息；任何一项失败都不发布新正式状态。
4. Go 返回 checkpoint ack 后，Bridge 才允许 Pi 切换并使用新 projection、恢复模型和工具入口。`SafeCutToken` 授权的是这个 Pi projection 变化，不授权另一个 Go 消息裁剪器。ack 丢失时从 Go 正式 entries 重建，不能猜测提交是否成功。

公开 SDK 的摘要 hook **不等于已承诺支持上述提交事务钩子**。优先在版本适配层暂存候选 entry、等待 ack 再应用；若该 SDK 路径只能先修改内存 SessionManager，修改结果必须保持 tentative，Bridge 在下一次模型请求、自动重试、工具入口全部设门禁。提交失败、校验失败或 ack 状态不明时销毁该 worker，按 Go 正式 entries 重建，绝不让 tentative projection 继续执行。无法证明某条内部调用路径受门禁控制时，禁用该路径或在固定版本 adapter 中补齐屏障后再启用。集成验收必须覆盖自动 compaction，不能仅验证手动入口。

**仅尾部追加不会使原前缀摘要失效**。新输入若尚未进入 Pi entries，保持队列等待本次提交；若 canonical tail 已追加，Bridge 先让 Pi 基于最新 tail 重新生成合法 parent/leaf 提交信息，再做 CAS，摘要可复用。Go 不自行修改 Pi entry 的父子关系。编辑旧消息、回滚分支或删除来源使前缀/generation 变化，则丢弃摘要；兄弟分支摘要不能混用。原始 entries 继续按保留策略保存。

新摘要从明确覆盖区间的原始事件及已验证结构字段构建，不能无限“摘要再摘要”而失去追溯。大历史按分段来源读取，必要时重新提取原始决策。结构校验只能证明覆盖与引用一致，不能证明模型语义百分百无损；重要操作始终回查原始约束和正式状态。

压缩失败保留正式旧快照、entries 和游标；tentative worker 按上述规则销毁。连续三次失败暂停自动重试，保留手动重试能力。prompt-too-long 通过同一 Pi compaction 协议重建输入后重试该模型调用一次，不能重放此前已成功的副作用工具。

## 8. 空闲整理：持久队列与可中断工作

“睡眠整理”是后台任务类型，不是另一套无人监管的 Agent loop。它复用同一个 Pi 接口、调度器、模型路由与费用记录，在已授权范围内整理候选、关联重复证据、提出冲突或更正、形成经历摘要；不能顺手改变任务状态、人格硬规则或用户权限。Letta 官方将 dreaming 描述为近期对话复盘与后台记忆整理，说明该流程可以与前台响应分开；本章不依赖 Letta 实现。[S4]

首版触发：有未处理的已到终态运行，且前台空闲五分钟；或显式“整理记忆”。后台并发最多 1，与系统 foreground 2/background 1 的配额一致。每批最多 128 个事件或 12,000 输入 tokens，先到即止。新用户交互到来时取消或暂停模型请求，交还后台资源；已完成批次不回滚，未发布提议可重做。

`ConsolidationJob` 必须持久化 scope、`from_seq/to_seq`、源集合哈希、extractor_version、状态、lease_owner、lease_until、fencing_token、attempt_count。幂等键由 scope、源范围、源集合哈希及 extractor_version 组成。租约首版 120 秒、每 30 秒续约；回收时递增 fencing token，旧 worker 即使迟到也不能提交。

游标是“已经明确处理到哪里”，不是“模型最后读到哪里”。发布事务同时写入合法记忆变更、逐项处理结果与新游标；事务前崩溃整批重做，事务后崩溃依靠幂等键返回已有结果。处理结果为 rejected/no_candidate 的事件也能推进游标；临时失败不能跳过。遇到新纠正、删除或范围变化，依据版本和 erase epoch 拒绝过期发布，再重新提取受影响批次。

已具备整理资格的事件进入 `memory_eligible_events`，分配 assistant 级 `eligible_seq`，按 scope 维护游标并保留原始 event seq 与 branch。用户显式记忆请求随原事件提交入队；普通内容在运行终态事务中入队，同一来源设唯一键。游标跟随资格队列，不能在原始事件流上跳过仍在运行的记录，否则它以后完成也不会再被处理。被撤回版本与不再有效的编辑后缀不自动提炼成全局事实。更新提取器版本产生新任务，不能把旧游标归零后重复增加证据权重。

## 9. 跨会话连续性与忘记

新会话加载同一人格版本、当前情绪状态的适当表达信息、适用全局记忆与当前项目记忆；不自动塞入另一个会话的全文、pending tool call 或审批。用户说“继续昨天那个方案”，先检索来源会话和任务记录，建立带来源引用的 handoff；沿用目标与证据，动作依照当前状态继续。会话 A 未完成的任务仍属于原任务记录，不因 B 提到它生成第二个副作用任务。

遗忘有两个不同指令语义。“别再记这件事”使对应记忆退出检索，并建立来源屏蔽规则，防止夜间整理从仍在的旧对话重新学回；“删除这段聊天/项目数据”进一步删除或脱敏对应原始载荷及其派生物。前者不应擅自删除整个聊天。

删除事务先标 erased、递增 erase epoch、登记依赖失效和索引清理 outbox，确保下一次检索立即不可见；再清理向量、FTS、派生快照、缓存及受影响的上下文副本。删除的原文不能藏在 tombstone 中；用 ID、版本、受控指纹记录屏蔽关系。被删除来源是唯一依据的记忆必须失效，有独立合法来源的记录重新计算证据集。备份清理遵守明确保留策略，恢复时先重放删除登记，避免复活。已发给外部模型的历史请求无法靠本地删除撤回，界面不能声称已经撤回。

## 10. 存储、事务与模块接口

| 实体 | 必要用途与索引 |
|---|---|
| memories + memory_revisions | 当前头与不可覆盖版本；索引 assistant/scope/status/valid_until、subject/slot；同一头更新采用 CAS |
| memory_provenance + memory_relations | 来源 event/revision/span、supersede/conflict/derived 关系；反向来源索引支撑删除传播 |
| scope_epochs + erasure_rules | 范围变更号、删除屏蔽；上下文发布与任务提交时校验 |
| memory_search + embeddings + outbox(kind=memory.index) | 同事务词法投影、分模型向量、异步索引任务；outbox 有唯一操作键和重试状态 |
| context_snapshots + context_manifests | 分支覆盖、前缀哈希、调用输入清单；索引 branch/cut/revision 与 run/attempt |
| memory_eligible_events + consolidation_jobs + cursors | 资格队列、可抢占租约、fencing、已处理范围及幂等结果 |

SQLite 使用 WAL；写事务保持短小，任何模型/网络调用都在事务外。WAL 允许读写并行但仍只有一个写者，因此 Go 集中提交，避免多 worker 争抢长事务。官方 WAL-reset 说明确认修复包含在 SQLite **3.51.3 及以后**，并回移到 **3.44.6、3.50.7**；发布必须使用含该修复的构建，锁定 Go driver 及实际 SQLite 内核版本，以 `sqlite_version()`、`sqlite_source_id()` 和构建清单验收，不能只检查 Go 包版本。[S3] 正式状态采用能满足断电持久性要求的同步策略；NORMAL 不保证每次提交都已抗断电持久落盘。向量重建使用短批次，长读分片，避免阻塞 checkpoint。FTS、索引 outbox 与正式版本同提交；外部向量允许最终一致，但读取必须经过正式版本过滤。

建议模块遵循总架构目录：`internal/domain/memory` 管提议/发布/检索/遗忘，`context` 管预算/清单/覆盖，`consolidation` 管批次与游标。对外方法为 `Propose`、`Commit(expectedRevision)`、`Retrieve`、`Forget`、`Assemble`、`RequestCompaction`、`ClaimConsolidationBatch`、`CommitConsolidationBatch`。PiBridge 的 checkpoint 提交协调 Pi entries 与 Context coverage 的同事务发布。接口接收 scope 与版本上下文，不接受裸 SQL；Pi 执行唯一压缩与消息投影变化。

## 11. 迁移与验收门槛

迁移先导出旧 memdir、向量库、会话事件与快照，生成计数和校验和清单；保留 legacy ID 映射。memdir 与向量中的重复内容按来源合并，不把命中次数当证据。来源缺失标 unknown，作用域不明先放待分类区，不自动发布全局。未知 embedding 模型的数据保留原值作可回滚归档，重新索引后再参与新检索。旧快照可以显示及作为重建输入，只有通过 Pi compaction 协议及 coverage 校验，才成为 Pi projection 的已提交压缩依据。迁移必须可重复运行、可恢复、可对账，不删除旧数据直到完成切换验收。

| 验收场景 | 必须观察到的结果 |
|---|---|
| 用户在 A 说“以后叫我老大”，新建 B | B 使用全局有效称呼，并能追溯来源 |
| A 项目讨论私密配置，B 无该项目范围 | 词法、向量、摘要、人格段均不出现该信息 |
| 两个会话同时改同一项目决策 | CAS 阻止静默覆盖；显式取代或冲突记录可查看 |
| 压缩期间新增用户纠正 | 新消息留在 tail，下一次请求包含纠正；旧前缀编辑则弃用结果 |
| 多工具并行时压缩、随后切换分支 | 调用与回执始终成组；兄弟分支快照不混用 |
| Pi 已在内存应用压缩，但 Go 拒绝提交或 ack 丢失 | 模型/工具门禁不放行；销毁 worker，从正式 entries 重建；不存在独立 Go 裁剪路径 |
| 摘要误称任务完成 | 任务真实状态不变，恢复时读取正式状态 |
| embedding 超时、模型提取失败 | 已写对话不丢；词法可用；失败任务有状态及重试 |
| 整理发布前后各强制退出一次 | 重启后无跳过、无重复有效记忆、无重复证据增权 |
| 旧租约 worker 在新 worker 发布后迟到 | fencing token 拒绝旧提交 |
| 删除记忆后重新整理旧聊天 | 当前与新会话均检索不到；来源屏蔽阻止复活 |
| 搜索“部署”“审批”等两字中文 | 词法路线可命中对应资料，不依赖向量运气 |
| 更换 embedding 模型或 token 估算偏差 | 向量空间不混用；容量错误可诊断且不丢强制约束 |

先把这些行为做成固定场景验收，再通过真实使用数据调阈值。观测至少记录检索命中与纠正率、上下文实际 tokens、压缩失败与重建次数、索引积压、整理游标延迟、删除传播状态；不把“存了多少条记忆”当成效果指标。

## 一手资料与实际采用结论

- [S1] Anthropic，[Effective context engineering for AI agents](https://www.anthropic.com/research/effective-context-engineering-for-ai-agents)：上下文是有限预算；按需检索、压缩和结构化笔记是不同手段；压缩过度会丢失细节。本章据此明确来源回查与强制约束独立保存。
- [S2] SQLite，[FTS5 Extension](https://www.sqlite.org/fts5.html)：trigram 不支持少于三字符的全文匹配；external-content 索引一致性由应用维护，旧数据需要 rebuild。本章选择可版本化的预分词投影。
- [S3] SQLite，[Write-Ahead Logging](https://www.sqlite.org/wal.html)，含第 11 节 WAL-reset：WAL 只有一个写者；长读影响 checkpoint；同步设置影响断电持久性；修复版本为 3.51.3 及以后，另有 3.44.6、3.50.7 回移版。本章要求发布内核包含修复。
- [S4] Letta，[Memory](https://docs.letta.com/configuration/memory)：官方将跨会话记忆与后台 dreaming/consolidation 分开描述。本章借鉴职责分离，不引入 Letta 作为额外 Agent runtime。
