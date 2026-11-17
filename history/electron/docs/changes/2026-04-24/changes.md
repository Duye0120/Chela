## 后台安全与运行时编排优化

时间：2026-04-24 00:39:53

改了什么：
- 将 provider 凭证持久化从明文 JSON 升级为 Electron `safeStorage` 加密存储，保留 legacy `credentials.json` 明文与旧 builtin key 兼容迁移。
- 为后台服务启动链路增加统一编排、启动失败回滚、服务级 stop 钩子和启动完成日志。
- 为自诊断与反思服务补充 scheduler 注销能力，避免停机或回滚时残留注册任务。
- 为 webhook 接入增加 `timingSafeEqual` 签名校验、请求头标准化、JSON content-type 校验、请求体大小上限和端口监听失败感知。
- 为 main-process 事件总线导出统一 `BUS_EVENTS` 常量，并替换核心后台链路的 `emit/on` 调用点，收敛事件契约。

为什么改：
- 明文 API Key 持久化是当前后台风险最高的点，优先提升本地凭证安全。
- 后台服务原先串行裸启动，任何中途失败都会留下半启动状态，回滚能力和可观测性都偏弱。
- webhook 属于外部入口，签名比较和请求体边界需要更稳的默认安全策略。
- 事件名长期以裸字符串散落在各模块里，后续维护容易漂移，统一常量可以降低契约分叉。

涉及文件：
- [src/main/providers.ts](/D:/a_github/first_pi_agent/src/main/providers.ts)
- [src/main/bootstrap/services.ts](/D:/a_github/first_pi_agent/src/main/bootstrap/services.ts)
- [src/main/webhook.ts](/D:/a_github/first_pi_agent/src/main/webhook.ts)
- [src/main/event-bus.ts](/D:/a_github/first_pi_agent/src/main/event-bus.ts)
- [src/main/self-diagnosis/service.ts](/D:/a_github/first_pi_agent/src/main/self-diagnosis/service.ts)
- [src/main/reflection/service.ts](/D:/a_github/first_pi_agent/src/main/reflection/service.ts)
- [src/main/chat/prepare.ts](/D:/a_github/first_pi_agent/src/main/chat/prepare.ts)
- [src/main/chat/finalize.ts](/D:/a_github/first_pi_agent/src/main/chat/finalize.ts)
- [src/main/emotional/state-machine.ts](/D:/a_github/first_pi_agent/src/main/emotional/state-machine.ts)
- [src/main/learning/engine.ts](/D:/a_github/first_pi_agent/src/main/learning/engine.ts)
- [src/main/harness/tool-execution.ts](/D:/a_github/first_pi_agent/src/main/harness/tool-execution.ts)
- [src/main/harness/runtime.ts](/D:/a_github/first_pi_agent/src/main/harness/runtime.ts)
- [src/main/metrics.ts](/D:/a_github/first_pi_agent/src/main/metrics.ts)
- [src/main/scheduler.ts](/D:/a_github/first_pi_agent/src/main/scheduler.ts)
- [src/main/tools/notify.ts](/D:/a_github/first_pi_agent/src/main/tools/notify.ts)
- [src/main/index.ts](/D:/a_github/first_pi_agent/src/main/index.ts)

结果：
- 后台凭证默认走系统安全存储，旧数据会在读取后自动迁移到新格式。
- 后台服务启动失败会记录已启动服务列表并按逆序回滚，主进程启动链路可以感知 webhook 端口绑定失败。
- webhook 入站安全边界更清晰，超大请求和异常 header 会更早被拒绝。
- main process 事件契约已经收敛到统一常量，后续继续扩展后台模块时更容易保持一致。

## shell 边界、调度可靠性与 MCP 配置收敛

时间：2026-04-24 00:48:20

改了什么：
- 为 `shell_exec` 增加 `cwd` 工作目录边界校验，要求目录真实存在、属于当前 workspace 且必须是目录。
- 为 harness policy 的 `shell_exec` 决策链补上 `cwd` 预校验，把越界目录和不存在目录前置拦截。
- 为 scheduler 的 daily job 增加启动即检查和按日期去重，解决在命中分钟内启动应用时可能漏执行的问题。
- 为 `mcp.json` 加入结构校验、字段归一化、无效 server 过滤和归一化名称冲突告警。
- 为 MCP 工具命名复用统一标识归一化规则，减少特殊字符 server/tool 名导致的运行时漂移。

为什么改：
- `shell_exec` 是高权限工具，工作目录越界会直接扩大执行面，边界需要和文件工具保持一致。
- daily scheduler 原来完全依赖下一次 60 秒轮询，应用在命中分钟内启动时会错过当天任务。
- MCP 配置原来更偏“尽量读”，遇到坏结构或名字冲突时缺少稳定的降级策略，后续排查成本高。

涉及文件：
- [src/main/tools/shell-exec.ts](/D:/a_github/first_pi_agent/src/main/tools/shell-exec.ts)
- [src/main/harness/policy.ts](/D:/a_github/first_pi_agent/src/main/harness/policy.ts)
- [src/main/scheduler.ts](/D:/a_github/first_pi_agent/src/main/scheduler.ts)
- [src/mcp/config.ts](/D:/a_github/first_pi_agent/src/mcp/config.ts)
- [src/mcp/adapter.ts](/D:/a_github/first_pi_agent/src/mcp/adapter.ts)

结果：
- `shell_exec` 现在只会在合法 workspace 目录内落地执行，异常 `cwd` 会在策略层和工具层双重拒绝。
- daily scheduler 在应用启动、任务重新启用和分钟命中时都更可靠，同一天内不会重复触发同一 daily job。
- `mcp.json` 配置错误会进入应用日志，无效项会被剔除，归一化后冲突的 server 不再悄悄共存。
