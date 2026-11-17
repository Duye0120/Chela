# 2026-11-16

## 修复 Windows 开发启动路径

- 改了什么：`package.json` 的 `shell:dev` 最后一步改为 `.\native\bin\Chela-dev.exe`，修复 npm/pnpm 在 Windows cmd.exe 下把正斜杠路径解析为 `native` 命令导致启动失败。
- 验证结果：提取脚本中的实际启动命令，在带空格的临时目录放置无副作用的 `where.exe` 替身，通过 Windows cmd.exe 执行并断言返回 0、找到 cmd.exe；未启动真实 Chela。
- 未做：未重复构建或运行业务测试，未提交推送；实际窗口行为仍由用户启动验收。

## 接通统一设置入口

- 改了什么：系统菜单原“设置”是禁用占位，现已接到全局设置弹窗；在任一工作区可用菜单或 Ctrl+, 打开。整合已有模型配置、关注与陪伴、扩展/MCP 入口和导航栏位置，复用原配置表单及后端，不新增未实现的外观/字体选项。
- 设置中的模型保存后通知已打开的聊天重新读取快照和模型列表；保留 cursor 检查，避免较旧响应覆盖新状态。重复挂载模型面板改用 useId，避免向量模型字段 ID 冲突。关闭内层模型弹窗不会连带关闭外层设置。
- 依据：按 chela-ui-guidelines 复用 token/控件；modern-web-guidance 的 dialog 指南要求 “Use the native `<dialog>` element”，沿用 showModal、原生 Esc/焦点处理、显式标题/关闭按钮和既有滚动隔离样式。
- 验证结果：前端 TypeScript、diff 格式检查通过；使用现有 esbuild 与 React 服务端渲染作一次性断言，确认设置项渲染、模型面板并存时字段 ID 唯一、label/ARIA 引用有效。此检查不启动窗口，不调用实际 API。
- 未做：未自动操作用户窗口，未重跑 build 或后端业务测试，未提交推送；实际菜单、快捷键及保存交互待桌面验收。嵌入桌面的前端需要重新编译启动才能更新。

## 按 Figma 重做设置工作区

- 时间：2026-11-16 09:42 +0800。
- 为什么改：上一轮把已有配置拼成弹窗，没有按用户的 Figma 参考实现。本轮替代上述弹窗，改为正式设置工作区。
- 设计依据：Figma `COT3jrWrT1ZzmhfsuY7LR7` 的设置页 `11:320`，对照外观 `177:21069`、模型 `177:21363`、助手 `177:21846`、工作区 `177:22300`、数据与关于 `177:22744` 的截图和结构；复用项目 token、Sidebar、SettingsSubnav 和表单控件，采用参考图标。
- 改了什么：
  - 五类侧栏、44px 分段导航、居中 780px 内容列、分组卡片和窄窗口布局；菜单及 Ctrl+, 跳转到设置工作区，顶栏显示当前分类。
  - 外观接入参考稿的 10 套配色、明暗模式、字体字号、Dock 位置和减弱动态效果，并校验和持久化本机偏好。
  - 模型页以供应商列表呈现，按需展开既有配置表单；保留实际默认模型及按用途绑定。助手页按三列策略、规则、记忆、技能、MCP 分段呈现，复用原面板及错误处理；人格与陪伴在规则卡片中展开。
  - 数据页显示真实归档会话，可恢复或确认后删除。尚未迁回的规则文件、统一权限切换、浏览器、代理、更新等能力明确标注，不用参考图中的示例数据冒充真实状态。
- 交互依据：按 modern-web-guidance 的 tabs 指南，分段滚动使用普通导航和 aria-current，不把页内跳转标为 ARIA tabs；保留焦点样式、横向导航溢出及减弱动态效果处理。
- 验证结果：
  - 经用户明确授权，在独立临时 profile 的浏览器预览中对照 Figma 截图，未操作用户正在使用的窗口或正式业务数据。
  - 验证五分类、Ctrl+,、分类搜索、分段滚动、主题保存、Dock 切换、临时模型配置及用途保存、归档恢复，以及往返设置后聊天草稿保留；外观偏好无效 JSON、非法预设及字号的断言通过。
  - 1468px 和 720px 截图/布局检查无横向溢出，无缺失图片。最终页面控制台仅有 favicon.ico 404，无业务脚本错误。
  - 最终前端 TypeScript 和 diff 格式检查通过。复核中 Windows 提交内存接近上限，编译器曾报内存分配/栈错误，浏览器曾报 ERR_INSUFFICIENT_RESOURCES；关闭临时浏览器后，设置进程级 GOMAXPROCS=2 重跑类型检查通过，并重新完成页面截图核验，未修改系统或项目资源配置。
  - 关闭临时浏览器与服务，确认 5189 无监听，预览 chat-dev 子进程已退出。截图保留在 `output/playwright/settings-*.png`。
- 未做：未重建桌面可执行文件、未跑完整 Build/Test/Lint，未验证真实上游模型请求、MCP 连接和参考稿中尚未迁回的能力；未提交推送。

## 统一对照 Figma 复核桌宠与工作区

- 时间：2026-11-16 09:57 +0800。
- 用户要求：发现小人展开态也未按稿实现，统一重新对照设计；本轮保持业务代码只读。
- 结果：九个区域盘点 100 个顶层画板/规范/标题帧，核对实际渲染和源码，整理 17 项主要偏差。桌宠的品牌图标放大、矩形操作卡、静态表情、上方气泡和点脸直接开主窗均不符；日历整页文档、Browser/Diff 工作区、聊天结构化运行态、笔记空块、看板详情、终端会话管理、五类设置和动效仍有缺口。上一轮设置结论仅能表示部分骨架接近，不代表整体按稿完成。
- 交付：[完整对照清单与画板目录](../../reviews/2026-11-16-figma-audit.md)；`output/figma-audit-2026-11-16/` 保留 27 张 Figma 参考图和 25 张当前截图。
- 验证：主要页面使用独立临时 Go profile；桌宠、终端窗格和聊天审批用临时浏览器宿主/快照 fixture 检查实际 React/CSS，未操作正式业务数据、未发真实模型请求、未启动 CLI。临时浏览器/服务已关闭，5189 可重新绑定，chat-dev 子进程已退出。
- 未做：未修改业务代码、未重建桌面 EXE 或运行完整 Build/Test/Lint、未提交推送；预览工具按需编译并启动临时 chat-dev。原生穿透、多屏、真实 CLI 和外部服务并未验收，不能以 fixture 结果替代。

## 按设计稿调整工作区与小圆脸

- 时间：2026-11-16 10:55 +0800，实施中。
- 授权：用户要求开始调整；沿用本任务的本地临时浏览器核验授权，不操作正式窗口与业务数据。
- 已调整：
  - 桌宠恢复独立 60px 圆脸、16×52 贴边条和侧边 300×120 气泡，晨报包络 345×246；Go 宿主扩大至 480×360，命中区域按实际可见布局计算。轻碰回应与进入会话分离，原有投递确认、错误反馈和动作入口保留。
  - 用户追加 Grok Bot 参考后，圆脸改为统一的黑色形体与七种眼睛表情；用代码实现视线跟随、待机眨眼和轻碰回弹，响应系统及应用的减弱动态设置。依据官方设计说明 https://x.ai/news/designing-grok-bot 参考形体与状态表达，不引入第三方头像库。尺寸、气泡和贴边关系仍取自 Figma。
  - 日历详情改整页块文档，保留日历视图和筛选；自动保存串行化，失败保留草稿并提供恢复。笔记中间空行不再重复提示，保留原 Markdown。
  - 看板默认详情改为信息/进展面板，显式进入原编辑表单；执行工具和关联落点读取真实持久记录。卡片缩短展示内部 ID，同时显示状态。
  - 终端同任务的窗格归组，重命名写入 Go 偏好并在重启后恢复；分屏针对当前窗格，分隔条可拖动及键盘调整，放大/还原保留进程。终端读取代码字体设置，结束进程前确认。
  - 各工作区补路径信息；对话侧栏支持暂时展开和持久化宽度，拖拽具有全窗口遮罩和取消清理。Dock 延迟 180ms 显示真实访问页面缩略图，Chela 左键表情、右键系统菜单；自动隐藏、延迟和图标互动设置接到实际行为。
  - 设置子导航加入 340ms 液体过渡和快速切换取消；长期记忆复用原业务表单直接在设置中管理。聊天复用 Markdown 块与代码差异呈现，审批移入消息流，保留现有逐次审批语义。
