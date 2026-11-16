# Chela 重建基线

2026-11-15。实施依据为 [架构包 v1](../architecture/chela-architecture-v1/README.md)，来源是用户指定的 [分享对话](https://chatgpt.com/share/6af8b23d-6c0c-83e8-a77f-df51378bc108)。ZIP 内 21 个文件的长度与 SHA-256 均与 MANIFEST 一致，原包随本文保存在架构目录。

## 当前工作区

- 仓库 `D:\a_kalerm\Chela`，分支 `codex/chela-figma-restart`，HEAD `3bc4297f5cddf8f26aa387dfaf0b477180ea3297`。
- 开工时已有 614 项 tracked 删除、8 项 tracked 修改，以及未跟踪的新 `native/`、`history/` 和架构文档。删除来自此前的 Electron 归档工作，当前实现以实际文件为准。
- 桌面入口 `native/main.go`，UI 桥 `native/frontend/src/platform/bridge.ts`，五个工作区在 `native/frontend/src/workspaces/`。现有 Figma 来源保存在根 README。
- Go Chat 通过 `native/internal/chat/pi.go` 调用 `native/agent/chat.mjs`。当前为 Pi Agent 文本循环，历史由每会话 JSON 保存，共用一个 Node worker。Work 保存 `work.json`，Terminal 使用 ConPTY。
- 最小基线检查 `go -C native test ./internal/chat ./internal/work ./internal/storage` 通过，三个包尚无测试文件。此结果证明编译，桌面和真实模型行为仍需本轮集成验证。

## 依赖与外部边界

| 项目 | 开工证据 |
|---|---|
| Node | 本机 24.16.0，现有 Agent 打包脚本复制私有运行时 |
| Go / MyGo | 系统 Go 1.26.5，模块声明 1.27.3，由自动工具链执行。MyGo 锁定 `v0.8.4-0.20261108082913-9233663736ca` |
| Pi | 现有 core、ai 均解析 1.5.2。npm 查询 coding-agent 为 1.5.2，要求 Node >=22.19.0。本轮引入同版 SDK |
| SQLite | 本轮选用纯 Go `modernc.org/sqlite v1.62.0`，实际内核、FTS5 与事务行为在持久核心测试中核对 |
| Magpie | 当前 Chat 读取旧 provider-sources / model-entries / settings，支持模型端点。独立 Magpie 目录 API 尚未核实，保持现有模型配置入口 |
| Codex / OpenCode | 已发现本机命令。结构化事件、恢复能力在 S06 按安装版本核验 |
| MCP / Skills | 旧归档含 MCP 连接、工具注册、skill IPC 与插件管理，新壳未接回 |

## 本地回退与数据

本轮开工副本位于 `C:\Users\user\AppData\Local\Chela-rebuild-checkpoints\20261115-031627`。保存了 104 个当前工作区源文件、16 个用户业务数据文件、原始 Git 状态和逐文件 SHA-256 清单。SQLite 采用只读源连接和 backup API 获得一致副本，副本 integrity_check 为 ok。

真实用户目录为 `%APPDATA%\Chela`。开工时 `data/` 有 6 个文件，`web-dev/` 有 2 个文件，另有 `chela-memory.db`、模型目录、加密凭据与窗口设置。报告只记录存储方式和计数，凭据内容保留在本机副本。新持久核心使用独立 `chela.db`，旧文件作为迁移来源保留。验证使用临时 profile。

## 能力迁移对照

| 编号 | 当前代码与状态 | 目标去向 |
|---|---|---|
| L01 | 新 `chat` 已有文本、流式、停止，旧 `agent.ts` 有工具/MCP | Pi AgentSession、原始 entries、Go 工具网关 |
| L02 | 旧 `harness/` 有 run、policy、approval、audit，新壳未接入 | 持久 Run、审批、invocation 与事务回执 |
| L03 | 旧 `shared/*recovery.ts` 与 Harness 恢复关联 | 新恢复 Run，记录已知结果与未知副作用 |
| L04 | 新 Agent 复用预算裁剪，旧 `context/` 有快照和覆盖 | 唯一 Pi compaction、Go 提交确认与原文回查 |
| L05–L06 | 旧 `memory/pipeline.ts`、`store.ts` 保存提取、检索和反馈 | 有来源、范围、版本、纠错和遗忘的 Memory |
| L07 | 旧上下文与 memory 文档保留规则、长期资料、快照的划分 | run memory、session memory、semantic memory 按数据含义迁移 |
| L08 | 新 Work 任务/笔记已落盘，旧 planner 有提醒和版本 | 统一 planner、独立排期/期限/提醒，保留可编辑笔记 |
| L09 | 旧 planner、codex-task 保存执行关联、结果和 review | ExecutionLink/Observation，查看与任务完成分别记录 |
| L10 | 新 Terminal 已有 ConPTY、resize、缓冲重连 | 保持终端现场，补持久关联和实际 CLI 能力 |
| L11 | 旧 emotional 状态机维护共享互动模式 | 保留 InteractionMode，新增共享 AffectState 和衰减 |
| L12 | 旧 runtime-services 与 bootstrap 有依赖和启停 | Go supervisor，应用生命周期持有活动运行 |
| L13 | 旧 learning/reflection/personality-drift 有实现与注册 | 有来源的记忆整理、人格提议，保留配置和产物 |
| L14 | 旧 scheduler/webhook 有启动接线 | 持久计划与有范围的事件输入 |
| L15 | 旧 plugins 有 manifest、启停、重复检查 | 能力注册与 Pi 扩展兼容分级 |
| L16 | 旧 audit/metrics/trace/readiness/self-diagnosis 已接线 | 集中提交事件与脱敏诊断，观测失败隔离 |
| L17 | 旧 Soul/学习材料与模型配置仍在归档 | 稳定 assistant_id、Persona、模型角色绑定 |
| L18 | 旧桌面面板、剪贴板、快捷调用和子 Agent 路由保留 | 明确入口和授权范围后接回，规划能力逐项核验 |
| 补充 | 旧 Browser/DOM、Git/diff、附件、消息编辑与队列 | 各工作区与 Session 能力迁移，逐项列入验收 |

## 本轮实施顺序

首个缺口为 S01 持久核心。先建立 SQLite、身份、会话/分支、Run 与 command/event 回执，再用 S02 验证真正等待 host ack 的 PiBridge、工具唯一路径和原始历史重建。S03 起接入队列、多会话 UI 和后台生命周期。后续阶段以架构包的 PLAN 与 ACCEPTANCE 为准，完成状态随真实验证更新。
