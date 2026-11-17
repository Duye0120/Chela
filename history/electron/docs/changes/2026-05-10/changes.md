

## Browser Workspace 改进计划

- 时间：2026-05-10 11:55 +0800
- 改了什么：新增 `docs/browser-workspace-improvement.md`，梳理 Codex App / Cursor browser 体验，并确定 Chela 第一刀先做“页面快照上下文”。
- 为什么改：现有 Browser 只能点 DOM 元素进上下文，体验像 DOM picker，不像可协作的 Browser Workspace。
- 涉及文件：`docs/browser-workspace-improvement.md`
- 结果：进入 MVP 实现阶段，优先补页面 title/url/headings/text/interactives snapshot。


## Browser Workspace 页面快照 MVP

- 时间：2026-05-10 11:55 +0800
- 改了什么：Browser 面板从“浏览器选择”升级为“浏览器工作区”，新增“抓页面”动作，把当前页面 title/url/description/viewport/headings/visible text/interactives 抽成 `page-snapshot` 上下文。
- 为什么改：对齐 Codex App / Cursor 的 browser 体验方向，让 agent 能拿到页面整体状态，而不是只能靠用户点 DOM 元素。
- 涉及文件：`src/shared/contracts.ts`、`src/shared/browser-context.ts`、`src/renderer/src/lib/browser-interview.ts`、`src/renderer/src/lib/browser-inspector-script.ts`、`src/renderer/src/components/browser-preview/BrowserPreviewPanel.tsx`、`tests/browser-interview-regression.test.ts`。
- 结果：Browser context 现在同时支持 element 与 page snapshot 两类上下文，发送聊天时会注入页面摘要和关键可交互元素。

- Browser Workspace 新增页面 Pin / Comment MVP：
  - 新增 `BrowserPagePin` / `kind: "pin"` 上下文类型。
  - 注入脚本支持 pin mode，点击页面元素后留下编号 marker 并把 selector、rect、styles、viewport 交给 Chela UI。
  - Browser 面板新增 `Pin` 按钮和批注输入条，提交后进入 `[Browser Context]` 的“页面批注”段。
  - `tests/browser-interview-regression.test.ts` 覆盖 pin context item、prompt 和位置/viewport 输出。

- Browser Context 新增治理 MVP：
  - `compactBrowserContextItems()` 统一处理 pin / element / page-snapshot 的去重、优先级和 8 项上限。
  - 优先级为 pin > element > page-snapshot；同 URL snapshot 自动替换旧快照。
  - Composer chips 展示粗略预算：item 数、估算字符数、light/medium/heavy。
  - Browser context chip icon 区分 pin / page snapshot / DOM element。
  - 回归测试覆盖去重、优先级、预算摘要和 `getBrowserContextItems()` 治理输出。

- Browser Pin Jump / Review List MVP：
  - `BrowserPagePin` 增加 `pinId` / `markerNumber`。
  - 注入脚本给 pin marker 绑定稳定 id，并暴露 `focusPin(pinId)` / `listPins()`。
  - Browser 面板新增 Pins 横向列表，点击 pin 可滚动回对应 selector 并高亮 marker。
  - selector 失效时展示轻量错误，不影响已有 pin 上下文发送。
  - 回归测试补充 pin id / marker number 断言。

## Browser Workspace 收口验收

- 时间：2026-05-10
- 改了什么：新增 `docs/browser-workspace-acceptance.md`，把页面快照、Pin/Comment、Context Governance、Pin Jump 四个 MVP 收口为自动回归 + 手动产品验收清单。
- 为什么改：Browser Workspace 今日改动较集中，继续 Review Queue 前需要先确认主链路可演示、可回归。
- 顺手修复：注入脚本把 `pins` 和 `pendingPins` 分开，避免 `consumePin()` 把 pin 从 `focusPin()` 所需的定位列表中移走；Browser 面板增加 pin 回跳失败的轻量错误展示。
- 验证：`pnpm exec tsx tests/browser-interview-regression.test.ts` 通过；browser 相关文件 filtered typecheck 无输出。

## Browser Review Queue MVP

- 时间：2026-05-10
- 改了什么：新增 `BrowserReviewQueue` / `review-queue` Browser Context 类型，Browser 面板可把当前页面多个 pin 组成 Review Queue，并一键加入聊天上下文。
- 为什么改：把“单点批注”升级成“页面 review 任务”，Agent 收到的是一组有编号的页面问题，而不是散落 chip。
- 核心文件：`src/shared/contracts.ts`、`src/shared/browser-context.ts`、`src/renderer/src/lib/browser-interview.ts`、`src/renderer/src/components/browser-preview/BrowserPreviewPanel.tsx`、`tests/browser-interview-regression.test.ts`。
- 验证：`pnpm exec tsx tests/browser-interview-regression.test.ts` 通过；browser 相关文件 filtered typecheck 无输出。
