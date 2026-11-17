# 打通 Diff Panel "自动生成 Commit Message" 完整链路

**时间**: 2026-04-15 18:00

## 改了什么

打通了 Sparkles 按钮从 UI 点击到 Worker 模型生成再到结果回填的完整 IPC 链路。

### 涉及文件

1. **`src/shared/contracts.ts`**: `GenerateCommitMessageRequest.diffContent` 改为可选 (`?`)，允许 UI 不传 diffContent，由 Main 进程自行获取。

2. **`src/main/git.ts`**: 新增 `getDiffForFiles(workspacePath, filePaths)` 函数，可根据文件路径列表从 git 仓库中逐个获取实际 diff 内容（优先 unstaged，其次 staged，最后 untracked）。

3. **`src/main/ipc/worker.ts`**: 增强 `worker:generate-commit-message` 的 handler。如果 UI 请求中 `diffContent` 为空，则调用 `getDiffForFiles` 从 git 获取实际 diff 内容后再传给 `WorkerService.generateCommitMessage`。

4. **`src/renderer/src/components/assistant-ui/diff-panel.tsx`**:
   - 简化 `generateCommitMessage` 本地辅助函数：不再拼接 patch 内容，只传 `selectedFiles`。
   - 更新 `handleGenerateMessage` handler：移除手动拼接 diffContent 的逻辑，增加 `files.length === 0` 的提前返回，增加 try/catch 错误处理（console.error）。

## 数据流

```
Sparkles 按钮点击
  → handleGenerateMessage()
    → 从 overview 筛选选中文件
    → window.desktopApi.worker.generateCommitMessage({ selectedFiles })
      → IPC: worker:generate-commit-message
        → Main handler: 检查 diffContent
          → 若为空: getDiffForFiles() 从 git 获取实际 diff
        → WorkerService.generateCommitMessage() → LLM 生成
      → 返回 raw commit message 字符串
    → 解析: 第一行 → Title, 其余 → Description
    → 填入 commitMessage 状态
  → UI 更新 Title + Description 输入框
```

## 错误处理

- `isGeneratingMessage` 状态控制 Loading 动画（Sparkles 按钮 animate-pulse + disabled）
- 错误通过 try/catch 捕获并 console.error，不会导致 UI 崩溃
- 文件列表为空时提前返回，不发起无效 IPC 调用
