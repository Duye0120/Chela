# Diff Panel 按选中文件提交并兼容工具模型请求

**时间**: 2026-04-16 11:56

## 改了什么

1. diff-panel 的 `Commit` 按钮改成携带 `message + selected paths` 调用 git IPC。
2. main 进程的提交链路改成先对选中文件执行 `git add -- <paths>`，再按这些路径执行 `git commit`。
3. diff-panel 增加提交失败提示，避免点击后只有控制台报错、界面无反馈。
4. `git add` 和 `git reset` 的路径参数统一补上 `--`，保证 pathspec 解析稳定。
5. 提交信息生成请求去掉空的 `tools: []`，兼容 DashScope 下会拒绝空工具数组的模型。

## 为什么改

- 用户点击 `Commit` 期望提交当前勾选文件，当前实现只提交已经 staged 的内容，选中文件范围没有进入主进程。
- 提交失败时 renderer 没有接住异常，diff-panel 只表现为“没反应”，定位成本高。
- 部分 openai-compatible 模型会把空工具数组视为非法请求，导致工具模型生成链路频繁走本地兜底。

## 涉及文件

- `src/shared/contracts.ts`
- `src/preload/index.ts`
- `src/main/ipc/workbench.ts`
- `src/main/git.ts`
- `src/main/worker-service.ts`
- `src/renderer/src/components/assistant-ui/diff-panel.tsx`

## 结果

- diff-panel 点击 `Commit` 会按当前勾选文件完成暂存和提交。
- git 提交失败时，面板里会直接显示错误信息。
- 工具模型生成 commit 文案时，不再附带空 `tools` 字段。
