# 2026-04-22 变更记录

## 全项目稳定性与性能优化（第一轮）

**时间**: 11:40

**改了什么**：
- **主进程稳定性**：
  - `src/main/adapter.ts` 为 agent 事件发送补上 `try/catch`，并把 terminal 终态事件改成仅在真正发送成功后才标记已 flush，避免窗口销毁/热重载时直接抛异常。
  - `src/main/terminal.ts` 与 `src/main/window.ts` 增加 renderer 安全发送包装，窗口关闭或销毁时不再裸调 `webContents.send`。
  - `src/main/session/io.ts` 把 transcript 追加写改成真正的 `appendFileSync`，并让临时文件路径改为带 `pid + uuid` 的唯一名，减少并发写覆盖风险。
- **安全与敏感信息**：
  - `src/main/security.ts` 的工作区路径校验改为解析 symlink 后再比较，避免通过符号链接绕过工作区白名单。
  - `src/main/shell.ts` 对 shell payload 统一清理 `NUL / CRLF`，PowerShell 与 cmd 走扁平化命令拼接，降低换行注入风险。
  - `src/main/logger.ts` 增加字符串级敏感信息脱敏（OpenAI / Anthropic key、JWT、Bearer token 等），错误消息、IPC 参数与任意对象字符串化结果都会过一遍打码。
  - `src/main/providers.ts` 把 runtime signature 里的原始 `apiKey` 改成 `sha256` 指纹，避免模型句柄签名携带明文密钥。
  - `src/main/ipc/handle.ts` 统一把非 Error 的 IPC 异常包装成可序列化的 `Error`，减少 renderer 端收到不可读异常的情况。
  - `src/main/window.ts` 在生产环境关闭 DevTools，并拦截快捷键，避免发布包里随手打开调试器。
- **聊天链路与渲染端性能**：
  - `src/renderer/src/components/AssistantThreadPanel.tsx` 补上 active run 事件订阅清理，session 切换或组件卸载时不再残留 `desktopApi.agent.onEvent` 监听；同时把用户可见错误文案收敛为产品级提示。
  - `src/renderer/src/lib/provider-directory.ts` 为 provider/model 目录加载增加请求去重、超时（默认 5s）与 abort 支持，避免设置页/线程面板卡死在无限加载。
  - `src/renderer/src/components/assistant-ui/branch-switcher.tsx` 增加 5 分钟分支缓存、请求去重和 `useDeferredValue` 搜索，避免每次打开都重新拉取本地分支。
  - `src/renderer/src/components/assistant-ui/context-usage-indicator.tsx` 增加显式 0% 灰环语义、固定 `viewBox` 与 `aria-label`，满足 context 圆环规范与可访问性要求。
  - `src/renderer/src/components/assistant-ui/approval-notice-bar.tsx` 去掉 `runId / requestId / modelEntryId` 等内部字段展示，改为产品级中文元信息，避免把内部实现细节暴露给用户。

**为什么改**：
1. 当前项目最危险的问题集中在三类：**renderer send 崩溃点**、**敏感信息泄漏面**、**聊天订阅/目录加载/分支加载导致的长时性能与体验问题**。
2. 这批改动优先处理“会直接崩、会直接泄漏、会高频卡”的问题，先把整条聊天主链路与设置链路稳定下来，再继续推进剩余的 P0/P1 项。
3. 分支缓存、provider 目录去重和订阅清理属于高频路径，投入小但收益大，适合作为全项目调优的第一轮落地点。

**涉及文件**：
- `src/main/adapter.ts`
- `src/main/ipc/handle.ts`
- `src/main/logger.ts`
- `src/main/providers.ts`
- `src/main/security.ts`
- `src/main/session/io.ts`
- `src/main/shell.ts`
- `src/main/terminal.ts`
- `src/main/window.ts`
- `src/renderer/src/components/AssistantThreadPanel.tsx`
- `src/renderer/src/components/assistant-ui/approval-notice-bar.tsx`
- `src/renderer/src/components/assistant-ui/branch-switcher.tsx`
- `src/renderer/src/components/assistant-ui/context-usage-indicator.tsx`
- `src/renderer/src/lib/provider-directory.ts`

