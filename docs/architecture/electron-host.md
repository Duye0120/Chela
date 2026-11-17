# Electron 宿主边界

更新时间：2026-11-16（America/Los_Angeles）。本决策覆盖架构 v1 包中关于 MyGo 宿主的旧要求，领域、存储、审批与 Pi 契约保持原职责。

## 职责

- Electron main：应用单实例、主窗/托盘、关闭方式、桌宠窗口、屏幕与锁屏事件、隔离的网页视图、系统对话框和打开动作。
- React：继续使用 `native/frontend/src/` 的工作区、主题与交互。`window.chelaDesktop` 通过 sandbox preload 暴露有限调用接口，页面没有 Node 权限。
- Go：业务与数据的唯一持久源。Chat、Work、Terminal、Browser、Pet 保留既有服务接口与业务校验；系统操作经 `internal/desktop` 请求宿主执行。
- Pi：现有 `native/agent/` 和私有 `node.exe + chat.cjs` worker 不变，仍由 Go 监督，不移进 Electron 主进程。

## 通信与退出

React → preload → Electron IPC → Go 私有 stdin/stdout。Go 对宿主的反向请求使用独立 `hostId`，与服务请求 `id` 区分。日志写文件或 stderr，不能污染 stdout。后端没有新增 HTTP 业务端口。

IPC 只接受主窗和桌宠的应用主 frame；桌宠仅可调用 Pet 服务。内置网页使用没有 preload 和 Node 权限的 sandbox `WebContentsView`，独立 session，拒绝非 HTTP(S) 导航，无法调用 Go。

关闭主窗沿用 Go 中保存的 tray/minimize/quit 设置。显式退出销毁宿主视图、关闭 Go stdin，后端取消调用并清理终端和 Pi；超过 8 秒的收尾由宿主结束后端进程。原 Pi Windows Job Object 继续负责 worker 随后端退出。

## 数据与偏好

默认 profile 仍为 `%APPDATA%/Chela`，支持 `CHELA_SHELL_PROFILE` 隔离覆盖。SQLite、Go DPAPI 凭据、记忆、任务和会话文件沿用原路径，不新增数据库迁移。首次启动前必须退出原 MyGo 进程，避免两个不同宿主同时恢复同一份数据。

窗口位置沿用 `window-state.json` 的 main/pet。界面使用稳定的 `chela://app/` origin；首次从旧 Electron file origin 与 Windows WebView2 的副本中导入 `chela.*` localStorage，已有新版值优先。原存储不修改，复制出来的临时 profile 在读取进程退出后删除；迁移失败记录到 `logs/electron.log` 并在下次启动重试。自定义 profile 不读取用户正式 WebView2 目录。

内置浏览器的新 Chromium session 无法直接复用 WebView2 Cookie/登录状态，原 WebView2 文件保留，网页需要重新登录。Go 仍复用原有 `mygo/netproxy` 独立网络辅助包以保留系统代理/PAC 行为；这不创建 MyGo 窗口或加载其 UI 宿主。

## 开发与分发

- `npm run dev`：启动前准备 Pi / Go，随后运行仅监听 127.0.0.1 的 Vite 服务并启动 Electron。React / CSS 使用 HMR，不生成 native/dist；Electron / preload / Go / Pi 修改后重启。主窗和桌宠继续使用 chela://app/ origin，由开发专用协议分支转发 Vite 资源，沿用本机偏好与 IPC 校验。开发 CSP 仅增加本次 nonce 和本机 HMR WebSocket；发行包忽略开发环境变量，仍加载静态资源。Electron 退出后关闭本次 Vite 服务。
- `npm run dev:web`：原 Vite 预览入口，沿用隔离的 chat-dev 数据。
- `npm run build`：electron-builder 生成 Windows unpacked 目录；`resources/backend/` 包含 Go 和私有 Pi runtime，`resources/frontend/` 包含前端资源。
- `npm run shell:smoke`：临时 profile，无真实供应商配置或模型请求，检查 IPC、Go、终端、桌宠、网页引用和元素拾取；报告写入 `output/electron-smoke.json`。

本次不恢复归档 Electron 版的旧业务实现，不新增常驻 daemon、前端框架、数据库格式或 Agent 循环。平台声明仍限 Windows，安装器、签名和自动更新另行实施。