- 当前验证：
  - 前端定向 TypeScript 检查通过；Go 的 work/terminal/pet 三包既有检查 12 项通过。补充现有检查中的名称校验与重启恢复、详情来源及不存在任务断言，定向检查通过。
  - 临时真实 Go API 验证日历文档自动保存与恢复原标题；浏览器 fixture 验证圆脸尺寸、左右侧气泡包络与命中区域、点脸不调用 Pet.Open、七态眼形及减弱动态停止跟随。
  - 浏览器验证 Dock 菜单语义、缩略图来自实际工作区、笔记提示不重复、侧栏暂时展开与键盘调整；终端 fixture 验证四窗格只显示一条会话、拖拽比例变化、放大还原、重命名及 xterm Resize 调用。
  - 本轮截图暂存 `output/figma-adjustment-2026-11-16/`（收尾时汇集）。按 modern-web-guidance 的 motion、natural-interactions、css-layout 指南处理减弱动态、取消与最小尺寸；“Always respect reduced motion preferences.”。
- 待完成：继续核验聊天、终端与五类设置的剩余差异，并在复核表逐项记录实际完成程度；Browser/Diff 等缺失能力尚不能算已完成。未重建桌面 EXE，未验收原生穿透、多屏、真实上游与用户正式数据；未提交推送。

## 收尾本轮 Figma 调整与分层核验

- 时间：2026-11-16 12:05 +0800。
- 为什么改：继续执行统一对照后的修正，避免只有视觉占位和不真实的“已连接”状态。
- 改了什么：
  - 右侧增加独立 Browser/Changes、真实多 Git 差异读取、单/分栏和引用。Go 仅按当前项目限定仓库/路径，读取禁用仓库外部过滤器和 textconv；浏览器页无 Go RPC 权限，使用独立 session。原生主窗改为 MyGo Content + 主 WebView，桌宠打开落点跟随主 Page。
  - 聊天增加结构化工具状态、流内审批和按当前会话/工作区限定、进程退出失效的文件写入放行。附件经过 MIME/大小/像素/模型能力校验，历史正文按需读取；图片和文本真实送达 Pi。为避免未打包的 SDK 图片 worker 令图片丢失，在已有 Go 上传上限下关闭 SDK 自动 resize，代码注明升级条件。
  - 接入默认思考强度、上下文自动整理/阈值；新增图片能力声明。自定义模型表单回填非密钥字段，空密钥可保留原值，换地址不能沿用旧密钥。
  - 默认工作目录由 Go 保存，实际用于新对话；编辑器/四个快捷键、多 Git 开关/深度、本机页面快捷入口、元素拾取偏好接入真实入口。归档支持标题/分组过滤和确认后范围清空，失败刷新，取消不删除。
  - 晨报使用投递事实快照展示安排、昨日完成/遗留，底部动作固定；复核普通 300×120 / 晨报 345×246 / 圆脸 60×60。
  - 补齐侧栏键盘焦点保持、页签关闭后焦点恢复；修复开发热更新重复创建 React root。清掉本轮已停用的六张头像 SVG，不引入依赖或锁文件变化。
- 涉及文件：`native/frontend/src/workspaces/{preview,chat,settings,pet,terminal,calendar,board,notes}/`、`src/{app,ui}/`；`native/internal/{browser,git,chat,companion,pet,terminal,work}/`、`native/main.go` 与 `native/cmd/chat-dev/main.go`。详见 [逐项复核与剩余项](../../reviews/2026-11-16-figma-audit.md)。
- 验证结果：
  - 定向 TypeScript、diff 格式通过；work/terminal 12 项、chat 附件/审批 2 项、Browser/Git 2 项、晨报 1 项及主包编译通过。新增非平凡边界使用小型真实临时 Git 检查，扩展既有附件、授权、名称和晨报断言；未新增依赖/测试框架。
  - 临时 Go API 验证默认目录生效、两仓库真实差异、模型默认保存、归档筛选删除及取消；浏览器验证端口偏好保存/移除、手动激活页签、快捷键、Delete 后焦点恢复、元素引用与隐藏调用、附件草稿保留。
  - 1468px/720px 页面核验，720px 设置无横向溢出；收尾聊天及多 Git 新页面无 pageerror。历史工具日志含刻意制造的失败响应、开发热更新及早期 fixture 未接桥错误，不将这些日志声称为全程无错。
  - `output/figma-adjustment-2026-11-16/` 汇集 19 张截图。图片、晨报、终端和聊天运行态截图中的临时示例均在复核记录标明来源。
  - 按用户指定 modern-web-guidance 的八份相关指南逐项核对，原文短引与应用记录在复核文档。没有执行 legacy-scan。
- 未做及剩余：
  - 未完成文件还原、快速模式/统一权限、全局规则、统一代理、诊断导出/日志、供应商启停/延迟测试、自动更新、持久业务编号及完整来源徽标；不能把 17 项全部标记完成。现有入口明确状态，未用前端选择器冒充后端权限。
  - 未重建桌面 EXE、未运行完整 Build/Test/Lint、未验收真实原生 WebView、穿透/多屏、外部 CLI 与真实上游；未提交推送。为验证图片链路曾运行定向 agent bundle 脚本；预览按既有 chat-dev 插件编译临时 helper。
- 清理结果：临时浏览器和 Vite 已关闭，默认目录已在临时 profile 中清空。临时 Git 测试目录的递归删除被自动审批以 `blocked by policy` 拒绝，未重试绕过，目录保留在 `C:/Users/user/AppData/Local/Temp/chela-figma-git-8b4eb4644dcc408d83076e27f8b50df1`。

## 按 Figma 收尾聊天与主题，转为逐步调整

- 时间：2026-11-16 13:33 +0800。
- 为什么改：用户指出主题切换后设置子导航仍是固定蓝色、聊天没有认真对照 UI。实施期间用户最新要求改为逐步调整，本轮完成已动手范围后停止，不再追加剩余功能。
- 改了什么：
  - 子导航边框、混色底色、光晕和液体轨迹跟随当前主题；根节点同步 color-scheme。保留选中态文字/形状及减弱动态。
  - 重新读取 Figma 的聊天、输入框状态、附件/引用、模型和权限规范，统一 760px 内容、消息间距、流内审批、思考折叠、132px 空态/96px 常规输入框、52px 附件卡和 hover 预览。运行中主按钮为停止，保留补充与排队；上下文环提供语义进度及实际用量/整理入口。修复悬浮提示挡住模型按钮。
  - 附件增加真实读取进度与受限 DOCX 正文提取；@ 接入项目文件/目录及网页文本，项目与仓库菜单使用真实记录，共享仓库选择。保留上传、模型图片能力、路径和总量边界。
  - 已开始的相关接口收尾：每轮冻结权限/规则版本，接入全局规则编辑、项目规则/自动记忆、显式快速能力与优先参数；供应商启停与只读连通探测；Go 管理代理与私有本机模型转发；健康/诊断导出/发行状态查询。没有自动更新安装或通用导入供应商编辑器。
  - 已开始的 Git 还原收尾：先预览、确认与保存 ZIP 备份，再按指纹复核；拒绝过期计划，多仓总览禁用全部还原。保留错误反馈和备份位置，未操作本仓库文件来测试还原。
- 涉及文件：`native/frontend/src/{ui,workspaces/chat,workspaces/settings,workspaces/preview}/`、`native/internal/{chat,network,git}/`、迁移 `017.sql`、`native/agent/{chat,network}.mjs`、`native/main.go` 及预览 RPC 分发；详细边界与截图见 [本轮复核](../../reviews/2026-11-16-figma-audit.md)。
- 验证结果：
  - TypeScript 与 diff 格式通过；4 项 chat 定向检查通过，文档边界收尾后相关 1 项重跑通过；network/git/browser/主包共 3 项检查通过。只生成必要的定向 agent bundle，没有完整桌面构建、全量测试或新依赖。
  - 临时 profile 浏览器实测发送文本/图片、模型与权限菜单、快速开关、@ 项目文件、附件预览、上下文弹层、规则保存重载、代理保存重载、供应商连通与启停、健康检查及诊断下载。假上游确认 priority 和图片收到，不冒充真实服务验收。
  - Figma 对照核验空态输入框 760×132、附件 52×52、模型菜单 640×401.3、审批卡宽 760。运行/审批视觉状态另用响应 fixture 标明；1468px/720px 无页面横向溢出。临时 Git 取消确认默认聚焦取消，Esc 不还原。
  - 森林/紫色/经典主题选中边框实际分别变为对应绿/紫/蓝。9 张截图保存在 `output/figma-chat-2026-11-16/`；modern-web-guidance 的新增 color、dark-mode、progress 应用及短引在复核文档记录。
  - 临时浏览器、Vite、本机假上游关闭，5189/45999 可重新绑定，chat-dev 已退出。未重试此前被策略拒绝的临时 Git 目录删除。
