import { useEffect } from "react";
import { useStore } from "zustand";
import { previewApi } from "../data/preview";
import { gitState, emptyRepositories } from "./git";
import { usePreferences } from "./preferences";
import { readRepository, selectRepository } from "./repository-selection";

type Target = { session: string; project: string; depth: number };
const keyOf = ({ session, project, depth }: Target) => JSON.stringify([session, project, depth]);
const readers = new Map<string, Target & { count: number }>();
const requests = new Map<string, Promise<void>>();

function load(target: Target) {
  const key = keyOf(target), pending = requests.get(key);
  if (pending) return pending;
  gitState.setState(state => ({ repositories: { ...state.repositories,
    [key]: { ...(state.repositories[key] || emptyRepositories), loading: true, error: "" },
  } }));
  const request = previewApi.repositories(target.session, target.depth).then(items => {
    if (requests.get(key) !== request) return;
    gitState.setState(state => ({ repositories: { ...state.repositories,
      [key]: { items, loading: false, error: "", revision: (state.repositories[key]?.revision || 0) + 1 },
    } }));
    if (!items.some(repo => repo.path === readRepository(target.session))) selectRepository(target.session, "all");
  }).catch(cause => {
    if (requests.get(key) !== request) return;
    gitState.setState(state => ({ repositories: { ...state.repositories,
      [key]: { ...(state.repositories[key] || emptyRepositories), loading: false, error: String(cause) },
    } }));
  }).finally(() => { if (requests.get(key) === request) requests.delete(key); });
  requests.set(key, request);
  return request;
}

export function invalidateRepositories(session: string) {
  for (const [key, target] of readers) {
    if (target.session !== session) continue;
    requests.delete(key);
    void load(target);
  }
}

function acquire(target: Target) {
  if (!target.session) return;
  const key = keyOf(target), existing = readers.get(key);
  if (existing) existing.count++;
  else readers.set(key, { ...target, count: 1 });
  void load(target);
  return () => {
    const reader = readers.get(key);
    if (!reader || --reader.count) return;
    readers.delete(key); requests.delete(key);
    gitState.setState(state => {
      const repositories = { ...state.repositories }; delete repositories[key];
      return { repositories };
    });
  };
}

export function useRepositories(session: string, project: string) {
  const depth = usePreferences(state => state.gitDepth), key = keyOf({ session, project, depth });
  const resource = useStore(gitState, state => state.repositories[key] || emptyRepositories);
  useEffect(() => acquire({ session, project, depth }), [session, project, depth]);
  return resource;
}
