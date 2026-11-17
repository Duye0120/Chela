# Chela 基础组件

Vite 编译 React + TypeScript，Electron 加载编译后的页面。基础组件只接收标准 React 属性和回调。导航、持久化与窗口操作由使用组件的页面处理。

| 组件 | 使用场景 |
| --- | --- |
| [Button](button.tsx) | 文字操作，支持 `primary`、`secondary`、`ghost`。 |
| [IconButton](icon-button.tsx) | 只有图标的操作，必须传入中文 `aria-label`。 |
| [Input、Textarea](text-field.tsx) | 单行和多行输入。页面提供关联的 label、校验文案和 `aria-invalid`。 |
| [Menu](menu.tsx) | Radix 菜单、子菜单、单选项和分隔线。Shell 中可参考[系统菜单](../app/system-menu.tsx)。 |
| [Select](select.tsx) | 表单单选。使用原生 `option` 和 `optgroup`，支持 `value`、`defaultValue`、`name`、`required`、`disabled`。用 label 关联。支持 `base-select` 时启用自定义面板，否则沿用系统选择器；面板至少与触发器等宽，并按选项、内边距和勾选图标的总宽度扩展，受视口约束。 |
| [Menu.Choices](menu.tsx) | 在操作菜单或子菜单中嵌入单选组，传入选项、当前值和回调。系统菜单的停靠位置已使用。 |
| [Sidebar、SidebarToggle](sidebar.tsx) | 固定标题及操作区、可选工具区、独立滚动的列表区。开关的 `controls` 对应侧栏的 `id`，两者使用同一个 `open`。 |
| [SidebarGroup、SidebarItem](sidebar.tsx) | 原生可折叠分组、列表行及行尾信息。由调用方提供条目和选中状态（`aria-current="page"`）。 |
| [SearchField](text-field.tsx) | 带搜索图标的原生搜索输入。调用方提供 label 或可访问名称，并处理查询。 |
| [Badge](badge.tsx) | 信息、成功、提醒、错误四种状态。传入可读的状态文字，也可用于列表行尾。 |

[tokens.css](tokens.css) 对应 Figma 的 Chela / Semantic（98 个变量，Light 和 Dark）及 Chela / Window（17 个变量）。颜色、字号与行高、间距、圆角、边框、图标和控件尺寸均按语义取用。默认浅色；在 html 设置 `data-theme="dark"` 可切换语义颜色。浮层通过 Portal 挂到 body，也能读取根变量。字段边界、键盘焦点和小字状态标签有独立的对比度用色。


## 组合组件

以下控件按 [Figma 共用组件](https://www.figma.com/design/COT3jrWrT1ZzmhfsuY7LR7/?node-id=27-320) 实现。它们使用受控值，由调用方处理保存、批准策略和路由。

| 组件 | 接入约定 |
| --- | --- |
| [ModelSelect](model-select.tsx) | 传入模型列表、当前模型与强度，以及选择和收藏回调。模型 ID 在整个列表内唯一。切换模型优先保留兼容强度，否则使用目标模型的默认值或首项，无可用强度时返回 null。可传快速模式和权限选择配置以显示底栏。 |
| [PermissionSelect](permission-select.tsx) | 支持 ask、auto、full，显示各模式的说明和选中标记。选择触发 onChange；可传 onLearnMore 打开说明。 |
| [SessionRow](session-row.tsx) | 支持打开、置顶或取消置顶、归档、删除和行内重命名。更多按钮与右键共用菜单。onRename 可返回 Promise，失败时保留草稿并显示错误。渲染列表时使用稳定的会话 ID 作为 React key。 |
| [SettingsSubnav](settings-subnav.tsx) | group 选择外观、模型、助手、工作区或数据与关于；value 使用 settingsSections 对应组的标签值。onChange 更新选中项，renderPanel 提供对应面板。 |

Figma 的 Theme Presets 由外观设置管理，页面与浮层沿用同一套 Chela 语义 token。

新增控件时先查已有组件和 token。基础组件放在本目录，业务组合放在页面目录。在仓库根目录执行 `npm run check:ui` 可检查前端类型。
