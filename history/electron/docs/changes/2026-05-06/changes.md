## Workspace 文件浏览器 baseline

时间：2026-05-06 16:24:42

改了什么：
- 为 Workspace 增加受控目录浏览和文本预览 IPC：`workspace:list-directory`、`workspace:read-file-preview`。
- 在 Settings 的 Workspace 区加入文件浏览器，支持进入目录、返回上级、查看文本文件预览，并显示图片 / 二进制 / 未知类型信息。
- 更新 specs 索引，把 MCP Server 管理 UI 和 Workspace 文件浏览器状态标为 baseline 已落地。

为什么改：
- `specs/README.md` 的后续规划里仍把 MCP 管理 UI 和 Workspace 文件浏览器标成未实现；MCP UI 当前已有实现，Workspace 文件浏览器缺少产品面。
- Workspace 文件浏览器属于明确未完成项，当前代码结构可以通过现有 workspace/settings IPC 完成最小可用闭环。

涉及文件：
- `src/shared/ipc.ts`
- `src/shared/contracts.ts`
- `src/main/files.ts`
- `src/main/ipc/workspace.ts`
- `src/main/ipc/schema.ts`
- `src/preload/index.ts`
- `src/renderer/src/components/assistant-ui/settings/workspace-section.tsx`
- `specs/README.md`

结果：
- Workspace 文件浏览器已有 baseline：目录枚举限制在当前 workspace 内，敏感文件预览走禁读保护，UI 复用现有设置页视觉语言和圆角 token。