- 未做：未重建桌面 EXE；未验收原生 WebView/窗口、真实上游、真实 CLI、原生文件/日志打开、所有代理协议与设计稿全部状态；未提交推送。不将本轮说成 17 项全部完成，按用户最新要求在此停止。

## Figma 共用组件页排版整理

- 时间：2026-11-16（Asia/Taipei）。
- 按用户最新要求先整理排版，后续组件设计等待共同调整。
- 将「09 · 共用组件」现有节点归入六个 Section：桌面基础组件、对话与输入、设置导航、模型选择、权限选择、会话操作；统一分区间距与对齐，归置散落的重命名状态。
- 权限组件按 Ask / Auto / Full 三列排列，收起与展开上下对应；压缩模型组件集与会话状态集的多余空白，保留菜单向外展开空间及现有节点 ID。
- 用户明确排版优先之前，已将模型选择两个主组件的字体绑定至现有 Noto Sans SC 变量，触发器宽度统一为 154px，并加入两个关联实例的对照框。其余视觉调整未继续。
- 验证：Figma 整页截图核对分区及遮挡；顶层为 6 个 Section，无散落节点。模型对照为可编辑实例，非图片。
- 链接：https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=27-320
- 未做：未修改应用代码，未运行 build/check/test，未验证原型播放或所有业务页面实例；未提交推送。后续与用户一起调整。

## Figma 会话右键菜单层级修正

- 时间：2026-11-16（Asia/Taipei）。
- 根据用户截图，将 SessionRowActions / Chela 的 Context 状态内右键菜单移到最后绘制，覆盖置顶和归档按钮，修复归档按钮在菜单上层的问题。
- 保留节点 ID、绝对定位、菜单位置和交互；未改应用代码。
- 验证：确认菜单为最后一个子节点，并截图检查组件集。未验证原型播放，未运行 build/check/test。
- Figma：https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=149-196

## Figma 模型分类补充品牌图标

- 时间：2026-11-16（Asia/Taipei）。
- 在用户选中 Popover / 模型与思考强度（109:6）的左栏 Claude 下方加入 OpenCode、Magpie；沿用 32px 按钮、8px 间距，图标高度 18px，保留品牌比例。
- 使用官方 SVG：OpenCode https://opencode.ai/brand/files/opencode-logo-light.svg；Magpie https://raw.githubusercontent.com/yetone/magpie/main/build/icon/magpie-small.svg。Lucide 不收录品牌 Logo，未用通用图标冒充品牌。
- 验证：640×401 弹层截图检查，新增图标为可编辑矢量，均在左栏范围内。
- 未做：未添加模型筛选交互，未改应用代码或其他独立页面稿；未运行 build/check/test，未提交。

## Figma 补齐模型键入检索状态

- 时间：2026-11-16（Asia/Taipei）。
- 基于用户选中的 109:6 弹层制作默认、聚焦、关键词结果、结果悬浮、切换选中、无结果六态完整对照，另补清空后保留新选模型的内部恢复态。保留 OpenCode、Magpie 品牌入口。
- 复用现有 640×401 弹层与语义颜色，新增焦点描边、输入光标、关键词加粗、清空按钮、空态文案。悬浮与当前模型选择分别呈现。设计为当前分类内即时筛选，不增加逐字请求的加载动画。
- 主组件集 291:586，评审实例板 291:652；归入「07 · 模型检索状态与交互」。组件源在实例板下方，均为可编辑文字/矢量，未使用整页图片。
- 原型示例：点击默认搜索框进入聚焦，G/X 示例按键进入 gpt/xyz 状态；Sol 悬浮与退出、点击选中、清空及 Esc 清空已配置。清空 Selected 指向仍勾选 Sol 的恢复态。
- 验证：六态整板及清空恢复态截图核对；保留 Noto Sans SC / Inter 原有字体组合，7 个组件变体、6 个评审实例，无图像填充。
- 边界：原型是固定关键词状态演示，不是真实任意输入搜索；再次 Esc 关闭是设计说明，未接入宿主弹层关闭；未播放验收原型，未修改应用代码，未运行 build/check/test，未提交。
- 查看：https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=291-652

## Figma 思考强度悬浮 UI

- 时间：2026-11-16（Asia/Taipei）。
- 按用户截图补齐六档思考强度的 hover。新增 EffortOption 四态组件：默认、悬浮、已选中、已选中悬浮；使用现有 hover 色、36px 行高、6px 圆角，已选中悬浮保留勾选。
- 源弹层与七个检索变体共 48 行接入组件实例，保留原有行 ID、文本与选中档位；六态检索对照实例同步继承。
- 配置鼠标移入/移出及 120ms 淡入淡出；仅悬浮不修改强度。
- 新增「08 · 思考强度悬浮」分区，展示四态及 Ultra 悬浮 / Medium 选中悬浮两个完整弹层。
- 验证：整板截图、六档名称与 216×36 行尺寸、四个变体的交互和勾选存在性检查通过。无图片填充，沿用 Noto Sans SC / Inter 字体。
- 未做：未播放验收原型，未实现点击切换强度的业务，未改应用代码、未运行 build/check/test、未提交。
- 查看：https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=294-861

## Figma 基础间距落地规范

- 时间：2026-11-16（Asia/Taipei）。
- 在基础规范补充「02B · 间距落地规范」（297:5），保留原有间距数值表并增加引用。新增按钮 8px 正例/0px 反例、工具栏组内8/组间16、换行8、表单标签4/行距16、菜单和页脚操作示例及实施检查。
- 使用既有间距与颜色变量，没有新增 token；明确独立按钮不得粘连，分段控件和连续菜单是限定例外。规范用按钮为共享组件实例。
- 同步稳定规则到 `.agents/skills/chela-ui-guidelines/SKILL.md`，防止后续实现只看数值表而忽略场景间距。
- 验证：1468×1128 整板截图检查，正例 gap=8、反例 gap=0、操作组与表单 gap=16；现有变量绑定有效。
- 未做：未批量修改所有业务页面或应用 CSS，未运行 build/check/test，未提交。
- 查看：https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=297-5

## Figma Button / Select 基础组件规范

- 时间：2026-11-16（Asia/Taipei）。
- 共用组件页新增「09 · Button 基础组件」「10 · Select 基础组件」，主组件与评审实例分离，配套类型、尺寸、间距、交互说明。
- Button：Primary / Secondary / Ghost 三类 × Default / Hover / Pressed / Focus / Disabled / Loading 六态，共18变体；另展示27/32/36/45px尺寸。绑定既有语义颜色与圆角、间距，深色主按钮焦点增加内侧反差环，加载保持宽度。
- Select：未选择、默认、悬浮、焦点、禁用、错误、展开、切换选中、无选项9态；选项4态独立复用。明确选中勾选、hover底色、禁用、错误说明与菜单间距。示例值固定于状态，避免原型切换保留旧的文本覆盖。
- 原型配置：Button鼠标移入/移出/按下/释放；Select默认展开、点击第二项更新、再次点击触发器收起及Esc取消。完整键盘与业务行为仅记为实现约定。
- 验证：两块整板截图与修正后复核通过；Noto Sans SC、可编辑文字/矢量，无整页图片填充。修复主按钮焦点不明显和Select示例值继承问题。
- 边界：未播放验收原型；加载动画、提交业务、完整键盘与原生WebView视觉兼容未实现；未改应用代码，未运行build/check/test，未提交。
- Button：https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=299-936
- Select：https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=300-984

## Figma Input 输入框状态规范

- 时间：2026-11-16（Asia/Taipei）。
- 共用组件页新增「11 · Input 基础组件」：空值、已填写、悬浮、聚焦、禁用、只读、错误、错误聚焦八态；提供 Label / Value / Placeholder 文本属性与评审实例。
- 标签与帮助/错误文字纳入示例；统一输入框32px、圆角6px、水平padding8px、标签/帮助间距4px、表单行16px、相邻按钮8px。区分禁用与只读，错误聚焦保留错误说明。
- 配置已填写到悬浮/聚焦、错误到错误聚焦的示例；说明键盘、中文输入法、复制、长文字与校验保留输入的实现约定。
- 验证：1256×1232整板截图检查，八态输入区域均为280×32，聚焦描边2px且不改变外部尺寸；Noto Sans SC，无图片填充。
- 边界：光标和文本为静态状态设计，未播放验收原型，未实现真实输入/校验，未改应用代码，未运行build/check/test，未提交。
- 查看：https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=304-1008

## Figma 基础表单控件成套补全

