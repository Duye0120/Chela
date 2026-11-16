# 08 · 证据边界、旧能力迁移与开工对账

本章防止实施者把讨论中的愿望写成现成功能，也防止重构时把旧 Chela 当成只有聊天循环的空壳。核验日期为 **2026-11-13**；本架构包是实施规格，不是已经完成的产品或运行验收报告。

## 1. 哪些结论来自哪里

| 标记 | 证据含义 | 可以据此说什么 |
|---|---|---|
| C · 代码 | 静态读取指定 commit 的实际文件 | 可以说明该实现及局部控制流；不能宣称实机行为、覆盖率或性能达标 |
| O · 上游 | 读取官方文档、源码或原始论文 | 可以说明上游机制及限制；Chela 的集成仍需验证 |
| R · 记录 | 用户表达、分享页可见消息、仓库计划文档 | 可以恢复意图和工作线索；助手说“已实现/已验证”不等于本次已核验 |
| D · 设计 | 本架构明确选择的新契约和行为 | 是实施目标；阈值、配额和评分是可调初值 |
| U · 待核 | 当前未获得或未实测的内容 | 列入 S00 或对应验收，不猜测、不默认不存在 |

本次使用分享页中的**可见记录**恢复需求，不保证拥有原线程所有分支、附件和本地工具现场。没有直接读到被参考的公众号原文，不能把此前回复对文章的转述写成已验证原文结论。已有 Figma 是视觉来源；本包规定行为与数据关系，**不重新设计视觉稿，也不宣称已逐帧检查所有现有资产**。

