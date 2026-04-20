# 2026-04-20 变更记录

## 启动时恢复默认展开侧边栏

**时间**: 09:46

### 改了什么

1. 调整 [`src/renderer/src/App.tsx`](D:/a_github/first_pi_agent/src/renderer/src/App.tsx) 的侧栏初始化逻辑，启动时默认使用展开态。
2. 移除侧栏收起状态的跨刷新 / 跨重启持久化，只保留侧栏宽度持久化。
3. 在启动阶段清理旧的 `chela.sidebar-collapsed` 本地存储键，避免历史收起状态继续把侧栏锁住。

### 为什么改

- 当前问题是侧栏一旦被收起，刷新或重新进入后仍沿用旧的收起标记，用户进入后直接看不到左侧栏。
- 侧栏宽度保留有价值，收起态跨启动持久化会直接影响可发现性，这里更适合回到默认展开。

### 涉及文件

- `src/renderer/src/App.tsx`
- `docs/changes/2026-04-20/changes.md`

### 结果

- 刷新和重新进入时，左侧侧边栏会直接显示。
- 当前运行期内仍然可以手动收起 / 展开侧栏。

## 侧边栏底部入口恢复固定

**时间**: 09:49

### 改了什么

1. 调整 [`src/renderer/src/components/assistant-ui/sidebar.tsx`](D:/a_github/first_pi_agent/src/renderer/src/components/assistant-ui/sidebar.tsx) 的 threads 布局，把 `已归档聊天` 和 `设置` 从滚动区移回底部固定区。
2. 上方项目区和聊天区继续放在 `flex-1` 的滚动容器里，底部入口单独放在滚动容器外。

### 为什么改

- 这两个入口原来就是侧边栏底部固定能力，当前实现把它们并进了内容流，视觉位置被内容高度推着走。
- 侧边栏主内容负责滚动，底部全局入口保持固定更符合原来的使用习惯。

### 涉及文件

- `src/renderer/src/components/assistant-ui/sidebar.tsx`
- `docs/changes/2026-04-20/changes.md`

### 结果

- `已归档聊天` 和 `设置` 重新固定在左侧栏底部。
- 上面的项目和聊天列表继续独立滚动，不会再把底部入口一起带上去。

## 侧边栏 item 视觉回到旧实现语气

**时间**: 09:53

### 改了什么

1. 调整 [`src/renderer/src/components/assistant-ui/sidebar.tsx`](D:/a_github/first_pi_agent/src/renderer/src/components/assistant-ui/sidebar.tsx) 的会话 item 结构，恢复旧侧边栏的左侧 pin 占位、正文两列布局和右侧时间/归档区位置关系。
2. 会话标题颜色、active 状态底色和 hover 反馈改回旧 item 的层级语气，继续保留这轮重构后的项目树和 item 级交互。
3. 项目 item 同步切回 `chela-list-item` 体系，和会话 item、底部入口保持同一套节奏。

### 为什么改

- 当前 item 的视觉结构和旧侧边栏断层明显，用户已经明确指出看起来不像原来的 item。
- 这轮目标是保留新信息结构，同时把单个 item 的视觉语气拉回旧实现。

### 涉及文件

- `src/renderer/src/components/assistant-ui/sidebar.tsx`
- `docs/changes/2026-04-20/changes.md`

### 结果

- 侧边栏 item 的节奏、层级和旧实现重新接近。
- 当前结构继续保留，item 本身回到更像原来那套视觉语言。

## 默认会话标题改成“新的聊天”

**时间**: 09:55

### 改了什么

1. 调整 [`src/renderer/src/lib/session.ts`](D:/a_github/first_pi_agent/src/renderer/src/lib/session.ts) 的默认标题生成逻辑。
2. 调整 [`src/main/session/transcript-writer.ts`](D:/a_github/first_pi_agent/src/main/session/transcript-writer.ts) 的默认标题生成逻辑。
3. 调整 [`src/shared/contracts.ts`](D:/a_github/first_pi_agent/src/shared/contracts.ts) 里的默认 session 标题初始值。

### 为什么改

- 当前默认文案显示为“新的工作线程”，和你要的“新的聊天”不一致。
- 这类标题有多条入口，统一改名可以避免创建时、流式落盘时和默认数据回退时出现不一致。

### 涉及文件

- `src/renderer/src/lib/session.ts`
- `src/main/session/transcript-writer.ts`
- `src/shared/contracts.ts`
- `docs/changes/2026-04-20/changes.md`

### 结果

- 新建会话的默认标题统一显示为“新的聊天”。
- 前后端默认标题来源保持一致。

## 项目项补回新建聊天入口

**时间**: 10:00

### 改了什么

1. 调整 [`src/renderer/src/components/assistant-ui/sidebar.tsx`](D:/a_github/first_pi_agent/src/renderer/src/components/assistant-ui/sidebar.tsx) 的项目 item，在右侧补上显式的新建聊天按钮。
2. 点击项目 item 右侧按钮后，直接调用现有 `onCreateProjectSession(group.id)`，把新聊天挂到当前项目下。

### 为什么改

- 当前项目区虽然能展示项目下的聊天，也支持右键菜单里的 `新建聊天`，但缺少直接可见的点击入口，项目区主路径不完整。
- 项目 item 本身就应该承载项目内新增聊天的主操作，用户不需要先切到底部聊天区。

### 涉及文件

- `src/renderer/src/components/assistant-ui/sidebar.tsx`
- `docs/changes/2026-04-20/changes.md`

### 结果

- 项目区现在可以直接新建该项目下的聊天。
- 项目结构和会话挂载逻辑保持不变，只补回缺失入口。

## 收敛侧边栏重复“新建”文案

**时间**: 10:03

### 改了什么

1. 调整 [`src/renderer/src/components/assistant-ui/sidebar.tsx`](D:/a_github/first_pi_agent/src/renderer/src/components/assistant-ui/sidebar.tsx) 的侧边栏入口层级，保留顶部 `新建聊天` 作为唯一文字主入口。
2. 项目分区右侧的 `新建项目` 改成图标按钮。
3. 项目 item 右侧的新建聊天入口改成 hover 才出现的图标按钮。
4. 聊天分区标题右侧的 `新建聊天` 文字入口移除，避免和顶部主入口重复。

### 为什么改

- 当前侧边栏里同时出现多处“新建聊天 / 新建项目 / 图标新增”，用户需要先判断每个入口的作用域，信息负担偏高。
- 主入口保留文字，次级入口降级为图标或 hover 态，层级会更清楚。

### 涉及文件

- `src/renderer/src/components/assistant-ui/sidebar.tsx`
- `docs/changes/2026-04-20/changes.md`

### 结果

- 顶部 `新建聊天` 继续作为最清晰的主入口。
- 项目区和聊天区的重复“新建”文案明显减少，作用域区分更直接。

## 归档入口移入设置并按来源归类

**时间**: 10:22

### 改了什么

1. 调整 [`src/renderer/src/App.tsx`](D:/a_github/first_pi_agent/src/renderer/src/App.tsx)，把设置路由 section 集合补上 `archived`，空态里的 `查看已归档` 直接跳到这个 section，并把 `groups` 传给设置页归档内容。
2. 调整 [`src/renderer/src/components/assistant-ui/sidebar.tsx`](D:/a_github/first_pi_agent/src/renderer/src/components/assistant-ui/sidebar.tsx)，侧边栏底部只保留设置入口，设置页左侧列表承接 `已归档会话`，同时清掉线程列表里遗留的归档分支判断。
3. 调整 [`src/renderer/src/components/assistant-ui/settings-view.tsx`](D:/a_github/first_pi_agent/src/renderer/src/components/assistant-ui/settings-view.tsx)、[`src/renderer/src/components/assistant-ui/settings/archived-section.tsx`](D:/a_github/first_pi_agent/src/renderer/src/components/assistant-ui/settings/archived-section.tsx)、[`src/renderer/src/components/assistant-ui/settings/system-section.tsx`](D:/a_github/first_pi_agent/src/renderer/src/components/assistant-ui/settings/system-section.tsx)，让归档内容独立成设置页 section，并按“项目会话 / 未归属聊天 / 项目待识别”归类展示。

