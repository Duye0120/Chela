> 时间：2026-04-15 17:12:00

# 主进程内联打包 diff 依赖

## 本次改动

- 调整 `electron.vite.config.ts` 的主进程打包配置，把 `diff` 从 externalize 列表里排除，改为直接打进 `out/main/index.js`。
- 给主进程新增 `src/main/diff-shim.ts`，统一通过 `createRequire("diff")` 读取 CommonJS 入口，`git.ts` 和 `file-edit.ts` 都改走这层 shim。
- 直接修正当前 `out/main/index.js` 的 `diff` 加载方式，先让现有运行产物恢复可启动。
- 补充本次回归修复记录，明确运行时崩溃的触发点和处理方式。

## 为什么改

- 当前桌面端启动时主进程直接执行 `out/main/index.js`，其中保留了 `import "diff"` 顶层导入。
- 这条导入在当前运行环境里触发 `ERR_MODULE_NOT_FOUND`，应用在主进程初始化阶段直接崩溃。
- `diff` 包本身同时提供 ESM 和 CJS 入口，当前环境里按文件路径直连 ESM 入口会碰到解析脆弱点；主进程走 `createRequire("diff")` 的 CommonJS 入口更稳。
- `git.ts` 和 `file-edit.ts` 都依赖 `createTwoFilesPatch / parsePatch`，把加载方式收口成一层 shim，后面继续构建也更容易控。

## 涉及文件

- `electron.vite.config.ts`
- `src/main/diff-shim.ts`
- `src/main/git.ts`
- `src/main/tools/file-edit.ts`
- `out/main/index.js`
- `docs/changes/2026-04-15/bundle-diff-in-main.md`

## 验证情况

- `pnpm build` 已执行一次，当前机器上的 Node 运行时在 `CSPRNG` 初始化阶段崩溃，构建过程没有进入业务代码打包阶段。
- 当前仓库内的 `out/main/index.js` 已经去掉 `from "diff"` 和按文件路径直连 `libesm/index.js` 这两种导入形式，改为 `require("diff")`。
- 后续只要本机 Node 环境恢复，重新构建后会继续由 `electron.vite.config.ts` 的配置接管，不需要保留手工热修。
