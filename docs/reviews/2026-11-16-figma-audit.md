# Chela 与 Figma 统一对照记录

## 本轮收尾（2026-11-16 13:33 +0800）

用户最新要求改为逐步调整，本轮完成已经开始的聊天、主题及相关接口后停止，不继续扩展剩余项。以下覆盖更新优先于 12:05 的历史状态；**不代表所有画板、所有原生交互均已验收**。

- F05/F06：再次读取 `161:7845`、`161:7106`、`161:8170`、`87:135`、`122:424`、`118:327`、`126:237`，对照消息流、审批、八种输入框状态、附件、模型与权限菜单。统一 760px 内容列、132px 空态/96px 普通输入框、52px 附件卡、思考折叠、上下文环及弹层；运行时主按钮改停止，保留补充与排队。模型弹层实测 640×401.3px，审批卡 760px。尚未对全部状态逐个做像素级验收。
- F06：快速模式、三种权限接到真实运行参数；每轮冻结策略与规则版本。新增项目选择、仓库选择共享状态、@ 项目文件与目录/网页正文引用、DOCX 只读正文提取。图片/文档仍有大小、MIME、像素、目录和 UTF-8 边界；未增加通用办公文件解析或新的依赖。历史附件正文仍按需读取。
- F04：补文件/单仓还原预览与确认，先保存私有 ZIP 备份，执行前核对 HEAD、暂存区及文件指纹。多仓总览禁止全部还原；浏览器只验证临时仓库取消及 Esc，不操作真实工作区。实际还原、过期计划拒绝、备份内容及其他仓库不变由 Go 临时 Git 检查覆盖。
- F14：接入 profile 内全局 AGENTS.md 的读取、冲突检查和原子保存；项目规则/自动记忆开关、模型快速能力声明、供应商启停与 `/models` 连通探测、系统/直连/自定义代理、健康检查与不含正文/密钥的诊断导出。代理覆盖 Pi 模型、本机模型目录/向量及发行检查请求，未覆盖外部 MCP 子进程。更新入口只查发行状态，不执行下载或安装；导入供应商的通用编辑器未做。
- F15：选中边框、底色、光晕和液体轨迹统一使用当前主题 accent，根节点同步 `color-scheme`。浏览器实测森林青瓷 `rgb(57,130,99)`、暮紫幽夜 `rgb(168,147,219)`、晴海经典 `rgb(29,115,201)`，对应浅/深外观正确。
- 本轮修复两处核验发现的问题：上下文悬浮提示不再截获模型按钮点击；供应商保存后刷新列表，启停后清除旧连通状态。

### 核验与证据

- 本轮 9 张截图位于 `output/figma-chat-2026-11-16/`：[聊天](../../output/figma-chat-2026-11-16/chela-final-chat.png)、[附件预览](../../output/figma-chat-2026-11-16/chela-final-chat-attachments.png)、[审批视觉 fixture](../../output/figma-chat-2026-11-16/chela-final-chat-approval-fixture.png)、[森林主题](../../output/figma-chat-2026-11-16/chela-final-theme-forest.png)。聊天正文由本机假上游生成，审批与思考截图使用临时响应 fixture；不是用户真实数据或真实供应商响应。
- 真实临时 Go API + 浏览器核对附件发送/历史回显、@ 项目文件、模型菜单/快速开关、权限菜单、上下文弹层、规则保存重载、代理保存重载、供应商连通/启停、健康检查及诊断下载。假上游确认图片与 `service_tier=priority` 实际收到；不据此保证真实供应商的加速、费用或协议支持。
- 1468px 与 720px 检查，聊天和设置的文档宽度均未超出视口；还原确认默认聚焦取消，Esc 后临时文件仍有变更。未点击视觉 fixture 的批准/拒绝按钮。
- 定向 TypeScript 与 diff 格式通过；chat 的规则/权限/优先参数/引用/文档/供应商/诊断、附件、写入审批、MCP 审批收据共 4 项检查通过，文档边界修改后重跑相关 1 项通过。network、git、browser 与主包检查共 3 项通过，包含真实临时代理/SSE 转发、令牌/Origin/头泄漏边界、真实临时 Git 还原；无完整 Build/Test/Lint。
- 按 modern-web-guidance 新读取的 `color`、`dark-mode`、`progress` 复核：保留文字/形状表达选中态（“Don't use color alone”）；混合色由当前 accent 派生；根节点设置主题（“Apply the `color-scheme` property to the `html` element”）；附件读取/上下文采用原生语义进度（“Use a native `<progress>` element”）。保留已有 Radix 组件及减弱动态处理，没有新增 polyfill 或运行 legacy-scan。
- 临时浏览器、Vite 和本机假上游均已关闭；5189 与 45999 实际重新绑定成功，chat-dev 已退出。原有临时 Git 目录保留，不重试此前被策略拒绝的递归删除。

本轮在此停止。原生 WebView/窗口、真实 CLI、真实上游、原生打开规则/日志/目录及全部外部代理协议未验收；未重建桌面 EXE，未提交推送。自动更新安装、通用导入供应商编辑、业务编号/完整来源徽标及其余未逐项覆盖的设计状态留待用户下一步指定。

## 实施更新（2026-11-16 12:05 +0800）

用户已要求开始调整，新增 Grok Bot 圆脸参考，并指定使用 Magpie 目录中的 modern-web-guidance。本次已落地以下修正；**整体仍不能标记为 17 项全部完成**。下文 09:57 的原始结论保留作基线，不是最新实现截图。

