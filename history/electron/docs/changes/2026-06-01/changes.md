## 识别账号计划到期错误

- 时间：2026-06-01 13:38 +0800
- 改了什么：
  - 将 `plan expired`、subscription、billing、quota、credits 等账号计划和额度类错误归类为 `账号计划不可用`。
  - 增加 `your plan has expired` 回归断言。
- 为什么改：账号计划到期会导致模型无回复，用户需要直接看到可操作原因。
- 涉及文件：
  - `src/shared/chat-runtime-errors.ts`
  - `tests/provider-regression.test.ts`
- 验证结果：
  - `pnpm exec tsx tests/provider-regression.test.ts`
  - `pnpm exec tsx tests/model-routing-regression.test.ts`
  - `pnpm exec tsx tests/chat-runtime-error-regression.test.ts`
  - `pnpm exec tsc --noEmit -p tsconfig.json`
  - `pnpm exec tsc --noEmit -p src/renderer/tsconfig.json`
- 未做：
  - 未运行 `pnpm build` / `pnpm check`，原因是本次只改错误文案分类，已由定向回归和两侧 typecheck 覆盖。

## 增加 OpenRouter 内置模型源

- 时间：2026-06-01 13:46 +0800
- 改了什么：
  - 增加 `builtin:openrouter` 内置 source，类型为 `openai-compatible`。
  - 默认 base URL 为 `https://openrouter.ai/api/v1`。
  - 预置 OpenRouter 模型条目：Claude Sonnet 4、GPT-4o、Gemini 2.0 Flash。
  - 保留 builtin source 的默认 custom base URL，避免 OpenRouter 被读成 native source。
- 为什么改：用户需要在模型列表里直接配置和选择 OpenRouter。
- 涉及文件：
  - `src/shared/provider-directory.ts`
  - `src/main/providers.ts`
  - `tests/provider-regression.test.ts`
- 验证结果：
  - `pnpm exec tsx tests/provider-regression.test.ts`
  - `pnpm exec tsx tests/model-routing-regression.test.ts`
  - `pnpm exec tsx tests/package-scripts-regression.test.ts`
  - `pnpm exec tsc --noEmit -p tsconfig.json`
  - `pnpm exec tsc --noEmit -p src/renderer/tsconfig.json`
- 未做：
  - 未运行 `pnpm build` / `pnpm check`，原因是本次为 provider directory 和类型层改动，已用定向回归和两侧 typecheck 覆盖。
