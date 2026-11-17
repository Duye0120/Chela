import { randomUUID } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import { isAbsolute } from "node:path";
import { PLANNER_MANUAL_EXECUTION_STATES, PLANNER_STATUSES } from "../shared/planner.ts";
import type { PlannerExecution, PlannerItem } from "../shared/planner.ts";
import { readRequiredJsonFileSync, writeJsonFileSync } from "./json-file.ts";

const DRAFT_KEYS = ["id", "title", "content", "kind", "date", "remindAt", "completed",
  "status", "projectDirectory", "executor", "sourceUrl", "acceptance", "result"];
const ITEM_KEYS = [...DRAFT_KEYS, "createdAt", "updatedAt", "remindedAt", "executions"];
const EXECUTION_KEYS = ["terminalId", "directory", "executor", "startedAt", "endedAt", "state", "source", "result", "autoReview"];
const EXECUTION_STATES = [...PLANNER_MANUAL_EXECUTION_STATES, "exited", "interrupted"] as const;

function record(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("备忘录数据格式无效。");
  }
  const result = value as Record<string, unknown>;
  if (Object.keys(result).some((key) => !keys.includes(key))) {
    throw new Error("备忘录数据包含未知字段。");
  }
  return result;
}

function itemId(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 128) {
    throw new Error("备忘录 ID 无效。");
  }
  return value;
}

function calendarDate(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("日期必须为 YYYY-MM-DD。");
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error("日历日期无效。");
  }
  return value;
}

function timestamp(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value)) {
    throw new Error("提醒时间必须为带时区的 ISO 日期时间。");
  }
  calendarDate(value.slice(0, 10));
  const parsed = new Date(value);
  const utcYear = parsed.getUTCFullYear();
  if (!Number.isFinite(utcYear) || utcYear < 0 || utcYear > 9999) throw new Error("提醒时间无效。");
  return parsed.toISOString();
}

function stringField(value: unknown, limit: number, label: string): string {
  if (typeof value !== "string" || value.length > limit || value.includes("\0")) {
    throw new Error(`${label}格式无效或超过 ${limit} 个字符。`);
  }
  return value;
}

function choice<T extends string>(value: unknown, choices: readonly T[], label: string): T {
  const match = choices.find((entry) => entry === value);
  if (!match) throw new Error(`${label}无效。`);
  return match;
}

function draftFields(value: Record<string, unknown>, previous?: PlannerItem) {
  if (typeof value.title !== "string" || !value.title.trim() || value.title.length > 200) {
    throw new Error("标题不能为空，且不能超过 200 个字符。");
  }
  if (typeof value.content !== "string" || value.content.length > 50_000) {
    throw new Error("正文不能超过 50,000 个字符。");
  }
  if (value.kind !== "note" && value.kind !== "todo") throw new Error("备忘录类型无效。");
  if (typeof value.completed !== "boolean") throw new Error("完成状态无效。");
  const status = value.status === undefined
    ? (previous?.completed === value.completed ? previous.status : value.completed ? "done" : "todo")
    : choice(value.status, PLANNER_STATUSES, "任务状态");
  const sourceUrl = stringField(value.sourceUrl === undefined ? previous?.sourceUrl ?? "" : value.sourceUrl, 2048, "来源链接").trim();
  if (sourceUrl) {
    const url = URL.parse(sourceUrl);
    if (!url || !["http:", "https:"].includes(url.protocol)) throw new Error("来源链接必须使用 HTTP 或 HTTPS。");
  }
  return {
    title: value.title.trim(),
    content: value.content,
    kind: value.kind,
    completed: status === "done",
    status,
    sourceUrl,
    projectDirectory: stringField(value.projectDirectory === undefined ? previous?.projectDirectory ?? "" : value.projectDirectory, 4096, "项目目录").trim(),
    executor: stringField(value.executor === undefined ? previous?.executor ?? "" : value.executor, 200, "执行者").trim(),
    acceptance: stringField(value.acceptance === undefined ? previous?.acceptance ?? "" : value.acceptance, 50_000, "验收要求"),
    result: stringField(value.result === undefined ? previous?.result ?? "" : value.result, 50_000, "验收结果"),
    date: value.date === null ? null : calendarDate(value.date),
    remindAt: value.remindAt === null ? null : timestamp(value.remindAt),
  } satisfies Omit<PlannerItem, "id" | "createdAt" | "updatedAt" | "remindedAt" | "executions">;
}