| 编号 | 实施状态 | 结果及边界 |
| --- | --- | --- |
| F01 | 已调整，原生待验收 | 60×60 独立圆脸、16×52 贴边条；去掉常驻矩形卡片。 |
| F02 | 已调整 | 七种代码眼形、轻碰眨眼、视线跟随；遵守应用及系统减弱动态设置。官方 [Grok Bot 设计说明](https://x.ai/news/designing-grok-bot) 作为追加形体参考，尺寸沿用 Figma。 |
| F03 | 已调整，原生待验收 | 气泡 300×120、晨报 345×246，左右镜像，宿主 480×360，命中区域按可见 DOM 生成；晨报从持久事实快照读取真实行。原生穿透、多屏和拖动尚未实测。 |
| F04 | 部分完成 | 独立右侧 Browser/Changes、页签、地址栏、缩放、宽度拖拽、元素引用与真实多仓库/分栏 Diff 已实现。Browser 使用无宿主 RPC 权限的独立 MyGo WebView；仅编译及桥接 fixture 验证，未验收原生显示。文件/仓库还原尚未实现。 |
| F05 | 已调整，覆盖有限 | 真实工具调用状态与耗时、Markdown/代码 Diff、流内审批和本会话放行；真实 Go 审批链路用本机假上游核验，视觉用 fixture。不是对设计稿所有运行态逐一验收。 |
| F06 | 部分完成 | 文件/粘贴图片、附件胶囊、@ 真实笔记/任务引用、/ 指令、草稿与编辑分支附件已接通；图片/文本实际到达本机假上游。本会话文件写入授权不覆盖 MCP；快速模式及统一权限选择尚未迁回。 |
| F07 | 已调整 | 日历整页 740px 文档、串行自动保存、失败草稿与恢复；真实临时 API 验证，保留原提醒/高级日程编辑。 |
| F08 | 已调整 | 仅末尾空块展示输入提示，中间空白保持正常文档密度，Markdown 不变。 |
| F09 | 已调整 | 默认 380px 只读详情，从 y=40 开始；真实执行工具、目录、关联对话/终端与显式编辑。 |
| F10 | 部分完成 | 紧凑展示内部 ID、状态与优先级同时可见，详情落点读取真实来源。未新增持久化业务编号、负责人或完整来源徽标。 |
| F11 | 已调整 | 同任务多窗格归为会话，名称持久化，针对当前窗格分屏；“其他命令”通过现有 pwsh 输入实现。原生 CLI 新启动未实测。 |
| F12 | 已调整 | CLI 关闭使用安全动作默认聚焦的确认框；分隔条支持指针/键盘与取消，放大还原保留树和连接。 |
| F13 | 已调整 | xterm 初始化及根外观变更时同步代码字体/字号。 |
| F14 | 部分完成 | 已接入默认思考强度、自动整理及阈值、关闭行为、默认目录/编辑器、快捷键、多 Git 深度、端口快捷入口与元素拾取开关、归档搜索/分组/筛选清空确认、自定义模型回填和安全保留密钥。全局规则、统一权限、统一代理、诊断导出/日志、供应商启停/延迟探测、自动更新仍未接入，页面明确显示实际状态。 |
| F15 | 已调整 | 340ms 液体子导航，快速切换取消；减弱动态即时停用。 |
| F16 | 已调整，覆盖有限 | 180ms 访问页面缩略图、左键表情/右键菜单、Dock 自动隐藏；未访问页面显示“尚未打开”。DOM 缩略图不含原生 Browser 画面的位图。 |
| F17 | 已调整 | 页面路径及临时侧栏 280px，拖拽宽度和键盘焦点保持；窄窗检查通过。 |

### 当前证据

- 截图目录：`output/figma-adjustment-2026-11-16/`（19 张，忽略构建产物）。`*-final.png` 是收尾截图，其余文件保留该轮较早的单项核验；不是所有画板的像素级一致性证明。
- [设置外观](../../output/figma-adjustment-2026-11-16/figma-adjustment-settings-appearance-final.png)、[设置工作区](../../output/figma-adjustment-2026-11-16/figma-adjustment-settings-workspace-final.png)、[720px 设置](../../output/figma-adjustment-2026-11-16/figma-adjustment-settings-narrow-final.png)。
- [小圆脸七态](../../output/figma-adjustment-2026-11-16/chela-grok-bot-expression-preview.png)、[侧边气泡](../../output/figma-adjustment-2026-11-16/figma-adjustment-pet-speaking-final.png)、[晨报](../../output/figma-adjustment-2026-11-16/figma-adjustment-pet-morning-final.png)。
- [消息流与审批 fixture](../../output/figma-adjustment-2026-11-16/figma-adjustment-chat-running-final.png)、[真实临时多 Git 差异](../../output/figma-adjustment-2026-11-16/figma-adjustment-multi-repo-diff-final.png)。
- 验证分层：真实临时 Go 数据/API、真实临时 Git 仓库；模型传输使用本机假上游；桌宠/终端/Browser 使用临时宿主 fixture。未操作用户窗口、正式数据或真实上游模型，未启动用户 CLI。
- 定向前端 TypeScript 与 diff 格式检查通过；work/terminal 既有检查 12 项、chat 附件及审批 2 项、Browser/Git 边界 2 项及主包编译通过；晨报事实投递检查 1 项通过。自定义模型保留密钥及禁止换地址沿用密钥复用附件检查再次通过。
- 键盘验证：页签方向键只移动焦点、Enter 激活；Ctrl+T 创建、Delete 关闭后焦点回到相邻页签、Ctrl+Shift+B 收起。归档确认默认聚焦取消、Esc 不删除，筛选清空只删除捕获的归档范围。720px 无横向页面溢出。
- 未完整 Build/Test/Lint、未重建桌面 EXE、未提交推送；用户已有未提交内容与旧实现归档保留。

### Modern Web Guidance

使用用户指定的 `C:/Users/user/.config/magpie/library/skills/modern-web-guidance/SKILL.md`，先 search 再 retrieve，完整读取指南并按实现核对：

- `motion`：“Always respect reduced motion preferences.” 应用及系统减弱动态即时生效。
- `natural-interactions`：“Use `:focus-visible` so keyboard users always see a clear focus ring” 为互动、分隔条和页签保留键盘反馈。
- `css-layout`：“Set `min-inline-size: 0`” 允许长路径、代码和分栏收缩。
- `dialog`：“put `autofocus` on the safe action” CLI 关闭及归档删除确认默认聚焦取消，沿用原生 Esc/焦点处理。
- `tabs`：“Keep tabs on a single row.” 使用现有 Radix Tabs，手动激活昂贵的原生/网络面板、横向滚动和关闭后焦点恢复。
- `validate-origins`：“DO NOT validate origins or sites with `startsWith()`” 前后端使用 URL 解析，预览页隔离宿主权限。
- `forms`：“use the `<form>` element to wrap interactive controls for data collection” 使用真实表单、可见标签、原生约束及异步状态。
- `validate-input-after-interaction`：“DO use `:user-invalid` to apply error styling only after interaction.” 端口表单提交校验，输入时清理错误。

---

## 09:57 基线复核（保留历史）

更新时间：2026-11-16 09:57 +0800（Asia/Taipei）。

结论：当前实现没有完整落实设计稿。主窗口壳和部分基础布局接近；桌宠主体、日历文档页、右侧工作区、聊天运行态及设置能力存在结构或功能缺口。上一轮“设置已按稿重做”的表述只能代表部分骨架接近，不能代表整页及动效已经验收。

本轮只核对和留证，不改业务代码，不提交推送。

## 范围和证据

- 当前 Figma 文件：COT3jrWrT1ZzmhfsuY7LR7。读取九个相关设计页，盘点 100 个顶层画板、规范板及标题帧；这不是“100 个运行态全部实测通过”。
- 保留 27 张 Figma 参考图、25 张当前渲染截图。主工作区按 1468 × 914 对照；设置按各自画板高度对照；桌宠按宿主的 360 × 360 渲染并额外截取主体。
- 看板、日历、笔记、模型配置使用独立临时 Go profile；没有操作正式记录，没有向真实上游模型提交消息。
- 桌宠、终端四窗格、聊天审批态使用浏览器中的临时宿主/快照 fixture，仅验证实际 React/CSS 的呈现和前端动作，不代表原生桌面、PTY 或真实审批已验收。
- 不把示例任务数量、项目名称、日期、供应商数量或空数据本身当成偏差。
- 浏览器预览没有原生窗口控制按钮的截图，不据此判断桌面按钮缺失。临时宿主 fixture 中可显示相同窗口控件。
- 临时浏览器和 Vite 已关闭，5189 端口可重新绑定，chat-dev 子进程已退出。未运行完整 Build/Test/Lint。

## 区域结论与对照图

| 区域 | 结论 | Figma | 当前 |
| --- | --- | --- | --- |
| 小人展开态 | 不符：圆脸被替换为品牌标志与矩形操作卡片 | [展开主体](D:/a_kalerm/Chela/output/figma-audit-2026-11-16/figma-pet-face.png) / [完整场景](D:/a_kalerm/Chela/output/figma-audit-2026-11-16/figma-pet-expanded.png) | [主体](D:/a_kalerm/Chela/output/figma-audit-2026-11-16/current-pet-body.png) / [完整宿主](D:/a_kalerm/Chela/output/figma-audit-2026-11-16/current-pet-expanded.png) |
| 小人气泡与表情 | 不符：气泡位置、表情和轻碰行为不同 | [说话](D:/a_kalerm/Chela/output/figma-audit-2026-11-16/figma-pet-speaking.png) / [轻碰](D:/a_kalerm/Chela/output/figma-audit-2026-11-16/figma-pet-blink.png) / [晨报](D:/a_kalerm/Chela/output/figma-audit-2026-11-16/figma-pet-morning.png) | [说话](D:/a_kalerm/Chela/output/figma-audit-2026-11-16/current-pet-speaking.png) / [好奇](D:/a_kalerm/Chela/output/figma-audit-2026-11-16/current-pet-curiosity.png) |
| Shell / Dock | 基础尺寸接近；悬浮预览、表情、侧栏临时展开及面包屑不完整 | [壳层](D:/a_kalerm/Chela/output/figma-audit-2026-11-16/figma-dock.png) / [Dock 规范](D:/a_kalerm/Chela/output/figma-audit-2026-11-16/figma-dock-preview.png) / [临时侧栏](D:/a_kalerm/Chela/output/figma-audit-2026-11-16/figma-sidebar-hover.png) | [主壳](D:/a_kalerm/Chela/output/figma-audit-2026-11-16/current-chat.png) / [系统菜单](D:/a_kalerm/Chela/output/figma-audit-2026-11-16/current-system-menu.png) / [侧栏悬浮](D:/a_kalerm/Chela/output/figma-audit-2026-11-16/current-sidebar-hover.png) |
| 对话 | 空态接近；消息、审批和输入上下文未完整落实 | [空态](D:/a_kalerm/Chela/output/figma-audit-2026-11-16/figma-chat.png) / [运行态](D:/a_kalerm/Chela/output/figma-audit-2026-11-16/figma-chat-running.png) | [空态](D:/a_kalerm/Chela/output/figma-audit-2026-11-16/current-chat.png) / [运行态 fixture](D:/a_kalerm/Chela/output/figma-audit-2026-11-16/current-chat-running.png) |
| 右侧面板 | 不符：Browser / Diff 工作区变为信息浮层 | [Browser](D:/a_kalerm/Chela/output/figma-audit-2026-11-16/figma-panels.png) | [对话信息浮层](D:/a_kalerm/Chela/output/figma-audit-2026-11-16/current-panels.png) |
| 看板 | 四列骨架接近；详情内容、纵向位置和卡片信息不符 | [状态看板](D:/a_kalerm/Chela/output/figma-audit-2026-11-16/figma-board.png) / [详情](D:/a_kalerm/Chela/output/figma-audit-2026-11-16/figma-board-drawer.png) | [状态看板](D:/a_kalerm/Chela/output/figma-audit-2026-11-16/current-board.png) / [同为左栏收起的详情](D:/a_kalerm/Chela/output/figma-audit-2026-11-16/current-board-drawer.png) |
| 日历 | 月/周框架存在；点击日程后的页面类型不符 | [月视图](D:/a_kalerm/Chela/output/figma-audit-2026-11-16/figma-calendar.png) / [整页文档](D:/a_kalerm/Chela/output/figma-audit-2026-11-16/figma-calendar-document.png) | [月视图](D:/a_kalerm/Chela/output/figma-audit-2026-11-16/current-calendar.png) / [详情抽屉](D:/a_kalerm/Chela/output/figma-audit-2026-11-16/current-calendar-document.png) |
| 笔记 | 页面树、正文列和搜索骨架接近；正文密度明显不符 | [文档](D:/a_kalerm/Chela/output/figma-audit-2026-11-16/figma-notes.png) / [搜索](D:/a_kalerm/Chela/output/figma-audit-2026-11-16/figma-notes-search.png) | [文档](D:/a_kalerm/Chela/output/figma-audit-2026-11-16/current-notes.png) / [搜索](D:/a_kalerm/Chela/output/figma-audit-2026-11-16/current-notes-search.png) |
| 终端 | 新建及四窗格外形部分接近；会话组织、操作和字体有差异 | [新建](D:/a_kalerm/Chela/output/figma-audit-2026-11-16/figma-terminal-create.png) / [四窗格](D:/a_kalerm/Chela/output/figma-audit-2026-11-16/figma-terminal-panes.png) | [新建](D:/a_kalerm/Chela/output/figma-audit-2026-11-16/current-terminal-create.png) / [四窗格 fixture](D:/a_kalerm/Chela/output/figma-audit-2026-11-16/current-terminal-panes.png) |
| 设置 | 五类骨架接近，多个真实控件和液体动效缺失 | [外观](D:/a_kalerm/Chela/output/figma-audit-2026-11-16/figma-settings-appearance.png) / [模型](D:/a_kalerm/Chela/output/figma-audit-2026-11-16/figma-settings-models.png) / [助手](D:/a_kalerm/Chela/output/figma-audit-2026-11-16/figma-settings-assistant.png) / [工作区](D:/a_kalerm/Chela/output/figma-audit-2026-11-16/figma-settings-workspace.png) / [数据](D:/a_kalerm/Chela/output/figma-audit-2026-11-16/figma-settings-data.png) | [外观](D:/a_kalerm/Chela/output/figma-audit-2026-11-16/current-settings-appearance.png) / [模型](D:/a_kalerm/Chela/output/figma-audit-2026-11-16/current-settings-models.png) / [助手](D:/a_kalerm/Chela/output/figma-audit-2026-11-16/current-settings-assistant.png) / [工作区](D:/a_kalerm/Chela/output/figma-audit-2026-11-16/current-settings-workspace.png) / [数据](D:/a_kalerm/Chela/output/figma-audit-2026-11-16/current-settings-data.png) |

## 17 项主要偏差

P1 表示主体结构、主要交互或重要操作缺失；P2 表示局部表现、信息组织或一致性问题。编号不代表这些问题已修复。

### F01 · P1 · 桌宠展开造型和收起形态不符

设计是独立 60 × 60 黑色 OLED 圆脸，位于 90 × 82 悬浮区；边缘休息是细条。当前将 Chela24Px.svg 放大到 52 × 52，外面是 112 × 124.5 的卡片，带拖动点、状态文字和常驻操作按钮。收起只是把整张卡片平移 64px，仍露出约半张卡片。

依据：[Figma 展开态](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=243-105)、[休息态](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=243-3)；[资源与 JSX](D:/a_kalerm/Chela/native/frontend/src/workspaces/pet/pet-workspace.tsx:7)、[卡片与平移样式](D:/a_kalerm/Chela/native/frontend/src/workspaces/pet/pet.css:7)。

验收：休息、探头、展开三态分别匹配参考；展开后只有设计中的独立圆脸，辅助操作按设计出现。

### F02 · P1 · 表情和轻碰交互没有落实

设计有静息、好奇、欢喜、俏皮眨眼、思考、提醒、休眠七态。当前 joy、curiosity 等只改变 data-emotion 和可访问文字，显示的始终是同一个品牌 SVG；本地动画只上下移动或旋转整个标志。点击脸实际调用 Pet.Open("", "")，Go 默认打开聊天主窗；设计“轻碰圆脸”应先眨眼回应。

依据：[表情体系](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=251-56467)、[轻碰状态](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=248-2)；[点击与情绪](D:/a_kalerm/Chela/native/frontend/src/workspaces/pet/pet-workspace.tsx:39)、[动画](D:/a_kalerm/Chela/native/frontend/src/workspaces/pet/pet.css:24)、[默认打开聊天](D:/a_kalerm/Chela/native/internal/pet/pet.go:261)。

验收：七种状态能从脸部视觉区分；轻碰回应与进入原会话分开；不借打开主窗冒充表情动作。

### F03 · P1 · 气泡排布和宿主尺寸不支持稿中的组合

设计的普通气泡为 300 × 120，位于圆脸左边，间隔 16px；晨报列表为 345 × 246。当前气泡宽 344px，在操作卡片上方，文案为普通小字加关闭图标。宿主窗口以及前后端命中边界都固定为 360 × 360；普通气泡加圆脸至少需 376px，晨报加圆脸需 421px，不能只改气泡 CSS 就完成。

依据：[说话气泡](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=243-111)、[晨报](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=257-48)；[气泡样式](D:/a_kalerm/Chela/native/frontend/src/workspaces/pet/pet.css:9)、[宿主窗口](D:/a_kalerm/Chela/native/internal/pet/pet.go:48)、[命中边界](D:/a_kalerm/Chela/native/internal/pet/pet.go:229)、[前端裁剪](D:/a_kalerm/Chela/native/frontend/src/workspaces/pet/pet-workspace.tsx:35)。

验收：左右贴边时气泡与圆脸保持参考中的关系，宿主包络和命中区域随布局更新；原生穿透、多屏和边缘行为需单独实测。

### F04 · P1 · 右侧工作区被信息浮层替代

稿里是可分栏的 Browser、Changes/Diff、多仓库和新标签页工作区。当前右上按钮只打开一个“对话信息”浮层，显示模型、用量、分支及配置入口；没有稿中的页签、地址栏、元素拾取、变更文件树或分栏内容。

依据：[Browser](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=162-9742)、[Diff](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=162-10151)；[当前浮层入口与内容](D:/a_kalerm/Chela/native/frontend/src/workspaces/chat/chat-workspace.tsx:378)。

验收：恢复设计中的工作区入口及布局，并接真实能力；信息浮层不能算 Browser / Diff 已实现。

### F05 · P1 · 聊天运行态缺少结构化呈现

当前 assistant content 直接作为字符串放入 div；实际 fixture 中 diff 围栏原样显示，没有代码 Diff 卡片。审批被放在输入框下面，只有“拒绝 / 允许此次操作”；参考把思考、工具进展、Diff 和审批按时间放在消息流内，并区分此次与会话授权。

依据：[运行态](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=161-7845)、[消息状态矩阵](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=161-7670)；[纯文本消息](D:/a_kalerm/Chela/native/frontend/src/workspaces/chat/chat-workspace.tsx:391)、[输入区后的审批](D:/a_kalerm/Chela/native/frontend/src/workspaces/chat/chat-workspace.tsx:331)。

验收：消息、思考、工具结果、Diff、审批在正确位置显示；授权按钮必须对应真实后端语义，不能只补视觉按钮。

### F06 · P1 · 输入区上下文与附件交互不完整

参考包含引用/注释胶囊、附件状态、拖拽、多行及权限/快速模式等状态。当前附件仅选文本文件并直接把文件内容拼进草稿，没有参考里的附件/注释胶囊及图片输入路径；@ 引用、/ 指令和相关运行态面板也没有在当前 ChatWorkspace 接通。模型选择器已复用，不等于这些输入能力已接上。

依据：[输入状态](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=161-7106)、[引用与边界态](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=161-8170)；[文本附件](D:/a_kalerm/Chela/native/frontend/src/workspaces/chat/chat-workspace.tsx:269)、[输入区实际调用](D:/a_kalerm/Chela/native/frontend/src/workspaces/chat/chat-workspace.tsx:307)。

验收：逐项对照设计里的输入状态；保留草稿、取消、失败等已有处理，不用纯文本拼接代替设计中的上下文对象。

### F07 · P1 · 日历详情应是整页文档，当前是抽屉

设计点击日程后进入带“返回日历”、属性行和块编辑器的整页文档。实际打开宽 560px 的右侧表单，月历继续留在背景；内容仍是 textarea 和显式“保存日程”。页面类型、阅读宽度、返回关系和编辑方式均不符。

依据：[日程文档](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=235-54707)；[编辑表单](D:/a_kalerm/Chela/native/frontend/src/workspaces/calendar/calendar-workspace.tsx:80)、[抽屉定位](D:/a_kalerm/Chela/native/frontend/src/workspaces/calendar/calendar.css:66)。

验收：按整页文档实现，并保留返回时的月/周视图、日期、滚动位置；排期与截止校验不能丢。

### F08 · P1 · 笔记空行被渲染成大量提示文字

Markdown 的每个空行都被解析成独立块，未编辑时也显示“输入 / 插入标题、待办、代码块……”提示。截图中这些提示反复夹在正文间，把原本紧凑的文档拉长，代码块被挤到屏幕下方。页面树、760px 正文列和 Ctrl+P 搜索已经存在；问题集中在块的呈现。

依据：[笔记主稿](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=12-1271)；[逐行分块](D:/a_kalerm/Chela/native/frontend/src/workspaces/notes/note-editor.tsx:10)、[空块提示](D:/a_kalerm/Chela/native/frontend/src/workspaces/notes/note-editor.tsx:204)。

验收：空白分隔保留合理留白，提示只在稿里对应的空输入/活动插入位置出现，不删除用户实际 Markdown 内容。

### F09 · P1 · 看板详情从信息面板变成了完整编辑表单

参考是标题、状态/项目/目录/执行工具/时间、验收进展及底部“查看关联对话”。当前默认展示必填目标、下拉、排期、时区、时间块、提醒和大文本框，底部是保存/终端/归档/删除；关键进展和对话落点不在原位置。抽屉宽 380px 接近，但实际 y=80，参考从 y=40 开始。

依据：[优先级详情](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=214-28786)；[TaskEditor](D:/a_kalerm/Chela/native/frontend/src/workspaces/board/board-workspace.tsx:38)、[详情布局](D:/a_kalerm/Chela/native/frontend/src/workspaces/board/board.css:51)。

验收：默认查看态与显式编辑态分开；信息结构、执行来源和返回落点对齐，已有排期业务保留。左栏收起后实测仍为四列，因此不把“保留左栏时自动两列”误判为四列缺失。

### F10 · P2 · 看板卡片直接显示内部长 ID，状态表达也不完整

实际 26 字符内部 ID 会换行占满卡片顶部；参考是 CHELA-12 等紧凑编号。最高优先级卡片用优先级徽标替换了执行状态，而参考的 Working / 等我确认 / 终端会话等信息用于区分当前动作。参考中的“我负责/我委派、执行来源、进展和前往原会话”也未完整表达。

依据：[状态看板](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=12-738)；[卡片元信息](D:/a_kalerm/Chela/native/frontend/src/workspaces/board/board-workspace.tsx:183)。

验收：内部 ID 与展示编号分开；优先级不遮住执行状态；任务来源与落点来自真实数据。

### F11 · P2 · 终端侧栏按窗格重复记录，缺少设计中的会话管理

四窗格 fixture 下，当前左栏为同一任务显示四条同名记录，且四条同时标为当前；参考是一个工作会话显示“4 窗格”。没有稿中的会话右键重命名入口。新建工具仅 codex / opencode / pwsh，缺少参考的其他命令入口。

依据：[四窗格](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=223-43958)、[左栏管理](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=229-52164)；[逐进程渲染侧栏](D:/a_kalerm/Chela/native/frontend/src/workspaces/terminal/terminal-workspace.tsx:276)、[程序类型](D:/a_kalerm/Chela/native/frontend/src/workspaces/terminal/api.ts:3)。

验收：工作会话与内部窗格分层，恢复名称和右键管理；不把同一任务的多个进程显示成无法区分的同名会话。

### F12 · P1 · 终端关闭确认和拖拽布局未按稿落实

“结束终端”直接调用 close，没有参考中关闭主 CLI 的确认；“隐藏窗格”是另一条保留进程的行为，不能代替结束确认。四窗格的初始形状已接近参考，放大也能切换，但布局为固定 CSS Grid；没有拖拽分隔条，方向选择会重排整个 pane 容器。

依据：[关闭确认](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=223-44477)、[四窗格](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=223-43958)；[直接结束](D:/a_kalerm/Chela/native/frontend/src/workspaces/terminal/terminal-workspace.tsx:236)、[全局分屏方向](D:/a_kalerm/Chela/native/frontend/src/workspaces/terminal/terminal-workspace.tsx:251)、[固定网格](D:/a_kalerm/Chela/native/frontend/src/workspaces/terminal/terminal.css:56)。

验收：结束主 CLI 前确认；隐藏保留进程；分屏、放大、拖拽和还原按设计作用于对应窗格。此次未启动或结束真实 CLI。

### F13 · P2 · 设置中的代码字体没有传入终端

外观显示 Maple Mono NF CN、13px；终端构造仍固定 JetBrains Mono / Consolas、12px。设置值和实际终端渲染不一致。

依据：[外观](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=177-21069)；[终端字体常量](D:/a_kalerm/Chela/native/frontend/src/workspaces/terminal/terminal-workspace.tsx:53)、[外观偏好](D:/a_kalerm/Chela/native/frontend/src/workspaces/settings/appearance.ts:15)。

验收：明确代码字体的适用范围；若涵盖终端，创建和已打开的终端都应实际应用并有缺字回退。

### F14 · P1 · 设置只有部分骨架，设计中的控件和能力未完整接回

外观的五类侧栏、44px 子导航、780px 内容列和十套预览较接近，但仍缺下列设计内容：

| 分类 | 参考要求 | 当前差异 |
| --- | --- | --- |
| 外观 | 自动隐藏、延迟、关闭方式、图标互动表情 | 尚未接入或禁用，不能算完成 |
| 模型 | 默认思考强度、压缩阈值、供应商测试/编辑/启停/连接状态 | 仅按对话或运行时管理；供应商配置不等于连通性测试 |
| 助手 | 可切换权限、规则文件、自动读取规则、内联记忆管理、紧凑技能/MCP 列表 | 策略按钮禁用；规则未接回；记忆通过另一个面板打开；列表沿用较长原表单 |
| 工作区 | 编辑器和可修改快捷键、默认目录、多 Git 深度、浏览器/端口、代理 | 大部分只是“尚未接入”说明 |
| 数据与关于 | 归档筛选/清空、健康检查、目录/日志/诊断导出、更新 | 仅部分归档操作与状态说明；缺少参考中的操作区 |

依据：[五类设置页](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=177-21069)、[工作区](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=177-22300)、[数据](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=177-22744)；[实际设置段落](D:/a_kalerm/Chela/native/frontend/src/workspaces/settings/settings-workspace.tsx:87)。

验收：逐项接真实后端并恢复控件；尚未实现的能力明确列为未完成，不以示例连接状态或可点击空开关填充。示例供应商/记忆数量不作为必须硬编码的内容。

### F15 · P2 · Liquid Subnav 只有静态选中图，没有液体切换过程

设计有 0 / 50 / 120 / 220 / 340ms 的拉丝、液桥、压扁和回弹过程。当前是切换 aria-current，然后给按钮换底色、边框、阴影和一张静态 LiquidTrail.svg；没有共享胶囊的位移/形变或相应状态过程。

依据：[动效分解](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=180-23451)；[导航组件](D:/a_kalerm/Chela/native/frontend/src/ui/settings-subnav.tsx:20)、[静态选中样式](D:/a_kalerm/Chela/native/frontend/src/ui/workspace-controls.css:72)。

验收：按设计实现切换及快速连点中断；系统/用户减弱动态效果时提供明确退化，不能把静态拖尾当作完整动效。

### F16 · P2 · Dock 悬浮行为和菜单触发条件不一致

参考要求工作台图标悬浮 180ms 出现缩略预览，Chela 只做表情反馈，右键才开系统菜单；当前工作台只有 title，没有预览，Chela 是静态 SVG。左键点击系统菜单后已确认 aria-expanded=true、menu 可见，不符合参考“左键与悬浮不弹出”。

依据：[Dock 悬浮规范](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=197-26522)；[普通 Dock 按钮](D:/a_kalerm/Chela/native/frontend/src/app/shell.tsx:109)、[同时保留普通 Trigger 的菜单](D:/a_kalerm/Chela/native/frontend/src/app/system-menu.tsx:31)。

验收：分别核对工作台预览、Chela 表情、左键和右键；与自动隐藏的配置行为一起验收。

### F17 · P2 · 通用面包屑、临时侧栏及分栏交互缺失

看板、日历、笔记、终端的顶栏通常只显示模块名，缺少参考中的当前视图/父页面/项目/会话层级。折叠聊天侧栏后悬浮展开按钮，实测侧栏仍隐藏，没有临时浮层；Sidebar 只是 hidden 开关。原稿的可拖分栏也没有在当前壳层实现。

依据：[侧栏悬浮](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=95-135)、[三栏规范](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=162-11735)；[面包屑](D:/a_kalerm/Chela/native/frontend/src/app/shell.tsx:92)、[侧栏实现](D:/a_kalerm/Chela/native/frontend/src/ui/sidebar.tsx:17)。

验收：各工作区给壳层提供准确层级；临时查看与固定展开分开；实际拖拽后不能遮挡正文或原生内容。

## 修复顺序

1. 小人的休息/探头/展开/轻碰/说话状态，以及相应窗口尺寸、命中和表情；先完成这一条完整链路。
2. 日历整页文档、右侧工作区、聊天运行态、笔记空块等主体结构。
3. 看板详情与终端的会话/窗格组织、关闭确认。
4. 五类设置的真实能力、Liquid Subnav、Dock 预览与共用交互。

每个区域以对应 Figma 节点、同尺寸截图、展开态和交互检查收口，不用“页面能打开”替代“按稿完成”。

## 验证边界

这次证明的是当前源码与参考稿之间的差异。没有发布、没有改业务代码、没有重建桌面 EXE；没有验收原生鼠标穿透、多屏、窗口置顶、真实 CLI 生命周期、实际模型或 MCP 请求。fixture 的输出和按钮动作只用于前端核验，不作为这些原生或外部能力已通过的证据。

## 已盘点的 Figma 画板目录

以下目录用于追溯范围；未为每个规范板或每条业务分支单独执行真实端到端测试。

### pet（11）

- [01 · 贴边休息 / 主窗隐藏](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=243-3) · 243:3
- [02 · 悬停探头 / 独立圆脸](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=243-27) · 243:27
- [03 · 主动开口 / 独立说话气泡](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=243-51) · 243:51
- [04 · 收起 / 回到屏幕边缘](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=243-75) · 243:75
- [05 · 打开原会话 / ESRV-35](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=243-129) · 243:129
- [06 · 轻碰圆脸 / 眨眼回应](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=248-2) · 248:2
- [07 · 助手形态与表情体系探索（Nomi 灵动微表情球 vs 边缘萌宠）](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=251-56467) · 251:56467
- [08 · 晨报 / 早安提示](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=257-4) · 257:4
- [09 · 晨报 / 当天事项](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=257-48) · 257:48
- [10 · 晨报收起 / 回到当前工作](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=257-92) · 257:92
- [11 · 桌宠落点：返回看板保留任务抽屉（提醒已读 · 任务继续）](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=266-56780) · 266:56780

### window（9）

- [Window · 全局布局 / 内容留空](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=48-3) · 48:3
- [规格与落地说明](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=48-300) · 48:300
- [关闭按钮 · Hover 贴边对比](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=58-2) · 58:2
- [纯图标导航 · 悬浮名称示例](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=67-2) · 67:2
- [列表切换 · 展开与收起图标](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=72-13) · 72:13
- [全局导航 · 默认 / 悬浮 / 选中](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=75-2) · 75:2
- [系统窗口 · 最大化与还原](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=77-14) · 77:14
- [展开收起按钮 · Hover 与 Tooltip](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=78-2) · 78:2
- [09 · 对话列表收起 · 悬浮临时查看（已同步新版 Shell）](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=162-11816) · 162:11816

### chat（22）

- [01 · 对话 / Session列表展开](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=87-135) · 87:135
- [02 · 对话 / Session列表收起](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=93-135) · 93:135
- [03 · 对话 / 收起后悬浮列表](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=95-135) · 95:135
- [04 · 模型Select / 收起·悬浮·展开·选项悬浮](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=104-184) · 104:184
- [05 · 权限选择 / Codex结构·Chela规范](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=118-327) · 118:327
- [06 · 思考强度悬浮 / 可直接编辑](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=122-589) · 122:589
- [07 · 快速模式 / 闪电按钮三态 · 可编辑](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=126-237) · 126:237
- [08 · 对话 / 文件夹分组收起](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=133-538) · 133:538
- [09 · Session列表 / 文件夹与会话悬浮 · 可编辑](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=133-755) · 133:755
- [10 · Session操作 / 悬浮快捷 · 右键菜单 · 可编辑](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=150-303) · 150:303
- [11 · 对话 / Session右键菜单展开](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=150-863) · 150:863
- [12 · Session重命名 / 同行编辑 · 可编辑](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=152-2687) · 152:2687
- [13 · 对话 / Session同行重命名中](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=152-2688) · 152:2688
- [14 · 文件夹操作 / 悬浮新增聊天 · 更多菜单 · 可编辑](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=161-6178) · 161:6178
- [15 · 对话 / 悬浮文件夹显示新增聊天](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=161-6315) · 161:6315
- [16 · 输入框状态 / 默认·聚焦·输入·附件·拖拽·多行·生成中·错误 · 可编辑](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=161-7106) · 161:7106
- [17 · 对话 / 进行中对话与底部聚焦输入](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=161-7357) · 161:7357
- [18 · 消息与审批 / 思考·工具调用·审批卡片·代码Diff·消息操作 · 可编辑](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=161-7670) · 161:7670
- [19 · 对话 / 工具审批卡片与运行流展开](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=161-7845) · 161:7845
- [20 · 面板与边界态 / @引用 · /指令 · 底栏切换 · 搜索 · 删除确认 · 可编辑](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=161-8170) · 161:8170
- [21 · 对话 / 输入@引用面板与搜索高亮实战态](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=161-8358) · 161:8358
- [对话分栏 · 尺寸和拖拽行为](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=91-139) · 91:139

### board（19）

- [01 · 看板 / 状态看板（默认视图 · 路径 ①② 起点）](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=12-738) · 12:738
- [02 · 看板 / 优先级看板与详情抽屉（CHELA-12）](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=214-28786) · 214:28786
- [03 · 看板 / 卡片拖拽与跨列落位（Drag & Drop）](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=227-47879) · 227:47879
- [04 · 看板 / 拖拽四态拆解与交互规范](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=220-31120) · 220:31120
- [05 · 看板 / 任务列表视图与「等我处理」集中入口](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=220-31250) · 220:31250
- [06 · 看板 / 筛选、排序菜单与项目过滤（等我处理 + 截止日排序）](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=227-48224) · 227:48224
- [07 · 看板 / 对话式新建任务：描述并确认生成 HELP-20（路径 ①）](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=227-48586) · 227:48586
- [08 · 看板 / 快速创建落位：状态看板（HELP-20 · 路径 ①）](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=227-49276) · 227:49276
- [09 · 看板 / 快速创建同步：任务列表（HELP-20 · 路径 ① 终点）](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=223-39452) · 223:39452
- [10 · 看板 / 对话式新建 ESRV-35：解析目录与 Codex 启动（路径 ② 起点）](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=227-48956) · 227:48956
- [11 · 看板 / 终端落点：单窗格 Codex（ESRV-35 · 同 06 · 终端 #03）](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=224-46282) · 224:46282
- [12 · 看板 / 终端落点：Kero 四窗格工作区（ESRV-35 · 同 06 · 终端 #05）](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=224-46483) · 224:46483
- [13 · 看板 / 离开后 ESRV-35 详情、返回原终端 & 终端已结束态（路径 ② 终点）](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=227-49829) · 227:49829
- [14 · 看板 / 待查看提醒（ESRV-35：Codex 已回复，等你查看 · 路径 ③ 起点）](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=227-50149) · 227:50149
- [15 · 看板 / 原终端落点：在 Codex 会话查看回复并继续输入（路径 ③）](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=227-50487) · 227:50487
- [16 · 看板 / 返回看板：本次提醒已读（任务继续）& 可选「标记完成」（路径 ③ 终点）](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=227-50765) · 227:50765
- [17 · 看板 / 关联对话落点（CHELA-12 · 返回保留视图与抽屉）](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=223-42624) · 223:42624
- [18 · 看板 / 关键边界与空状态矩阵（4 态）](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=223-43008) · 223:43008
- [19 · 看板 / 新建任务「手动」表单模板（同草稿结构 · 与对话互通）](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=234-53493) · 234:53493

### calendar（4）

- [01 · 日历 / Notion 式月视图（默认视图 · 跨天日程与文档卡片）](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=12-881) · 12:881
- [02 · 日历 / 周视图与无日期列表（Weekly & Unscheduled）](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=12-1138) · 12:1138
- [03 · 日历 / 点击日程打开 Notion 式文档页（Chela 主题同步）](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=235-54707) · 235:54707
- [04 · 日历 / 自己新建（格子「+」/「新建」）与 Agent 自动写入](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=235-54986) · 235:54986

### notes（4）

- [01 · 笔记 / Notion 式块编辑与目录树](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=12-1271) · 12:1271
- [02 · 笔记 / 随手摘录 Inbox 与斜杠指令](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=210-27919) · 210:27919
- [03 · 笔记 / 双向链接（[[页面]]）与反向链接（Backlinks）](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=237-55608) · 237:55608
- [04 · 笔记 / Ctrl+P 快速搜索与左栏页面右键菜单](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=237-55911) · 237:55911

### terminal（13）

- [01 · 终端 / 尚未创建（空态 + 左侧项目会话栏）](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=12-1537) · 12:1537
- [02 · 终端 / 新建终端弹窗（选项目目录与 Codex / OpenCode / pwsh）](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=223-43291) · 223:43291
- [03 · 终端 / 刚开始工作：单窗格 Codex（ESRV-35 · 待发送要求）](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=223-43495) · 223:43495
- [04 · 终端 / 分屏菜单：在 Codex 下方打开 PowerShell](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=223-43731) · 223:43731
- [05 · 终端 / 工作展开：Kero 四窗格布局（ESRV-35 同一会话）](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=223-43958) · 223:43958
- [06 · 终端 / 主 CLI 单独放大阅读（Zoomed Codex）& 还原布局](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=223-44254) · 223:44254
- [07 · 终端 / 关闭普通 shell（剩余填满）& 关闭 CLI 进程确认](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=223-44477) · 223:44477
- [08 · 终端 / 窄窗口响应式态（收起项目栏 & 窗格切换）](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=223-44769) · 223:44769
- [09 · 终端 / OpenCode 启动态 & 临时无任务 PowerShell 示例](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=223-45084) · 223:45084
- [10 · 终端 / 会话已结束态（CLI 退出不代表任务完成 · 新建记录 #2）](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=223-45334) · 223:45334
- [11 · 终端闭环落点：返回 ESRV-35 看板抽屉（同 03 · 看板 #13）](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=227-51198) · 227:51198
- [12 · 终端闭环落点：返回后提醒已读与「标记完成」（同 03 · 看板 #16）](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=227-51631) · 227:51631
- [13 · 终端 / 左栏会话右键菜单与重命名（Rename Session）](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=229-52164) · 229:52164

### panels（8）

- [05 · 右侧面板总览标题](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=12-1670) · 12:1670
- [01 · 右侧面板 / 浏览器预览与元素拾取（Browser）](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=162-9742) · 162:9742
- [02 · 右侧面板 / 工作区变更 Diff（Changes）](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=162-10151) · 162:10151
- [03 · 右侧面板 / 多 Git 合一总览与快切浮层（Multi-Repo）](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=162-10602) · 162:10602
- [04 · 右侧面板 / 窄窗左栏收起与加宽分栏（Split Diff）](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=162-11092) · 162:11092
- [05 · 右侧面板 / 点击「+」空新增与新标签页（New Tab）](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=162-13070) · 162:13070
- [06 · 右侧面板边界态 / 浏览器报错·元素拾取·还原确认·多 Git 范围隔离](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=162-11604) · 162:11604
- [07 · 三栏联动规则与组件规范 / 动态 Tab·新标签页(+)·外部打开·快捷键](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=162-11735) · 162:11735

### settings（10）

- [04 · 设置总览标题](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=177-23171) · 177:23171
- [01 · 设置 / 外观](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=177-21069) · 177:21069
- [02 · 设置 / 模型](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=177-21363) · 177:21363
- [03 · 设置 / 助手](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=177-21846) · 177:21846
- [04 · 设置 / 工作区](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=177-22300) · 177:22300
- [05 · 设置 / 数据与关于](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=177-22744) · 177:22744
- [06 · 设置 / 液体切换动效规范（Liquid Subnav）](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=180-23451) · 180:23451
- [07 · 设置 / 导航栏停靠规范（macOS Dock 居中 · 启动器置末）](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=186-23827) · 186:23827
- [08 · 设置 / 系统启动菜单（Win+X 式浮层）](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=188-24802) · 188:24802
- [09 · 设置 / Dock 悬浮预览与 Chela 表情态](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=197-26522) · 197:26522