- 时间：2026-11-16（Asia/Taipei）。
- 按用户要求补齐 Checkbox / Radio / Switch，并以整套基础表单复核代替只修孤立状态。
- Checkbox三种值×默认/悬浮/按下/聚焦/禁用，共15变体；Radio两值×五态10变体；Switch两值×五态10变体。禁用保留当前值，无任何反应；半选点击进入全选；Radio已选不直接取消。共35变体，均216×32点击行。
- Checkbox/Radio16px，Switch沿用现有36×20轨道与16px滑块。复用语义色、字体、间距；增强未选状态hover/pressed填色及独立焦点环。
- 增加六类基础控件同屏组合稿307:1105；同步Select值文字为14px，与Input/Button一致，统一辅助文字颜色。稳定的成套维护与组合复核要求写入chela-ui-guidelines。
- 验证：三块完整矩阵及组合稿截图，相关视觉修正后再次复核；35变体尺寸一致，所有禁用变体reactions=0；可编辑文字和矢量，无整页图片。
- 边界：本轮覆盖六类基础表单设计，不宣称全应用或所有组件已修复。原型为单控件示例，未播放验收；Radio组级联动、键盘及业务仍待接入；未改业务源码、未运行build/check/test、未提交。
- Checkbox：https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=306-1292
- Radio：https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=306-1429
- Switch：https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=306-1544
- 组合稿：https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=307-1105

## Figma 全页间距与状态巡检

- 时间：2026-11-16（Asia/Taipei）。
- 范围：检查现有14个页面，按基础间距规范修正发现的独立操作组；仅改Figma设计稿，应用源码保持不动。
- 将78处操作布局容器绑定到既有gap/sm（8px），覆盖基础主题示例、会话重命名、看板内终端、日历工具栏/翻页、笔记新建、终端分屏、右栏操作、共用组件和桌面助手。重命名操作组改为随内容适配宽度。
- 设置页29处标题/说明与操作区绑定gap/lg（16px），避免SPACE_BETWEEN在空间用尽时没有最小间距。
- 修复右侧面板两处选中会话底色缺失、一处已激活拾取按钮底色缺失；五处新标签页默认/悬浮圆角统一6px；七组引用/还原操作等高27px，确认还原弹窗两按钮等高32px。
- 共用组件两个空输入发送按钮对齐基础Button禁用语义色，去掉整组透明度叠加，图标使用禁用前景色；关联实例随主组件同步。
- 保留系统窗口按钮、分段控件、连续菜单、日历网格、颜色样本、信息标签和间距规范中的错误示例；不将所有小于8px的内部间距机械改大。
- 验证：修改的操作组和设置标题容器横向溢出检查通过；10处代表性整板/局部截图覆盖全部改动页面，未见新增挤压或粘连。其余页面完成结构检查，未发现本轮需修改的独立操作间距问题。
- 边界：截图为代表性检查，并非每一画板逐张验收；未播放全套原型，未将所有旧Frame替换成新组件实例。旧终端存在不可加载的Maple Mono NF CN字体，本轮只改容器间距，未改字体。
- 未运行build/check/test，未提交。Figma：https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7

## Figma 逐页画板排版整理

- 时间：2026-11-16（Asia/Taipei）。
- 按用户要求继续检查现有14页画板截图，并逐页核对画板重叠、文字越界和容器裁切。
- 修复设计说明两块画板重叠，改为80px间隔；基础间距示例四张卡片统一312px高度，对齐并排底边。
- Window规范说明随内容撑高；导航与展开按钮说明按可用宽度换行，恢复完整文字及左右内边距。
- Input八个状态说明容器随内容撑高；两处品牌文字容器修正高度；权限选择分区收紧多余底部留白。
- 日历两处翻月操作组去掉异常100px固定高度，按26px按钮自然撑高；设置预览导航和缩略图标题去掉异常固定高度，修复内容裁切。
- 设置侧停靠示例收敛到660px父列宽度，内部预览618px，顶栏及内容面板同步调整；Dock示例底栏宽度匹配639px容器。
- 右侧面板两处尺寸示意末列填充剩余宽度，消除15px横向裁切。
- 验证：修改处截图复核，14页顶层画板重叠检查无重叠。保留看板横向滚动区域、菜单弹层及旋转图标等有意越界，不机械压缩。
- 范围：仅Figma布局及本文档；未改变业务内容或应用源码。未播放全套交互原型，未运行build/check/test，未提交。
- Figma：https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7

## Figma 对话发送定位与流式阅读

- 时间：2026-11-16（Asia/Taipei）。
- 用户要求：参考 https://x.com/MananTank_/status/2122007666835009733 调整 Figma 聊天交互；范围仅设计稿，应用源码未修改。
- 沿用对话页既有三态稿，整理为第 22–24 张画板，移到现有内容下方：发送后定位本轮问题、流式增长不自动滚动、结束生成保留阅读位置。
- 三态用户消息起点均为阅读区顶部 28px；阅读列最小高度设为 490px（538px 阅读区扣除上下内边距），补齐短回复预留空间。
- 统一原消息规范卡片的「查看最新回复」名称与规则：末尾在视口外时出现，点击以 200ms 缓动定位一次，后续生成保持阅读位置。更新两处对应原型滚动动作及三态说明；保留已有发送、两秒增长、停止生成连线。
- 验证：发送态、结束态与规范卡片截图复核；三态消息起点与最小高度检查通过，移动后的画板无重叠，规范卡片标题无重叠，滚动动作指向各自回复末尾。
- 边界：未播放验收原型；逐 token 输出、入口随滚动显隐、会话/分支阅读位置恢复和动态高度补偿仍为设计约定。未运行 build/check/test，未提交。
- 查看：https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=354-638

## 对话区按完成版 Figma 还原（含悬浮与阅读定位）

- 时间：2026-11-16（Asia/Taipei）。
- 依据：重新读取 Figma `COT3jrWrT1ZzmhfsuY7LR7` 的「02 · 对话」、基础规范与「09 · 共用组件」；重点核对空态、会话浮层、模型检索六态、思考强度、权限、输入框八态、消息/审批、文件夹菜单，以及 `354:638` 发送后阅读位置规范。复用现有 React、Radix、Button、IconButton、SearchField、Sidebar、SessionRow、Picker 和语义 token，没有增加依赖。
- 改了什么：
  - 对齐 760px 消息/输入列、132px 欢迎输入框、普通输入框两行文本空间、28px 消息起点、8px 独立操作间距。保留字体、字号和颜色跟随现有外观设置。
  - 会话按实际项目路径区分同名目录；置顶留在原文件夹，悬浮只显示置顶/归档，右键保留重命名及删除。支持双击/F2 行内重命名、空值禁用确认、键盘取消与失败草稿。文件夹提供新增聊天、折叠、打开目录、分组名称编辑及移出分组；新对话继承当前目录和分组。分组名称编辑不重命名磁盘目录，移出分组不删除对话或文件。
  - 修复折叠后会话浮层被桌面侧栏样式覆盖的问题；保留按钮与左边缘热区，浮层覆盖正文，尺寸 280×806（1468×914 参考视口），位置 x=52/y=48。浮层菜单打开时保持可操作。
  - 模型弹层对齐 640×401，增加 Figma 的 OpenCode/Magpie 原始品牌资产、关键词加粗、清空入口与空结果状态；Esc 第一次清空、第二次关闭。思考强度保持 36px/8px 行距，hover 不改选中值。修正分类选中底色及鼠标打开时的无意 tooltip。
  - 增加复用的 Tooltip 和 HighlightText；消息显示编辑重发、复制、重新生成入口。重新生成沿用编辑分支 API 和附件读取，不覆盖原对话，并保留图片模型能力校验。
  - 附件卡保持 52×52；图片 hover 为 176px 预览，文档 hover 为紧凑文件名提示，点击才展开正文。完善 @/指令面板和键盘选项语义；上下文灰环、hover 摘要、点击详情及手动整理保留。
  - 新增按 session/branch 保存的阅读位置：新问题一次定位到顶部下方 28px，流式和结束不自动滚动，末尾离开视口时显示「查看最新回复」。点击执行 200ms 单次缓动，减少动态时直接定位，用户滚动/按键可以中止。短回复通过底部留白保持问题可定位。
  - 修正结束生成时先清空流式内容、后载入最终消息引起的位置重置；快照与进度同批更新。修正切换空会话时已卸载节点的 scrollTop 覆盖历史位置；分支菜单使用 session/branch 缓存。
