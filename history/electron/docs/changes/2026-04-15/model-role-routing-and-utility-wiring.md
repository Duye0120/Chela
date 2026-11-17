> 时间：2026-04-15 16:40:00

# 模型角色路由与工具模型接线

## 本次改动

- 把设置里的单点模型配置收成角色路由层，新增 `modelRouting.chat / utility / subagent / compact`，同时继续兼容 legacy `defaultModelId / workerModelId` 读写。
- 新增统一的主进程解析入口 `resolveModelForRole(role)`，聊天主链继续走 `chat`，轻量工具任务正式切到 `utility`。
- 重写 `WorkerService`，把杂活模型执行收成显式任务接口：`generateCommitMessage()` 和 `generateSessionTitle()`。
- 接通 `DesktopApi.worker.generateCommitMessage()`，diff 面板不再走 mock，直接通过主进程 utility 模型生成 commit message。
- 在聊天收尾链路补上首轮自动标题生成：只在系统自动标题且用户未手动改名时触发，标题生成也走 `utility` 模型。
- 给 session meta 增加 `titleManuallySet`，把自动标题和手动改名从持久化层明确分开。
- 扩展 provider / model 占用保护，删除、禁用模型或 source 时同时覆盖 `chat / utility / subagent / compact` 四类角色，避免未来配置悬空。
- 设置页 `General` 区新增模型角色展示，当前展示聊天模型、工具模型，以及 `Sub-agent / Compact` 预留位。

## 为什么改

- 现有 `workerModelId` 已经能承载轻量任务，直接抽成角色路由层比继续加特判更稳，后面接 `sub-agent` 不需要再翻设置结构。
- commit message 和聊天标题属于典型杂活任务，单独走 `utility` 模型能把主聊天模型和辅助任务明确拆开。
- provider 层如果只保护聊天模型，后面一旦工具模型或预留角色引用某条目，删除和禁用链路就会留下脆弱配置。

## 涉及文件

- `src/shared/contracts.ts`
- `src/main/settings.ts`
- `src/main/model-resolution.ts`
- `src/main/providers.ts`
- `src/main/worker-service.ts`
- `src/main/ipc/worker.ts`
- `src/main/chat/finalize.ts`
- `src/main/chat/service.ts`
- `src/main/context/snapshot.ts`
- `src/main/session/meta.ts`
- `src/main/session/service.ts`
- `src/preload/index.ts`
- `src/renderer/src/App.tsx`
- `src/renderer/src/components/assistant-ui/diff-panel.tsx`
- `src/renderer/src/components/assistant-ui/settings/general-section.tsx`
- `src/renderer/src/components/assistant-ui/settings-view.tsx`
- `src/renderer/src/components/assistant-ui/settings/ai-model-section.tsx`
- `src/renderer/src/components/assistant-ui/settings/keys-section.tsx`
- `specs/03-agent-core.md`
- `docs/changes/2026-04-15/model-role-routing-and-utility-wiring.md`

## 验证情况

- 主进程与 renderer 关键改动文件都通过了仓库内 TypeScript 诊断。
- `pnpm check` 在当前机器上没有进入项目类型报错阶段，Node 运行时先崩在 `CSPRNG` 初始化；这次没有拿它当有效校验结果。
