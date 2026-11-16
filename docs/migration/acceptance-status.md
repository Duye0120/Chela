# 架构验收状态

更新时间：2026-11-15。基于当前未提交工作区、Windows、Go 模块锁定依赖与 Pi 1.5.2。这里列的是实际证据覆盖范围；“部分”不等于该 A 项全部通过。原始完整门禁见 [ACCEPTANCE](../architecture/chela-architecture-v1/implementation/ACCEPTANCE.md)。

| ID | 当前证据 | 仍未完成的部分 |
|---|---|---|
| A01–A04 | 临时 SQLite + 真实 Node worker：身份持久化、范围隔离、命令去重、队列/steer、编辑分支与原分支保留 | 实际多视图操作 |
| A05–A07 | 两个前台、独立后台额度、前台中断整理、取消、审批挂起、重启中断与回执门禁 | 长期负载与所有晚到响应组合 |
| A08 | 未完成 | 受限 child lane、父子额度和死锁演练 |
| A09–A12 | 私有 Node、AgentSession、awaited checkpoint、custom entries、真实读写副作用、嵌套调用、已知结果复用、协议污染拒绝 | 更多 Pi entry 类型与广泛原生扩展 |
| A13–A17 | 来源/范围/纠正、中文词法/向量、实际请求 manifest、预算、自动/手动压缩与拒绝回滚、整理游标/中断 | 真实模型质量和更广并发压缩场景 |
| A18 | 正式记忆遗忘、检索/embedding/派生摘要清理、防重新整理、恢复时合并较新遗忘登记 | 完整原文擦除、逐段来源与全部 trace/blob 传播 |
| A19–A25 | 条件关注、无变化不调用、来源复核、免打扰、投递去重、共享心情、事件去重/限幅/衰减、表达快照、陪伴邀请 | 长期真实使用、实际弹出及表达质量 |
| A26–A28 | Planner 同库 CAS、多时间块/锁定、计划草案/采用、DST gap/fold、跨天提醒/snooze、晨报分组 | 实际日历拖动/键盘、草案覆盖层拖动 |
| A29–A30 | 本机 CLI 版本/握手、Windows 实际管道与 ConPTY、可靠结果 ID、已读和任务完成分离、原 ID 恢复 fixture | 真上游 CLI observe/resume、实际原现场导航和输入录像 |
| A31–A34 | 当前 checkout 基线、归档保留、真实资料副本对账、旧会话/记忆/Planner/终端/模式导入与重复导入、插件依赖检查 | 全部旧工具功能替换；Browser/Git diff/附件/快捷调用等不能按已完成计；完整服务启动失败回滚 |
| A35–A36 | Pet/main 编译、持久展示合并/优先级/回执/撤销、窗口/托盘与系统静默代码接线 | 真实桌面、多屏/DPI、IME、命中穿透/拖动/焦点、完整表情资源及退出进程树验收 |
| A37–A38 | Magpie 目录/ETag/离线 fixture、模型角色、requested/actual、encoder 版本分区与查询 | 本机 Magpie 网关离线；真实多模态能力、fallback 和上游模型链路 |
| A39 | A 资源进入实际模型请求并通过 managed read；B lifecycle/custom entry/native/nested tool；C select 与身份/取消/超时；D/E 拒绝 | C 实际 WebView 交互和更多第三方包 |
| A40–A41 | 包 hash/依赖环/命名空间、失败包隔离、idle 升级、HTTP/stdio MCP 单连接/发现/完整 schema/授权/回执；包外读取被拒绝 | 真实第三方 MCP、完整恶意内容/不可信 WebView 流程；trusted-native 仍非沙箱 |
| A42–A43 | 实际 worker 终止、回执丢失/重投/冲突、写入后 DB trigger 失败与 unknown 门禁、快照/游标事务 | 宿主任意阶段断电、磁盘满、blob 发布与 GC、慢 UI/过期游标压力演练 |
| A44 | 活跃 WAL 一致备份、文件/附件校验、副本恢复、最新遗忘/任务删除合并、历史 pending 禁用、损坏拒绝 | 原文 erase_payload 登记遇到即拒绝恢复；跨用户凭据与更大资料集 |
| A45–A46 | 前端 TypeScript、宿主/Pet 编译、私有 Node 打包、SQLite 3.54.1/source ID、升级前 DB 快照与高版本拒绝 | 安装包/干净机器离线安装、bindings 无副作用完整观察、安装中断/回退演练、真实启动/内存/延迟测量与发布 |

运行证据入口：`native/internal/chat/runtime_test.go`、`storage/database_test.go`、`work/*_test.go`、`companion/companion_test.go`、`terminal/terminal_windows_test.go`、`capabilities/registry_test.go`、`maintenance/backup_test.go`。测试采用临时 profile、模拟上游和受控本机进程，没有真实模型调用。

维护流程见 [资料维护](data-maintenance.md)，扩展边界见 [扩展与 MCP](capabilities.md)。没有提交、推送、发布、切换真实资料或启动桌面 UI。当前版本是已实现多条纵向能力的重建工作区，不能标记为全部 A01–A46 通过或可发布成品。
