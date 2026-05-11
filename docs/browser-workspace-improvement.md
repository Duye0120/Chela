# Browser Workspace 改进计划

> 2026-05-10 11:55 +0800 | 状态：MVP 实施中

## 这一步的目的

Chela 现在的 Browser 面板能打开页面、选择 DOM 元素，但体验更像“内嵌网页 + 元素选择器”，还不像 Codex App / Cursor 那种能围绕页面做 review、调试和上下文协作的 Browser Workspace。

这轮先补第一刀：让 Browser 不只选单个元素，还能把当前页面摘要抓成上下文，降低“我得点到某个 DOM 才能让 agent 理解页面”的摩擦。

## 外部参考

### Codex App in-app browser

- 核心是用户和 Codex 共享同一个 rendered page 视角。
- 适合 local dev server、file-backed preview、public page。
- 重点体验是 preview + comment + browser use：当 bug 只能在渲染页看到时，用 browser comments 给 Codex 指上下文。

### Cursor Browser tool

- Agent 可以控制浏览器测试应用、视觉调整布局/样式、做 accessibility audit、把设计转代码。
- 价值不是“打开网页”本身，而是 browser 状态能进入 agent 工作循环：看页面、定位元素、执行动作、反馈修改。

## Chela 当前状态

已有能力：

- Electron `<webview>` 内嵌 Browser Preview。
- 地址栏、后退、前进、刷新。
- Inspector 模式 hover/click DOM 元素。
- 选中元素会进入聊天上下文，发送时注入 `[Browser Context]`。

主要问题：

- 只能靠“点元素”给上下文，页面整体状态进不来。
- 没有页面标题、可交互元素、主要文本、viewport 这类摘要。
- 用户不知道 agent 看到的是哪个页面、哪些东西。
- 体验上像 DOM picker，不像 review/debug workspace。

## MVP 范围

### 1. 页面快照上下文

在 Browser 面板新增“抓取页面”动作：

- 从 webview 当前页面提取：
  - title
  - url
  - meta description
  - viewport size
  - headings
  - visible text 摘要
  - buttons / links / inputs 等关键可交互元素
- 作为一个 `BrowserContextItem` 加入当前 session。
- 发送聊天时复用既有 Browser Context prompt，不新增 agent runtime 协议。

### 2. 面板状态更清晰

- 显示页面标题。
- 最近一次抓取/选择给出明确反馈。
- Inspector 文案从“浏览器选择”升级成更接近 Browser Workspace。

### 3. 非目标

本轮不做：

- Playwright/CDP 自动操作浏览器。
- 截图视觉模型输入。
- 网页评论 pin 的完整数据模型。
- 多 tab / session 持久化。
- 跨进程 browser automation server。

这些后续再做，避免第一刀过大。

## 后续路线

1. **Review comments**：像 Codex App 一样在页面上留 pin/comment，再作为上下文发送。
2. **Agent browser actions**：让 agent 能导航、点击、输入、读取 snapshot。
3. **Visual evidence**：截图 + DOM snapshot + trace 绑定，形成可复盘证据。
4. **Accessibility/debug audit**：自动抽取按钮可访问名、表单 label、布局溢出等问题。


## Pin / Comment MVP

> 2026-05-10 11:55 +0800 | 状态：实施中

页面快照解决“让 agent 看到页面整体结构”，Pin 解决“我具体在页面哪里发现问题”。

### MVP 行为

- Browser 面板新增 Pin 模式。
- 开启 Pin 后，用户点击页面任意元素：
  - 页面内显示一个轻量编号 pin。
  - Chela 侧边栏弹出评论输入框。
  - 用户写一句评论后加入聊天上下文。
- Pin 上下文包含：
  - comment
  - sourceUrl
  - selector / tag / text / rect / styles
  - viewport-relative position
- 发送聊天时复用 `[Browser Context]`，新增“页面批注”段。

### 非目标

- 本轮不做 pin 持久化。
- 不做跨页面 pin 恢复。
- 不做网页截图和视觉模型。
- 不做多人协作 comment thread。