export function validatePlannerDraftFields(input: unknown) {
  return draftFields(record(input, DRAFT_KEYS));
}

function executionFields(raw: unknown): PlannerExecution[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new Error("执行记录列表无效。");
  return raw.map((entry) => {
    const value = record(entry, EXECUTION_KEYS);
    const source = choice(value.source, ["terminal", "manual", "codex"] as const, "执行状态来源");
    if (value.autoReview !== undefined && (source !== "codex" || typeof value.autoReview !== "boolean")) {
      throw new Error("执行验收状态无效。");
    }
    return {
      terminalId: itemId(value.terminalId),
      directory: stringField(value.directory, 4096, "执行目录"),
      executor: stringField(value.executor, 200, "执行者"),
      startedAt: timestamp(value.startedAt),
      endedAt: value.endedAt === null ? null : timestamp(value.endedAt),
      state: choice(value.state, EXECUTION_STATES, "执行状态"),
      source,
      result: stringField(value.result, 50_000, "执行结果"),
      ...(typeof value.autoReview === "boolean" ? { autoReview: value.autoReview } : {}),
    };
  });
}

function endExecution(execution: PlannerExecution, state: "exited" | "interrupted", now: string): void {
  execution.endedAt = now;
  if (execution.state !== "finished" && execution.state !== "failed") {
    execution.state = state;
    if (execution.source !== "codex") execution.source = "terminal";
  }
  delete execution.autoReview;
}

function nextUpdatedAt(item: PlannerItem): string {
  return new Date(Math.max(Date.now(), Date.parse(item.updatedAt) + 1)).toISOString();
}

export class PlannerStore {
  private readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  list(): PlannerItem[] {
    if (!existsSync(this.filePath)) return [];
    try {
      const data = record(readRequiredJsonFileSync(this.filePath), ["version", "items"]);
      if (data.version !== 1 || !Array.isArray(data.items)) throw new Error("版本或列表格式无效。");
      const ids = new Set<string>();
      return data.items.map((raw): PlannerItem => {
        const value = record(raw, ITEM_KEYS);
        const id = itemId(value.id);
        if (ids.has(id)) throw new Error("存在重复 ID。");
        ids.add(id);
        return {
          ...draftFields(value),
          id,
          createdAt: timestamp(value.createdAt),
          updatedAt: timestamp(value.updatedAt),
          remindedAt: value.remindedAt === null ? null : timestamp(value.remindedAt),
          executions: executionFields(value.executions),
        };
      });
    } catch (error) {
      throw new Error("无法读取备忘录文件；已保留原文件，请检查或恢复备份。", { cause: error });
    }
  }

  save(input: unknown, expectedUpdatedAt?: unknown): PlannerItem[] {
    const value = record(input, DRAFT_KEYS);
    const id = value.id === undefined ? undefined : itemId(value.id);
    const items = this.list();
    const previous = id ? items.find((item) => item.id === id) : undefined;
    if (id && !previous) throw new Error("备忘录已不存在，请刷新后重试。");
    if (expectedUpdatedAt !== undefined && previous?.updatedAt !== expectedUpdatedAt) {
      throw new Error("此项在保存前已更新，草稿仍保留。请核对后重试。");
    }
    const draft = draftFields(value, previous);
    const executions = previous?.executions ?? [];
    if (draft.kind !== "todo" && executions.some((execution) => !execution.endedAt)) {
      throw new Error("请先停止任务执行或关闭关联终端，再改为备忘。");
    }
    const executionBasisChanged = previous && (["status", "title", "content", "acceptance", "projectDirectory"] as const)
      .some((field) => draft[field] !== previous[field]);
    for (const execution of executions) {
      if (execution.source !== "codex" || execution.endedAt) continue;
      if (executionBasisChanged) execution.autoReview = false;
    }
    const now = new Date().toISOString();
    const item: PlannerItem = {
      ...draft,
      id: previous?.id ?? randomUUID(),
      createdAt: previous?.createdAt ?? now,
      updatedAt: previous ? nextUpdatedAt(previous) : now,
      remindedAt: previous && previous.remindAt === draft.remindAt ? previous.remindedAt : null,
      executions,
    };
    const next = previous ? items.map((entry) => entry.id === item.id ? item : entry) : [item, ...items];
    writeJsonFileSync(this.filePath, { version: 1, items: next });
    return next;
  }

