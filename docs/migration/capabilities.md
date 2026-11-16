# 扩展与 MCP 使用边界

更新时间：2026-11-15。固定烟测环境：Pi 1.5.2、Windows、私有 Node 24.16.0。

工作区菜单中的「扩展与技能」安装一个本机目录。包被复制到当前 profile 的 `capabilities/<id>/<hash>`，保留来源路径与 hash；运行中不能安装、启停或重载。升级时先停用、移除登记，再安装新版本，旧版本文件保留。不会自动联网安装依赖。

```json
{
  "name": "example",
  "version": "1.0.0",
  "pi": { "extensions": ["index.ts"], "skills": ["skills/example/SKILL.md"], "prompts": ["prompts/review.md"] },
  "chela": { "id": "example", "compatibility": "C", "permissions": ["本地 Node 权限"], "requires": [] }
}
```

工具和命令须以 `example__` 开头；技能和提示模板由宿主加同样前缀。包内路径必须明确，不能使用 glob 或符号链接。附加依赖应提前打包，宿主提供当前 Pi SDK 与旧 TypeBox alias。项目范围仅在对应项目会话加载；不会扫描全盘或全局 skill 目录。

| 等级 | 当前行为与实际证据 |
|---|---|
| A 资源 | 提示模板展开、技能名称进入实际模型请求；`read` 经 Go 读取已启用包内文件，包外路径被拒绝。|
| B 生命周期与工具 | session_start/shutdown、custom entry、native tool、命令登记及嵌套 managed read 已用真实 worker 验证。|
| C 简单交互 | select/confirm/input/editor、notify/status 使用 rpc 语义；session/run/request 身份、回答校验、取消与超时已验证。实际 UI 仍待验收。|
| D TUI 自定义 | 明确拒绝启用，需单独 WebView 适配。|
| E 私有 API/提供商 | 明确拒绝；不能注册另一套 provider 或 MCP owner。|

兼容等级与信任等级独立。只有资源的包标为 managed；执行任意 Node 扩展的包标为 trusted-native，不能宣称已经沙箱化。native 工具回执只描述观测到的调用，不阻止扩展自行执行 Node I/O。native 包每轮后销毁 worker，清除进程内残留；加载失败会停止该轮、记录失败并排除该包，用户下一次提交在干净 worker 中继续，直到明确重载才再次尝试失败包。

「MCP 连接」支持本机 stdio 和 HTTPS（环回地址允许 HTTP）。Go 管理单一连接与子进程树；凭据复用现有加密存储，列表不返回 headers/env。默认每次调用展示最终参数并请求授权，也可由用户为该连接明确启用自动授权。服务仍持有自己的文件和网络权限。

MCP 工具通过 `tool_search` 延迟发现，实际调用使用本轮固定的完整 schema 和版本；资源列表、模板列表与资源读取也经同一路径。stdio、HTTP、发现/授权/持久回执、相同结果恢复复用已烟测。连接中断或回执写入失败会留下未知结果并停止继续请求；不会据此自动重做外部副作用。真实第三方服务及所有协议错误组合尚未验收。
