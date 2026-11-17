import { useEffect } from "react";
import { useStore } from "zustand";
import { chatApi, isActiveRun, type ChatSession, type ChatSnapshot, type RuntimeSettings } from "../data/chat";
import { chatState, emptyBranches, emptyRuntime, setSnapshot, setLoading, setError } from "./chat";
import { invalidateRepositories } from "./git-actions";

export const errorMessage = (cause: unknown) => cause instanceof Error && cause.message ? cause.message : "操作失败，请重试";
const branchRequests = new Map<string, Promise<void>>();
const runtimeRequests = new Map<string, Promise<void>>();
const runtimeReaders = new Map<string, number>();

export function invalidateBranches(session: string) {
  branchRequests.delete(session);
  chatState.setState(state => {
    const branches = { ...state.branches }; delete branches[session];
    return { branches };
  });
}

export function loadBranches(session: string, branch: string) {
  const resource = chatState.getState().branches[session];
  if (resource?.branch === branch && !resource.error && !resource.loading) return Promise.resolve();
  const pending = branchRequests.get(session);
  if (pending && resource?.branch === branch) return pending;
  chatState.setState(state => ({ branches: { ...state.branches,
    [session]: { branch, items: [], loading: true, error: "" },
  } }));
  const request = chatApi.branches(session).then(items => {
    if (branchRequests.get(session) !== request) return;
    chatState.setState(state => ({ branches: { ...state.branches,
      [session]: { branch, items, loading: false, error: "" },
    } }));
  }).catch(cause => {
    if (branchRequests.get(session) !== request) return;
    chatState.setState(state => ({ branches: { ...state.branches,
      [session]: { branch, items: [], loading: false, error: errorMessage(cause) },
    } }));
  }).finally(() => { if (branchRequests.get(session) === request) branchRequests.delete(session); });
  branchRequests.set(session, request);
  return request;
}

export function useBranches(session: ChatSession | undefined, enabled: boolean) {
  const id = session?.id || "", branch = session?.branchId || "";
  const resource = useStore(chatState, state => state.branches[id]);
  useEffect(() => { if (id && enabled) void loadBranches(id, branch); }, [id, branch, enabled, resource === undefined]);
  return resource?.branch === branch ? resource : emptyBranches;
}

function loadRuntime(session: string) {
  const pending = runtimeRequests.get(session);
  if (pending) return pending;
  const request = chatApi.runtimeSettings(session).then(value => {
    if (runtimeRequests.get(session) !== request) return;
    chatState.setState(state => ({ runtime: { ...state.runtime, [session]: { value, error: "" } } }));
  }).catch(cause => {
    if (runtimeRequests.get(session) !== request) return;
    chatState.setState(state => ({ runtime: { ...state.runtime, [session]: { value: null, error: errorMessage(cause) } } }));
  }).finally(() => { if (runtimeRequests.get(session) === request) runtimeRequests.delete(session); });
  runtimeRequests.set(session, request);
  return request;
}
function refreshRuntime() {
  runtimeRequests.clear();
  chatState.setState({ runtime: {} });
  for (const session of runtimeReaders.keys()) void loadRuntime(session);
}
export function useRuntimeSettings(session: string) {
  const resource = useStore(chatState, state => state.runtime[session] || emptyRuntime);
  useEffect(() => {
    if (!runtimeReaders.size) window.addEventListener("chela-runtime-settings-changed", refreshRuntime);
    const count = runtimeReaders.get(session) || 0;
    runtimeReaders.set(session, count + 1);
    if (!count) void loadRuntime(session);
    return () => {
      const remaining = runtimeReaders.get(session)! - 1;
      if (remaining) runtimeReaders.set(session, remaining);
      else {
        runtimeReaders.delete(session); runtimeRequests.delete(session);
        chatState.setState(state => { const runtime = { ...state.runtime }; delete runtime[session]; return { runtime }; });
      }
      if (!runtimeReaders.size) window.removeEventListener("chela-runtime-settings-changed", refreshRuntime);
    };
  }, [session]);
  return resource;
}
export async function saveRuntimeSettings(session: string, value: RuntimeSettings) {
  await chatApi.setRuntimeSettings(session, value);
  runtimeRequests.delete(session);
  chatState.setState(state => ({ runtime: { ...state.runtime, [session]: { value, error: "" } } }));
}