### 为什么改

- 归档会话属于历史内容检索能力，放进设置左侧列表后，主侧边栏可以继续聚焦当前聊天和项目。
- 归档列表按来源归类后，用户先看归属，再看标题，定位路径更直接，心智负担更低。

### 涉及文件

- `src/renderer/src/App.tsx`
- `src/renderer/src/components/assistant-ui/sidebar.tsx`
- `src/renderer/src/components/assistant-ui/settings-view.tsx`
- `src/renderer/src/components/assistant-ui/settings/archived-section.tsx`
- `src/renderer/src/components/assistant-ui/settings/system-section.tsx`
- `src/renderer/src/components/assistant-ui/settings/types.ts`
- `src/renderer/src/components/assistant-ui/settings/constants.ts`
- `docs/changes/2026-04-20/changes.md`

### 结果

- 归档会话现在作为设置里的独立入口出现，主侧边栏不再承担归档浏览。
- 右侧归档列表按来源分类展示，普通聊天和项目会话有清晰区分。

## 设置页升级为“项目与规则”联动页

**时间**: 10:37

### 改了什么

1. 调整 [`src/renderer/src/components/assistant-ui/settings/workspace-section.tsx`](D:/a_github/first_pi_agent/src/renderer/src/components/assistant-ui/settings/workspace-section.tsx)，把原来的单一工作区卡片升级成“项目列表 + 当前项目详情”结构。
2. 调整 [`src/renderer/src/App.tsx`](D:/a_github/first_pi_agent/src/renderer/src/App.tsx)、[`src/renderer/src/components/assistant-ui/settings-view.tsx`](D:/a_github/first_pi_agent/src/renderer/src/components/assistant-ui/settings-view.tsx)、[`src/renderer/src/components/assistant-ui/settings/types.ts`](D:/a_github/first_pi_agent/src/renderer/src/components/assistant-ui/settings/types.ts)，把项目列表、聊天摘要和设置页内项目选择动作接到设置页。
3. 调整 [`src/renderer/src/components/assistant-ui/settings/constants.ts`](D:/a_github/first_pi_agent/src/renderer/src/components/assistant-ui/settings/constants.ts) 和 [`src/renderer/src/components/assistant-ui/sidebar.tsx`](D:/a_github/first_pi_agent/src/renderer/src/components/assistant-ui/sidebar.tsx)，把设置侧栏里的 `工作区` 文案升级成 `项目与规则`。

### 为什么改

- 外部左侧已经有项目区时，设置页继续只展示单一工作区会丢掉多项目上下文。
- 设置页补上项目列表后，用户可以在设置里直接切项目，再看这个项目的规则文件、路径和聊天状态，内外结构会统一很多。

### 涉及文件

- `src/renderer/src/components/assistant-ui/settings/workspace-section.tsx`
- `src/renderer/src/App.tsx`
- `src/renderer/src/components/assistant-ui/settings-view.tsx`
- `src/renderer/src/components/assistant-ui/settings/types.ts`
- `src/renderer/src/components/assistant-ui/settings/constants.ts`
- `src/renderer/src/components/assistant-ui/sidebar.tsx`
- `docs/changes/2026-04-20/changes.md`

### 结果

- 设置里的 `项目与规则` 现在会展示全部已保存项目。
- 点设置页里的项目后，会同步当前 workspace，右侧详情会跟着切到对应项目。
- 项目详情里可以直接看到项目路径、规则文件状态、活跃聊天数和归档数。

## 去掉“项目与规则”页重复标题

**时间**: 10:39

### 改了什么

1. 调整 [`src/renderer/src/components/assistant-ui/settings/workspace-section.tsx`](D:/a_github/first_pi_agent/src/renderer/src/components/assistant-ui/settings/workspace-section.tsx)，移除内层 `SettingsCard` 的 `title` 和 `description`。

### 为什么改

- 设置页外层已经有 section 标题和说明，内容卡片里再重复一遍，会形成连续两层同名头部，信息重复很明显。

### 涉及文件

- `src/renderer/src/components/assistant-ui/settings/workspace-section.tsx`
- `docs/changes/2026-04-20/changes.md`

### 结果

- `项目与规则` 页面现在只保留外层标题。
- 右侧内容直接进入项目列表和详情，信息层级更干净。

## 拉开“项目与规则”详情区横向布局

**时间**: 10:46

### 改了什么

1. 调整 [`src/renderer/src/components/assistant-ui/settings/workspace-section.tsx`](D:/a_github/first_pi_agent/src/renderer/src/components/assistant-ui/settings/workspace-section.tsx) 的详情区布局，把原来的“左内容 + 右按钮列”改成“顶部信息栏 + 下方全宽内容区”。
2. `打开目录`、`复制路径` 和 `更换默认目录` 继续保留在详情卡右上角，路径卡片和统计卡改成横向吃满详情宽度。

### 为什么改

- 原布局把操作按钮单独占成一列，导致下面的路径和统计只堆在左侧，右边留白很大，信息利用率偏低。

### 涉及文件

- `src/renderer/src/components/assistant-ui/settings/workspace-section.tsx`
- `docs/changes/2026-04-20/changes.md`

### 结果

- 详情区正文现在会更均匀地铺开。
- 操作按钮仍然在右上角，路径和统计卡片开始真正使用右侧宽度。

## 续写引导条改成单行排队样式

**时间**: 14:50

### 改了什么

1. 调整 [`src/renderer/src/components/assistant-ui/thread.tsx`](D:/a_github/first_pi_agent/src/renderer/src/components/assistant-ui/thread.tsx) 的输入框回车逻辑，运行中按 `Enter` 时直接读取当前输入框内容，写入待引导草稿，并在成功后清空输入框。
2. 调整同文件里的 `RedirectDraftCard`，把原来的大卡片收成单行横条，结构对齐为“左侧图标 + 中间文本 + 右侧轻量操作”。
3. 收窄运行中操作区，继续保留右侧 `停止` 主动作，引导草稿只在回车排队后通过上方横条展示。

### 为什么改

- 当前实现里回车拦截读错了 composer 状态，运行中输入内容后无法正确进入待引导草稿。
- 这条引导提示需要和现有线程区视觉语言保持一致，同时向 Codex 那种更轻、更细的单行条靠拢，减少大卡片带来的打断感。

### 涉及文件

- `src/renderer/src/components/assistant-ui/thread.tsx`
- `docs/changes/2026-04-20/changes.md`

### 结果

- 运行中输入内容按回车后，会先进入待引导队列，再在输入区上方显示单行引导条。
- 引导条的视觉占位更轻，和当前 composer 的整体节奏更接近。

## 引导与下一条消息队列分流

**时间**: 15:18

### 改了什么

1. 调整 [`src/shared/contracts.ts`](D:/a_github/first_pi_agent/src/shared/contracts.ts)、[`src/preload/index.ts`](D:/a_github/first_pi_agent/src/preload/index.ts)、[`src/shared/ipc.ts`](D:/a_github/first_pi_agent/src/shared/ipc.ts)，把旧的单条 `pendingRedirectDraft` 接口升级成 `queuedMessages` 队列模型，并拆出 `enqueueQueuedMessage`、`triggerRedirectMessage`、`removeQueuedMessage` 三个 chat API。
2. 调整 [`src/main/session/meta.ts`](D:/a_github/first_pi_agent/src/main/session/meta.ts)、[`src/main/session/service.ts`](D:/a_github/first_pi_agent/src/main/session/service.ts)、[`src/main/session/facade.ts`](D:/a_github/first_pi_agent/src/main/session/facade.ts)，把会话持久化改成 FIFO 队列，并兼容把历史 `pendingRedirectDraft` 自动迁移成一条队列消息。
3. 调整 [`src/main/chat/service.ts`](D:/a_github/first_pi_agent/src/main/chat/service.ts) 和 [`src/main/ipc/chat.ts`](D:/a_github/first_pi_agent/src/main/ipc/chat.ts)，把“普通排队消息”和“引导抢占消息”拆成两条链路：
   - 回车进入队尾，当前 run 结束后自动续发
   - 点击 `引导` 时，先取消当前 run，再优先发送这条消息
