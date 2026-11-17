# Prompt Control Plane 蓝图

> 更新时间：2026-04-08 16:31:49
> 目的：把 prompt 从“几段字符串拼起来”收成“分层控制面”，后续实现按同一套边界推进。

## 1. 一句话

prompt 不是一大坨提示词。

prompt 应该分层，每层只管一类事情：

- 什么是平台硬约束
- 什么是项目级长期规则
- 什么是当前运行时真实能力
- 什么是长期相关记忆
- 什么是这条线程的续接信息
- 什么是这一轮临时补丁

如果这些东西继续炖在一起，后面一定会出现：

- 项目规则和当前任务互相污染
- 历史摘要把长期规则冲掉
- 运行时没有的能力被 prompt 硬说成“有”
- compact 一来，重要规则和低价值摘要一起被压扁

## 2. 核心原则

### 2.1 一层只做一件事

每一层都只回答一个问题，不准多管。

### 2.2 从稳定到动态

越稳定的内容越靠前，越临时的内容越靠后。

### 2.3 prompt 不是安全边界

approval、tool gate、policy、audit 仍然属于 Harness Runtime。

prompt 只能指导模型，不能代替运行时约束。

### 2.4 当前任务不要污染长期规则

“这轮先讨论方案，不要改代码”这种要求，只能是 turn patch，不能写回 workspace policy。

### 2.5 续接信息不是完整记忆系统

讨论记忆架构时，继续沿用既定术语：

- `run memory`：活动 run 现场
- `session memory`：当前线程续接快照
- `semantic memory`：跨线程长期语义记忆

### 2.6 渲染顺序不等于推导顺序

最终拼到 system prompt 里的顺序，可以是“稳定 → 动态”。

但实际装配时，`Turn Intent Patch` 往往要先被提炼出来，再决定：

- 当前该不该检索 `semantic memory`
- 当前该不该强制补齐 `session snapshot`
- 当前是讨论态、实现态，还是 review 态

一句话：`先推导，再渲染。`

### 2.7 指令、事实、记忆、意图要分开

prompt 层不是只有“谁排前面”。

还要先分清这段内容到底属于：

- `instruction`：规则、要求、做事方式
- `fact`：运行时真实事实
- `memory`：历史沉淀或检索结果
- `intent`：本轮临时目标和执行姿势

不分类型，只靠前后顺序，后面一定会把“事实”和“要求”搞混。

## 3. 推荐分层

### 3.1 Platform Constitution

回答：

“你是谁？”
“你默认怎么说话？”
“你和 Harness 的关系是什么？”

应该放：

- 身份
- 默认语言
- 基本回复风格
- 工具调用总协议
- 不能绕过 Harness 的原则

不该放：

- 项目偏好
- 当前任务
- 线程摘要

### 3.2 Workspace Policy

回答：

“在这个仓库里，长期应该怎么干活？”

应该放：

- `.pi/SOUL.md`
- `.pi/USER.md`
- `.pi/AGENTS.md`
- 用户/项目的长期偏好与禁忌

不该放：

- 本轮临时要求
- 某次聊天的局部结论
- 动态 token 使用情况

### 3.3 Runtime Capability Manifest

回答：

“这次运行时，模型真实能做什么？”

应该放：

- 当前模型能力
- 是否支持图片
- 当前 shell 类型
- 已接入的工具 / MCP 能力
- workspace / cwd 等运行事实

不该放：

- 人格描述
- 项目哲学
- 历史摘要

### 3.4 Semantic Memory

回答：

“系统按需检索到哪些长期相关记忆？”

应该放：

- T1 检索命中的短摘要
- 与当前 query 强相关的历史知识

不该放：

- 全量 transcript
- 当前线程全部消息
- 低相关、只会制造噪音的记忆

### 3.5 Session Continuity Snapshot

回答：

“这条线程现在做到哪了？”

应该放：

- 当前任务
- 关键决策
- 关键文件
- 未闭环事项
- 下一步建议
- 当前风险

不该放：

- 完整历史重放
- approval 现场
- 全量 tool logs

### 3.6 Turn Intent Patch

回答：

“这一轮额外要注意什么？”

应该放：

- 这轮是讨论、实现、review，还是排障
- 用户这轮临时强调的执行方式
- 只对本轮有效的约束

不该放：

- 长期偏好
- 持久记忆
- 项目总规则

## 4. 覆盖关系

层级不是“谁写得晚谁赢”。

必须明确谁能覆盖谁：

### 4.1 Constitution 定硬框

`Platform Constitution` 负责产品级硬框架。

它可以定义：

- 默认语言
- 基础身份
- 与 Harness 的边界

但它不该细管仓库私货。

### 4.2 Workspace 只能细化，不能越线

`Workspace Policy` 可以细化平台默认行为，也可以把风格收窄。

但它不能：

- 宣称自己绕过 Harness
- 虚构不存在的工具权限
- 把“一次性要求”冒充长期规则

### 4.3 Runtime 是事实源，不参加“人格竞争”

`Runtime Capability Manifest` 不是建议，是事实。

如果别层和它冲突，以 runtime 为准。

例如：

- prompt 说“支持图片”，runtime 说“不支持” → 以 runtime 为准
- prompt 说“可以联网”，runtime 说“当前断网” → 以 runtime 为准

