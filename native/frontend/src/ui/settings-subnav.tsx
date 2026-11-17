import * as Tabs from "@radix-ui/react-tabs";
import type { ReactNode } from "react";
import "./workspace-controls.css";
import { LiquidNavigation } from "./liquid-navigation";

export const settingsSections = {
  appearance: ["主题与配色", "字体与字号", "导航与窗口"],
  models: ["默认对话模型", "供应商与凭证"],
  assistant: ["执行权限", "规则", "记忆", "技能", "MCP"],
  workspace: ["编辑器与快捷键", "目录与多 Git", "浏览器与端口", "网络代理"],
  data: ["会话归档", "诊断与数据", "关于"],
} as const;

type Props = {
  group: keyof typeof settingsSections;
  value: string;
  onChange: (section: string) => void;
  renderPanel: (section: string) => ReactNode;
  navigationOnly?: boolean;
};

export function SettingsSubnav({ group, value, onChange, renderPanel, navigationOnly }: Props) {
  const sections: readonly string[] = settingsSections[group];
  const active = sections.includes(value) ? value : sections[0];
  if (navigationOnly) return <LiquidNavigation key={group} sections={sections} value={active} onChange={onChange} />;
  return <Tabs.Root value={active} onValueChange={onChange}>
    <Tabs.List aria-label="设置子导航" className="ui-settings-subnav" loop>
      {sections.map(section => <Tabs.Trigger key={section} value={section}>{section}</Tabs.Trigger>)}
    </Tabs.List>
    {sections.map(section => <Tabs.Content key={section} value={section}>
      {active === section && renderPanel(section)}
    </Tabs.Content>)}
  </Tabs.Root>;
}
