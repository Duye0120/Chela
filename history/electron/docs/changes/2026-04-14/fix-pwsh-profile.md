# 2026-04-14
## 修复集成终端无法使用 pwsh (PowerShell Core) 配置的问题
- 问题描述：如果用户通过 Microsoft Store (或 \winget\ / WindowsApp 执行别名) 安装了 \pwsh\，Node.js 原生的 \s.existsSync\ 会因重解析点 (Reparse Point) 访问权限问题抛出报错，从而将存活的 \pwsh.exe\ 误判为不存在。这导致 \Chela\ 总是降级打开旧版 \powershell.exe\ (Windows PowerShell 5.1)，致使如 \oh-my-posh\ 这类配置在 \pwsh\ 下无法加载。
- 解决：在 \src/main/shell.ts\ (\indExecutableOnPath\) 添加了针对 \WindowsApps\ 目录特有的 \EACCES / EPERM\ 异常捕获探测，如果是被权限拦截则依然正确识别为有效执行别名并正确启动 \pwsh\。
- 影响文件：\src/main/shell.ts\

