# 2026-04-08 15:56 Prompt Control Plane Baseline

> 更新时间：2026-04-08 16:31:49

## 第 1 轮：基线

### 本次做了什么

- 新增 `docs/prompt-control-plane.md`，把 prompt 分层方案收成单独文档
- 明确了 `Platform Constitution / Workspace Policy / Runtime Capability Manifest / Semantic Memory / Session Continuity Snapshot / Turn Intent Patch` 六层
- 补清了“prompt 负责指导，Harness 负责边界”的职责分工

### 为什么改

- 之前项目已经有 `T0 + session snapshot + future T1 hook` 的主干
- 但 prompt 侧还停留在“几段字符串拼起来”，没有把每层职责说死
- 如果现在不先定文档，后面继续接 memory、compact、sub-agent 时很容易把长期规则、线程续接和本轮临时要求又炖回一锅

### 涉及文件

- `docs/prompt-control-plane.md`

### 验证

- `2026-04-08 15:56:51` 人工核对当前代码与文档映射：
- `src/main/agent.ts`
- `src/main/soul.ts`
- `src/main/context/service.ts`
- `src/main/memory/service.ts`

### 说明

- 这轮只定架构文档，不改代码
- 后续实现优先补 `Prompt Assembler`，再拆 `Turn Intent Patch` 和独立 `Runtime Capability` 层

## 第 2 轮：层级调优

### 时间

- `2026-04-08 16:14:00`

### 本次做了什么

- 补了 prompt 层的覆盖关系，明确不是“后写覆盖前写”
- 增加 `instruction / fact / memory / intent` 四种角色划分
- 补了 token 压力下的裁剪顺序，先砍参考层，再砍细节层
- 给 `Prompt Assembler` 增加 `role / authority / trimPriority / writableBack` 等元数据要求
- 更新 `docs/prompt-control-plane.md`，把这些边界写死

### 为什么改

- 仅有六层还不够，真正容易翻车的是“谁能改谁”
- 如果不把 `runtime fact` 和 `memory` 分开，后面很容易把旧摘要误当规则
- 如果不先定裁剪顺序，compact 一上来就可能把关键规则一起压没

### 涉及文件

- `docs/prompt-control-plane.md`
- `docs/changes/2026-04-08/prompt-control-plane-baseline.md`

### 验证

- `2026-04-08 16:14:00` 人工复核 `src/main/agent.ts` 当前仍是 `base + snapshot + semantic memory` 直拼
- `2026-04-08 16:14:00` 人工确认 `src/main/context/service.ts` 已具备 session snapshot 主链，适合作为后续装配输入

### 说明

- 这轮仍然只调文档，不动实现
- 下一步最值钱的是把 `Turn Intent Patch` 从“隐式理解”拉成显式装配输入

## 第 3 轮：首版代码落地

### 时间

- `2026-04-08 16:31:49`

### 本次做了什么

- 新增 `src/main/prompt-control-plane.ts`，落了首版 `Prompt Assembler`
- 把 `Platform Constitution / Workspace Policy / Runtime Capability / Session Snapshot / Semantic Memory / Turn Intent Patch` 都收成显式 section
- `src/main/agent.ts` 不再自己手搓大字符串，改成收集输入后交给 assembler 排序输出
- 补了首版 `Turn Intent Patch` 规则推导，能从本轮用户话里提炼讨论 / review / 排障 / 实现模式
- 调整 `src/main/soul.ts`，让 workspace policy 内容以干净 section 形式注入
- 更新 `docs/prompt-control-plane.md`，把状态从“还没落地”改成“骨架已在”

### 为什么改

- 再只写文档已经不够了，代码里那条 `base + snapshot + semanticMemory` 直拼链必须先拆
- `runtime facts` 不独立，后面很难做裁剪、调试和可视化
- `turn intent` 不先显式化，后面 discussion / implementation / review 的行为还是会继续糊在一起

### 涉及文件

- `src/main/prompt-control-plane.ts`
- `src/main/agent.ts`
- `src/main/soul.ts`
- `docs/prompt-control-plane.md`
- `docs/changes/2026-04-08/prompt-control-plane-baseline.md`

### 验证

- `2026-04-08 16:31:49` 运行 `pnpm exec tsc --noEmit -p tsconfig.json`

### 说明

- 这轮先落骨架，没有做 token-aware trim 执行链
- `Turn Intent Patch` 现在是轻量规则版，先求稳，不装聪明
- 下一步该补的是 section 级调试视图，或者把 turn intent 从规则版升级成结构化解析
