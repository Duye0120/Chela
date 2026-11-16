# Chela

Windows 桌面端由 Go 和 MyGo 创建窗口，WebView2 加载 React 界面。Dock 提供对话、看板、日历、笔记和终端五个工作区。看板和日历共用事项数据。

## 运行

首次在仓库根目录安装前端依赖，随后可启动窗口或生成 Windows 可执行文件。

```sh
corepack pnpm install --frozen-lockfile
npm run dev     # 启动 Go 桌面壳
npm run dev:web # 仅启动浏览器预览，打开 Vite 输出的本机地址
npm run build   # 生成 native/bin/Chela.exe
```

Chat 的桌面入口通过 MyGo IPC 调用 Go。开发页通过 Vite 的本机同源入口调用相同的 Go Chat 服务，聊天记录保存在独立的 `Chela/web-dev` 目录。其他工作区仍使用浏览器预览数据。

Chela 自带 `pi-agent-core` 和 `pi-ai`。在 [Agent 入口](native/agent/chat.mjs) 中，Pi 负责对话循环、模型适配和回复事件。Go 提供会话存储、模型配置和进程控制，React 展示消息与生成状态。单机分发时，将 `native/bin/Chela.exe` 与同级 `runtime/` 一起交付，其中含 Node 运行时和打包后的 Agent。

Chat 读取旧 Chela 配置的模型来源和聊天路由。首次打开桌面对话时，从旧事件记录投影文字历史，原始文件保留。点输入区的模型名称可切换模型，右上角「对话信息 → 配置模型」可设置兼容 OpenAI 的接口地址、模型 ID 和密钥。新凭据使用 Windows DPAPI 加密。旧 Electron safeStorage 凭据需要在新壳重新录入。

## 从哪里开始

[整体架构图与迁移边界](docs/architecture/chela.md) 说明 Go、Pi 与桌面工作台各自负责什么，以及悬浮助手、审批恢复、长期记忆和外部执行者将从哪里接入。

| 要找什么 | 位置 |
| --- | --- |
| 桌面入口、窗口与系统菜单 | [Go 入口](native/main.go) · [React 桌面壳](native/frontend/src/app/) · [Figma 窗口规范](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=186-23827) |
| Go 服务 | [internal](native/internal/) 下的 chat 管理会话和 Pi，work 保存任务与笔记，terminal 管理本机终端，storage 提供原子写盘。 |
| 五个工作区 | [workspaces](native/frontend/src/workspaces/) 中各模块管理自己的页面、样式和专属资源。跨工作区的任务和笔记数据接口在 [data](native/frontend/src/data/)，MyGo 桥接与浏览器预览存储在 [platform](native/frontend/src/platform/)。 |
| 本版改动及验证记录 | [docs/changes](docs/changes/) |
| 通用组件、主题 token 和使用约定 | [前端组件库](native/frontend/src/ui/README.md) |
| 仓库协作约定 | [AGENTS.md](AGENTS.md) |