  reserveCodex(taskId: unknown, updatedAt: unknown): { item: PlannerItem; items: PlannerItem[]; execution: PlannerExecution } {
    const id = itemId(taskId);
    if (typeof updatedAt !== "string" || updatedAt.length !== 24) throw new Error("任务版本无效。");
    const items = this.list();
    const item = items.find((entry) => entry.id === id);
    if (!item || item.updatedAt !== updatedAt) throw new Error("任务已变更，请重新打开确认。");
    if (item.kind !== "todo" || item.completed) throw new Error("只能执行未完成的待办。");
    if (item.executions.some((execution) => !execution.endedAt)) throw new Error("任务已有活动执行，请先结束它。");
    const directory = item.projectDirectory;
    if (!isAbsolute(directory) || !statSync(directory, { throwIfNoEntry: false })?.isDirectory()) {
      throw new Error("项目目录必须是存在的绝对目录。");
    }
    const execution: PlannerExecution = {
      terminalId: randomUUID(), directory, executor: "Codex", startedAt: new Date().toISOString(),
      endedAt: null, state: "unknown", source: "codex", result: "", autoReview: true,
    };
    item.executions.unshift(execution);
    writeJsonFileSync(this.filePath, { version: 1, items });
    return { item, items, execution };
  }

  requireActiveCodexId(taskId: unknown, executionId: unknown): string {
    const id = itemId(taskId);
    const terminalId = itemId(executionId);
    const item = this.list().find((entry) => entry.id === id);
    if (!item?.executions.some((execution) => execution.source === "codex" && execution.terminalId === terminalId && !execution.endedAt)) {
      throw new Error("该任务没有对应的活动 Codex 执行。");
    }
    return terminalId;
  }

  recordCodexUpdate(taskId: string, executionId: string, update: {
    state: "running" | "finished" | "failed" | "interrupted";
    result: string;
  }): { items: PlannerItem[]; item: PlannerItem; needsReview: boolean } | null {
    const items = this.list();
    const item = items.find((entry) => entry.id === taskId);
    const execution = item?.executions.find((entry) => entry.terminalId === executionId && entry.source === "codex");
    if (!item || !execution || execution.endedAt || execution.state === update.state) return null;
    execution.state = update.state;
    execution.result = update.result.slice(0, 50_000).replaceAll("\0", "");
    const needsReview = update.state === "finished" && execution.autoReview === true && item.kind === "todo"
      && (item.status === "todo" || item.status === "doing");
    if (update.state !== "running") {
      execution.endedAt = new Date().toISOString();
      delete execution.autoReview;
    }
    if (needsReview) {
      item.status = "review";
      item.updatedAt = nextUpdatedAt(item);
    }
    writeJsonFileSync(this.filePath, { version: 1, items });
    return { items, item, needsReview };
  }