4. 调整 [`src/renderer/src/components/AssistantThreadPanel.tsx`](D:/a_github/first_pi_agent/src/renderer/src/components/AssistantThreadPanel.tsx) 和 [`src/renderer/src/components/assistant-ui/thread.tsx`](D:/a_github/first_pi_agent/src/renderer/src/components/assistant-ui/thread.tsx)，让输入框回车只负责排队，顶部横条展示队首内容和剩余数量，`引导` / 删除按钮分别接到新的行为接口。

### 为什么改

- 当前实现把“下一条普通消息”和“引导当前轮”混在一套单条草稿语义里，导致停止后不续发、点击引导不生效这两类问题一起出现。
- 把排队和引导拆开以后，用户的回车、停止、引导三种动作会形成稳定且可预期的行为。

### 涉及文件

- `src/shared/contracts.ts`
- `src/preload/index.ts`
- `src/shared/ipc.ts`
- `src/main/session/meta.ts`
- `src/main/session/service.ts`
- `src/main/session/facade.ts`
- `src/main/chat/service.ts`
- `src/main/ipc/chat.ts`
- `src/renderer/src/components/AssistantThreadPanel.tsx`
- `src/renderer/src/components/assistant-ui/thread.tsx`
- `docs/changes/2026-04-20/changes.md`

### 结果

- 当前 run 进行中按回车时，输入内容会进入“下一条消息”队列。
- 当前 run 自然结束、失败或取消后，队列会继续按 FIFO 发送。
- 点击横条上的 `引导` 后，会抢占当前 run，并优先发送该条消息。

## 收敛中断恢复信息暴露与底部状态条

**时间**: 15:34

### 改了什么

1. 调整 [`src/renderer/src/components/assistant-ui/approval-notice-bar.tsx`](D:/a_github/first_pi_agent/src/renderer/src/components/assistant-ui/approval-notice-bar.tsx)，去掉中断审批条里的“填入输入框”和审批详情展开，只保留用户可理解的摘要、`继续处理` 和 `关闭`。
2. 调整 [`src/renderer/src/components/assistant-ui/thread.tsx`](D:/a_github/first_pi_agent/src/renderer/src/components/assistant-ui/thread.tsx)，`继续处理` 不再把内部恢复 prompt 填进输入框，改成发送一条简洁的“继续处理刚才中断的任务。”消息。
3. 调整 [`src/shared/contracts.ts`](D:/a_github/first_pi_agent/src/shared/contracts.ts) 和 [`src/main/harness/approvals.ts`](D:/a_github/first_pi_agent/src/main/harness/approvals.ts)，停止把 `recoveryPrompt` 下发到 renderer。
4. 同时收窄 composer 底部状态条，移除最近 usage / 累计 usage 那几组数字 chip，只保留必要入口和 context 圆环。

### 为什么改

- 中断审批恢复 prompt 属于 agent 内部恢复材料，直接暴露给用户会增加噪音，也会让输入框和消息区出现不该出现的内部文本。
- 底部状态条同时展示运行状态、最近输入输出和累计 tokens，信息密度偏高，已经开始抢占主要聊天区注意力。

### 涉及文件

- `src/renderer/src/components/assistant-ui/approval-notice-bar.tsx`
- `src/renderer/src/components/assistant-ui/thread.tsx`
- `src/shared/contracts.ts`
- `src/main/harness/approvals.ts`
- `docs/changes/2026-04-20/changes.md`

### 结果

- 用户侧不再看到内部恢复 prompt 和审批技术细节。
- 中断后继续处理的入口更短、更接近业务动作。
- 底部状态条更轻，聊天主区域的视觉负担更小。

## 恢复工作区规则文件里的 CLAUDE.md

**时间**: 15:41

### 改了什么

1. 调整 [`src/main/soul.ts`](D:/a_github/first_pi_agent/src/main/soul.ts)，把 `CLAUDE.md` 的扫描和 prompt 拼装补回去，同时兼容项目根目录和 `.pi` 目录两种读取位置。
2. 调整 [`src/shared/contracts.ts`](D:/a_github/first_pi_agent/src/shared/contracts.ts)，给 `SoulFilesStatus` 重新补上 `claude` 字段。
3. 调整 [`src/renderer/src/components/assistant-ui/settings/workspace-section.tsx`](D:/a_github/first_pi_agent/src/renderer/src/components/assistant-ui/settings/workspace-section.tsx)，把工作区规则文件卡片补回 `CLAUDE.md`，加载计数改回动态值，并把布局维持在垂直优先的 `1 列 / 大屏 2 列`。

### 为什么改

- 设置页工作区的规则文件列表当前只剩 `SOUL.md / USER.md / AGENTS.md`，之前确认过要纳入的 `CLAUDE.md` 被回退掉了。
- 运行时 workspace policy 也应该继续把根目录或 `.pi` 目录下的 `CLAUDE.md` 一起纳入。

### 涉及文件

- `src/main/soul.ts`
- `src/shared/contracts.ts`
- `src/renderer/src/components/assistant-ui/settings/workspace-section.tsx`
- `docs/changes/2026-04-20/changes.md`

### 结果

- 设置里的工作区规则文件会重新显示 `CLAUDE.md`。
- 根目录和 `.pi` 目录里的规则文件都能被正确识别。

## 让项目说明文案占满详情整行

**时间**: 10:48

### 改了什么

1. 调整 [`src/renderer/src/components/assistant-ui/settings/workspace-section.tsx`](D:/a_github/first_pi_agent/src/renderer/src/components/assistant-ui/settings/workspace-section.tsx)，把项目说明文案从标题区左侧容器里移到标题区下方，单独占一整行。

### 为什么改

- 说明文案挂在标题左侧容器里时，宽度会被头部信息块限制，视觉上像一块窄条，右边留下大段空白。

### 涉及文件

- `src/renderer/src/components/assistant-ui/settings/workspace-section.tsx`
- `docs/changes/2026-04-20/changes.md`

### 结果

- 说明文案现在会直接占满详情区宽度。
- 标题、操作按钮和正文的层级更清楚。

## 规则文件集合补入 CLAUDE.md

**时间**: 10:55

### 改了什么

1. 调整 [`src/main/soul.ts`](D:/a_github/first_pi_agent/src/main/soul.ts)，规则文件扫描和 prompt 组装补入 `CLAUDE.md`，同时兼容项目根目录和 `.pi` 目录两种读取位置。
2. 调整 [`src/shared/contracts.ts`](D:/a_github/first_pi_agent/src/shared/contracts.ts)，给 `SoulFilesStatus` 增加 `claude` 状态。
3. 调整 [`src/renderer/src/components/assistant-ui/settings/workspace-section.tsx`](D:/a_github/first_pi_agent/src/renderer/src/components/assistant-ui/settings/workspace-section.tsx)，规则文件卡片补入 `CLAUDE.md`，计数改成动态值，四个规则文件按四列展示。

### 为什么改

- 当前仓库已有根目录 `CLAUDE.md`，规则文件状态和运行时 workspace policy 都应该把它纳入。
- 原实现只写死了 `SOUL.md / USER.md / AGENTS.md` 三项，既看不到 `CLAUDE.md`，也吃不到它的内容。

### 涉及文件

- `src/main/soul.ts`
- `src/shared/contracts.ts`
- `src/renderer/src/components/assistant-ui/settings/workspace-section.tsx`
- `docs/changes/2026-04-20/changes.md`

### 结果

- `CLAUDE.md` 现在会出现在项目规则文件状态里。
- 运行时 workspace policy 也会把 `CLAUDE.md` 内容一并纳入。
- 规则文件计数不再写死 `3`，后续继续扩展会更稳。

## 规则文件卡片改成垂直优先排布

**时间**: 11:21

### 改了什么

1. 调整 [`src/renderer/src/components/assistant-ui/settings/workspace-section.tsx`](D:/a_github/first_pi_agent/src/renderer/src/components/assistant-ui/settings/workspace-section.tsx)，把规则文件卡片网格从更激进的多列改成 `1 列 / 大屏 2 列`。

### 为什么改

- 四个规则文件卡片在当前详情宽度下被硬塞成并排布局，标题和正文都被压得太窄，既没有滚动，也没有真正走垂直展开。

### 涉及文件

