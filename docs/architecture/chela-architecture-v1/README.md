# Chela 架构与实施包 v1.0

**目标：同一个持续存在的 Chela，通过多个独立会话和并行执行，为用户工作、记住经历，并在合适的时候主动出现。**

本包是可直接交给 Sol / Astra 的目标架构、契约和分阶段实施说明。它规定系统应如何建设，不表示其中的新功能已经实现或通过运行测试。本文不重新设计已有 Figma 视觉稿，也不要求从零删除旧代码。

## 从哪里开始

1. 先读 [架构决策与需求](docs/architecture/00-decisions.md) 和 [整体系统](docs/architecture/01-system.md)。这两章定义不可擅自改变的边界。
2. 按实现领域阅读 [Pi 与运行时](docs/architecture/02-runtime-pi.md)、[记忆与上下文](docs/architecture/03-memory-context.md)、[主动性与情绪](docs/architecture/04-proactivity-emotion.md)。
3. 对照 [数据与协议](docs/architecture/05-data-contracts.md)、[界面与集成](docs/architecture/06-ui-integrations.md)、[可靠性与发布](docs/architecture/07-reliability-release.md) 实施横向能力。
4. 按 [实施计划](implementation/PLAN.md) 逐门禁推进；给实现模型的首条指令在 [IMPLEMENTER-PROMPT.md](implementation/IMPLEMENTER-PROMPT.md)。
5. 对照 [验收矩阵](implementation/ACCEPTANCE.md) 和 [资料与证据边界](docs/architecture/08-evidence.md) 完成迁移。

## 契约文件

- [protocol.ts](contracts/protocol.ts)：跨进程、界面、领域服务的类型与命令契约；不依赖具体 UI 库。
- [wire.schema.json](contracts/wire.schema.json)：进程协议信封的 JSON Schema；业务 payload 另按 `protocol.ts` 进行运行时校验。
- [storage.sql](contracts/storage.sql)：目标 SQLite 初始结构与约束，用于指导迁移；现有数据库不得直接覆盖。
- [defaults.json](contracts/defaults.json)：首版预算、并发、心情和提醒参数。均为可配置初值，不是性能或心理学结论。

契约的字段、枚举和错误码以 `contracts/` 为准；实体职责与事务语义以架构章节为准；实现顺序以实施计划为准。发现冲突必须在同一次改动中统一文档、契约和测试，不允许悄悄另造一套解释。

## 阅读时区分三种陈述

- **已核验事实**：注明远端源码 commit 或官方文档来源。
- **本次设计决定**：在本包中直接规定，不依赖上游已经替 Chela 实现。
- **实施门禁**：依赖当前工作区或目标平台的行为，必须用小型集成验证取得证据，例如 Pi 提交屏障、桌宠窗口、PTY 恢复。

设计日期：2026-11-13。已核对旧 Chela 远端 `main`：`3bc4297f5cddf8f26aa387dfaf0b477180ea3297`。分享记录里的新 Go 分支未在远端出现，开工第一步须审计实际工作区。当前核验的 Pi 上游 commit 为 `47e9d74f9186de37e700693fac0f6e56a499657a`；版本升级必须经过适配层契约测试。