**结果**：
- 关键 renderer 发送路径更稳，窗口销毁/切换时不容易再抛未捕获异常。
- 敏感 key/token 不再轻易出现在日志、runtime signature 和 IPC 错误文案里。
- provider 目录与分支列表走缓存/去重后，聊天区和设置页的高频打开路径更顺滑。
- 审批栏与 context 圆环对齐了既有产品约束：不暴露内部 ID、无 usage 时也能看到灰色 0% 环。
- 本轮未主动执行 build / check；已使用错误检查确认本次涉及文件没有新增类型或语法错误。

## 聊天区 provider 目录加载竞态补强

**时间**: 11:40

**改了什么**：
- `src/renderer/src/components/assistant-ui/thread.tsx` 为 provider 目录同步增加 `AbortController`、最新 `visible` 引用和清理逻辑；切换页面可见性或收到新的 provider-directory 更新时，会主动取消上一轮请求。
- 同文件把 `ThreadScrollToBottom` 的 tooltip 从英文改成中文 `滚至底部`，顺手消掉一个遗留文案不一致点。

**为什么改**：
1. 原实现里 provider 目录加载虽然会在 effect cleanup 时退订，但进行中的 Promise 不会被取消；可见性快速切换时，旧请求回包仍可能覆盖新状态。
2. 这段是聊天区高频入口，属于典型的“看起来没报错，但会悄悄抖一下”的竞态型体验问题，值得在第一轮里顺手收紧。

**涉及文件**：
- `src/renderer/src/components/assistant-ui/thread.tsx`
- `docs/changes/2026-04-22/changes.md`

**结果**：
- 聊天区 provider 目录加载现在具备取消能力，visible 快速切换时不容易再吃到过期数据回包。
- 滚动到底部按钮文案与全站中文界面保持一致。

## 后台订阅清理与前端竞态补强（第二轮）

**时间**: 11:40

**改了什么**：
- `src/main/metrics.ts` 为 metrics 采集保存 bus 退订函数，并新增 `stopMetrics()`，停止后台服务时会清理监听与 active run tracker。
- `src/main/emotional/state-machine.ts` 为情绪状态机增加初始化幂等和 `stopEmotionalStateMachine()`，停止时清空最近消息/错误状态与 bus 监听。
- `src/main/learning/engine.ts` 为主动学习引擎增加 `stopActiveLearning()`，停止时退订 bus、注销 scheduler job 并清理累积信号。
- `src/main/bootstrap/services.ts` 把以上三个 stop 链接进 `stopBackgroundServices()`，避免后台服务反复启动后监听器叠加。
- `src/renderer/src/App.tsx` 为 Git summary / Git overview 请求增加 workspace 维度的 request guard，并给会话切换加选择序号，防止旧请求回包覆盖新工作区或新会话。
- `src/renderer/src/components/AssistantThreadPanel.tsx` 给 pending approval 列表刷新增加 request serial 与签名去重，减少 confirmation_request 高频场景下的重复 setState。
- `src/renderer/src/components/assistant-ui/thread.tsx` 为 composer 输入补上 IME composing guard，中文/日文输入法组合阶段按 Enter 不会误入队发送。

**为什么改**：
1. 背景服务此前只负责启动，不负责完整退订；只要开发态多次热重载或服务重复启动，就会出现监听叠加和内存长期增长。
2. Git 概览、分支摘要和会话切换都属于“用户看起来只是点一下，内部其实有异步竞赛”的高频路径，过期回包会直接污染当前 UI 状态。
3. IME 输入和审批刷新都是聊天区高频边角，但体验上非常敏感，补上之后整条主链路会更稳。

**涉及文件**：
- `src/main/bootstrap/services.ts`
- `src/main/emotional/state-machine.ts`
- `src/main/learning/engine.ts`
- `src/main/metrics.ts`
- `src/renderer/src/App.tsx`
- `src/renderer/src/components/AssistantThreadPanel.tsx`
- `src/renderer/src/components/assistant-ui/thread.tsx`
- `docs/changes/2026-04-22/changes.md`

**结果**：
- 后台服务现在具备更完整的 stop 清理能力，重复启动时不容易继续叠监听。
- 切项目、切会话、刷新 Git 面板时，旧请求更难覆盖新状态。
- 输入法组合态按 Enter 不会误把半成品文本送进消息队列。