- `src/renderer/src/components/assistant-ui/settings/workspace-section.tsx`
- `docs/changes/2026-04-20/changes.md`

### 结果

- 规则文件卡片现在会优先纵向展开。
- 文本宽度更充足，卡片不再挤成一排小块。

## 项目 item 补回直接重命名入口

**时间**: 13:47

### 改了什么

1. 调整 [`src/renderer/src/components/assistant-ui/sidebar.tsx`](D:/a_github/first_pi_agent/src/renderer/src/components/assistant-ui/sidebar.tsx)，给项目 item 的 hover 操作区补上直接的重命名按钮。
2. 项目标题区域补上双击重命名，和显式按钮走同一条 `onRenameProject(group.id)` 链路。

### 为什么改

- 当前项目重命名只挂在右键菜单里，主路径不明显，用户会直接感知为“项目没法重命名”。

### 涉及文件

- `src/renderer/src/components/assistant-ui/sidebar.tsx`
- `docs/changes/2026-04-20/changes.md`

### 结果

- 项目 item 现在 hover 时可以直接点重命名。
- 双击项目名也可以进入重命名，右键菜单入口继续保留。

## 项目右键重命名改成内联编辑

**时间**: 13:49

### 改了什么

1. 调整 [`src/renderer/src/components/assistant-ui/sidebar.tsx`](D:/a_github/first_pi_agent/src/renderer/src/components/assistant-ui/sidebar.tsx)，项目右键菜单、hover 重命名按钮和双击项目名都会进入同一套内联编辑态。
2. 调整 [`src/renderer/src/App.tsx`](D:/a_github/first_pi_agent/src/renderer/src/App.tsx)，`renameProject` 支持直接接收新名称，给侧边栏内联提交复用。

### 为什么改

- 当前项目重命名的触发点已经补出来了，实际提交仍然依赖 `window.prompt`，右键菜单点击后体感上会像“没反应”。
- 改成侧边栏内联编辑后，交互路径更直接，也绕开了弹窗链路。

### 涉及文件

- `src/renderer/src/components/assistant-ui/sidebar.tsx`
- `src/renderer/src/App.tsx`
- `docs/changes/2026-04-20/changes.md`

### 结果

- 右键点“重命名项目”会直接把项目名切进编辑态。
- hover 重命名按钮和双击项目名也会走同一套编辑逻辑。

## 项目编辑态改成独立输入框节点

**时间**: 13:51

### 改了什么

1. 调整 [`src/renderer/src/components/assistant-ui/sidebar.tsx`](D:/a_github/first_pi_agent/src/renderer/src/components/assistant-ui/sidebar.tsx)，项目标题区从“按钮内嵌 input”改成“展示态按钮 / 编辑态输入框”两种节点切换。

### 为什么改

- 输入框放在按钮节点里时，右键重命名进入编辑态会被按钮结构干扰，视觉上容易表现成“完全没反应”。

### 涉及文件

- `src/renderer/src/components/assistant-ui/sidebar.tsx`
- `docs/changes/2026-04-20/changes.md`

### 结果

- 项目 title 在编辑态会真正切成输入框。
- 右键菜单、hover 重命名按钮和双击项目名都会落到同一个稳定的编辑节点。

## 项目和聊天统一改成标题原地编辑

**时间**: 13:56

### 改了什么

1. 调整 [`src/renderer/src/components/assistant-ui/sidebar.tsx`](D:/a_github/first_pi_agent/src/renderer/src/components/assistant-ui/sidebar.tsx)，项目项和聊天项都补上原地编辑状态。
2. 右键菜单里的 `重命名项目` / `重命名聊天` 现在都会把对应 title 直接切成输入框；hover 编辑按钮和双击标题也共用同一套链路。
3. 调整 [`src/renderer/src/App.tsx`](D:/a_github/first_pi_agent/src/renderer/src/App.tsx)，`renameSession` 也支持直接接收新标题，和项目重命名保持一致。

### 为什么改

- 当前用户预期是“点击重命名后，标题区域切成可编辑框”，不是弹 prompt。
- 项目和聊天分别走两套重命名方式会造成明显割裂，这里统一成一套原地编辑更稳。

### 涉及文件

- `src/renderer/src/components/assistant-ui/sidebar.tsx`
- `src/renderer/src/App.tsx`
- `docs/changes/2026-04-20/changes.md`

### 结果

- 右键点重命名后，标题区会直接进入原地编辑。
- 项目项和聊天项的重命名交互现在保持一致。

## 重命名提交改成直接读取输入框当前值

**时间**: 14:00

### 改了什么

1. 调整 [`src/renderer/src/components/assistant-ui/sidebar.tsx`](D:/a_github/first_pi_agent/src/renderer/src/components/assistant-ui/sidebar.tsx)，项目和聊天的 Enter / blur 提交都改成直接读取输入框的 `currentTarget.value`。

### 为什么改

- 原实现提交时优先读 React state，快速输入后直接回车时，状态时序可能拿不到最后一次编辑值，表现就会像“按回车没保存”。

### 涉及文件

- `src/renderer/src/components/assistant-ui/sidebar.tsx`
- `docs/changes/2026-04-20/changes.md`

### 结果

- 回车和失焦提交现在都会拿到输入框里的最新值。
- 项目名和聊天标题保存链路更稳。

## 接入 Chela 本地优先 RAG Memory 系统

**时间**: 15:18

### 改了什么

1. 新增 `src/main/memory/embedding.ts`、`src/main/memory/store.ts`、`src/main/memory/retrieval.ts`、`src/main/memory/rag-service.ts`，落地基于 `worker_threads + @xenova/transformers + better-sqlite3` 的本地语义记忆链路。
2. 新增 `memory:add`、`memory:search`、`memory:get-stats`、`memory:rebuild` IPC，并把 preload / shared contracts / settings 模型一起补齐。
3. 扩展 `src/main/settings.ts` 和 `src/renderer/src/App.tsx`，给设置持久化增加 memory 配置项（embedding 模型、候选窗口）。
4. 调整 `src/main/tools/memory.ts` 与 `src/main/memory/service.ts`，现有 memdir 保存会同步写入 RAG 索引，语义记忆也会进入上下文注入。
5. 在设置页 `系统` 分区新增 `Memory` 管理卡片，提供模型选择、状态统计、重建向量按钮。
6. 更新 `package.json`，声明 `@xenova/transformers`、`better-sqlite3` 和对应类型依赖，并把 `better-sqlite3` 补进 `pnpm.onlyBuiltDependencies`。

### 为什么改

- 这轮目标是把原来的文件化记忆升级成真正可检索的本地语义记忆系统，同时保持 Electron 主线程不被模型推理和 SQLite 同步调用拖慢。
- `better-sqlite3` 依旧是同步 API，所以把存储和 embedding 一并挪进 worker thread，才能满足“主线程不阻塞”的约束。
- 设置页需要最基础的可观测性和手动重建入口，不然模型切换后无法确认索引状态，也不利于后续扩展。

### 涉及文件

- `package.json`
- `src/shared/memory.ts`
- `src/shared/contracts.ts`
- `src/shared/ipc.ts`
- `src/preload/index.ts`
- `src/main/settings.ts`
- `src/main/index.ts`
- `src/main/ipc/memory.ts`
- `src/main/memory/embedding.ts`
- `src/main/memory/store.ts`
- `src/main/memory/retrieval.ts`
- `src/main/memory/rag-service.ts`
- `src/main/memory/service.ts`
- `src/main/tools/memory.ts`
- `src/renderer/src/App.tsx`
- `src/renderer/src/components/assistant-ui/settings-view.tsx`
- `src/renderer/src/components/assistant-ui/settings/system-section.tsx`
- `src/renderer/src/components/assistant-ui/settings/memory-section.tsx`
- `docs/changes/2026-04-20/changes.md`

### 结果

- Chela 现在具备本地优先的向量化记忆存储与语义检索基础链路。
- embedding 推理和 SQLite 读写不再直接占用主进程事件循环。
- 设置页可以看到 Memory 当前模型、索引条目、worker 状态、数据库路径与重建入口。

## 侧边栏重命名参数透传修正

**时间**: 14:03

### 改了什么

