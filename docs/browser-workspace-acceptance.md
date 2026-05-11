# Browser Workspace 验收清单

> 2026-05-10 | 目的：把 Browser Workspace 从“代码已写”收口成“可演示、可回归、可继续扩展”的功能切片。

## 1. 本轮验收范围

本轮 Browser Workspace 包含 4 个连续 MVP：

1. **页面快照上下文**
   - Browser 面板可抓取当前页面摘要。
   - 上下文包含 title、url、description、viewport、headings、visible text、关键可交互元素。
   - 发送消息时注入 `[Browser Context]` 的页面快照段。

2. **Pin / Comment**
   - Browser 面板可进入 Pin 模式。
   - 点击页面元素后生成编号 marker。
   - Chela 面板弹出批注输入框。
   - 提交后生成 `kind: "pin"` 的 Browser context item。

3. **Context Governance**
   - Browser context 统一经过 `compactBrowserContextItems()`。
   - 优先级：pin > element > page-snapshot。
   - 同 URL page snapshot 自动替换旧快照。
   - Composer chips 显示 item 数、估算字符数和 light/medium/heavy 档位。

4. **Pin Jump / Review List**
   - Pin 有 `pinId` / `markerNumber`。
   - Browser 面板显示 Pins 列表。
   - 点击列表项可回跳原 selector、滚动到中间并高亮 marker。
   - selector 失效时展示轻量错误，不影响已加入的上下文。

## 2. 自动回归验收

### 2.1 Browser interview regression

命令：

```bash
pnpm exec tsx tests/browser-interview-regression.test.ts
```

期望：

```text
browser interview regression tests passed
```

覆盖点：

- element context 创建与 prompt 输出。
- page-snapshot context 创建与 prompt 输出。
- pin context 创建与 prompt 输出。
- pinId / markerNumber 保留。
- context governance 去重、排序、预算摘要。

### 2.2 相关文件 TypeScript 过滤检查

命令：

```bash
pnpm exec tsc --noEmit --pretty false 2>&1 | grep -E 'App.tsx|thread.tsx|BrowserPreviewPanel|browser-interview|browser-inspector|browser-context|contracts.ts|browser-interview-regression' || true
```

期望：无输出。

说明：当前仓库全量 `tsc` 可能存在 unrelated 旧错误，所以这里先做 Browser 相关文件过滤检查。

## 3. 手动产品验收清单

> 手动验收建议用 Chela 本地 dev 页面或任意稳定页面。目标不是测所有网页兼容性，而是确认 Browser Workspace 主链路能演示。

### 3.1 页面快照

- [ ] 打开 Browser 面板。
- [ ] 输入或加载目标 URL。
- [ ] 页面加载完成后状态栏显示页面标题 + URL。
- [ ] 点击“抓页面”。
- [ ] Composer 出现 page snapshot chip。
- [ ] Browser Context 预算显示 item 数和 chars 档位。
- [ ] 连续抓同一个 URL，不应堆出多份重复 snapshot。

### 3.2 元素选择

- [ ] 点击“选元素”。
- [ ] hover 页面元素时出现高亮。
- [ ] 点击元素后 Composer 出现 DOM element chip。
- [ ] chip label 能看出元素大概身份。
- [ ] 关闭/再次开启不会导致页面不可点击。

### 3.3 Pin / Comment

- [ ] 点击“Pin”。
- [ ] 点击页面元素后页面出现编号 marker。
- [ ] Chela 面板出现批注输入框。
- [ ] 输入批注后点击“加入上下文”。
- [ ] Composer 出现 pin chip。
- [ ] Browser 状态栏显示最近 pin。

### 3.4 Pin 列表回跳

- [ ] 添加至少 2 个 pin。
- [ ] Browser 面板出现 Pins 横向列表。
- [ ] 点击某个 pin，页面滚动到对应元素。
- [ ] 对应元素重新高亮。
- [ ] marker 短暂放大/强调。
- [ ] 页面刷新后点击旧 pin，若 selector 找不到，应显示轻量错误，不崩溃。

### 3.5 发送消息

- [ ] 带 browser context 输入一条消息并发送。
- [ ] 发送时 prompt 包含 `[Browser Context]` 段。
- [ ] pin 段包含 comment、selector、rect、viewport、styles。
- [ ] page snapshot 段包含标题、headings、关键可交互元素。
- [ ] 发送后当前 session 的 Browser Context 清空或符合现有会话清理规则。

## 4. 已知边界

- Pin 目前只保存在当前 Browser 面板/webview 内存态，不跨页面持久化。
- selector 依赖页面 DOM；页面刷新或重新渲染后可能失效。
- 页面快照是结构摘要，不是截图，也不是完整 HTML。
- 字符预算是粗略 chars 估算，不是精确 token。
- 暂不做 Playwright/CDP 自动 browser action。

## 5. 下一刀建议

验收通过后，下一刀做 **Browser Review Queue**：

- 把多个 pin 组织成一组 review issue。
- 支持一键生成“按这些页面批注修复当前页面”的任务 prompt。
- 保留 review record，方便回看和二次修改。

这比继续堆单点功能更有产品感，也更适合面试讲“evidence-driven UI repair”。
