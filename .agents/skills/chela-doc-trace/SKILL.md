---
name: chela-doc-trace
description: Use for Chela change-log records, docs/changes entries, prior-day work recall, and capturing repeated user constraints into AGENTS.md or project skills.
---

# Chela Doc Trace

## 适用场景

- 完成了一轮有效代码、配置、文档、spec 或 skill 改动。
- 用户要求回看某天做了什么、还剩什么、昨天有没有计划。
- 用户多次确认同一条偏好、禁忌或长期约束，需要沉淀成稳定规则。

## 留痕规则

- 默认追加到 `docs/changes/YYYY-MM-DD/changes.md`。
- 每个日期目录默认只维护一个 `changes.md`；当天新增记录继续追加。
- 用二级标题区分每轮改动，标题直接写主题，不把时分秒写进文件名。
- 即使本次改动本身就在文档里完成，也要在文档内写明更新时间和本轮摘要。
- 不能只让 `git diff` 充当记忆。

## 推荐模板

```md
## <改动主题>

- 时间：YYYY-MM-DD HH:mm +0800
- 改了什么：
  - ...
- 为什么改：...
- 涉及文件：
  - `path/to/file`
- 验证结果：
  - ...
- 未做：
  - 未运行 `pnpm build` / `pnpm check`，原因是 ...
```

## 回看历史

- 用户指定日期时，先读当天 `docs/changes/<date>/changes.md`，再看 `docs/todos/*` 和 `git status`。
- 区分“已完成记录”和“明确的后续计划”；不要把完成日志改写成假的今日计划。
- 引用仍然开放的事项时，尽量使用文档里的原话或明确文件路径。

## 约束沉淀

- 长期全局规则写进根 `AGENTS.md`。
- 只在特定场景生效的规则写进对应 `chela-*` skill。
- 新增规则时写成稳定约束，不写成一次性聊天记录。