1. 调整 [`src/renderer/src/App.tsx`](D:/a_github/first_pi_agent/src/renderer/src/App.tsx)，`Sidebar` 的 `onRenameSession` 和 `onRenameProject` 回调现在会把第二个参数 `nextTitle / nextName` 继续透传给真正的重命名函数。

### 为什么改

- 侧边栏原地编辑已经把新标题传出来了，`App.tsx` 这一层却只接收 `sessionId / groupId`，导致新名称被直接丢掉，保存自然没有生效。

### 涉及文件

- `src/renderer/src/App.tsx`
- `docs/changes/2026-04-20/changes.md`

### 结果

- 原地编辑输入的新名称现在会真正进入保存链路。
- 聊天和项目的重命名都能正确落盘。

## 侧边栏行对齐与稳定占位修正

**时间**: 14:09

### 改了什么

1. 调整 [`src/renderer/src/components/assistant-ui/sidebar.tsx`](D:/a_github/first_pi_agent/src/renderer/src/components/assistant-ui/sidebar.tsx)，项目行和聊天行统一成整行布局：左侧层级槽位、中间标题列、右侧固定信息列。
2. 项目下聊天移除外层额外左边距，缩进改成行内层级占位，选中态背景现在会完整铺满整行宽度。
3. pin、重命名、项目内新建聊天这些 hover 动作改成固定槽位内显隐，只切透明度和可点击状态，不再通过宽度变化挤压标题和相邻 item。

### 为什么改

- 当前侧边栏在项目下聊天这一层存在双重缩进，标题列和选中底色都被压窄，和参考图里的整行对齐差距很明显。
- hover 按钮通过宽度变化出现时会破坏横向对齐，也会制造“侵占其他 dom 位置”的观感问题。

### 涉及文件

- `src/renderer/src/components/assistant-ui/sidebar.tsx`
- `docs/changes/2026-04-20/changes.md`

### 结果

- 项目行、聊天行、项目下聊天现在都按整行宽度对齐。
- 选中项背景会完整展开，右侧时间和操作区位置更稳定。
- hover 出现的图标不会再把标题和相邻布局顶歪。

## 侧边栏文字起始线统一与 hover 编辑入口收口

**时间**: 14:13

### 改了什么

1. 调整 [`src/renderer/src/components/assistant-ui/sidebar.tsx`](D:/a_github/first_pi_agent/src/renderer/src/components/assistant-ui/sidebar.tsx)，`新建聊天`、`项目`、`聊天` 分区标题都对齐到同一条文字起始线。
2. 顶部 `新建聊天` 的图标槽位改成和项目行、聊天行一致的宽度，项目/聊天分区标题也同步补齐左侧留白。
3. 删除 hover 态的编辑按钮；聊天重命名和项目重命名统一只保留右键菜单入口，项目 hover 右侧继续保留“在项目中新增聊天”。

### 为什么改

- 参考图里的主视觉关系是“文字起始线统一”，图标各自放在这条线左侧，侧边栏读起来会更稳。
- hover 编辑入口会让右侧动作区语义变杂，右键重命名已经足够明确。

### 涉及文件

- `src/renderer/src/components/assistant-ui/sidebar.tsx`
- `docs/changes/2026-04-20/changes.md`

### 结果

- `新建聊天`、项目名、聊天列表标题的左边界现在落在同一条线上。
- 悬浮时不再出现编辑图标，重命名统一通过右键菜单进入原地编辑。

## 分区标题改成和列表项共享同一条真实文字基准线

**时间**: 14:16

### 改了什么

1. 调整 [`src/renderer/src/components/assistant-ui/sidebar.tsx`](D:/a_github/first_pi_agent/src/renderer/src/components/assistant-ui/sidebar.tsx)，`项目` 和 `聊天` 分区标题不再使用单纯的 `padding-left` 对齐。
2. 分区标题改成和项目项、聊天项一致的结构：左侧预留一个和列表图标同宽的占位槽，再接标题文字。

### 为什么改

- 上一版对齐是按 padding 估位，语义上已经接近，视觉上仍然容易出现半个字宽的误差。
- 这次直接复用同一套列结构，`项目` 的“项”和 `聊天` 的“聊”会和项目名、聊天标题落在同一条真实基准线上。

### 涉及文件

- `src/renderer/src/components/assistant-ui/sidebar.tsx`
- `docs/changes/2026-04-20/changes.md`

### 结果

- 分区标题和列表项现在共享同一条文字起始线。
- 后续再调图标或间距时，这条对齐关系也会更稳定。

## 分区标题前置占位移除

**时间**: 14:19

### 改了什么

1. 调整 [`src/renderer/src/components/assistant-ui/sidebar.tsx`](D:/a_github/first_pi_agent/src/renderer/src/components/assistant-ui/sidebar.tsx)，移除了 `项目` 和 `聊天` 分区标题前面的 `h-5 w-5 shrink-0` 占位元素。

### 为什么改

- 用户要的是参考图 2 的效果，分区标题本身直接起笔，列表项继续保留自己的图标和内容结构。
- 这一层去掉占位后，标题视觉会更轻，也更接近当前参考图。

### 涉及文件

- `src/renderer/src/components/assistant-ui/sidebar.tsx`
- `docs/changes/2026-04-20/changes.md`

### 结果

- `项目` 和 `聊天` 标题前面不再保留空的图标槽位。
- 项目项和聊天项本身的结构保持不变。

## 项目内聊天前置空白缩进移除

**时间**: 14:21

### 改了什么

1. 调整 [`src/renderer/src/components/assistant-ui/sidebar.tsx`](D:/a_github/first_pi_agent/src/renderer/src/components/assistant-ui/sidebar.tsx)，去掉项目内聊天行最前面的额外缩进占位。

### 为什么改

- 用户给出的参考图里，项目内聊天应该从自己的图标开始，不需要在最左侧再多一段空白。

### 涉及文件

- `src/renderer/src/components/assistant-ui/sidebar.tsx`
- `docs/changes/2026-04-20/changes.md`

### 结果

- 项目内聊天前面那块额外空白已经移除。
- 项目内聊天会从图标起笔，列表更接近参考图。

## 聊天消息新增 run 级文件变更摘要卡片

**时间**: 14:31

### 改了什么

1. 扩展 [`src/shared/contracts.ts`](D:/a_github/first_pi_agent/src/shared/contracts.ts)，新增 `RunChangeSummary` / `RunChangeSummaryFile`，允许 assistant 消息携带“本次改动摘要”元数据。
2. 调整 [`src/main/chat/prepare.ts`](D:/a_github/first_pi_agent/src/main/chat/prepare.ts)、[`src/main/chat/types.ts`](D:/a_github/first_pi_agent/src/main/chat/types.ts)、[`src/main/chat/finalize.ts`](D:/a_github/first_pi_agent/src/main/chat/finalize.ts)，在 run 开始时记录 Git 基线快照，结束时和最新快照做对比，把单次 run 的文件变更摘要写入 assistant 消息。
3. 新增 [`src/main/chat/run-change-summary.ts`](D:/a_github/first_pi_agent/src/main/chat/run-change-summary.ts)，专门负责计算 run 前后文件级增删变化。
4. 调整 [`src/renderer/src/components/AssistantThreadPanel.tsx`](D:/a_github/first_pi_agent/src/renderer/src/components/AssistantThreadPanel.tsx) 和 [`src/renderer/src/components/assistant-ui/thread.tsx`](D:/a_github/first_pi_agent/src/renderer/src/components/assistant-ui/thread.tsx)，在 assistant 消息里渲染可展开的“文件已更改”摘要卡片，展示文件数、总增删和逐文件列表。

### 为什么改

- 用户希望像 Codex 那样，在聊天流里直接看到“这次调整了什么”，而不是再切到右侧 diff 面板自己对照。
- 这类信息更适合作为单次 assistant 结果的一部分保存下来，后续回看聊天也能继续成立。

### 涉及文件

- `src/shared/contracts.ts`
- `src/main/chat/types.ts`
- `src/main/chat/prepare.ts`
- `src/main/chat/finalize.ts`
- `src/main/chat/run-change-summary.ts`
- `src/renderer/src/components/AssistantThreadPanel.tsx`
- `src/renderer/src/components/assistant-ui/thread.tsx`
- `docs/changes/2026-04-20/changes.md`