这保持第一刀足够小：先把“页面上的一句话批注”变成 agent 可消费的证据。


## Context Governance MVP

> 2026-05-10 11:55 +0800 | 状态：实施中

Pin / Element / Page Snapshot 都进入同一个 `BrowserContextItem[]` 后，必须先做最小治理，避免 Browser 从“有用上下文”变成“上下文污染”。

### 规则

1. **优先级**
   - `pin` 最高：保留用户判断和具体位置。
   - `element` 次之：保留精确 DOM 选择。
   - `page-snapshot` 最低：保留页面地图，但可被同 URL 新快照替换。

2. **去重**
   - `page-snapshot`：同一个 canonical URL 只保留最新一份。
   - `element`：同 URL + selector 只保留最新一份。
   - `pin`：同 URL + selector + comment 只保留最新一份。

3. **预算**
   - 总 item 上限仍是 8。
   - 显示粗略字符预算，帮助用户知道当前 Browser Context 是 light / medium / heavy。
   - prompt 构造前统一调用治理函数，确保运行时和 UI 使用同一套规则。

4. **UI 提示**
   - Chips 行展示：`Browser Context · N 项 · ~X chars · light/medium/heavy`。
   - Chip icon 区分 pin / snapshot / element。

### 非目标

- 本轮不做 token 精准估算。
- 不做 AI 总结压缩。
- 不做跨 session 持久化。

这一步先把上下文入口收住，后面再做真正的压缩档位。


## Pin Jump / Review List MVP

> 2026-05-10 11:55 +0800 | 状态：实施中

Page pin 已经能把“位置 + 评论 + DOM 证据”加入上下文，但当前缺口是：加入后只在 Composer chips 里可见，Browser 面板里没有 pin 列表，也不能回跳定位。

### 目标

1. Browser 面板展示本次页面会话中的 pin 列表。
2. 点击列表里的 pin 可以让 webview 滚动到对应 selector，并短暂高亮。
3. Marker 需要和 pin 绑定稳定 id，避免只显示编号但无法定位。

### MVP 边界

- 只做当前 webview 注入脚本内存态，不跨页面持久化。
- 不做跨 session pin 数据库。
- 不要求 Composer chip 反向驱动 Browser 面板；本轮先保证 Browser 面板内部可回跳。
- selector 找不到时返回失败，UI 展示轻量错误。

### 实现点

- `BrowserPagePin` 增加 `pinId` / `markerNumber`。
- 注入脚本维护 `pinId -> marker/selector`。
- 暴露 `focusPin(pinId)` 和 `listPins()`。
- `BrowserPreviewPanel` 维护 `pagePins`，提交批注后追加到面板列表。
- 列表点击触发 `focusPin`，并更新状态栏。


## Browser Review Queue MVP

> 2026-05-10 | 状态：实施中

页面 pin 解决了“指出一个点”，Review Queue 解决“把多个点组织成一个可执行页面修复任务”。

### 目标

1. Browser 面板把当前页面会话里的多个 pin 组织成 Review Queue。
2. 用户可以一键把 queue 作为 `review-queue` Browser Context 加入聊天上下文。
3. 发送给 agent 的 prompt 不是散落 pin，而是一组有编号的页面 review issue。

### MVP 行为

- 每次提交 pin 后，pin 自动进入当前 Browser 面板的 queue。
- 面板显示 queue 数量和一键加入上下文按钮。
- `review-queue` context item 包含：
  - title
  - sourceUrl
  - pins[]
  - summary
- prompt 输出为“页面 Review 队列”，按编号列出 comment、selector、位置、文本。

### 非目标

- 本轮不做跨 session 持久化。
- 不做 issue 状态机（open/resolved）。
- 不做复杂编辑/重排。
- 不引入新的 agent runtime 协议，仍复用 Browser Context。

这一步的价值是把 Browser 从“若干上下文 chip”推进到“页面 review 任务生成器”。
