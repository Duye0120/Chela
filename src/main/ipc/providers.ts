import { IPC_CHANNELS } from "../../shared/ipc.js";
import {
  deleteEntry,
  deleteSource,
  getCredentials,
  getEntry,
  getSource,
  listEntries,
  listEntriesBySource,
  listSources,
  saveEntry,
  saveSource,
  setCredentials,
  testSource,
  fetchSourceModels,
} from "../providers.js";
import { handleIpc } from "./handle.js";
import {
  validateProviderApiKeyPayload,
  validateProviderSourceDraftPayload,
  validateSourceIdPayload,
} from "./schema.js";

export function registerProvidersIpc(): void {
  handleIpc(IPC_CHANNELS.providersListSources, async () => listSources());
  handleIpc(
    IPC_CHANNELS.providersGetSource,
    async (_event, sourceId: string) =>
      getSource(validateSourceIdPayload(IPC_CHANNELS.providersGetSource, sourceId)),
  );
  handleIpc(
    IPC_CHANNELS.providersSaveSource,
    async (_event, draft) =>
      saveSource(validateProviderSourceDraftPayload(IPC_CHANNELS.providersSaveSource, draft)),
  );
  handleIpc(
    IPC_CHANNELS.providersDeleteSource,
    async (_event, sourceId: string) =>
      deleteSource(validateSourceIdPayload(IPC_CHANNELS.providersDeleteSource, sourceId)),
  );
  handleIpc(
    IPC_CHANNELS.providersTestSource,
    async (_event, draft) =>
      testSource(validateProviderSourceDraftPayload(IPC_CHANNELS.providersTestSource, draft)),
  );
  handleIpc(
    IPC_CHANNELS.providersFetchModels,
    async (_event, draft) =>
      fetchSourceModels(validateProviderSourceDraftPayload(IPC_CHANNELS.providersFetchModels, draft)),
  );
  handleIpc(
    IPC_CHANNELS.providersGetCredentials,
    async (_event, sourceId: string) =>
      getCredentials(validateSourceIdPayload(IPC_CHANNELS.providersGetCredentials, sourceId)),
  );
  handleIpc(
    IPC_CHANNELS.providersSetCredentials,
    async (_event, sourceId: string, apiKey: string) =>
      setCredentials(
        validateSourceIdPayload(IPC_CHANNELS.providersSetCredentials, sourceId),
        validateProviderApiKeyPayload(IPC_CHANNELS.providersSetCredentials, apiKey),
      ),
  );

  handleIpc(IPC_CHANNELS.modelsListEntries, async () => listEntries());
  handleIpc(
    IPC_CHANNELS.modelsListEntriesBySource,
    async (_event, sourceId: string) => listEntriesBySource(sourceId),
  );
  handleIpc(
    IPC_CHANNELS.modelsSaveEntry,
    async (_event, draft) => saveEntry(draft),
  );
  handleIpc(
    IPC_CHANNELS.modelsDeleteEntry,
    async (_event, entryId: string) => deleteEntry(entryId),
  );
  handleIpc(
    IPC_CHANNELS.modelsGetEntry,
    async (_event, entryId: string) => getEntry(entryId),
  );
}