### 结果

- assistant 完成一次有代码改动的 run 后，聊天消息里会直接出现一张“文件已更改”卡片。
- 卡片会展示这次 run 的文件数、总增删和逐文件变化列表。
- 摘要基于 run 前后 Git 快照对比，表达的是“这一次 assistant 带来的变化”，不是工作区当前全部脏改动的简单平铺。

## 样式入口修正与变更卡实时渲染补齐

**时间**: 14:39

### 改了什么

1. 调整 [`src/renderer/src/styles.css`](D:/a_github/first_pi_agent/src/renderer/src/styles.css)，把 `@import "tailwindcss";` 改成显式的 `theme/preflight/utilities` 三段导入，修复 Vite/PostCSS 将 `tailwindcss` 误判成文件路径导致的 `ENOENT`。
2. 调整 [`src/main/chat/prepare.ts`](D:/a_github/first_pi_agent/src/main/chat/prepare.ts) 和 [`src/main/chat/finalize.ts`](D:/a_github/first_pi_agent/src/main/chat/finalize.ts)，统一使用 [`src/main/git.ts`](D:/a_github/first_pi_agent/src/main/git.ts) 里真实导出的 `getGitDiffSnapshot`。
3. 调整 [`src/shared/agent-events.ts`](D:/a_github/first_pi_agent/src/shared/agent-events.ts)、[`src/main/adapter.ts`](D:/a_github/first_pi_agent/src/main/adapter.ts)、[`src/renderer/src/components/AssistantThreadPanel.tsx`](D:/a_github/first_pi_agent/src/renderer/src/components/AssistantThreadPanel.tsx)，让 `agent_end` 事件直接携带 `runChangeSummary`，当前 run 结束后前端运行时消息就能立刻显示变更卡。

### 为什么改

- 之前那张 overlay 报错来自 Tailwind 入口导入链。
- 变更卡最初只写进了持久化消息，当前线程里看到的是运行时临时消息，所以会出现“已经让它改文件了，但卡片还没看到”的现象。

### 涉及文件

- `src/renderer/src/styles.css`
- `src/shared/agent-events.ts`
- `src/main/adapter.ts`
- `src/main/chat/prepare.ts`
- `src/main/chat/finalize.ts`
- `src/renderer/src/components/AssistantThreadPanel.tsx`
- `docs/changes/2026-04-20/changes.md`

### 结果

- Tailwind/PostCSS 的 `ENOENT` overlay 已被修复。
- 主进程导入错误已消失，dev 构建恢复正常。
- 新一次有文件改动的 run 完成后，当前聊天里会直接出现“文件已更改”卡片，不需要靠刷新或重新进入会话才能看到。

## 新增相对时间格式化工具函数

**时间**: 14:33

### 改了什么

1. 在 `src/renderer/src/lib/utils.ts` 中新增 `formatRelativeTime` 函数。
2. 接受毫秒时间戳或 `Date` 对象，输出"刚刚"、"5分钟前"、"2小时前"、"昨天"、"3天前"或完整日期（超过 7 天）。

### 为什么改

- 聊天列表、项目卡片等场景需要展示会话的相对时间，直接用 ISO 字符串可读性差。
- 提供一个轻量的纯函数，后续任何需要时间展示的组件都可以直接引用，不需要重复造轮子。

### 涉及文件

- `src/renderer/src/lib/utils.ts`
- `docs/changes/2026-04-20/changes.md`

### 结果

- `utils.ts` 现在导出 `cn` 和 `formatRelativeTime` 两个工具函数。
- 后续侧边栏会话列表、归档列表、项目卡片等位置可直接复用。

## 设置页拆分 Memory 与系统页

**时间**: 15:06

### 改了什么

1. 调整 `src/renderer/src/components/assistant-ui/settings/types.ts`、`src/renderer/src/components/assistant-ui/settings/constants.ts`、`src/renderer/src/App.tsx`、`src/renderer/src/components/assistant-ui/sidebar.tsx`，把 `memory` 加入设置 section 类型、路由白名单、设置元信息和侧边栏导航，并新增 `记忆` 入口。
2. 调整 `src/renderer/src/components/assistant-ui/settings-view.tsx`，把 `MemorySection` 作为独立设置页渲染，不再挂在系统页下面。
3. 调整 `src/renderer/src/components/assistant-ui/settings/system-section.tsx`，移除 `MemorySection`、`settings` 和 `onSettingsChange`，只保留日志与关于信息。
4. 调整 `src/main/memory/embedding.ts`、`src/main/memory/store.ts`，修复 memory worker 的严格类型报错，包括 `parentPort` 空值收窄、worker 响应判别和 `better-sqlite3` 数据库类型标注。

### 为什么改

- 当前设置结构把 `Memory` 藏在 `数据与系统` 下面，信息架构不够清晰，用户想单独管理本地语义检索与索引时入口过深。
- 这轮拆分同时顺手修掉 memory 模块里已经暴露出来的 TypeScript 严格模式错误，避免设置页改完后验证卡在主进程类型问题上。

### 涉及文件

- `src/renderer/src/components/assistant-ui/settings/types.ts`
- `src/renderer/src/components/assistant-ui/settings/constants.ts`
- `src/renderer/src/components/assistant-ui/settings-view.tsx`
- `src/renderer/src/components/assistant-ui/settings/system-section.tsx`
- `src/renderer/src/App.tsx`
- `src/renderer/src/components/assistant-ui/sidebar.tsx`
- `src/main/memory/embedding.ts`
- `src/main/memory/store.ts`
- `docs/changes/2026-04-20/changes.md`

### 结果

- 设置侧边栏现在有独立的 `记忆` 页面，`Memory` 不再混在 `数据与系统` 里。
- `数据与系统` 页面只保留日志和说明信息，结构更清楚。
- `src/main/memory/embedding.ts` 和 `src/main/memory/store.ts` 里这轮列出的 TypeScript 报错已清掉。

## 聊天正文改成按事件顺序穿插渲染

**时间**: 15:41

### 改了什么

1. 调整 [`src/shared/contracts.ts`](D:/a_github/first_pi_agent/src/shared/contracts.ts)，给 `AgentStep` 增加 `text` 类型和对应文本字段，让正文也进入 step 序列。
2. 调整 [`src/renderer/src/components/AssistantThreadPanel.tsx`](D:/a_github/first_pi_agent/src/renderer/src/components/AssistantThreadPanel.tsx)，流式收到 `thinking_delta`、`text_delta`、`tool_execution_start` 时会先收口当前执行中的相邻 step，再按真实到达顺序创建 `thinking / text / tool_call` step。
3. 调整同文件里的 assistant parts 构造逻辑，正文改成按 step 顺序输出，`message_end` 只负责补齐尾部缺失文本。
4. 调整 [`src/main/adapter.ts`](D:/a_github/first_pi_agent/src/main/adapter.ts) 和 [`src/renderer/src/hooks/useAgentEvents.ts`](D:/a_github/first_pi_agent/src/renderer/src/hooks/useAgentEvents.ts)，让主进程持久化链路与前端运行时链路保持同一套正文分段语义。

### 为什么改

- 当前实现把正文单独挂在 `finalText` 尾部，每次新增思考或工具步骤时，正文都会被整体移到最后，聊天流缺少“正文和思考/工具穿插”的真实顺序。
- 文本块位置反复后移时，渲染层会把正文当成新块重建，用户看到的体感就是正文从第一个字开始重新刷一遍。

### 涉及文件

- `src/shared/contracts.ts`
- `src/renderer/src/components/AssistantThreadPanel.tsx`
- `src/main/adapter.ts`
- `src/renderer/src/hooks/useAgentEvents.ts`
- `docs/changes/2026-04-20/changes.md`

### 结果

- assistant 正文现在会留在它第一次出现的位置，后续思考和工具步骤可以继续插在后面。
- 新增思考或工具更新时，已有正文块的顺序保持稳定，整段正文重排重刷会明显收敛。

## Memory 设置页对齐 checkbox 导入层

**时间**: 15:50

### 改了什么

