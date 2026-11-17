# Chela 个人 Agent Harness 演进

更新于 2026-11-06 13:14 +0800。对照当前代码、`docs/harness/` 与四个项目的一方公开资料。

## 借鉴什么

| 参考 | 公开机制 | 对 Chela 的启发 |
| --- | --- | --- |
| Codex | app-server 提供 thread、turn、流式事件和审批协议，应用负责界面、业务记录、上下文和数据授权 | 界面和 Agent 共用应用服务。由主进程校验业务命令，Harness 负责运行和工具审批。[OpenAI 架构说明](https://developers.openai.com/blog/codex-as-a-platform) · [app-server 协议](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md) |
| Claude Code | 子 Agent 可有独立上下文、工具和权限，生命周期 hooks 可用于控制和观测 | 委派明确的任务、输入、权限和取消边界，主 Agent 收结果并复核。利用 Chela 现有 policy 和事件，逐步加可验证的生命周期证据。[子 Agent](https://code.claude.com/docs/en/sub-agents) · [权限](https://code.claude.com/docs/en/permissions) · [Hooks](https://code.claude.com/docs/en/hooks) |
| Pi | 压缩把摘要和保留边界写成会话条目，从它重建下一次模型上下文。溢出后先修复持久化的上下文投影，再开启重试 | 压缩是否可重试以实际覆盖范围为准。保留原始 transcript，并对照恢复后真正进入请求的上下文。[Pi 压缩文档](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/compaction.md) |
| DeepSeek Harness | DeepSeek AI 官方开源项目，采用插件架构，目前为开发者预览。包图分开 core、goal、schedule、telemetry 和 subagent | 本地提醒、持续目标和模型运行的生命周期各自独立。先按需要加有界接口。[DeepSeek 官方仓库](https://github.com/deepseek-ai/deepseek-harness) · [包职责](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/README.md) |

## Chela 目前的边界

- **运行与权限。** `src/main/harness/runtime.ts` 管理活动 run 和终态，`policy.ts`、`tool-execution.ts` 负责工具门禁和等待审批。继续复用这条路径。本轮补强聊天取消后的清理、摘要和续写等待后的状态复查。
- **上下文与记忆。** Context Engine 决定每次模型调用的上下文，Transcript Persistence 保存会话事件。Run memory 跟踪执行，session memory 依靠 transcript、快照和 T0/T1 接续，semantic memory 独立保存、检索长期内容。本轮把反应式压缩是否成功与覆盖进度绑定，并保留失败前已落盘的记忆统计。
- **恢复。** 启动扫描将上次遗留运行标为失败或中断，待审批条目通过恢复提示发起带来源关联的新 run。恢复后工具仍需走正常审批。活动 run 文件承担运行登记和中断恢复入口。任意工具的执行进度目前没有通用重放协议。本轮修复了恢复事件写入失败时的临时预约清理。
- **观测。** 沿用 `event-bus → ObservabilityDispatcher → ReadinessObservabilitySink → ReadinessTraceRecorder`。观测故障经 degraded health 暴露，记录 run ID、原因和结果，避免把个人内容和工具载荷写入诊断。
- **子 Agent。** 仓库已有 subagent 模型路由和后台运行类型。现有路由是模型配置入口。产品内委派若进入实施，先确定父子 run 关系、取消传播、独立工具权限、有限输入和结果回收。开发协作的 Sol 约定已在根 `AGENTS.md` 记录。

## 本地个人工作流

备忘录、Todo 和月历共用 `planner.json` 中的个人事项。月历按日期呈现，近期事项从同一数据派生，完成和编辑通过同一存储服务生效。提醒由主进程检查，独立于模型运行。现有聊天线程 Todo 用于跟踪线程内的执行步骤，采用独立的生命周期。个人计划目前通过桌面面板操作。

未来如授权 Agent 使用计划功能，先从用户主动选中的事项开始。读取范围以本次选择为限，写入复用面板校验、存储和现有授权策略。用户明确要求的可逆新增和编辑可直接执行，未授权副作用及删除等操作按风险确认。剪贴板历史只服务于本次启动的面板交互。Agent 不自动读取剪贴板历史，不把复制内容加入上下文、写入记忆或外发。翻译另走[主动触发的待办](../todos/2026-11-06.md)，仅处理获授权的文本。Decisions API 提供意图判断，译文另行生成。[OpenAI Decisions API 文档](https://developers.openai.com/api/docs/guides/decisions)

## 下一轮优先级

1. **审批的真实接续。** 现有 readiness 的 `approval-resume` 样例只有请求、批准、完成三步，下一轮验收应覆盖重启、旧 run 到新 run 的关联，以及工具仍需审批。恢复事件写入失败时回滚预约、保留旧中断项的行为，本轮已通过隔离故障注入验证。
2. **启动恢复遇到 I/O 异常。** `hydrateFromDisk` 在读取前设置 `hydrated`，扫描中的审计或中断记录写入异常会提前退出，同进程随后直接返回。先复现其中一个写失败场景，约定什么时候允许重试、如何避免重复记录、怎样暴露降级。
3. **再评估 Agent 计划入口。** 先验收本地计划和提醒。首个 Agent 场景以用户选中的单条事项和结构化草稿为限，验证权限、保存和跨视图同步。

现阶段保留 Chela 现有运行时、存储与观测链。后续架构调整由可复现的故障或具体工作流驱动。
