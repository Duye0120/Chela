import type {
  ThinkingLevel,
  ProviderSource,
  ModelEntry,
  Settings,
} from "@shared/contracts";
import type { ModelOption } from "@renderer/components/assistant-ui/model-selector";
import { KeysSection } from "./keys-section";
import { GeneralSection } from "./general-section";

type AiModelSectionProps = {
  settings: Settings;
  currentModelId: string;
  thinkingLevel: ThinkingLevel;
  canConfigureThinking: boolean;
  thinkingHint: string;
  thinkingOptions: { value: ThinkingLevel; label: string }[];
  modelOptions: ModelOption[];
  onModelChange: (modelEntryId: string) => void;
  onThinkingLevelChange: (level: ThinkingLevel) => void;
  onSettingsChange: (partial: Partial<Settings>) => void;
  sources: ProviderSource[];
  entries: ModelEntry[];
  onDirectoryChanged: () => void;
};

export function AiModelSection({
  settings,
  currentModelId,
  thinkingLevel,
  canConfigureThinking,
  thinkingHint,
  thinkingOptions,
  modelOptions,
  onModelChange,
  onThinkingLevelChange,
  onSettingsChange,
  sources,
  entries,
  onDirectoryChanged,
}: AiModelSectionProps) {
  return (
    <div className="space-y-4 flex flex-col min-h-[850px]">
      <KeysSection
        currentModelId={currentModelId}
        initialSources={sources}
        initialEntries={entries}
        onDirectoryChanged={onDirectoryChanged}
        onModelChange={onModelChange}
      />
      <GeneralSection
        settings={settings}
        currentModelId={currentModelId}
        thinkingLevel={thinkingLevel}
        canConfigureThinking={canConfigureThinking}
        thinkingHint={thinkingHint}
        thinkingOptions={thinkingOptions}
        modelOptions={modelOptions}
        onModelChange={onModelChange}
        onThinkingLevelChange={onThinkingLevelChange}
        onSettingsChange={onSettingsChange}
      />
    </div>
  );
}
