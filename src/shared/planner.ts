export const PLANNER_STATUSES = ["todo", "doing", "review", "done"] as const;
export type PlannerStatus = (typeof PLANNER_STATUSES)[number];

export const PLANNER_MANUAL_EXECUTION_STATES = ["unknown", "running", "waiting", "failed", "finished"] as const;
export type PlannerManualExecutionState = (typeof PLANNER_MANUAL_EXECUTION_STATES)[number];

export type PlannerExecution = {
  terminalId: string;
  directory: string;
  executor: string;
  startedAt: string;
  endedAt: string | null;
  state: PlannerManualExecutionState | "exited" | "interrupted";
  source: "terminal" | "manual" | "codex";
  result: string;
  autoReview?: boolean;
};

export type PlannerExecutionUpdate = { terminalId: string } & (
  | { state: "linked"; directory: string; executor: string }
  | { state: "exited" | "interrupted" }
  | { state: PlannerManualExecutionState; result: string }
);

type PlannerTaskFields = {
  status: PlannerStatus;
  projectDirectory: string;
  executor: string;
  sourceUrl: string;
  acceptance: string;
  result: string;
};

export type PlannerItem = {
  id: string;
  title: string;
  content: string;
  kind: "note" | "todo";
  date: string | null;
  remindAt: string | null;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
  remindedAt: string | null;
  executions: PlannerExecution[];
} & PlannerTaskFields;

export type PlannerDraft = Pick<PlannerItem, "title" | "content" | "kind" | "date" | "remindAt" | "completed"> & Partial<PlannerTaskFields> & {
  id?: string;
};

export function buildCodexTaskPrompt(task: Pick<PlannerItem, "title" | "content" | "acceptance">): string {
  return [
    `任务：${task.title}`,
    task.content.trim() ? `目标与说明：\n${task.content}` : "",
    task.acceptance.trim() ? `验收要求：\n${task.acceptance}` : "",
  ].filter(Boolean).join("\n\n");
}

export type PlannerApi = {
  list(): Promise<PlannerItem[]>;
  save(input: PlannerDraft, expectedUpdatedAt?: string): Promise<PlannerItem[]>;
  remove(id: string, expectedUpdatedAt: string): Promise<PlannerItem[]>;
  recordExecution(taskId: string, update: PlannerExecutionUpdate): Promise<PlannerItem[]>;
  startCodex(id: string, updatedAt: string): Promise<PlannerItem[]>;
  cancelCodex(taskId: string, executionId: string): Promise<void>;
  show(taskId?: string): Promise<void>;
  discuss(id: string, updatedAt: string): Promise<void>;
  onChange(listener: (items: PlannerItem[]) => void): () => void;
};
