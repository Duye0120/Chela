import type {
  GitDiffOverview,
  SendMessageInput,
} from "../../shared/contracts.ts";
import type { AgentHandle } from "../agent.ts";
import type { ElectronAdapter } from "../adapter.ts";
import type { HarnessRunScope } from "../harness/types.ts";
import { getSettings } from "../settings.ts";
import type { ResolvedRuntimeModel } from "../model-resolution.ts";
import { loadSession } from "../session/facade.ts";

export type ChatRuntimeSettings = ReturnType<typeof getSettings>;
export type ExistingChatSession = NonNullable<ReturnType<typeof loadSession>>;

export type ChatRunContext = {
  input: SendMessageInput;
  runScope: HarnessRunScope;
  settings: ChatRuntimeSettings;
  existingSession: ExistingChatSession;
  requestedModelEntryId: string;
  resolvedModel: ResolvedRuntimeModel;
  failover: {
    prepare: {
      failedEntries: string[];
      isFailover: boolean;
    };
    execute: {
      attemptedEntryIds: string[];
      lastError: string | null;
    };
  };
  adapter: ElectronAdapter;
  createdHandle: boolean;
  handle: AgentHandle | null;
  runCreated: boolean;
  transcriptStarted: boolean;
  beforeDiffOverview: GitDiffOverview | null;
};