1. 调整 [`src/renderer/src/components/assistant-ui/settings/memory-section.tsx`](D:/a_github/first_pi_agent/src/renderer/src/components/assistant-ui/settings/memory-section.tsx) 的 `Checkbox` 导入路径，从底层 `ui` 目录改成项目现有的 [`assistant-ui/checkbox`](D:/a_github/first_pi_agent/src/renderer/src/components/assistant-ui/checkbox.tsx) 包装层。

### 为什么改

- 当前报错直接指向 `memory-section.tsx` 的 `Checkbox` 导入解析失败。
- 设置页里其它组件已经统一走 `assistant-ui/*` 入口，这里对齐现有包装层后，导入路径和别名解析会更稳定。

### 涉及文件

- `src/renderer/src/components/assistant-ui/settings/memory-section.tsx`
- `docs/changes/2026-04-20/changes.md`

### 结果

- Memory 设置页现在和现有组件入口保持一致。
- 这条 `Checkbox` 导入解析错误已经被收口到项目当前组件体系里。

## 确认条上移并补全说明，正文碎片收口

**时间**: 15:58

### 改了什么

1. 调整 [`src/renderer/src/components/assistant-ui/approval-notice-bar.tsx`](D:/a_github/first_pi_agent/src/renderer/src/components/assistant-ui/approval-notice-bar.tsx)，待确认条从纯按钮条改成“类型标签 + 标题 + 描述 + 时间 + 操作”结构。
2. 调整 [`src/renderer/src/components/assistant-ui/thread.tsx`](D:/a_github/first_pi_agent/src/renderer/src/components/assistant-ui/thread.tsx)，把待确认条和中断恢复条都挪到 composer 主卡片上方，优先出现在输入框之前。
3. 调整 [`src/renderer/src/components/AssistantThreadPanel.tsx`](D:/a_github/first_pi_agent/src/renderer/src/components/AssistantThreadPanel.tsx) 的正文分段构造逻辑，像“我”“找到了”这类过短碎片会前拼到下一段正文里，减少单字单句独立成块的情况。

### 为什么改

- 当前确认区只有 `允许 / 拒绝` 两个按钮，用户需要自己猜当前在确认什么，信息不完整。
- 确认条挂在输入区下面时，运行中会更容易被视线和滚动压到下方，可见性偏差。
- 聊天正文在思考与工具之间按事件分段后，过短碎片直接独立展示会让句子读起来发散。

### 涉及文件

- `src/renderer/src/components/assistant-ui/approval-notice-bar.tsx`
- `src/renderer/src/components/assistant-ui/thread.tsx`
- `src/renderer/src/components/AssistantThreadPanel.tsx`
- `docs/changes/2026-04-20/changes.md`

### 结果

- 用户现在能直接看到“在确认什么、何时发起、怎么处理”。
- 确认条会先出现在输入框上方，进入视线主路径。
- 正文里的短碎片会并回下一段，聊天文本更接近完整句子。

## 过滤 commentary 文本，正文只保留 final answer

**时间**: 16:05

### 改了什么

1. 调整 [`src/main/adapter.ts`](D:/a_github/first_pi_agent/src/main/adapter.ts)，从 `pi-ai` 的 `textSignature.phase` 解析文本阶段，`commentary` 类型的 `text_delta` 不再进入正文缓冲。
2. 调整 [`src/shared/agent-events.ts`](D:/a_github/first_pi_agent/src/shared/agent-events.ts) 和 [`src/shared/contracts.ts`](D:/a_github/first_pi_agent/src/shared/contracts.ts)，给流式 `text_delta` 与持久化 `text step` 补上 `phase / textPhase`。
3. 调整 [`src/renderer/src/components/AssistantThreadPanel.tsx`](D:/a_github/first_pi_agent/src/renderer/src/components/AssistantThreadPanel.tsx) 和 [`src/renderer/src/hooks/useAgentEvents.ts`](D:/a_github/first_pi_agent/src/renderer/src/hooks/useAgentEvents.ts)，renderer 侧同步跳过 `commentary` 文本，只渲染真正的最终答案正文。

### 为什么改

- 当前这批“我 / 找到了 / 准备继续调整...”来自执行过程中的 commentary 更新，它们属于中间进度，不属于最终答案正文。
- 之前 adapter 把所有 `text_delta` 一视同仁塞进正文，所以你会看到一堆不符合正常表达的进度短句混进消息主体。

### 涉及文件

- `src/main/adapter.ts`
- `src/shared/agent-events.ts`
- `src/shared/contracts.ts`
- `src/renderer/src/components/AssistantThreadPanel.tsx`
- `src/renderer/src/hooks/useAgentEvents.ts`
- `docs/changes/2026-04-20/changes.md`

### 结果

- `commentary` 文本不会再进入正文区。
- 正文区现在只保留 `final answer` 阶段的文本内容。

## 聊天里的改动卡对齐 diff 面板语气

**时间**: 16:10

### 改了什么

1. 调整 [`src/renderer/src/components/assistant-ui/thread.tsx`](D:/a_github/first_pi_agent/src/renderer/src/components/assistant-ui/thread.tsx) 里的 `AssistantMessageRunChangeSummary`，把原来的轻量列表卡改成和右侧 diff 面板更接近的结构。
2. 文件状态改成复用同类 badge 语义，顶部补上文件数 / 新增 / 删除三块摘要。
3. 标题区补上 `本轮增量` 标记和说明文案，明确这张卡表达的是“本轮相对开始时的增量”，不是当前工作区全部 diff。

### 为什么改

- 之前聊天里的改动卡和右侧 diff 面板在视觉语言上差距太大，读起来像两套产品。
- 这张卡本身表达的是 run 级增量，明确范围后，用户更容易理解它和右侧工作区总览的关系。

### 涉及文件

- `src/renderer/src/components/assistant-ui/thread.tsx`
- `docs/changes/2026-04-20/changes.md`

### 结果

- 聊天里的改动卡现在更接近 diff 面板的层级和细节语言。
- 卡片顶部会直接说明这是 `本轮增量`，减少和工作区总 diff 的混淆。

## 相邻思考块在渲染层自动合并

**时间**: 16:15

### 改了什么

1. 调整 [`src/renderer/src/components/AssistantThreadPanel.tsx`](D:/a_github/first_pi_agent/src/renderer/src/components/AssistantThreadPanel.tsx) 的 `buildAssistantParts`。
2. 当前一个可见 part 已经是 `reasoning`，后面又来了新的 `thinking step`，且中间没有可见正文或工具卡时，直接把两段思考文本合并到同一个 reasoning part。

### 为什么改

- 当前底层事件里即使中间只有被过滤掉的隐藏片段，也可能把思考 step 切成前后两段。
- 用户真正看到的是“连续思考”，渲染层把这类相邻思考块合并后，展示更接近真实阅读体验。

### 涉及文件

- `src/renderer/src/components/AssistantThreadPanel.tsx`
- `docs/changes/2026-04-20/changes.md`

### 结果

- 中间没有任何可见内容打断时，思考会以一整段展示。
- 被隐藏片段切开的思考块不会再拆成两个独立卡片。

## 侧边栏项目区"+"按钮增强可见性

**时间**: 16:05

### 改了什么

1. 调整 \src/renderer/src/components/assistant-ui/sidebar.tsx\ 项目分区标题右侧的新建项目按钮。
2. 颜色从 \	ertiary\（最淡灰）改为 \secondary\（中等灰），常态对比度提升。
3. 按钮尺寸从 \h-5 w-5\ 放大到 \h-6 w-6\，图标从 \3.5\ 放大到 \4\。
4. 图标描边 \strokeWidth\ 从默认 1.5 加到 \2\，线条更清晰。
5. 补上 \ounded-md\ 和 \hover:bg\ 背景反馈，点击区域感更强。

### 为什么改

- 用户反馈"+"号看不清楚，原实现用了最淡的三级色且图标偏小。
- 这个按钮是项目区的主操作入口，需要保证一眼可见。

### 涉及文件

- \src/renderer/src/components/assistant-ui/sidebar.tsx\
- \docs/changes/2026-04-20/changes.md\

### 结果

- 项目区"+"按钮在默认态和 hover 态都更清晰。
- 按钮点击区域和视觉重量提升，符合主操作入口的层级。