- 涉及文件：`native/frontend/src/workspaces/chat/{chat-workspace.tsx,chat.css,context-control.tsx,context-chips.tsx,project-controls.tsx,tool-activity.tsx,use-reading-position.ts}`；`native/frontend/src/ui/{icon-button.tsx,model-select.tsx,picker.tsx,session-row.tsx,sidebar.tsx,workspace-controls.css,tooltip.tsx,highlight-text.tsx}`；`native/frontend/src/assets/icons/{OpenCode.png,Magpie.svg,OpenAI16.svg}`。
- 验证结果：
  - 用户指定 Chrome；使用独立 Chrome context 与 `127.0.0.1:5197` 的临时 Vite UI fixture，未访问真实桌面 profile、真实项目文件或供应商。文本提交、35 段流式增长及结束、会话位置恢复、@ 搜索、模型搜索/Esc/强度 hover、附件 hover/正文、上下文、右键菜单、重命名、删除确认取消及审批展示均检查；审批卡按钮等高 32px，删除默认聚焦取消。
  - 修复后连续 722 帧记录的 scrollTop 始终为 1831.333px，包含生成结束；切换空会话后返回正确恢复 500px。查看最新回复的末次位移约 195ms，末尾可见后入口隐藏。分支菜单首次与重复展开合计仅 1 次 Branches 请求。
  - 320/375/414/768/1024/1280/1468px 检查无对话区横向溢出；320px 模型弹层宽 304px 且位于视口内。模型分类资产本地文件非空、浏览器实际加载成功；新增 16px OpenAI 资产用于 16px 行内槽位。
  - 定向 `npx tsc -p native/frontend --noEmit`、`git diff --check` 通过；最终 Chrome 无控制台错误或警告。
  - 截图：`output/chat-fidelity-2026-11-16/model-final.png`、`sidebar-peek-final.png`、`approval-final.png`、`context.png`、`narrow-320.png`。截图中的模型、文本、图片和审批为临时数据，不代表真实供应商或原生桥接验收。
- Modern Web Guidance：读取 `interest-triggered-tooltips`、`natural-interactions`、`menu`；保留已安装 Radix 的定位/焦点/关闭机制，不为这次样式调整引入 polyfill。悬浮内容可保持、Esc 可关闭，键盘可访问操作（“never only on hover”）；减少动态设置禁用定位动画。范围内未采用原生 interestfor/focusgroup，未运行 legacy-scan。
- 未做：没有运行完整 Build/Test/Lint，没有新增测试框架、依赖、修改后端或重建 EXE，没有提交推送。原生 WebView、原生选目录/文件管理器、真实模型响应、真实权限执行和完整原型播放仍由后续原生验收确认；上下文只展示已有真实总量，不编造设计示例中的来源拆分。
- 收尾：本轮独立 Chrome 标签页和 5197 临时服务已关闭；保留截图与 UI fixture。工作期间另一路设置页与共享控件修改曾触发 Vite 重载，未改动或回滚这些并行工作；收尾对当前共享代码再运行定向类型与 diff 检查通过。


## 按 Figma 对齐设置页与浮层

- 时间：2026-11-16 17:35 +0800。
- 设计依据：当前文件 `COT3jrWrT1ZzmhfsuY7LR7` 的设置五类主稿（`177:21069`、`177:21363`、`177:21846`、`177:22300`、`177:22744`），基础规范及共用组件中的 Select、Switch、表单组合、液体导航与系统菜单规范；Figma 只读，未修改设计稿。
- 改了什么：
  - 统一设置列宽、侧栏分隔、区块行高、按钮尺寸、主题与停靠预览、选择/悬浮/按下/聚焦/禁用状态。液体导航校准为 32px 容器、28px 胶囊及稿中的标签位置。
  - 助手页使用真实记忆、技能与 MCP 的紧凑列表；新增、编辑、详情、配置复用原管理表单，打开目标记录。保留原生扩展信任提示、规则版本校验、记忆来源/版本与遗忘确认。
  - 模型高级用途与阈值、人设陪伴、规则内置编辑保留在独立入口；默认思考强度使用分段选择，不伪造未配置项或连通状态。
  - 快捷键显示为键帽并用弹窗重录，支持恢复默认；目录与端口改为入口加编辑弹窗。取消目录草稿不影响已保存值，端口继续校验本机地址与数量。代理地址离开输入框或 Enter 保存，测试仍复用原调用。
  - 共享 Select 浮层与触发器等宽、间隔 8px、选项间隔 4px；保留原生键盘/表单语义与不支持 `base-select` 时的系统选择器。系统菜单的主层行高为 34px。
  - 开关文字可点击，权限卡改用原生单选组；弹窗回焦、编辑字段初始焦点与保存冲突反馈保持可用。总览批量还原仍是固定保护，不提供关闭安全约束的假开关。
- 涉及文件：
  - `native/frontend/src/workspaces/settings/`：工作区、样式、列表与编辑入口；新增 `settings-controls.tsx`、`settings-dialog.tsx`、`assistant-resources.tsx`。
  - `native/frontend/src/app/capabilities-panel.tsx`、`mcp-panel.tsx`：支持从设置打开指定条目或新增表单，原独立面板调用兼容。
  - `native/frontend/src/workspaces/chat/memory-panel.tsx`：支持指定编辑/遗忘条目，复用共享 Select。
  - `native/frontend/src/ui/controls.css`、`workspace-controls.css`、`README.md`；`native/frontend/src/app/system-menu.tsx`。
- 验证结果：
  - `npm run check:ui` 通过。
  - 独立 Chrome、1468px、DPR 1 下，五页主要区块的 x/y/宽/高逐项对照 Figma 节点一致（列 x=460.5、宽 780）；外观区块高度 266/179/540，模型 256/256，助手 150/189/256/189/256，工作区 390/323/256/189，数据 376/189/122。
  - 烟测覆盖下拉悬浮、Esc/Tab 保留原值、方向键/Enter、开关 Space、单选组方向键、液体导航与减少动态、深色主题、底部/左侧系统菜单及子菜单、搜索筛选、快捷键/目录取消、端口编辑与边界校验、规则冲突、技能导入/详情与切换、MCP 新增/编辑、记忆编辑/清空取消、归档删除取消。
  - 五类页面在 320/375/414/768/1024/1280/1440px 检查文档、设置滚动区、内容列无横向溢出；最后再次检查 320px。静态图标本地文件非空、加载及显示尺寸核对通过。
  - 截图：`output/settings-2026-11-16/`，包括五类主页面、Select 悬浮、系统菜单/子菜单、深色及编辑弹窗。
- Modern Web Guidance：使用 `branded-select-styling` 的 “Apply appearance: base-select to both” 保留原生选择行为；按 `natural-interactions` 的 “Keep animations on the compositor” 核对液体导航，并保留键盘焦点、Esc 和减少动态。未引入新依赖。
- 验证边界：预览使用隔离 RPC fixture 与临时浏览器存储，证明布局和前端操作，不代表真实供应商/MCP、记忆持久化、安装或本机文件操作已验收。稿中的列表内容由实际数据驱动；既有 Dock 提醒入口等全局壳功能继续保留，未据此宣称整窗像素完全相同。
- 未做：未运行完整 Build/Test/Lint，未重建桌面 EXE，未操作用户正式数据，未提交或推送。原生 WebView2 的字体渲染、缩放和真实业务联调仍由实际桌面验收。
- 收尾：临时浏览器与 Vite 已关闭，5191 端口已重新绑定验证释放。


## 默认宿主切回 Electron，保留 Go 后端与 Pi

- 时间：2026-11-16 20:03 -0800（America/Los_Angeles）。
- 改了什么：
  - Electron 接管主窗、单实例、托盘、关闭模式、桌宠窗口、屏幕与锁屏事件，以及 sandbox WebContentsView 内置浏览器。沿用现有 React 工作区和视觉，只替换宿主检测与窗口拖动 CSS 属性。
  - Go 继续持有业务、数据库、权限、任务、终端与会话；`native/main.go` 改为无新增业务监听端口的 stdio 服务。通过 `internal/desktop` 双向调用宿主；原目录和 URL 校验保留。
  - Pi Agent、私有 Node、worker 协议与 SDK 版本不改，继续由 Go 监督。原 `mygo/netproxy` 独立代理辅助包保留，避免更换宿主时丢失系统代理/PAC 行为。
  - 使用原 `%APPDATA%/Chela` 数据路径和 Go DPAPI 凭据；沿用窗口状态。通过独立临时读取进程导入旧 Electron / MyGo WebView2 的 `chela.*` UI 偏好，只读副本，保留原文件及已有新版值；自定义 profile 不读取正式 WebView2 存储。
  - 默认 `dev/build` 切到 Electron，保留 `dev:web`。分发输出为 `release/win-unpacked/`；Go + 私有 Pi runtime 与前端作为资源打包，Electron 宿主不重复携带 npm 业务依赖。EXE 图标和产品名为 Chela，不签名、不发布。
  - 更新 AGENTS、README 和架构补充说明，v1 包中的旧 MyGo 宿主约定由新说明覆盖，旧证据保留。
