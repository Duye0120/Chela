import { useMemo } from "react";
import type {
  ModelRoutingRole,
  Settings,
  ThinkingLevel,
} from "@shared/contracts";
import {
  formatDateTimeInTimeZone,
  getCommonTimeZoneOptions,
  getSystemTimeZone,
  resolveConfiguredTimeZone,
} from "@shared/timezone";
import { Button } from "@renderer/components/assistant-ui/button";
import {
  ModelSelector,
  type ModelOption,
} from "@renderer/components/assistant-ui/model-selector";
import { FieldSelect, SettingsCard, SettingsRow } from "./shared";

function RoleModelSelector({
  role,
  roleLabel,
  hint,
  modelOptions,
  effectiveModelId,
  configuredModelId,
  onChange,
  reserveHint,
}: {
  role: Exclude<ModelRoutingRole, "chat">;
  roleLabel: string;
  hint: string;
  modelOptions: ModelOption[];
  effectiveModelId: string;
  configuredModelId: string | null;
  onChange: (role: Exclude<ModelRoutingRole, "chat">, modelId: string | null) => void;
  reserveHint?: string;
}) {
  const currentModel =
    modelOptions.find((option) => option.id === effectiveModelId) ?? null;
  const followsChat = configuredModelId === null;

  return (
    <SettingsRow
      label={roleLabel}
      hint={`${hint}${reserveHint ? ` ${reserveHint}` : ""}`}
    >
      <div className="space-y-2">
        <ModelSelector.Root
          models={modelOptions}
          value={effectiveModelId}
          onValueChange={(value) => onChange(role, value)}
        >
          <ModelSelector.Trigger
            variant="outline"
            size="default"
            title={currentModel?.name ?? "选择模型"}
            aria-label={
              currentModel?.name
                ? `当前${roleLabel}：${currentModel.name}`
                : `选择${roleLabel}`
            }
            className="h-9 w-full justify-between px-3 text-[13px]"
          />
          <ModelSelector.Content
            align="start"
            className="min-w-[var(--radix-select-trigger-width)]"
          />
        </ModelSelector.Root>

        <div className="flex items-center justify-between gap-3 text-[12px] text-muted-foreground">
          <span>
            {followsChat
              ? "当前跟随聊天模型。"
              : `当前单独指定为 ${currentModel?.name ?? "未识别模型"}。`}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange(role, null)}
            disabled={followsChat}
            className="h-7 rounded-[var(--radius-shell)] px-2.5 text-[12px]"
          >
            跟随聊天模型
          </Button>
        </div>
      </div>
    </SettingsRow>
  );
}

export function GeneralSection({
  settings,
  currentModelId,
  thinkingLevel,
  canConfigureThinking,
  thinkingHint,
  thinkingOptions,
  modelOptions,
  onModelChange,
  onRoleModelChange,
  onThinkingLevelChange,
  onSettingsChange,
}: {
  settings: Settings;
  currentModelId: string;
  thinkingLevel: ThinkingLevel;
  canConfigureThinking: boolean;
  thinkingHint: string;
  thinkingOptions: { value: ThinkingLevel; label: string }[];
  modelOptions: ModelOption[];
  onModelChange: (modelEntryId: string) => void;
  onRoleModelChange: (
    role: Exclude<ModelRoutingRole, "chat">,
    modelId: string | null,
  ) => void;
  onThinkingLevelChange: (level: ThinkingLevel) => void;
  onSettingsChange: (partial: Partial<Settings>) => void;
}) {
  const currentModel =
    modelOptions.find((option) => option.id === currentModelId) ?? null;
  const systemTimeZone = useMemo(() => getSystemTimeZone(), []);
  const resolvedTimeZone = resolveConfiguredTimeZone(settings.timeZone);
  const timeZoneOptions = useMemo(
    () => getCommonTimeZoneOptions(systemTimeZone, settings.timeZone),
    [settings.timeZone, systemTimeZone],
  );
  const utilityModelId =
    settings.modelRouting.utility.modelId ?? settings.modelRouting.chat.modelId;
  const subagentModelId =
    settings.modelRouting.subagent.modelId ?? settings.modelRouting.chat.modelId;
  const compactModelId =
    settings.modelRouting.compact.modelId ?? settings.modelRouting.chat.modelId;

  return (
    <SettingsCard
      title="默认行为"
      description="聊天、工具和后续角色模型都从这里收口。当前只有工具模型已经正式接入主链。"
    >
      <SettingsRow
        label="聊天模型"
        hint="新会话和后续发送默认会使用这里选择的模型。"
      >
        <ModelSelector.Root
          models={modelOptions}
          value={currentModelId}
          onValueChange={onModelChange}
        >
          <ModelSelector.Trigger
            variant="outline"
            size="default"
            title={currentModel?.name ?? "选择聊天模型"}
            aria-label={
              currentModel?.name
                ? `当前聊天模型：${currentModel.name}`
                : "选择聊天模型"
            }
            className="h-9 w-full justify-between px-3 text-[13px]"
          />
          <ModelSelector.Content
            align="start"
            className="min-w-[var(--radix-select-trigger-width)]"
          />
        </ModelSelector.Root>
      </SettingsRow>

      <RoleModelSelector
        role="utility"
        roleLabel="工具模型"
        hint="commit message、聊天标题等轻量任务会优先使用这里的模型。"
        modelOptions={modelOptions}
        effectiveModelId={utilityModelId}
        configuredModelId={settings.modelRouting.utility.modelId}
        onChange={onRoleModelChange}
      />

      <RoleModelSelector
        role="subagent"
        roleLabel="Sub-agent 模型（预留）"
        hint="当前只保留配置位和 fallback。"
        reserveHint="真实 sub-agent 执行链后续接入。"
        modelOptions={modelOptions}
        effectiveModelId={subagentModelId}
        configuredModelId={settings.modelRouting.subagent.modelId}
        onChange={onRoleModelChange}
      />

      <RoleModelSelector
        role="compact"
        roleLabel="Compact 模型（预留）"
        hint="当前主要用于后续 context compact 路由兼容。"
        reserveHint="未单独配置时会跟随聊天模型。"
        modelOptions={modelOptions}
        effectiveModelId={compactModelId}
        configuredModelId={settings.modelRouting.compact.modelId}
        onChange={onRoleModelChange}
      />

      <SettingsRow label="默认思考强度" hint={thinkingHint}>
        <FieldSelect
          value={canConfigureThinking ? thinkingLevel : "__unsupported__"}
          onChange={(value) => onThinkingLevelChange(value as ThinkingLevel)}
          disabled={!canConfigureThinking}
          options={
            canConfigureThinking
              ? thinkingOptions
              : [
                  {
                    value: "__unsupported__",
                    label: "当前模型不支持单独设置",
                    disabled: true,
                  },
                ]
          }
        />
      </SettingsRow>

      <SettingsRow
        label="时区"
        hint={`当前生效：${resolvedTimeZone} · ${formatDateTimeInTimeZone(new Date(), resolvedTimeZone)}`}
      >
        <FieldSelect
          value={settings.timeZone}
          onChange={(value) => onSettingsChange({ timeZone: value })}
          options={timeZoneOptions}
        />
      </SettingsRow>
    </SettingsCard>
  );
}
