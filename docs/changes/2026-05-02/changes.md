## 修复记忆列表空置信度过滤报错

时间：2026-05-02 21:35:00 +08:00

改了什么：
- 调整 `memory:list` IPC 参数校验，可选字段为 `undefined` 时按未提供处理。
- 调整记忆设置页列表请求，空的 source、topic、confidence 过滤条件不会再作为 `undefined` 字段传给主进程。
- 新增 IPC 回归断言，覆盖记忆列表过滤参数里 `minConfidence: undefined` 的场景。

为什么改：
- 设置页打开记忆列表时，空的 `confidence >=` 输入会生成 `minConfidence: undefined`，主进程旧校验把它当成非法数字，导致 `memory:list` 报错。

涉及文件：
- `src/main/ipc/schema.ts`
- `src/renderer/src/components/assistant-ui/settings/memory-section.tsx`
- `tests/ipc-contract-regression.test.ts`
- `docs/changes/2026-05-02/changes.md`

结果：
- 记忆设置页空过滤条件下可以正常调用 `memory:list`。
- 后端 IPC 对可选过滤字段更稳健，前端请求也不再携带空过滤字段。

## 调整模型页本地接入快捷配置位置

时间：2026-05-02 21:34:12 +08:00

改了什么：
- 将模型设置页左侧栏的 `Ollama` / `LM Studio` 快捷按钮从顶部操作区移到提供商列表下方。
- 新增底部 `快捷配置` 区块，把本地提供商预设作为独立配置入口展示。

为什么改：
- 本地接入预设属于提供商配置的一部分，放在列表下方能减少顶部操作区拥挤，也更符合截图里的布局预期。

涉及文件：
- `src/renderer/src/components/assistant-ui/settings/keys-section.tsx`
- `docs/changes/2026-05-02/changes.md`

结果：
- 搜索和自定义提供商入口保持在顶部。
- 本地接入预设固定落在左侧列表底部空白区域，列表内容较多时随列表区域滚动可达。