- 本轮发现并修复的 EPIPE：临时短命令启动后，GUI 进程继续运行但控制台管道已回收，`console.error` 写入导致主进程弹窗。主进程日志改写 `logs/electron.log`，处理关闭管道错误，致命异常走有界退出；启动脚本等待子进程并验证本次烟测报告。用主动关闭 stdout/stderr 的启动方式复测通过。
- 涉及文件：
  - `native/electron/`：main/preload、Go 进程、browser/pet 宿主、偏好迁移、图标与独立打包清单，另有按需运行的 stdlib assert 烟测。
  - `native/internal/desktop/`、`native/main.go`、Go Browser/Pet、Chat 的项目/文件/诊断系统动作、Terminal 目录选择、Work 退出动作。
  - `native/frontend/src/platform/bridge.ts`、现有聊天与设置页中的宿主检测、`app/shell.css`、`workspaces/pet/pet.css`；保留之前已有的界面和业务修改。
  - `native/scripts/desktop.mjs`、`package.json`、`pnpm-lock.yaml`、`.gitignore`、README、AGENTS、`docs/architecture/electron-host.md` 及架构入口。
- 验证结果：
  - 相关 UI TypeScript 检查、Node 脚本语法检查通过；Go Browser / Network 现有检查通过。
  - `npm run shell:smoke` 通过 9 组真实烟测：隔离 preload 与原界面、两类旧偏好导入与新版值保护、Go 会话与边界校验、Work 数据与关闭设置、真实 pwsh/ConPTY 输入输出/resize/close、Pet 路由与权限隔离、本机网页/视图布局/引用/元素拾取及网页权限隔离、现有工作区和 renderer 错误检查。
  - electron-builder Windows unpacked 打包成功；独立启动实际 `Chela.exe`，验证前端资源、preload、Go 会话创建、工作区、桌宠、关闭控制台管道后的正常退出，以及打包私有 Node/Pi 的 `worker.ready` 握手（SDK 1.5.2），无模型请求。
  - 报告：`output/electron-smoke.json`、`output/electron-packaged-smoke.json`。临时测试 profile 和源码分离，测试后无本次 Electron/Go 进程遗留。打包的宿主 asar 约 44 KiB，不含重复的 npm 依赖；Electron 引擎、Go 和私有 Node 仍单独分发，不能把该大小理解为整个应用大小。
- Modern Web Guidance：查阅 `security`，遵循 “Validate and sanitize the properties of incoming message payloads”，校验消息来源和参数；按 Electron 官方 main/preload/sandbox 指南隔离网页与本机能力。未引入测试框架或测试依赖。
- 未做和验收边界：
  - 未运行全量 Test/Lint；本轮构建与打包用于验证宿主迁移及分发路径，未顺带重构或优化业务。
  - 未接入真实模型、供应商凭据、外部 MCP 或插件进行业务验收；未改动用户正式数据库。物理多显示器、锁屏、拖动/穿透、目录对话框和系统外部打开动作仍需实机验收。
  - 首次运行需退出原 MyGo 版本，避免两个宿主同时恢复同一 profile。内置网页 Cookie/登录状态不跨 WebView2/Chromium 自动迁移，需重新登录，原存储保留。
  - 未制作安装器，未签名、部署、发布、提交或推送。仓库中本轮前已有大量未提交改动，继续保留。


## 修复主题控件状态，并按 T3 Code 重做字体设置

- 时间：2026-11-16 21:22 -0800（America/Los_Angeles）。
- 用户反馈：开关选中是黑色、未选中 hover 却变成主题色；字号菜单逐字换行，字体菜单宽度不足。后续明确要求恢复上周给过的 T3 Code 字体设置方式。
- 参考：找回「完善外观」聊天（`01a1beec-f359-7793-9836-433856d65a62`）中用户提供的 T3 截图和三类字体、真实字体检索、彩色预览要求；核对 T3 当前源码 `90a098bb4b5f22bb9178f1e4d129a0e09bedccbb` 的 `FontFamilyPicker.tsx`、`TypographySettings.tsx`、`SettingsFontPreviews.tsx`。适配现有 React/Radix 和主题 token，未引入 T3 的框架、虚拟列表或预览依赖。MIT 说明保存在 `native/frontend/public/licenses/t3code-MIT.txt` 并随前端分发。
- 改了什么：
  - 将 primary 按钮、开关、单选、选中卡片、分段按钮和焦点状态接回当前主题；action 默认/hover/pressed 从 accent 派生。未选中开关的 hover/pressed 保持中性轨道，选中态维持主题色。前景明暗随预设保持可读。
  - 共享 Select 面板改为按内容扩展、至少与触发器等宽，并受视口限制；为文本、勾选图标与内边距保留总宽度。短字号与字体名不再被强制拆成逐字换行，较长选项仍可在视口限制下换行。
  - 字体区恢复 T3 的「标题/说明 + 字体和字号 + 下方实时预览」结构：界面文字、彩色代码 Diff、彩色终端三组独立设置；增加检索本机字体、键盘选择、空结果、重开清空和单组重置。代码/终端字体列表按实际字宽筛选等宽字体，保留当前值与原有常用候选，系统枚举不可用时仍可选择常用字体。
  - UI 字号 12–20、代码 10–18、终端 8–20，沿用当前默认值。持久化校验支持实际字体名，不再因选择非固定三项字体而重置整份外观配置。旧配置缺少终端字段时沿用原代码字体/字号，保留原显示；此后独立保存。
  - 真实 xterm 改读 terminal 专属变量，字体变化后重新 fit；不会再跟着 code 字体改变。现有进程、终端输入输出与保存逻辑保留。
  - 将三组字体、预览与 Select 文本宽度要求写入项目 UI skill；更新共享 Select 使用说明。
- 涉及文件：
  - `native/frontend/src/ui/controls.css`、`tokens.css`、`README.md`。
  - `native/frontend/src/workspaces/settings/appearance.ts`、`settings.css`、`settings-workspace.tsx`、新 `typography-settings.tsx/css`。
  - `native/frontend/src/workspaces/terminal/terminal-workspace.tsx`、字体预览参考许可与 UI skill。
- 验证结果：
  - 在真实 Electron / Chromium 156 中复现原问题：84px 字号面板每项 4 行、约 100px 高；170px 字体面板将 Maple Mono NF CN 拆为 2 行。修复后字号各项 1 行、36px 高；字体使用 288px 可搜索面板，长字体名完整呈现。
  - 实际读取 142 个界面字体候选、35 个等宽字体候选；验证输入过滤、无匹配提示、Enter 选择、Esc 关闭、重开清空、重置，以及保存后重新加载保留 Segoe UI / Consolas / Courier New。
  - 分别设置 UI 18px、代码 13px、终端 16px，核对三种预览、body/设置标签实际字体与真实 pwsh/xterm 的 Courier New 16px；修改代码字号不影响真实终端。所有操作使用隔离临时 profile，不改用户正式字体配置。
  - 验证 10 套浅深主题的 action/选中卡片与当前 accent 一致，检查开关正常/hover、Radio 选中/hover 和 primary 按钮正常/hover/pressed。
  - 320/375/414/768/1024/1280/1440px 的文档和设置滚动区均无横向溢出。
  - 定向 TypeScript 检查、前端资源生成及 Windows unpacked 打包通过；实际打包 EXE 烟测通过。更新后的包仍在 `release/win-unpacked/`。
  - 报告和截图：`output/settings-controls-2026-11-16/`，含修复前后截图、`after.json` 与 T3 源码定位。额外重复截图时出现一次 GPU 截图超时；此前截图已人工查看，最终操作/样式/持久化指标复测通过，没有将截图超时当成业务通过。
- Modern Web Guidance：`branded-select-styling` 的 “Test layout behavior” 用于核对原生 base-select 内在宽度；保留原生键盘/表单语义和不支持时的系统选择器。`brand-consistent-forms` 的 “Apply the accent-color property” 用于让原生表单状态跟随主题，同时保留现有自定义控件与 forced-colors 兜底。
- 未做：未运行全量测试/Lint，未新增测试框架或依赖；未验证其他操作系统或未安装字体的所有系统回退。保留既有未提交改动，未提交、推送或操作用户正在运行的实例；重启 Chela 后载入新的静态资源。

## Figma 基础控件统一为 26px

