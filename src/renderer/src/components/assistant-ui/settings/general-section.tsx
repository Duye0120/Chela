import type { ThinkingLevel } from "@shared/contracts";
import {
  ModelSelector,
  type ModelOption,
} from "@renderer/components/assistant-ui/model-selector";
import { FieldSelect, SettingsCard, SettingsRow } from "./shared";

export function GeneralSection({
  currentModelId,
  thinkingLevel,
  canConfigureThinking,
  thinkingHint,
  thinkingOptions,
  modelOptions,
  onModelChange,
  onThinkingLevelChange,
}: {
  currentModelId: string;
  thinkingLevel: ThinkingLevel;
  canConfigureThinking: boolean;
  thinkingHint: string;
  thinkingOptions: { value: ThinkingLevel; label: string }[];
  modelOptions: ModelOption[];
  onModelChange: (modelEntryId: string) => void;
  onThinkingLevelChange: (level: ThinkingLevel) => void;
}) {
  const currentModel =
    modelOptions.find((option) => option.id === currentModelId) ?? null;

  return (
    <SettingsCard
      title="模型与推理"
      description="这些配置会直接影响新消息默认使用的模型和思考强度。"
    >
      <SettingsRow
        label="默认模型"
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
            title={currentModel?.name ?? "选择默认模型"}
            aria-label={
              currentModel?.name
                ? `当前默认模型：${currentModel.name}`
                : "选择默认模型"
            }
            className="h-9 w-full justify-between rounded-[var(--radius-shell)] bg-shell-panel-contrast px-3 text-[13px] text-foreground shadow-none hover:bg-shell-panel-contrast"
          />
          <ModelSelector.Content
            align="start"
            className="min-w-[var(--radix-select-trigger-width)]"
          />
        </ModelSelector.Root>
      </SettingsRow>

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
    </SettingsCard>
  );
}