  recordExecution(taskId: unknown, input: unknown, terminal?: { cwd: string; exitCode?: number }): PlannerItem[] {
    const id = itemId(taskId);
    const value = record(input, ["terminalId", "state", "directory", "executor", "result"]);
    const terminalId = itemId(value.terminalId);
    const state = choice(value.state, [...EXECUTION_STATES, "linked"] as const, "执行状态");
    const items = this.list();
    const item = items.find((entry) => entry.id === id);
    const closing = state === "exited" || state === "interrupted";
    if (!item) {
      if (closing) return items;
      throw new Error("任务已不存在，请刷新后重试。");
    }
    const existing = item.executions.find((entry) => entry.terminalId === terminalId);
    if (existing?.source === "codex") throw new Error("受管 Codex 执行只能由运行服务更新。");
    const now = new Date().toISOString();
    if (state === "linked") {
      if (item.kind !== "todo") throw new Error("请先将事项设为待办。");
      if (existing) return items;
      if (item.executions.some((entry) => !entry.endedAt)) throw new Error("任务已有活动执行，请先结束它。");
      if (items.some((entry) => entry.executions.some((execution) => execution.terminalId === terminalId))) {
        throw new Error("该终端已关联其他任务。");
      }
      const directory = stringField(terminal?.cwd ?? value.directory, 4096, "执行目录");
      const executor = stringField(value.executor, 200, "执行者");
      const execution: PlannerExecution = { terminalId, directory, executor, startedAt: now, endedAt: null, state: "unknown", source: "terminal", result: "" };
      if (terminal?.exitCode !== undefined) endExecution(execution, "exited", now);
      item.executions.unshift(execution);
    } else if (closing) {
      if (!existing || existing.endedAt) return items;
      endExecution(existing, state, now);
    } else {
      if (!existing) throw new Error("未找到关联的执行记录。");
      if (existing.endedAt && (state === "running" || state === "waiting")) {
        throw new Error("关联终端已结束。");
      }
      existing.state = state;
      existing.source = "manual";
      existing.result = stringField(value.result, 50_000, "执行结果");
    }
    writeJsonFileSync(this.filePath, { version: 1, items });
    return items;
  }

  endTerminal(terminalId: string, state: "exited" | "interrupted"): PlannerItem[] | null {
    const items = this.list();
    const active = items.flatMap((item) => item.executions.filter((entry) => entry.source !== "codex" && entry.terminalId === terminalId && !entry.endedAt));
    if (!active.length) return null;
    const now = new Date().toISOString();
    for (const execution of active) endExecution(execution, state, now);
    writeJsonFileSync(this.filePath, { version: 1, items });
    return items;
  }

  interruptOpenExecutions(): void {
    const items = this.list();
    const now = new Date().toISOString();
    let changed = false;
    for (const item of items) {
      for (const execution of item.executions) {
        if (execution.endedAt) continue;
        if (execution.source === "codex") {
          execution.endedAt = now;
          execution.state = "unknown";
          delete execution.autoReview;
          execution.result = [
            "Chela 已重新启动，无法确认上次 Codex 进程是否仍在运行。请检查原目录和进程后再执行。",
            execution.result,
          ].filter(Boolean).join("\n\n").slice(0, 50_000);
        } else {
          endExecution(execution, "interrupted", now);
        }
        changed = true;
      }
    }
    if (changed) writeJsonFileSync(this.filePath, { version: 1, items });
  }

  remove(id: unknown, expectedUpdatedAt: unknown): PlannerItem[] {
    const targetId = itemId(id);
    const items = this.list();
    const item = items.find((entry) => entry.id === targetId);
    if (!item) throw new Error("备忘录已不存在，请刷新后重试。");
    if (typeof expectedUpdatedAt !== "string" || item.updatedAt !== expectedUpdatedAt) {
      throw new Error("此项在确认删除后已更新，请核对最新内容并重新确认删除。");
    }
    if (item.executions.some((execution) => !execution.endedAt)) {
      throw new Error("请先停止任务执行或关闭关联终端，再删除任务。");
    }
    const next = items.filter((item) => item.id !== targetId);
    writeJsonFileSync(this.filePath, { version: 1, items: next });
    return next;
  }

  due(now = new Date()): PlannerItem[] {
    return this.list().filter((item) =>
      !item.completed && !item.remindedAt && item.remindAt !== null && Date.parse(item.remindAt) <= now.getTime(),
    );
  }

  markReminded(id: string, remindAt: string): boolean {
    const items = this.list();
    const item = items.find((entry) => entry.id === id);
    // A notification may finish after its item was edited, completed, or deleted.
    if (!item || item.completed || item.remindAt !== remindAt || item.remindedAt) return false;
    item.remindedAt = new Date().toISOString();
    writeJsonFileSync(this.filePath, { version: 1, items });
    return true;
  }
}