- 时间：2026-11-16（America/Los_Angeles）。
- 用户确认：32px 对桌面布局偏高，标准控件改为 26px，以提高信息密度；本轮范围为 Figma 基础组件、基础规范和设置页样例。
- 原因：旧规范同时将 toolbar 32px 和 default 36px 称为默认；设置页保留 27px 独立按钮，分段选择还有 32px 外框 / 26px 选中块，造成混用与视觉高度差异。
- 新增 size/control/26 基础变量及 size/control/form 语义别名。Button、Select、Input 输入区域、Checkbox、Radio、Switch 点击行和 SelectOption 统一 26px，主要控件文字统一 13px / 18px；保留 Checkbox / Radio 16px 图形和 Switch 36×20px 轨道。Input 标签及帮助文字另计，完整字段并非只有 26px。
- 同步七个组件集共 74 个变体、既有组合稿和尺寸说明。将基础规范的四个旧多高度示例替换为共享组件实例；共用组件页 79 个相关实例均为 26px。调整组合稿独立标签，Input / Select 顶边坐标一致。
- 设置页 59 处旧 27/32px 有框控件统一 26px；主题、思考强度、代理三组分段选择的外框和选项均 26px，九处开关增加透明 26px 点击区。保留菜单、导航、列表行和窗口控件各自用途的高度。
- Select 错误帮助文字距输入区 4px，弹层距触发器 8px；保留已有错误、禁用和原型行为。将紧凑表单默认 26px 写入 chela-ui-guidelines，避免后续回到多种默认高度。
- 验证：组合稿、设置外观页、基础规范与 Select 状态矩阵截图复核；74 个变体的控件区域均为 26px，79 个相关实例无高度覆盖偏差，设置行无横向溢出，Radio / Checkbox / Switch 禁用变体仍无交互。
- 边界：未播放整套原型；旧页面中未连接基础库的其他独立 Frame 尚未全文件迁移。应用源码未改，未运行 Build/Test/Lint，未提交推送；旧工程 27/32/36/45px 令牌仍保留，本轮不代表实际应用已同步。
- 组合稿：https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=307-1105
- 设置外观：https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7?node-id=177-21069

## 统一 Dock 与 Windows 应用图标

- 时间：2026-11-16 21:32 -0800（America/Los_Angeles）。
- 原因：Dock 已使用黑圆双白眼的 `ChelaAvatar`，Windows 窗口、任务栏、托盘与 EXE 仍使用从旧碗状头像导出的 PNG。
- 改了什么：
  - 将 `native/frontend/src/assets/icons/Chela24Px.svg` 改为与 `ChelaAvatar` idle 状态相同的圆形、颜色、眼睛位置与倾斜角度；保留透明背景。Dock 的动态表情和交互不改。
  - 从该 SVG 生成新的 512×512 `native/electron/icon.png`，供窗口、桌宠窗口、托盘与 Windows EXE 共用。
  - 新增按需运行的 `native/scripts/render-icon.cjs` / `npm run shell:icon`，使用已有 Electron Canvas 生成图标，内置尺寸、透明边角和主体颜色断言；无新依赖，使用 output 下的独立 profile。
  - Windows 主进程使用与打包配置相同的 `com.chela.desktop` AppUserModelID，保持应用任务栏身份一致。
- 验证：图标生成断言、main.mjs 语法检查和 Windows unpacked 重新打包通过；从实际 `release/win-unpacked/Chela.exe` 提取 32px 图标并查看，确认为新黑圆双白眼；产品名仍为 Chela。校验包内 PNG 与源码 PNG 二进制一致，窗口与托盘继续引用该文件。提取图保存在 `output/app-icon-2026-11-16/exe-icon.png`。
- 未做：未运行全量 Build/Test/Lint；只重新生成图标与 Electron 分发包，没有重建 Go/Pi 或更改用户数据。未操作用户正在运行的实例或任务栏固定项；正在运行的旧实例须重启，旧固定快捷方式可能需要取消固定后重新固定以刷新 Windows 缓存。未签名、发布、提交或推送。

## 代码同步 Figma 26px 表单控件

- 时间：2026-11-16（America/Los_Angeles）。
- 用户要求：先停止继续整理其他 Figma 页面，直接将已确认的 26px 控件设计同步到本仓库代码。
- 新增 --chela-size-control-form = 26px。共用 Button、IconButton、单行 Input、SearchField 和 Select 改用此尺寸与既有 13px / 18px 控制字体；Button / Select 的 small、toolbar、default 映射到统一标准，large 保留显式大尺寸，旧令牌继续服务列表及其他用途。
- 清理设置、字体弹层、聊天审批与输入工具栏、看板、日历、笔记、终端、Browser 地址栏和桌宠操作按钮的相关高度覆盖。设置分段选择去除外框额外 padding / border，内部选项与整组均为 26px；Switch 保留 20px 轨道及 26px 点击区。
- 陪伴表单、记忆范围及排期中的单行 Checkbox / Radio 行对齐 26px，保留原生 input、16px 图形、键盘、禁用与主题色。输入框缩小后，聊天与模型检索清除按钮按容器垂直居中。
- 单行字段通过低优先级 :where 规则限定，保留 Textarea、文档标题、菜单、列表行、窗口按钮及既有 coarse-pointer 规则按用途定高。没有新增组件、依赖、业务状态或持久化逻辑。
- 涉及 13 个 CSS 文件及 ui/README.md；本轮 CSS 差量为增加 59 行、删除 53 行。只在现有文件做局部修改，保留其他本地工作。
- 验证：使用现有 esbuild 对本轮 13 个 CSS 文件做定向语法解析通过，差量审阅通过；没有以静态检查代替实际布局验收。
- 边界：已提出独立临时 Electron UI 验收请求，尚未获得本轮明确授权，未自动操作任何窗口。未运行前端资源生成、Go / Electron 构建、全量测试或 Lint，未提交推送；实际控件像素高度、下拉展开与窄窗口同排对齐仍待运行验收，已有桌面包也尚未更新。
- 依据：沿用 Figma size/control/form 26px 规则；查阅 Modern Web Guidance 的 brand-consistent-forms，保留现有原生表单与 accent-color，不新增皮肤或兼容实现。

## 26px 控件临时 Electron 验收完成

- 时间：2026-11-16（America/Los_Angeles）。
- 授权：用户明确允许使用独立临时 Electron 实例验收；本节完成上一条记录中的待运行检查。
- 生成一次前端资源（npm run shell:frontend）以加载修改后的 CSS，复用已有 Electron 和 Go/Pi 后端程序，没有重建后端或重新打包分发目录。
- 沿用既有隔离 Electron 验收脚本，使用独立临时 userData/provider 目录与自动分配调试端口；只操作该实例。验收结束通过 Work.Quit 正常退出，Electron 进程列表恢复到运行前的五个原有进程，未操作原有实例。
- 结果：设置外观中的 15 个相关控件/容器实测 26px；三组字体按钮与字号 Select 顶边相同，主控件文字 13px / 18px，hover / active / focus-visible 状态高度保持 26px。界面、代码、终端字号 Select 均可展开，选项高 26px、文字不换行；三个字体弹层可展开，抽查的选项高 26px。
- 检查五个设置分类，以及看板、日历、笔记、终端、聊天空数据页面；所抽查工具栏和输入控件均为 26px。设置页在 320、375、768、1024、1440px 宽度下，文档和内部滚动区均无横向溢出。
- 已人工查看浅色字体设置、375px 窄窗口、深色字体设置、看板、聊天截图，未发现本轮造成的裁切或同排错位；本轮验收无需追加代码修正。
- 证据：output/controls-26-2026-11-16/compact.json；同目录保存字体/字号弹层、浅色/深色、窄窗口及工作区截图。脚本复用现有流程，仅为本次验收产物，不新增项目测试依赖。
- 边界：未重建 Go/Pi、未重新打包 release/win-unpacked、未运行全量测试/Lint、未提交推送；本次使用空白临时数据，未发真实模型请求，未验收所有含历史业务数据的页面状态。开发入口已生成新前端资源，已有分发包尚未更新。

## 新增可切换 macOS 外观