## 项目区新增图标替换为“新建聊天”同款

**时间**: 16:12

### 改了什么

1. 调整 `src/renderer/src/components/assistant-ui/sidebar.tsx`，把项目分区标题右侧的新建项目图标从 `PlusIcon` 换成 `SquarePen`（和顶部“新建聊天”完全一致）。
2. 移除不再使用的 `PlusIcon` 引入。

### 为什么改

- 用户反馈"+"号看着不太好，希望直接复用“新建聊天”的图标，保持入口语义统一。

### 涉及文件

- `src/renderer/src/components/assistant-ui/sidebar.tsx`
- `docs/changes/2026-04-20/changes.md`

### 结果

- 项目区新增按钮现在显示为“新建聊天”同款笔形图标。
- 侧边栏新增类入口视觉语言进一步统一。

## 补齐设置页 Memory 跳转与接线

**时间**: 16:32

### 改了什么

1. 调整 `src/renderer/src/components/assistant-ui/settings/types.ts`、`src/renderer/src/components/assistant-ui/settings/constants.ts`、`src/renderer/src/App.tsx`、`src/renderer/src/components/assistant-ui/settings-view.tsx`，把 `memory` 和 `archived` 正式加入设置 section 类型、路由白名单和页面渲染分支。
2. 调整 `src/renderer/src/components/assistant-ui/settings/system-section.tsx`，让 `数据与系统` 回到日志与关于信息，归档内容继续走独立 section。
3. 调整 `src/shared/contracts.ts`、`src/shared/ipc.ts`、`src/preload/index.ts`、`src/main/index.ts`、`src/main/settings.ts`，补齐 Memory 设置和 IPC 的共享类型、preload 暴露、主进程注册与设置持久化合并逻辑。
4. 调整 `src/renderer/src/components/assistant-ui/settings/memory-section.tsx`，顺手清掉无用类型导入，保持页面自身类型干净。

### 为什么改

- 当前左侧设置栏已经出现 `记忆` 入口，设置页的 section 类型、路由解析和渲染分支还没接住它，点击后会落回默认 section，看起来就是“点不过去”。
- 即使页面路由切进来，`memory` IPC 和 `desktopApi.memory` 这一层也还没完全接通，页面读取状态时会缺能力。

### 涉及文件

- `src/renderer/src/components/assistant-ui/settings/types.ts`
- `src/renderer/src/components/assistant-ui/settings/constants.ts`
- `src/renderer/src/App.tsx`
- `src/renderer/src/components/assistant-ui/settings-view.tsx`
- `src/renderer/src/components/assistant-ui/settings/system-section.tsx`
- `src/renderer/src/components/assistant-ui/settings/memory-section.tsx`
- `src/shared/contracts.ts`
- `src/shared/ipc.ts`
- `src/preload/index.ts`
- `src/main/index.ts`
- `src/main/settings.ts`
- `docs/changes/2026-04-20/changes.md`

### 结果

- 点击 `设置 -> 记忆` 时，路由会稳定落到独立的 Memory 页面。
- Memory 页读取状态、更新设置、触发重建时，renderer / preload / main 三层接口已经闭环。
- `已归档会话` 也重新回到独立 section，设置侧栏里的入口和实际页面结构保持一致。

## 聊天消息底部补回本轮 diff 摘要

**时间**: 16:24

### 改了什么

1. 在 [`src/shared/contracts.ts`](D:/a_github/first_pi_agent/src/shared/contracts.ts) 和 [`src/shared/agent-events.ts`](D:/a_github/first_pi_agent/src/shared/agent-events.ts) 补入 `RunChangeSummary` 类型，并让 `agent_end` 事件可以携带这轮运行生成的 diff 摘要。
2. 在 [`src/main/chat/prepare.ts`](D:/a_github/first_pi_agent/src/main/chat/prepare.ts)、[`src/main/chat/types.ts`](D:/a_github/first_pi_agent/src/main/chat/types.ts)、[`src/main/chat/finalize.ts`](D:/a_github/first_pi_agent/src/main/chat/finalize.ts)、[`src/main/adapter.ts`](D:/a_github/first_pi_agent/src/main/adapter.ts) 接上“运行前快照 + 运行后快照 + 摘要落盘 + 实时事件下发”整条链路。
3. 在 [`src/main/chat/run-change-summary.ts`](D:/a_github/first_pi_agent/src/main/chat/run-change-summary.ts) 启用现有摘要计算逻辑，把本轮改动写入 assistant 消息 `meta`。
4. 在 [`src/renderer/src/components/AssistantThreadPanel.tsx`](D:/a_github/first_pi_agent/src/renderer/src/components/AssistantThreadPanel.tsx) 和 [`src/renderer/src/components/assistant-ui/thread.tsx`](D:/a_github/first_pi_agent/src/renderer/src/components/assistant-ui/thread.tsx) 增加消息底部 diff 卡片，并让实时消息和刷新后消息统一读取同一份 `runChangeSummary`。

### 为什么改

- 当前聊天消息里缺少稳定的本轮 diff 数据链路，导致卡片时机和位置都不稳定。
- diff 摘要属于 assistant 回复的结果信息，固定放在消息正文底部更符合阅读顺序。

### 涉及文件

- `src/shared/contracts.ts`
- `src/shared/agent-events.ts`
- `src/main/chat/types.ts`
- `src/main/chat/prepare.ts`
- `src/main/chat/finalize.ts`
- `src/main/chat/run-change-summary.ts`
- `src/main/adapter.ts`
- `src/renderer/src/components/AssistantThreadPanel.tsx`
- `src/renderer/src/components/assistant-ui/thread.tsx`
- `docs/changes/2026-04-20/changes.md`

### 结果

- 本轮 diff 摘要现在固定渲染在 assistant 消息内容底部。
- 回复结束后无需刷新，消息会直接拿到这轮 diff 摘要。
- 刷新后重载 transcript，diff 卡片内容会继续保留。

## 设置页工作区补回多项目联动

**时间**: 17:32

### 改了什么

1. 调整 [`src/renderer/src/components/assistant-ui/settings/types.ts`](D:/a_github/first_pi_agent/src/renderer/src/components/assistant-ui/settings/types.ts)、[`src/renderer/src/components/assistant-ui/settings-view.tsx`](D:/a_github/first_pi_agent/src/renderer/src/components/assistant-ui/settings-view.tsx)、[`src/renderer/src/App.tsx`](D:/a_github/first_pi_agent/src/renderer/src/App.tsx)，把 `groups`、活跃聊天摘要和 `添加项目` 动作重新接回 `设置 -> 工作区`。
2. 重写 [`src/renderer/src/components/assistant-ui/settings/workspace-section.tsx`](D:/a_github/first_pi_agent/src/renderer/src/components/assistant-ui/settings/workspace-section.tsx)，把单工作区卡片升级成“工作区列表 + 当前工作区详情”的联动结构。
3. 调整 [`src/renderer/src/components/assistant-ui/settings/constants.ts`](D:/a_github/first_pi_agent/src/renderer/src/components/assistant-ui/settings/constants.ts) 的工作区说明文案，让页面语义明确落在“多个工作区项目的管理”上。

### 为什么改

- 外部侧边栏已经有项目 / 工作区概念，设置页继续只展示单一路径，多个工作区的区分和管理都会断掉。
- 后续同时维护多个项目时，设置页需要和外部项目列表共享同一套工作区切换结果。

### 涉及文件

- `src/renderer/src/components/assistant-ui/settings/types.ts`
- `src/renderer/src/components/assistant-ui/settings-view.tsx`
- `src/renderer/src/App.tsx`
- `src/renderer/src/components/assistant-ui/settings/workspace-section.tsx`
- `src/renderer/src/components/assistant-ui/settings/constants.ts`
- `docs/changes/2026-04-20/changes.md`

### 结果

- `设置 -> 工作区` 现在会展示全部已保存项目，同时保留当前默认目录。
- 在设置页点某个项目后，当前 workspace 会同步切过去，规则文件状态也会跟着更新。
- 每个工作区都会显示自己的路径、活跃聊天数和归档数，多项目管理路径更清楚。