### 4.4 Memory 只能提供参考，不能发号施令

`Semantic Memory` 和 `Session Continuity Snapshot` 只负责提供上下文参考。

它们不能：

- 新增长期规则
- 提升权限
- 覆盖项目硬约束
- 把旧结论强行盖过用户本轮新要求

### 4.5 Turn 只收窄，不扩权

`Turn Intent Patch` 只应该对当前轮做收窄和聚焦。

它可以说：

- 这轮先讨论，不改代码
- 这轮只 review 某个文件
- 这轮先别跑 build

但它不能：

- 把没有的能力说成有
- 覆盖长期禁忌
- 改写历史 snapshot
- 写回 workspace policy

## 5. Prompt Assembler 最少要知道什么

当前问题不只是“还没单独做 Prompt Assembler”。

更关键是装配器还没拿到足够元数据。

至少要补这些字段：

```ts
type PromptSection = {
  id: string;
  layer:
    | "constitution"
    | "workspace"
    | "runtime"
    | "semantic-memory"
    | "session"
    | "turn";
  role: "instruction" | "fact" | "memory" | "intent";
  authority: "hard" | "soft" | "reference";
  priority: number;
  cacheScope: "stable" | "session" | "turn";
  trimPriority: number;
  writableBack: false | "session" | "semantic";
  content: string;
};
```

新增这些字段不是为了炫技，是为了明确：

- 这段内容到底算规则、事实、记忆，还是意图
- token 紧张时先砍谁
- 哪些内容绝不能被写回长期层
- 哪些内容只能留在 session

## 6. 和当前架构的映射

| 层 | 当前落点 | 状态 |
|---|---|---|
| Platform Constitution | `src/main/prompt-control-plane.ts` 的 `buildPlatformConstitutionSection()` | 已拆出独立层 |
| Workspace Policy | `src/main/soul.ts` 读取 `.pi/SOUL.md + USER.md + AGENTS.md` | 已有，但当前仓库未实际提供 `.pi/` |
| Runtime Capability Manifest | `src/main/prompt-control-plane.ts` 的 `buildRuntimeCapabilitySection()` | 已拆出独立层 |
| Semantic Memory | `src/main/memory/service.ts` | 只有占位，未启用 |
| Session Continuity Snapshot | `src/main/context/service.ts` 的 snapshot 注入 | 已有，是当前最完整的一层 |
| Turn Intent Patch | `src/main/prompt-control-plane.ts` 的 `buildTurnIntentPatchSection()` | 已有首版，当前仍是轻量规则推导 |

当前代码更准确的状态是：

- 已经有 `Prompt Assembler + constitution / workspace / runtime / session / turn` 主干
- `buildSystemPrompt()` 现在负责收集输入，再交给装配器排序输出
- 但 `semantic memory` 仍未真正启用，`turn intent` 也还是规则版首稿

所以当前结论仍然是：

`已经有 control plane 骨架，但还没到 fully operational。`

## 7. Token 压力下先砍谁

compact 来时，不能瞎砍。

默认裁剪顺序应该是：

1. 先砍低相关 `semantic memory`
2. 再砍 `session snapshot` 里的旧细节，保留任务 / 决策 / 风险
3. 再压缩 `runtime capability` 的冗长枚举，保留真实能力结论
4. `workspace policy` 只做去重，不轻易裁掉核心规则
5. `constitution` 和当前轮 `turn intent patch` 默认不裁

一句话：

`先砍参考层，再砍细节层，最后才碰规则层。`

## 8. 推荐收敛顺序

### 8.1 第一步：补 Prompt Assembler

让 `src/main/agent.ts` 不再自己拼大字符串，只负责调用统一装配器。

### 8.2 第二步：拆出 Runtime Capability Layer

把“你是谁”和“当前能做什么”分开，避免人格和运行事实混写。

### 8.3 第三步：补 Turn Intent Patch

把“本轮先讨论 / 先 review / 不要直接改”变成显式层，不再散落在用户消息理解里。

### 8.4 第四步：接实 Semantic Memory

让 T1 真正成为独立层，而不是继续塞回 `context/service`。

### 8.5 第五步：给装配链补元数据

至少补：

- `role`
- `authority`
- `cacheScope`
- `trimPriority`
- `writableBack`

方便后续调试、可视化和审计。

## 9. 实施约束

- Harness policy 继续留在运行时，不回退成 prompt 自觉
- `session memory snapshot` 继续只负责续接，不冒充完整记忆系统
- `Turn Intent Patch` 不得写回 `.pi/*`
- `Workspace Policy` 不得塞进动态 usage 或 token 状态
- `Runtime Capability Manifest` 必须来自真实运行时，不准靠 prompt 臆造
- 没有充分理由，不新增更多“人格段落”

## 10. 最终结论

这份方案的重点不是“把 prompt 写更长”，而是把边界收清：

- 长期规则归长期规则
- 项目规则归项目规则
- runtime facts 归 runtime facts
- 续接归续接
- 本轮补丁归本轮补丁

最后收成一句：

`后续实现 prompt 时，先做层类型、覆盖关系、裁剪顺序，再做内容扩张。`
