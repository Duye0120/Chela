# 资料备份、迁移预览与恢复

更新时间：2026-11-15。维护命令只操作明确给出的目录，不启动模型、worker、MCP、PTY 或桌面窗口。输出目录必须尚不存在，不会自动激活或覆盖原 profile。

```powershell
# 对当前资料做一致备份；输出必须在源目录之外。
go -C native run ./cmd/chela-data backup --source "$env:APPDATA/Chela" --out 'D:/Chela-backups/backup-1'

# 校验文件 SHA-256、长度以及数据库附件引用。
go -C native run ./cmd/chela-data verify --source 'D:/Chela-backups/backup-1'

# 在副本内导入两次并对账；source/ 保留备份，profile/ 是迁移结果。
go -C native run ./cmd/chela-data preview --source "$env:APPDATA/Chela" --out 'D:/Chela-backups/preview-1'

# 恢复到新目录，并从当前 profile 合并最新遗忘/删除登记。
go -C native run ./cmd/chela-data restore --source 'D:/Chela-backups/backup-1' --current "$env:APPDATA/Chela" --out 'D:/Chela-backups/restored-1'
```

备份使用 SQLite `VACUUM INTO`，覆盖已提交 WAL，而非直接复制活跃 `.db`。备份包含应用 JSON/DB、data、chat-sessions、capabilities、blobs；不包含 Chromium 缓存、独立 web-dev profile 或项目目录中的外部文件。附件引用必须能与清单 hash/长度对上。加密配置保留为本机密文，跨 Windows 用户恢复不能保证可解密。

恢复前核验所有清单文件，随后在新目录升级 schema、合并同一身份的较新遗忘记录和已删除任务/会话，清理相应记忆索引与派生上下文。排队运行、旧审批、未结束进程和扩展交互都失效；扩展与 MCP 默认停用，需用户重新确认。未知外部副作用仍为 unknown，不自动恢复 JavaScript 栈或旧 CLI 进程。当前不支持 `erase_payload` 格式的原文擦除登记，遇到它会拒绝恢复而不是冒险开放检索。

数据库版本高于程序支持范围时拒绝写入；正常 schema 升级前先在 `schema-backups/` 保存一致 DB 副本。它是升级前数据库快照，完整资料回退仍使用上述备份清单。没有任意 down migration。

旧 Planner 的笔记、日期、状态、独立提醒、原始字段与终端链接会保留；旧结果文本归档到原 terminal ID，进程显示中断且不提供虚假的 resume。终端退出或文本中的 done 不改变任务完成状态。旧模式与 locked 保留，新六维心情从基线开始；旧信号不伪造当前心情。

本机已执行真实资料副本预览：`C:/Users/user/AppData/Local/Chela-rebuild-checkpoints/20261115-migration-preview`。14 个资料文件，1 个会话、0 条消息，源 transcript 本身为空；重复导入数量一致。原目录未生成新 `chela.db`，未切换读路径。报告内核为 SQLite 3.54.1，source ID 随 `migration-report.json` 保存。这是资料迁移对账证据，不能替代 UI 或生产验收。
