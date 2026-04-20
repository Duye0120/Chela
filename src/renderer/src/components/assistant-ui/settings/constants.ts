import { formatTimeInZone } from "@shared/timezone";
import type { Settings, ThinkingLevel } from "@shared/contracts";
import { THINKING_LEVEL_OPTIONS } from "@renderer/lib/thinking-levels";
import type { SettingsSection } from "./types";

export const SETTINGS_SECTIONS: {
  id: SettingsSection;
  label: string;
  description: string;
}[] = [
  {
    id: "general",
    label: "通用",
    description: "配置应用的默认行为、聊天模型路由与时区。"
  },
  {
    id: "network",
    label: "网络",
    description: "单独管理代理与运行时网络超时，不和通用行为混放。"
  },
  {
    id: "ai_model",
    label: "模型",
    description: "配置提供商鉴权、Base URL与模型目录配置。"
  },
  {
    id: "workspace",
    label: "工作区",
    description: "设置默认工作目录，顺手看规则文件状态。"
  },
  {
    id: "memory",
    label: "记忆",
    description: "管理本地记忆检索、索引模型和向量重建状态。"
  },
  {
    id: "skills",
    label: "Skills",
    description: "管理项目内与用户级 skills，顺手发现可安装的新能力。"
  },
  {
    id: "interface",
    label: "界面与终端",
    description: "应用视觉偏好、代码字号以及终端默认表现。"
  },
  {
    id: "archived",
    label: "已归档会话",
    description: "集中查看、恢复或删除已经归档的聊天记录。"
  },
  {
    id: "system",
    label: "数据与系统",
    description: "查看日志、程序信息和本地系统状态。"
  }
] as const;

export const THINKING_LEVELS: { value: ThinkingLevel; label: string }[] = [
  ...THINKING_LEVEL_OPTIONS,
];

export const THEME_OPTIONS: { value: Settings["theme"]; label: string }[] = [
  { value: "light", label: "浅色" },
  { value: "dark", label: "深色" },
  { value: "custom", label: "自定义" },
];

export const TERMINAL_SHELL_OPTIONS = [
  { value: "default", label: "系统默认" },
  { value: "powershell", label: "PowerShell" },
  { value: "cmd", label: "Command Prompt" },
  { value: "git-bash", label: "Git Bash" },
  { value: "wsl", label: "WSL" },
] as const;

export const SECTION_META = Object.fromEntries(
  SETTINGS_SECTIONS.map((section) => [section.id, section]),
) as Record<SettingsSection, (typeof SETTINGS_SECTIONS)[number]>;

export function parseNumericInput(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function formatArchivedTime(iso: string, timeZone: string) {
  try {
    return formatTimeInZone(iso, timeZone, "zh-CN", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
