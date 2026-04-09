# 安装 oh-my-codex

> 时间：2026-04-09 11:14:30
> 目的：按用户给的仓库 `Yeachan-Heo/oh-my-codex` 安装 OMX，到当前 Codex 用户环境。

## 本次改了什么

- 确认目标仓库是 `oh-my-codex / omx` 工作流层，不是单独的 `.codex-plugin` 目录插件。
- 通过 `npm install -g oh-my-codex` 完成全局安装。
- 运行 `omx setup`，把 prompts、skills、native agents、hooks、HUD 配到 `C:\Users\Administrator\.codex`。
- 运行 `omx doctor` 做快验，确认主安装链路可用。

## 为什么这样改

- 用户要“装一下”这个仓库，README 的官方主路径就是全局安装 `oh-my-codex` 后执行 `omx setup`。
- 直接走官方安装链最稳，少踩一层本地源码构建和环境差异坑。

## 当前结果

- `omx --version` 可用，版本：`0.12.3`
- `omx setup` 已完成
- `omx doctor` 通过主检查，但有两条提醒：
  - `omx explore` 的 Rust harness 还没就绪，需要 Rust 或额外设置 `OMX_EXPLORE_BIN`
  - `~/.agents/skills` 旧目录仍在，可能造成技能重复显示

## 涉及位置

- `C:\Users\Administrator\.codex\config.toml`
- `C:\Users\Administrator\.codex\hooks.json`
- `C:\Users\Administrator\.codex\agents\`
- `C:\Users\Administrator\.codex\skills\`
