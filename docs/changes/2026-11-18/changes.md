# 2026-11-18 变更记录

## WorkTask 共享读取与写后同步

- 时间为 2026-11-18 11:36 +0800。基线为 `codex/chela-figma-restart` 上的 `eea5383`。
- Board、Calendar、Terminal 与 Notes 的已保存任务展示共用 Zustand 内存镜像。新增任务 action 负责统一读取、写后失效和重试，接入挂载、窗口焦点恢复和页面重新可见。
- 保存直接返回 Go 确认结果。后续刷新失败保留数据并显示读取错误。删除父任务后重新读取 Go 返回的子项关系和版本。采用计划成功即刷新任务，随后独立读取草案。
- Board 同任务刷新保留未保存输入。Calendar 保留有序自动保存、卸载保存及恢复草稿的原版本。Notes 转任务和 Calendar 子任务接入共享保存。
- 验证通过，包括前端类型、差异检查、隔离回调验证和两个现有 Go Work 测试。细节见 [状态重构进度](../../architecture/state-refactor-progress.md)。真实 Electron、DOM 交互及端到端 IPC 待验证。
- Companion 和聊天补全仍直接读取任务。前台持续停留时暂不保证实时收到外部 Go / CLI 修改。
