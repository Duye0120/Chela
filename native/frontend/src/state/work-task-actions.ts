import { useEffect } from "react";
import { useStore } from "zustand";
import { workApi, type WorkTask } from "../data/work";
import { workTasks } from "./work-tasks";

let readers = 0;
let pending: Promise<void> | undefined;

export function refreshWorkTasks() {
  if (pending) return pending;
  const request = workApi.tasks().then(tasks => {
    if (pending === request) workTasks.setState({ tasks, loaded: true, error: "" });
  }).catch(cause => {
    if (pending === request) workTasks.setState({ error: cause instanceof Error ? cause.message : String(cause) });
  }).finally(() => {
    if (pending === request) pending = undefined;
  });
  pending = request;
  workTasks.setState({ error: "" });
  return request;
}

function refreshVisibleTasks() {
  if (document.visibilityState === "visible") void refreshWorkTasks();
}

function observeWorkTasks() {
  if (++readers === 1) {
    window.addEventListener("focus", refreshVisibleTasks);
    document.addEventListener("visibilitychange", refreshVisibleTasks);
  }
  void refreshWorkTasks();
  return () => {
    if (--readers > 0) return;
    window.removeEventListener("focus", refreshVisibleTasks);
    document.removeEventListener("visibilitychange", refreshVisibleTasks);
    pending = undefined;
  };
}

export function useWorkTasks() {
  useEffect(observeWorkTasks, []);
  return useStore(workTasks);
}

export function invalidateWorkTasks() {
  // A read started before the write cannot confirm its result.
  pending = undefined;
  if (readers > 0) void refreshWorkTasks();
}

export async function saveWorkTask(task: WorkTask) {
  const saved = await workApi.saveTask(task);
  workTasks.setState(({ tasks }) => ({
    tasks: tasks.some(item => item.id === saved.id)
      ? tasks.map(item => item.id === saved.id ? saved : item)
      : [...tasks, saved],
  }));
  invalidateWorkTasks();
  return saved;
}

export async function deleteWorkTask(id: string) {
  await workApi.deleteTask(id);
  workTasks.setState(({ tasks }) => ({ tasks: tasks.filter(task => task.id !== id) }));
  invalidateWorkTasks();
}