代码基线是远端 [Duye0120/Chela](https://github.com/Duye0120/Chela/tree/3bc4297f5cddf8f26aa387dfaf0b477180ea3297)，SHA 为 `3bc4297f5cddf8f26aa387dfaf0b477180ea3297`。它是旧 Electron main。分享记录提到的新 Go 工作区或未推送分支**未在该远端基线中核验**，本包不声称已读取它，更不能据此覆盖用户本地更新。

实际静态审阅覆盖 agent、Harness、恢复提示、context 三文件、memory pipeline/store、planner、terminal、情绪状态机、服务注册及启动接线、插件扫描与外部 API adapter。部分服务只读到注册入口，未读其完整实现。仓库计划文档用于补全清单，若与同 SHA 源码不同，以代码为准。本次没有启动旧/新 Chela 做整机测试，没有完成真实数据迁移，也没有测得新的性能收益。

## 2. 上游来源与支持范围

源码链接固定到 commit；滚动文档只代表本次读取内容。后续升级必须重新核对，不能把这里的版本当永久最新版本。

| 来源 | 已支持的结论 | 不支持的推论 |
|---|---|---|
| Pi [SDK](https://github.com/earendil-works/pi/blob/47e9d74f9186de37e700693fac0f6e56a499657a/packages/coding-agent/docs/sdk.md)、[SessionManager](https://github.com/earendil-works/pi/blob/47e9d74f9186de37e700693fac0f6e56a499657a/packages/coding-agent/src/core/session-manager.ts) | 可嵌入会话与内存 manager；entries、树和 active leaf 是恢复依据 | Go 持久化屏障已经由 SDK 自动实现 |
| Pi [AgentSession](https://github.com/earendil-works/pi/blob/47e9d74f9186de37e700693fac0f6e56a499657a/packages/coding-agent/src/core/agent-session.ts)、[Agent](https://github.com/earendil-works/pi/blob/47e9d74f9186de37e700693fac0f6e56a499657a/packages/agent/src/agent.ts) | 两层订阅的等待语义不同；不能把 async session listener 当持久化屏障 | 任意监听器写法都能保证工具执行前已提交 |
| Pi [compaction](https://github.com/earendil-works/pi/blob/47e9d74f9186de37e700693fac0f6e56a499657a/packages/coding-agent/docs/compaction.md)、[extensions](https://github.com/earendil-works/pi/blob/47e9d74f9186de37e700693fac0f6e56a499657a/packages/coding-agent/docs/extensions.md) | 存在压缩与扩展机制，可用于定制摘要和能力接入 | 已有跨 Go/Node 事务钩子；任意 TUI 插件可直接用于 WebView；扩展天然沙箱化 |
| MyGo [架构](https://github.com/egoist/mygo/blob/d5c76cf8a0986cc8b3e12671d068a8d9d510b6c7/docs/architecture.md)、[WebView](https://github.com/egoist/mygo/blob/d5c76cf8a0986cc8b3e12671d068a8d9d510b6c7/docs/ui/web-view.md)、[bindings](https://github.com/egoist/mygo/blob/d5c76cf8a0986cc8b3e12671d068a8d9d510b6c7/docs/bindings.md) | 支持所选宿主/WebView/binding 方向；生成 bindings 的入口行为需控制副作用 | 透明、穿透、置顶、全屏和多显示器行为已跨平台验证 |
| Anthropic [context engineering](https://www.anthropic.com/research/effective-context-engineering-for-ai-agents) | 上下文有有限预算；按需检索、压缩、结构化笔记各有作用，摘要可能丢失细节 | 本包的 token 阈值或检索参数经过该文验证 |
| SQLite [FTS5](https://www.sqlite.org/fts5.html) | trigram 少于三字符的全文查询不匹配；external-content 索引需维护同步 | 默认配置自然解决所有中文短词搜索 |
| SQLite [WAL](https://www.sqlite.org/wal.html) | 单写者、checkpoint 与同步限制；WAL-reset 修复为 3.51.3 及以后，另有 3.44.6/3.50.7 回移 | 升级 Go driver 包名即可保证实际内核已修复 |
| DeepSeek [Harness架构说明](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.zh.md) | 服务、类型化事件、能力接口和可替换模块可作为宿主设计参考 | 必须把Cordis或第二套Agent框架搬进Chela；Go与Pi的事务边界已由它解决 |
| Letta [Memory](https://docs.letta.com/configuration/memory) | 跨会话记忆与后台 dreaming/consolidation 是可分离职责 | 必须引入 Letta，或其效果等于 Chela 已实测效果 |
| Park 等 [Generative Agents v2](https://arxiv.org/abs/2304.03442v2)；Russell [情感环状模型论文](https://pdodds.w3.uvm.edu/research/papers/others/1980/russell1980a.pdf) | 分别提供观察/记忆/反思/规划，以及效价/唤醒度的研究背景 | 六维情绪、权重、半衰期有心理测量效度，或助手具有真实情绪体验 |

单一 Go 真相源、Pi 唯一 loop、SafeCutToken、Attention/Intention/Delivery 分离、两前台一后台、六维心情、RRF 与中文预分词，均属于 **D**。它们需要本包规定的故障与产品场景验收，不靠引用替代验证。Magpie 的具体 API、用户安装的 Codex/OpenCode 能力、目标 OS 和现有 Go 分支属于 **U**，实施时按实际接口探测。

## 3. 旧功能逐项迁移矩阵

本表的“保留”指保留用户能力、数据和可解释的失败行为，不要求原语言或文件结构不变。路径均相对于上述 Chela 固定 SHA；“接线”只证明注册存在。源码入口见本节后的链接。

| ID | 旧能力及证据 | 新归属与必须保留的结果 |
|---|---|---|
| L01 | C：`agent.ts` 使用 pi-agent-core，含会话 handle、工具和 MCP 接入 | PiBridge/AgentSession；保留聊天、流式、工具、取消。每个会话只选一种 adapter，不叠加新旧循环 |
| L02 | C：`harness/runtime.ts`、`policy.ts`、`tool-execution.ts` | Runs/ToolGateway/Policy；保留运行归属、审批、取消、状态与日志，补事务、幂等和未知结果对账 |
| L03 | C：恢复关联和 `shared/*recovery.ts`；R：演进说明 | 新恢复 Run 关联旧 Run；保留恢复提示与重新校验。旧能力不是保存 Promise 或任意工具自动重放 |
| L04 | C：`context/engine.ts`、`budget-transform.ts`、`snapshot.ts` | Context + Pi compaction；保留现场摘要、原文引用、覆盖检查和失败降级，只有正式 ack 后使用新 projection |
| L05 | C：`memory/pipeline.ts` | Memory；保留候选提取、双路检索、失败回退、来源 run/session、刷新报告；增加 scope、有效期与纠正 |
| L06 | C：`memory/store.ts` | 正式记忆与派生索引分离；保留旧内容、反馈和映射。命中/反馈不冒充可信度，未知模型向量重建 |
| L07 | R：旧文档出现 T0/T1；当前已读文件无完整 T0/T1/T2 定义 | 按原始事件、快照、语义记忆实际语义迁移；S00 补查真实定义，不按名字臆造层级 |
| L08 | C：`planner.ts` 的 note/todo、日期、提醒、版本校验 | Planner 保留备忘录与待办、跨列表/日历视图和提醒；note 必须继续可读可编辑，不因新增 calendar_event 消失 |
| L09 | C：planner 执行关联、Codex 更新、review、acceptance/result | ExecutionLink/Observation；保留来源、结果及可选详情。旧 review 映射为未完成任务与待查看结果，不能改成 done，也不强加验收表单 |
| L10 | C：`terminal.ts` 的 PTY、attach、resize、缓冲重放、退出通知 | Terminal/ExecutionAdapter；保持原现场、中文输入、尺寸变化与导航后重接；旧内存缓冲不是跨重启完整终端恢复 |
| L11 | C：`emotional/state-machine.ts` 的模式、锁定、冷却、持久化、soft prompt | 保留为 InteractionMode；新 AffectState 独立建立。旧信号保留审计，不伪造历史六维分数 |
| L12 | C：服务 registry 依赖排序与错误；bootstrap 生命周期接线 | Go supervisor；保留依赖检查、启停、回滚、健康与降级，不只搬 timer |
| L13 | C 接线：active-learning、reflection、personality-drift | Memory/Consolidation 与人格提议；保留配置和既有产物。S00 读实现后逐项映射，不能仅凭服务名宣布已替代 |
| L14 | C 接线：scheduler、webhook | Scheduler/受控接入能力；保留有效计划、触发与停止入口，迁到持久 occurrence/授权范围；具体旧规则需补查 |
| L15 | C：插件 manifest 扫描、重复 ID 检查、启用状态、外部 API adapter | CapabilityRegistry；保留配置、命名、启停与错误。完整 Pi 扩展宿主属于新增，不能冒称旧系统已支持 |
| L16 | C 接线及 R：bus audit、metrics、self-diagnosis、trace、readiness | Observability；保留诊断入口、因果 ID、健康与脱敏，记录失败不能撤销已提交业务事实 |
| L17 | C：context 中 Soul/学习材料接入；R：角色及模型配置 | Identity/Memory/MagpieAdapter；保留角色资产与用户选择，不用 worker ID 当人格，不编造 Magpie API |
| L18 | R：计划文档中的剪贴板面板、翻译线索、subagent 模型路由 | S00 列完整清单及状态；现有面板能力继续可用，明确未完成项；不变成自动读剪贴板或默认全天观察 |

固定源码入口：[agent](https://github.com/Duye0120/Chela/blob/3bc4297f5cddf8f26aa387dfaf0b477180ea3297/src/main/agent.ts)、[Harness](https://github.com/Duye0120/Chela/tree/3bc4297f5cddf8f26aa387dfaf0b477180ea3297/src/main/harness)、[context](https://github.com/Duye0120/Chela/tree/3bc4297f5cddf8f26aa387dfaf0b477180ea3297/src/main/context)、[memory](https://github.com/Duye0120/Chela/tree/3bc4297f5cddf8f26aa387dfaf0b477180ea3297/src/main/memory)、[planner](https://github.com/Duye0120/Chela/blob/3bc4297f5cddf8f26aa387dfaf0b477180ea3297/src/main/planner.ts)、[terminal](https://github.com/Duye0120/Chela/blob/3bc4297f5cddf8f26aa387dfaf0b477180ea3297/src/main/terminal.ts)、[情绪](https://github.com/Duye0120/Chela/blob/3bc4297f5cddf8f26aa387dfaf0b477180ea3297/src/main/emotional/state-machine.ts)、[服务接线](https://github.com/Duye0120/Chela/blob/3bc4297f5cddf8f26aa387dfaf0b477180ea3297/src/main/bootstrap/services.ts)、[服务 registry](https://github.com/Duye0120/Chela/blob/3bc4297f5cddf8f26aa387dfaf0b477180ea3297/src/main/runtime-services/registry.ts)、[插件](https://github.com/Duye0120/Chela/tree/3bc4297f5cddf8f26aa387dfaf0b477180ea3297/src/main/plugins)、[旧演进文档](https://github.com/Duye0120/Chela/blob/3bc4297f5cddf8f26aa387dfaf0b477180ea3297/docs/plans/2026-11-06-personal-agent-harness.md)。目录链接仅定位已列文件，不表示目录全部经过审计。

## 4. S00：进入真实 workspace 的开工门禁

S00 是执行者应自主完成的发现与对账工作，不是重新征求已给授权。它先产出可审阅基线，再开始修改真实项目。

1. **定位实际版本。** 记录 workspace、repo/remote、branch/HEAD、未提交与未跟踪改动、Electron 归档、新 Go 入口和已有构建命令；保留用户当前工作，不 reset、覆盖或用远端 main 冒充本地分支。读取实际 AGENTS/项目约定。
2. **补全功能清单。** 从现有 UI 入口、服务注册、工具、插件、快捷键、设置和数据目录逐项对应 L01–L18，新增未列能力。记录“现可用/已知故障/未完成/废弃但保留数据”，不能只列本次想实现的功能。
3. **确认外部边界。** 定位现有 Figma/资产；读取实际 Magpie 契约；记录 Pi/MyGo/Node/Go/SQLite 版本、目标 OS、CLI 版本及能力。缺少材料先标 U，继续独立可做的核对，不替用户虚构接口。
4. **建立数据与恢复基线。** 列出会话、快照、memdir/向量、planner、角色/模式、执行关联、审批、插件配置、附件的路径、格式、数量和校验和；用隔离副本验证读取与恢复。凭据只记录存储方式，不导出到报告。
5. **提交 S00 结果。** 在项目中保存 `docs/migration/workspace-baseline.md` 与功能对照清单，明确当前代码与本包的差异、复用路径和未决缺口。关键依赖、数据归属、迁移范围未确认前不做破坏性切换；没有必要重新设计已确定产品方向。

通过条件：每个已用功能有归属与验收，每类真实数据有读取/备份路径，已核对未提交 Go 工作，集成版本已锁定或记录阻塞原因。仅生成空目录、接口或一份新 README 不算通过。

## 5. 迁移对账与切换门槛

迁移顺序固定为 `detect → dry-run → backup → import → reconcile → switch read path`，跨阶段保留输入指纹、工具版本和检查点。数据库备份使用一致性接口；不能只复制运行中的 `.db` 丢掉 WAL。原始数据和旧程序保留到切换验收完成。

每类来源必须满足：**全部来源记录 = 已迁移覆盖 + 明确延后 + 明确无效并保留原文**。合并允许多对一，但每个 legacy ID 都有去向，不能靠目标行数较少解释丢数据。报告列来源/目标计数、ID 映射、关键字段校验、冲突、未知范围、失败与重试结果。

重点对账：note 正文可编辑；任务完成状态、日期和时区不改义；旧 review 不变 done；来源链接、acceptance/result、执行关联仍可查看；旧审批不视为新授权；中断运行不伪装继续原进程；记忆未知来源不擅自全局公开；旧提供商原始字段存在则保留、缺失则不补造；删除/遗忘登记先恢复再开放检索。

导入重复运行、批次前后崩溃、断网、索引失败必须能继续且不重复创建事实。切换前使用实际数据副本和目标平台完成对应验收；切换后新增写入必须有明确记录，回滚时不能悄悄丢掉它们。旧模块退役需要同时满足等效能力可用、旧数据可读、错误可解释、场景验收通过。若有意改变行为，像取消强制“待验收”流程一样，必须在映射中明确说明保留的数据和新的用户行为，不能以重构为名默删能力。
