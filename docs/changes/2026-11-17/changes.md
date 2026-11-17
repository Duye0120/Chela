# 2026-11-17 变更记录

## 修复 Chat / Preview 迟到响应与 Git 面板重新验证

- 时间：2026-11-17（America/Los_Angeles）。
- 基线：`codex/chela-figma-restart` / `f69b070`，开始时工作区干净；用户授权修改完成后 commit + push，沿用当前 checkout。
- 改了什么：
  - `native/frontend/src/state/chat-actions.ts`：refreshChat 在 acceptSnapshot 前核对请求的观察 epoch；释放时撤销旧在途复用入口，保留 snapshot_cursor >=，相同 cursor 的模型更新仍有效。
  - `native/frontend/src/state/git-actions.ts`：新读者每次 acquire 重新验证，即使底栏保持订阅；继续共享缓存、合并在途 load，无后台轮询。
  - `native/frontend/src/workspaces/chat/chat-workspace.tsx` 与 `preview/preview-workspace.tsx`：快捷新建及 Preview 新建/关闭的异步回写检查发起实例代次；卸载后不写 open/requestedTab/tab，不继续旧 act 的 tabs 刷新。Electron 继续拥有原生资源，正常操作和既有请求重放保留。
  - 更新 `docs/architecture/state-ownership.md` 与 `state-refactor-progress.md` 的生命周期、刷新合同和验证边界。
- 为什么改：原快照 cursor 无法区分已释放工作区，常驻底栏阻止面板重挂载读取，旧实例 Promise 则可写入新的共享 UI。
- 验证结果：隔离执行脚本修复前复现 6 个失败，修复后 10 个场景全部通过，覆盖相同 cursor 的新旧模型返回顺序、释放前后、变更面板重开、在途请求合并、迟到快捷/新建/关闭，以及有效实例与请求重放。脚本执行实际 action/回调，模拟 bridge、存储、计时器及 hook 生命周期，不渲染 JSX；本地产物留在 `output/lifecycle-fixes-2026-11-17/`。前端 TypeScript 和 diff 检查通过。
- 未做：未启动应用、未请求真实模型、未运行全量 build/test/lint；实际 React DOM/Electron 挂载、原生资源与真实 Git 文件变化未验收。未扩大拆分，未改 Go、IPC、schema、依赖、CSS 或 JSX 结构。