- 时间：2026-11-16（America/Los_Angeles）。
- 用户要求：在已确定的紧凑桌面规范上，再增加一个 macOS 风格选项。
- 在现有主题预设中追加 macOS，入口为设置 → 外观 → 主题与配色；复用原有 preset 持久化及浅色 / 深色 / 系统模式，不新增一套偏好配置。主题数量改为按列表显示，当前为 11 套。
- 新增隔离的 macos.css：浅灰侧栏、白色内容面与蓝色强调、轻按钮阴影、原生式分段选择，以及底部浮动 Dock；深色使用独立中性灰层次和蓝色强调。所有样式只在 data-preset=macos 时生效，保留用户字体选择、26px 表单高度和窗口控制逻辑。
- applyAppearance 同步当前 preset 标记，为 macOS 深色选择可读蓝色，并把背景与文字色交给主题样式，避免内联旧颜色覆盖；切回原主题后恢复原有外观。补充 HTML color-scheme 元信息，沿用根级 color-scheme 与现有系统明暗 change 监听。
- 验证：一次性断言覆盖新主题 ID 唯一、读取保存、浅色、系统深色、切回旧主题与自选字体；CSS 解析、前端资源生成、diff 格式检查通过。独立临时 Electron 验证点击选择、浅/深切换、刷新持久化、系统偏好实时变化、切回旧主题清除 Dock 特效。亮暗主按钮实测颜色对比均 ≥4.5:1，按钮高 26px。
- 320/375/768/1440px 实测文档无横向溢出。复核发现 320px Dock 滚动条和深色图标对比不足，针对性缩小窄窗 Dock 项宽并提高深色图标对比后，复查 Dock scrollWidth=clientWidth，截图通过。首次窄窗断言失败来自测量探针进入正常文档流，改为固定定位探针后再执行，未据此修改生产布局。
- 证据：output/macos-style-2026-11-16/macos.json，同目录保存最终浅色、深色、窄窗与聊天截图；临时实例已退出，原有 Electron 实例保持不动。
- 涉及：native/frontend/src/workspaces/settings/appearance.ts、settings-workspace.tsx、macos.css 及 native/frontend/index.html。
- Modern Web Guidance：dark-mode 的 “place a <meta> tag in your <head>” 用于声明原生 UI 的明暗支持；保留现有根级方案，未添加无关 polyfill 或重写原生表单。
- 未做：未更新 Figma、未重建 Go/Pi 或重新打包发行目录，未运行全量测试/Lint、未提交推送。当前为 macOS 风格外观，保留所在操作系统的窗口控件与宿主行为；原有发行包尚未包含新前端资源。

## Electron 开发入口接入 Vite 热更新

- 时间：2026-11-16（America/Los_Angeles）。
- 用户要求：直接在 Electron 桌面窗口边看边调 UI，React / CSS 保存后生效，不再每次重新构建。
- npm run dev / shell:dev 启动前准备既有 Go / Pi 后，创建本机 Vite 开发服务，再打开 Electron；开发分支不执行前端 build。build / smoke 继续使用原有静态资源流程，不增加依赖或新的业务服务。
- 主窗与桌宠继续使用 chela://app/，仅在未打包的开发环境通过私有协议将资源转发到本次 127.0.0.1 Vite 地址，保留原有 localStorage、隔离 preload 和 IPC 主 frame 校验。发行环境忽略开发地址。
- 开发地址限定 HTTP、127.0.0.1、显式端口与根路径，拒绝凭据、查询和 hash；资源 URL 拼接始终保留该本机 origin，避免双斜线网络路径改写目标主机；禁止跟随转发重定向。
- Vite 使用当前 server.ws 配置和显式 clientPort；每次启动生成 nonce，通过 html.cspNonce 和开发 CSP 放行 React Refresh 前导脚本，CSP 仅额外允许本次本机 WebSocket，没有关闭 webSecurity 或放开任意脚本来源。
- Electron 退出或 Ctrl+C 后关闭本次 Vite；Ctrl+C 标记中断并结束后续启动阶段，不再输出预期退出的异常栈。README 与宿主边界文档同步热更新命令、退出旧实例要求和 main/preload/Go/Pi 修改后重启的边界。
- 验证：Node 语法检查、开发地址/nonce/发行隔离与网络路径断言、diff 检查通过。真实运行完整 desktop.mjs dev，独立临时 profile 下确认 chela origin、隔离 preload、Go Work/Chat 和窗口 IPC 可调用。
- 动态验证：临时在现有 CSS 与 Button TSX 添加唯一探针，窗口立即收到 CSS HMR 与 React Refresh；window 哨兵及聊天草稿仍保留，证明没有整页重载。之后仅移除本次探针，确认界面恢复并无测试标记残留。开发日志未发生前端生产构建。
- 退出验证：Work.Quit 正常退出后本次 Vite 端口不可连接；另外用真实 PTY Ctrl+C 结束开发流程，确认监听端口关闭且无异常栈。所有临时实例已停止，不留下常驻开发服务。
- 证据：output/electron-hmr-2026-11-16/report.json、process.log、desktop-hmr.png 与同目录临时验收脚本。
- 已知边界：React 开发模式暴露原有 ModelSettings 嵌套 form 警告，本轮仅接通开发链路，未改模型表单业务；未发真实模型请求、未运行全量业务测试/Lint或重新打包发行版，未提交推送。
- 参考：Vite JavaScript API https://vite.dev/guide/api-javascript.html、server.ws https://vite.dev/config/server-options#server-ws；Electron protocol.handle https://www.electronjs.org/docs/latest/api/protocol。

## 沉淀执行节奏约束

- 时间：2026-11-16（America/Los_Angeles）。
- 用户反馈：热更新接入耗时过长，要求控制节奏，避免考虑过多。
- 将最小可靠改动、先完成可用闭环、必要验证后及时收尾写入 AGENTS.md；新增改动、实际失败或具体未决风险才触发追加检查，保留必要校验和防数据丢失处理。
- 本轮仅更新协作约定，未改业务代码，未运行构建或测试。

## 撤回本轮 UI 尺寸与 macOS 外观调整

- 时间：2026-11-16（America/Los_Angeles）。
- 用户确认：代码 UI 整轮退回统一 26px 之前，保留 Electron 热更新。
- 按本轮修改前的备份恢复 13 个 CSS 文件，撤回按钮、Select、表单及页面内文字、图标、间距的统一尺寸改动；移除 macOS 主题及其设置入口。
- 已保存的 macOS 主题读取时回落到原有经典主题，保留用户自选字体与字号。撤回未验收的全局 26px 规范，保留先确认页面实际效果再推广的约束。
- 保留 Electron 热更新、后端及其他无关改动；本轮没有修改 Figma。
- 验证：13 个 CSS 与修改前备份逐字节一致，设置页与 macOS 调整前备份一致；外观代码仅增加移除主题的偏好兼容。CSS 解析及字体偏好保留断言通过，Electron 开发入口仍保留热更新配置。
- 未做：未运行 build/check、全量测试或额外启动 Electron 验收；未提交推送。当前视觉效果由用户在开发窗口验收。

## 保存当前仓库代码快照

- 时间：2026-11-16（America/Los_Angeles）。
- 用户要求：停止 UI 讨论和调整，先提交当前代码，后续按用户决定执行。
- 将当前工作区的 Electron 迁移、开发热更新、现有前后端改动、旧代码归档及文档一并保存为本地 Git 提交；不推送，不新增功能或组件拆分。
- 验证边界：核对当前分支、变更概况和提交结果；本轮不运行 build/check、测试或 UI 自动化。本次提交用于保存现状，不表示全量业务已验收。

## 清理未使用代码与旧验收产物

- 时间：2026-11-16（America/Los_Angeles）。
- 用户要求：当前代码提交后梳理并删除不需要的文件。完整清理前快照为 `50b8594`。
- 删除 `history/artifacts/` 中 Git 已跟踪的 23 个旧构建、日志、截图、样稿及临时状态文件；同步历史索引与忽略配置。旧源码、规格和文档仍被迁移资料引用，继续保留。
- 删除没有当前调用方的 `native/agent/agent-loop-guard.ts` 和 `budget-transform.ts`，两者与历史归档逐字节相同；保留归档版本，修正架构文档链接。实际 Pi 循环、Go 上下文校验和代理依赖未修改。
- 删除没有引用的聊天资源 `context-empty.svg`；glob 动态加载的图标和已登记共用组件保留。
- 从 Git 索引移除 `.claude/skills/` 的 90 个重复文件并忽略该路径；本机 junction 和 `.agents/skills/` 唯一源码保持原样，不影响 skill 加载。
- 验证：核对入口与引用、重复文件、Git 删除清单和 skill 链接；未运行 build/check、全量测试或 UI 自动化，未修改 UI 或热更新行为。按用户后续要求保存为本地提交，不推送。
- 执行边界：递归清理命令被自动审批拒绝，仅返回 `blocked by policy`；改用 Git 删除已跟踪、可恢复的文件。未跟踪的旧产物与 `native/bin/Chela.exe`、`Chela-dev.exe` 保留，现用服务、runtime、发行目录和依赖未动。
