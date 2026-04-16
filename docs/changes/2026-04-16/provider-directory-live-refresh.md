# 模型目录保存后即时刷新所有模型选择器

**时间**: 2026-04-16 11:42

## 改了什么

1. 给 renderer 侧的 provider directory 缓存新增失效与广播机制。
2. 模型配置页保存/删除 provider 或模型条目后，会主动广播“模型目录已更新”。
3. 设置页自己的模型选择器与首页线程里的模型选择器都订阅这个广播，并强制重载最新模型目录。

## 为什么改

- 用户在模型配置页新增模型后，当前页局部能看到变化，但“默认行为”和首页模型下拉仍然停留在旧缓存里。
- Electron 桌面壳没有面向用户的刷新入口，保存后不即时同步会明显降低体感。

## 涉及文件

- `src/renderer/src/lib/provider-directory.ts`
- `src/renderer/src/components/assistant-ui/settings-view.tsx`
- `src/renderer/src/components/assistant-ui/settings/keys-section.tsx`
- `src/renderer/src/components/assistant-ui/thread.tsx`

## 结果

- 新增、删除、启用或禁用模型条目后，设置页和首页的模型下拉都会立即刷新。
- 用户不需要重开页面或手动刷新 Electron 窗口。
