# Chela

Windows 桌面端由 Electron 创建窗口并加载现有 React 界面。Go 继续管理业务、数据和本机服务，Pi 保持独立 Agent worker。Dock 提供对话、看板、日历、笔记和终端五个工作区，看板和日历共用事项数据。

## 运行

首次在仓库根目录安装前端依赖，随后可启动窗口或生成 Windows 可执行文件。

```sh
corepack pnpm install --frozen-lockfile
npm run dev     # 准备 Go / Pi，启动支持 React / CSS 热更新的 Electron 窗口
npm run dev:web # 仅启动浏览器预览，打开 Vite 输出的本机地址
npm run build   # 生成 release/win-unpacked/Chela.exe 及完整分发目录
```

先从托盘完整退出旧的 Chela，再执行 `npm run dev`。启动后保存 React / CSS 即可在桌面窗口看到更新，无需重新构建前端；Electron main / preload、Go 或 Pi 源码修改后需要停止并重新启动。退出 Electron 或在终端按 Ctrl+C 会一并关闭本次 Vite 服务。

桌面界面通过隔离的 preload、Electron IPC 和私有 stdio 调用 Go，后端不开放业务监听端口。开发页继续通过 Vite 的本机同源入口调用相同的 Go Chat 服务，聊天记录保存在独立的 `Chela/web-dev` 目录。浏览器预览不能操作桌面窗口或本机终端。

Chela 自带 `pi-agent-core` 和 `pi-ai`。在 [Agent 入口](native/agent/chat.mjs) 中，Pi 负责对话循环、模型适配和回复事件。Go 提供会话存储、模型配置和进程控制，React 展示消息与生成状态。分发时交付整个 `release/win-unpacked/`，其中包含 Electron、Go 后端、私有 Node 运行时与打包后的 Agent，不能只复制 EXE。

首次切换前退出原 MyGo 版本。默认继续使用 `%APPDATA%/Chela` 的数据库和 Go 凭据，本次不新增数据库格式迁移；旧窗口位置和 `chela.*` 界面偏好会读取迁移，WebView2 原存储保留。详情见 [Electron 宿主边界](docs/architecture/electron-host.md)。

Chat 读取旧 Chela 配置的模型来源和聊天路由。首次打开桌面对话时，从旧事件记录投影文字历史，原始文件保留。点输入区的模型名称可切换模型，右上角「对话信息 → 配置模型」可设置兼容 OpenAI 的接口地址、模型 ID 和密钥。新凭据使用 Windows DPAPI 加密。旧 Electron safeStorage 凭据需要在新壳重新录入。

## 从哪里开始

[整体架构图与迁移边界](docs/architecture/chela.md) 说明 Go、Pi 与桌面工作台各自负责什么，以及悬浮助手、审批恢复、长期记忆和外部执行者将从哪里接入。

| 要找什么 | 位置 |
| --- | --- |
| 桌面入口、窗口与系统菜单 | [Electron 入口](native/electron/main.mjs) · [Go 服务入口](native/main.go) · [React 桌面壳](native/frontend/src/app/) · [Figma 窗口规范](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=186-23827) |
| Go 服务 | [internal](native/internal/) 下的 chat 管理会话和 Pi，work 保存任务与笔记，terminal 管理本机终端，storage 提供原子写盘。 |
| 五个工作区 | [workspaces](native/frontend/src/workspaces/) 中各模块管理自己的页面、样式和专属资源。跨工作区的任务和笔记数据接口在 [data](native/frontend/src/data/)，Electron 桥接与浏览器预览存储在 [platform](native/frontend/src/platform/)。 |
| 本版改动及验证记录 | [docs/changes](docs/changes/) |
| 通用组件、主题 token 和使用约定 | [前端组件库](native/frontend/src/ui/README.md) |
| 仓库协作约定 | [AGENTS.md](AGENTS.md) |
