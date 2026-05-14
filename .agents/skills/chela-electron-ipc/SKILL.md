---
name: chela-electron-ipc
description: Use when changing Chela Electron main/preload/IPC boundaries, settings IPC contracts, MCP/plugin management, shell.openPath behavior, or service modules imported by Node-side tests.
---

# Chela Electron IPC

## 边界原则

- Electron-only side effects 留在 main/preload/IPC 边界内。
- `shell.openPath` 这类能力不要静态导入到会被 Node-side tests 直接 import 的 service 模块里。
- Service 层优先保持 Node import-safe；需要 Electron 能力时通过 IPC handler 或 main-process adapter 注入。
- preload 暴露、shared contracts、IPC handler 要一起更新，避免 renderer 能调用但类型或主进程没接住。

## MCP / Plugins 设置

- 用户说“完善” MCP/plugins 设置时，默认做完整管理闭环，不只做只读状态页。
- 保持已接受的信息架构：`MCP` 和 `插件` 是独立入口，除非用户明确要求合并。
- open config / root directory / manifest 这类动作走 IPC/main-only 实现。
- 插件 id 等持久化标识要做冲突/重复保护。

## 验证

- 优先跑和本次 IPC 边界直接相关的最小 tsx/单测验证。
- 出现 `SyntaxError: The requested module 'electron' does not provide an export named 'shell'` 时，优先检查 Electron-only import 是否泄漏到 Node-side test 路径。
- 仍然遵守项目根规则：不因习惯运行 `pnpm build` / `pnpm check`。