export function replaceSession(value: ChatSession) {
  const previous = chatState.getState().snapshot.sessions.find(item => item.id === value.id);
  setSnapshot(current => ({ ...current, sessions: [value, ...current.sessions.filter(item => item.id !== value.id)] }));
  if (previous && previous.branchId !== value.branchId) invalidateBranches(value.id);
  if (previous && previous.project === value.project && previous.branchId !== value.branchId) invalidateRepositories(value.id);
}

function acceptSnapshot(value: ChatSnapshot) {
  const previous = chatState.getState().snapshot;
  setSnapshot(value);
  if (chatState.getState().snapshot !== value) return;
  const changedRepositories = new Set<string>();
  for (const session of value.sessions) {
    const old = previous.sessions.find(item => item.id === session.id);
    if (old && old.branchId !== session.branchId) invalidateBranches(session.id);
    if (old && old.project === session.project && old.branchId !== session.branchId) changedRepositories.add(session.id);
  }
  for (const run of value.runs || []) {
    if (!isActiveRun(run) && previous.runs?.some(old => old.run_id === run.run_id && isActiveRun(old))) changedRepositories.add(run.session_id);
  }
  for (const session of changedRepositories) invalidateRepositories(session);
  for (const session of previous.sessions) if (!value.sessions.some(item => item.id === session.id)) invalidateBranches(session.id);
}

let snapshotRequest: Promise<ChatSnapshot> | undefined;
export function refreshChat(fresh = true) {
  if (!fresh && snapshotRequest) return snapshotRequest;
  const current = epoch;
  const request = chatApi.load().then(value => {
    if (current === epoch) acceptSnapshot(value);
    return chatState.getState().snapshot;
  })
    .finally(() => { if (snapshotRequest === request) snapshotRequest = undefined; });
  snapshotRequest = request;
  return request;
}

let observers = 0, epoch = 0, timer: ReturnType<typeof setTimeout> | undefined;
let initial: Promise<ChatSnapshot>;
function modelsChanged() {
  const current = epoch;
  void refreshChat().then(() => {
    if (current === epoch) chatState.setState(state => ({ modelRevision: state.modelRevision + 1 }));
  }).catch(cause => { if (current === epoch) setError(errorMessage(cause)); });
}

export function observeChat() {
  if (++observers === 1) {
    const current = ++epoch;
    setLoading(true); setError("");
    window.addEventListener("chela-models-changed", modelsChanged);
    async function poll() {
      try {
        if (chatState.getState().loading) return;
        const update = await chatApi.observe(chatState.getState().snapshot.snapshot_cursor || "0");
        if (current !== epoch) return;
        if (update.events.length) await refreshChat(false);
        if (current !== epoch) return;
        chatState.setState({ progress: update.progress });
        if (update.runtimeError) setError(update.runtimeError);
      } catch (cause) { if (current === epoch) setError(errorMessage(cause)); }
      finally { if (current === epoch) timer = setTimeout(poll, 200); }
    }
    initial = refreshChat();
    void initial.catch(cause => { if (current === epoch) setError(errorMessage(cause)); })
      .finally(() => { if (current === epoch) { setLoading(false); void poll(); } });
  }
  return { ready: initial, release: () => {
    if (--observers) return;
    ++epoch; clearTimeout(timer);
    snapshotRequest = undefined;
    window.removeEventListener("chela-models-changed", modelsChanged);
    chatState.setState({ progress: {}, branches: {}, runtime: {}, loading: true, error: "" });
    branchRequests.clear(); runtimeRequests.clear();
  } };
}
