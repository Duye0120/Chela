import type {
  ChatSessionSummary,
  ModelRoutingRole,
  Settings,
  ThinkingLevel,
} from "@shared/contracts";

export type SettingsSection =
  | "general"
  | "network"
  | "ai_model"
  | "workspace"
  | "skills"
  | "interface"
  | "system";

export type SettingsViewProps = {
  activeSection: SettingsSection;
  settings: Settings | null;
  currentModelId: string;
  thinkingLevel: ThinkingLevel;
  onModelChange: (modelEntryId: string) => void;
  onRoleModelChange: (
    role: Exclude<ModelRoutingRole, "chat">,
    modelId: string | null,
  ) => void;
  onThinkingLevelChange: (level: ThinkingLevel) => void;
  onSettingsChange: (partial: Partial<Settings>) => void;
  archivedSummaries: ChatSessionSummary[];
  onOpenArchivedSession: (sessionId: string) => void;
  onUnarchiveSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
};
