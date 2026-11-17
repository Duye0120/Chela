# Settings UI Refactor

**时间**: 2026-04-14 10:20:00  
**摘要**: 将分散的8个设置选项卡合并为4大逻辑分类。
**原因**: 提高界面的组织性和信息密度，更便于用户根据类别找到相关设置。

## 改动内容
- `src/renderer/src/components/assistant-ui/settings/types.ts`: 更新 `SettingsSection` 联合类型为 `ai_model`, `workspace`, `interface`, `system`
- `src/renderer/src/components/assistant-ui/settings/constants.ts`: 将 `SETTINGS_SECTIONS` 重新梳理分类映射。
- `src/renderer/src/components/assistant-ui/sidebar.tsx`: 用新的左侧面板选项卡替换和重新采用 Heroicons 表意。
- 提取并创建新的Wrapper页面组件合并子模块设置:
  - `ai-model-section.tsx`: GeneralSection + KeysSection
  - `interface-section.tsx`: AppearanceSection + TerminalSection
  - `system-section.tsx`: ArchivedSection + LogsSection + AboutSection
- 修复 `App.tsx` 和 `settings-view.tsx` 对齐相关参数传递和页面默认路由 ("general" -> "ai_model")。
