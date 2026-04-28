## 修复 Trace 面板图标导入导致的白屏

时间：2026-04-28 11:39:33

改了什么：
- 将 `src/renderer/src/App.tsx` 中不存在的 `ScopeIcon` 替换为 `lucide-react` 当前可用的 `ActivityIcon`。
- 新增本轮变更记录。

为什么改：
- renderer TypeScript 检查报错：`lucide-react` 没有导出 `ScopeIcon`。
- 该导入会阻断渲染层编译，导致页面白屏卡住。

涉及文件：
- `src/renderer/src/App.tsx`
- `docs/changes/2026-04-28/changes.md`

结果：
- Trace 面板入口继续使用同一套 `lucide-react` 图标体系，渲染层导入恢复可解析。
