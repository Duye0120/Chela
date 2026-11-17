> 时间：2026-04-15 17:34:00

# 补回 commit 描述编辑器依赖声明

## 本次改动

- 给 `package.json` 补回 `@tiptap/react`、`@tiptap/starter-kit`、`@tiptap/extension-placeholder` 和 `tiptap-markdown`。

## 为什么改

- `src/renderer/src/components/ui/commit-description-editor.tsx` 直接 import 了这四个包。
- 当前 `package.json` 没有声明它们，`pnpm install` 会把它们从 `node_modules` 里清掉，随后 Vite 预构建和 renderer import 解析一起报错。

## 涉及文件

- `package.json`
- `src/renderer/src/components/ui/commit-description-editor.tsx`
- `docs/changes/2026-04-15/restore-missing-tiptap-dependencies.md`

## 后续动作

- 重新执行一次 `pnpm install`，让缺失依赖回到 `node_modules`。
- 再重启一次 `pnpm dev`，确认 commit 描述编辑器相关的预构建错误消失。
