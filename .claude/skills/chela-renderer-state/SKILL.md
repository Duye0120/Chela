---
name: chela-renderer-state
description: Use when changing Chela renderer shared state across sessions, chat, Browser panel, settings, attachments, context chips, markers, panel interaction state, or Zustand stores.
---

# Chela Renderer State

## 唯一事实源

- 聊天 session、附件、Browser context、Browser marker、右侧 panel 等跨组件共享状态，默认先找唯一事实源。
- 删除、保存、切换 session、清空 context 时，要同步所有派生 UI。
- 聊天里的 context / attachment chip 和 Browser panel 里的 marker 必须联动。

## Store 边界

- Renderer 大范围共享状态默认使用 Zustand store。
- 新增跨 session、跨 panel、跨聊天 / Browser / settings 的状态时，优先进入 `src/renderer/src/stores/`。
- 组件内只保留局部交互 state。
- Zustand store 只负责 renderer 内同步、selector 和派生状态。
- IPC 持久化、主进程服务和磁盘写入继续由对应 service/action 编排，不混进 UI store。

## 扩展判断

- 如果同类同步逻辑继续增多，优先评估收拢到轻量状态层。
- 不要在多个组件里各自维护同一份跨面板状态，再用临时 effect 互相修补。
