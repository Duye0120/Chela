import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  MemoryListSort,
  MemoryRecord,
  MemoryStats,
  Settings,
} from "@shared/contracts";
import type { MemoryEmbeddingModelId } from "@shared/memory";
import { MEMORY_EMBEDDING_MODELS } from "@shared/memory";
import { formatDateTimeInTimeZone } from "@shared/timezone";
import { Button } from "@renderer/components/assistant-ui/button";
import { Checkbox } from "@renderer/components/assistant-ui/checkbox";
import { ModelSelector } from "@renderer/components/assistant-ui/model-selector";
import type { ModelOption } from "@renderer/components/assistant-ui/model-selector";
import {
  FieldSelect,
  SettingsCard,
  SettingsBlock,
  StatusBadge,
  FieldInput,
} from "./shared";

function formatTimestamp(value: string | null, timeZone: string): string {
  if (!value) {
    return "—";
  }

  try {
    return formatDateTimeInTimeZone(value, timeZone);
  } catch {
    return value;
  }
}

function getWorkerLabel(state: MemoryStats["workerState"]): string {
  switch (state) {
    case "idle":
      return "未启动";
    case "starting":
      return "启动中";
    case "ready":
      return "已就绪";
    case "error":
      return "异常";
  }
}

function MetaItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[var(--radius-shell)] bg-[color:var(--color-control-bg)] px-4 py-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 text-[13px] leading-5 text-foreground">{value}</p>
    </div>
  );
}

const MEMORY_SORT_OPTIONS: Array<{ value: MemoryListSort; label: string }> = [
  { value: "confidence_desc", label: "综合分最高" },
  { value: "match_count_desc", label: "命中次数最高" },
  { value: "feedback_score_desc", label: "反馈分最高" },
  { value: "last_matched_desc", label: "最近命中" },
  { value: "created_desc", label: "最近创建" },
];

function getMemoryTags(memory: MemoryRecord): string[] {
  return Array.isArray(memory.metadata?.tags) ? memory.metadata.tags : [];
}

function getMemorySource(memory: MemoryRecord): string {
  return typeof memory.metadata?.source === "string"
    ? memory.metadata.source
    : "memory";
}

export function MemorySection({
  settings,
  timeZone,
  modelOptions,
  onSettingsChange,
}: {
  settings: Settings;
  timeZone: string;
  modelOptions: ModelOption[];
  onSettingsChange: (partial: Partial<Settings>) => void;
}) {
  const desktopApi = window.desktopApi;
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [memories, setMemories] = useState<MemoryRecord[]>([]);
  const [memorySort, setMemorySort] =
    useState<MemoryListSort>("confidence_desc");
  const [loading, setLoading] = useState(false);
  const [memoriesLoading, setMemoriesLoading] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    if (!desktopApi) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const nextStats = await desktopApi.memory.getStats();
      setStats(nextStats);
    } catch (err) {
      setError(err instanceof Error ? err.message : "读取 Memory 状态失败");
    } finally {
      setLoading(false);
    }
  }, [desktopApi]);

  useEffect(() => {
    void loadStats();
  }, [loadStats, settings.memory.embeddingModelId]);

  const loadMemories = useCallback(async () => {
    if (!desktopApi) {
      return;
    }

    setMemoriesLoading(true);
    setError(null);

    try {
      const nextMemories = await desktopApi.memory.list({
        sort: memorySort,
        limit: 80,
      });
      setMemories(nextMemories);
    } catch (err) {
      setError(err instanceof Error ? err.message : "读取 Memory 列表失败");
    } finally {
      setMemoriesLoading(false);
    }
  }, [desktopApi, memorySort]);

  useEffect(() => {
    void loadMemories();
  }, [loadMemories]);

  const selectedModel = useMemo(
    () =>
      MEMORY_EMBEDDING_MODELS.find(
        (entry) => entry.id === settings.memory.embeddingModelId,
      ) ?? MEMORY_EMBEDDING_MODELS[0],
    [settings.memory.embeddingModelId],
  );
  const modelNeedsRebuild =
    !!stats?.indexedModelId &&
    stats.indexedModelId !== settings.memory.embeddingModelId;

  const handleModelChange = useCallback(
    (value: string) => {
      onSettingsChange({
        memory: {
          embeddingModelId: value as MemoryEmbeddingModelId,
        },
      } as Partial<Settings>);
    },
    [onSettingsChange],
  );

  const handleRebuild = useCallback(async () => {
    if (!desktopApi) {
      return;
    }

    setRebuilding(true);
    setError(null);
    try {
      await desktopApi.memory.rebuild();
      await Promise.all([loadStats(), loadMemories()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "重建 Memory 失败");
    } finally {
      setRebuilding(false);
    }
  }, [desktopApi, loadMemories, loadStats]);

  const handleMemorySettingChange = useCallback(
    (key: keyof Settings["memory"], value: any) => {
      onSettingsChange({
        memory: {
          ...settings.memory,
          [key]: value,
        },
      } as Partial<Settings>);
    },
    [onSettingsChange, settings.memory],
  );

  return (
    <div className="space-y-4">
      <SettingsCard>
        <SettingsBlock label="记忆功能">
          <div className="flex items-start gap-3">
            <Checkbox
              checked={settings.memory.enabled}
              onCheckedChange={(checked: boolean | "indeterminate") => handleMemorySettingChange("enabled", !!checked)}
            />
            <div className="-mt-0.5 space-y-1">
              <p className="text-[13px] font-medium leading-none text-foreground">启用记忆</p>
              <p className="text-[12px] text-muted-foreground">
                启用后，AI 将记住您对话中的重要信息，并使用这些信息提供更个性化的回复。
              </p>
            </div>
          </div>
        </SettingsBlock>
      </SettingsCard>

      <SettingsCard>
        <SettingsBlock label="记忆检索">
          <div className="space-y-5">
            <div className="flex items-start gap-3">
              <Checkbox
                checked={settings.memory.autoRetrieve}
                onCheckedChange={(checked: boolean | "indeterminate") => handleMemorySettingChange("autoRetrieve", !!checked)}
              />
              <div className="-mt-0.5 space-y-3 w-full">
                <div>
                  <p className="text-[13px] font-medium leading-none text-foreground">自动检索记忆</p>
                  <p className="mt-1 text-[12px] text-muted-foreground">在每次对话前自动搜索并注入相关记忆以提供上下文。</p>
                </div>
                <div className="flex items-start gap-3">
                  <Checkbox
                    checked={settings.memory.queryRewrite}
                    onCheckedChange={(checked: boolean | "indeterminate") => handleMemorySettingChange("queryRewrite", !!checked)}
                  />
                  <div className="-mt-0.5 space-y-1">
                    <p className="text-[13px] font-medium leading-none text-foreground">查询重写</p>
                    <p className="text-[12px] text-muted-foreground">使用大语言模型优化您的消息再进行记忆搜索。这会将对话式查询转换为语义搜索词，以获得更好的匹配效果。</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-1 sm:max-w-md">
              <div className="flex items-center justify-between text-[13px] font-medium text-foreground">
                <span>最大检索记忆数：{settings.memory.searchCandidateLimit}</span>
              </div>
              <p className="text-[12px] text-muted-foreground">注入对话上下文的相关记忆最大数量 (1-20)。</p>
              <FieldInput
                type="number"
                min={1}
                max={20}
                value={settings.memory.searchCandidateLimit}
                onChange={(e) => handleMemorySettingChange("searchCandidateLimit", parseInt(e.target.value, 10))}
                className="mt-2 w-full"
              />
            </div>

            <div className="space-y-1 sm:max-w-md">
              <div className="flex items-center justify-between text-[13px] font-medium text-foreground">
                <span>相似度阈值：{settings.memory.similarityThreshold}%</span>
              </div>
              <p className="text-[12px] text-muted-foreground">检索记忆所需的最低相似度分数。值越高，匹配越严格。</p>
              <FieldInput
                type="number"
                min={0}
                max={100}
                value={settings.memory.similarityThreshold}
                onChange={(e) => handleMemorySettingChange("similarityThreshold", parseInt(e.target.value, 10))}
                className="mt-2 w-full"
              />
              <div className="flex justify-between text-[11px] text-muted-foreground mt-1">
                <span>宽松 (0%)</span>
                <span>严格 (100%)</span>
              </div>
            </div>
          </div>
        </SettingsBlock>
      </SettingsCard>

      <SettingsCard>
        <SettingsBlock label="记忆总结">
          <div className="flex items-start gap-3">
            <Checkbox
              checked={settings.memory.autoSummarize}
              onCheckedChange={(checked: boolean | "indeterminate") => handleMemorySettingChange("autoSummarize", !!checked)}
            />
            <div className="-mt-0.5 space-y-1">
              <p className="text-[13px] font-medium leading-none text-foreground">自动总结对话</p>
              <p className="text-[12px] text-muted-foreground">自动从对话中提取并存储重要信息作为新记忆。</p>
            </div>
          </div>
        </SettingsBlock>
      </SettingsCard>

      <SettingsCard>
        <SettingsBlock label="记忆工具模型" hint="为记忆操作指定专用工具模型。留空则使用通用工具模型。">
          <div className="sm:max-w-md">
            <ModelSelector.Root
              models={modelOptions}
              value={settings.memory.toolModelId ?? ""}
              onValueChange={(val) => handleMemorySettingChange("toolModelId", val === "" ? null : val)}
            >
              <ModelSelector.Trigger className="h-9 w-full justify-between px-3 text-[13px]" />
              <ModelSelector.Content align="start" className="min-w-[var(--radix-select-trigger-width)]" />
            </ModelSelector.Root>
          </div>
        </SettingsBlock>
      </SettingsCard>

      <SettingsCard>
        <SettingsBlock
          label="嵌入模型"
          hint="用于语义搜索的嵌入模型。留空则使用默认值。"
        >
          <div className="space-y-3 sm:max-w-md">
            <FieldSelect
              value={settings.memory.embeddingModelId}
              onChange={(val) => handleMemorySettingChange("embeddingModelId", val)}
              options={MEMORY_EMBEDDING_MODELS.map((option) => ({
                value: option.id,
                label: `${option.label}`,
              }))}
            />
            <div className="flex items-center justify-between gap-3 text-[12px] text-muted-foreground">
              <span>当前选择：{selectedModel.id}</span>
              <StatusBadge
                ok={!modelNeedsRebuild}
                text={modelNeedsRebuild ? "待重建索引" : "索引模型一致"}
              />
            </div>
          </div>
        </SettingsBlock>
      </SettingsCard>

      <SettingsCard>
        <SettingsBlock label="操作与统计">
          <div className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-5">
              <MetaItem
                label="记忆总数"
                value={loading && !stats ? "加载中…" : String(stats?.totalMemories ?? 0)}
              />
              <MetaItem
                label="累计命中"
                value={loading && !stats ? "加载中…" : String(stats?.totalMatches ?? 0)}
              />
              <MetaItem
                label="Worker 状态"
                value={stats ? getWorkerLabel(stats.workerState) : "—"}
              />
              <MetaItem
                label="最近写入"
                value={formatTimestamp(stats?.lastIndexedAt ?? null, timeZone)}
              />
              <MetaItem
                label="最近重建"
                value={formatTimestamp(stats?.lastRebuiltAt ?? null, timeZone)}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void Promise.all([loadStats(), loadMemories()])}
                disabled={loading || memoriesLoading || rebuilding}
              >
                {loading || memoriesLoading ? "刷新中…" : "刷新状态"}
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => void handleRebuild()}
                disabled={rebuilding}
              >
                {rebuilding ? "重建中…" : "重建所有向量"}
              </Button>
              <span className="text-[12px] leading-5 text-muted-foreground ml-2">
                如有需要，手动重新生成所有记忆的嵌入向量。
              </span>
            </div>
            
            {error ? (
              <p className="text-[12px] leading-5 text-[color:var(--color-status-danger-fg,#c43d2f)]">
                {error}
              </p>
            ) : null}
          </div>
        </SettingsBlock>
      </SettingsCard>

      <SettingsCard>
        <SettingsBlock
          label="记忆列表"
          hint="查看本地向量记忆与命中强化信号。"
        >
          <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="sm:w-[220px]">
                <FieldSelect
                  value={memorySort}
                  onChange={(value) => setMemorySort(value as MemoryListSort)}
                  options={MEMORY_SORT_OPTIONS}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void loadMemories()}
                disabled={memoriesLoading}
              >
                {memoriesLoading ? "刷新中…" : "刷新列表"}
              </Button>
            </div>

            <div className="space-y-2">
              {memoriesLoading && memories.length === 0 ? (
                <div className="rounded-[var(--radius-shell)] bg-[color:var(--color-control-bg)] px-4 py-5 text-[12px] text-muted-foreground">
                  正在读取记忆…
                </div>
              ) : memories.length === 0 ? (
                <div className="rounded-[var(--radius-shell)] bg-[color:var(--color-control-bg)] px-4 py-5 text-[12px] text-muted-foreground">
                  当前没有已保存的向量记忆。
                </div>
              ) : (
                memories.map((memory) => {
                  const tags = getMemoryTags(memory);
                  const confidenceScore = memory.matchCount + memory.feedbackScore;

                  return (
                    <div
                      key={memory.id}
                      className="rounded-[var(--radius-shell)] bg-[color:var(--color-control-bg)] px-4 py-3"
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <p className="text-[13px] leading-5 text-foreground">
                          {memory.content}
                        </p>
                        <div className="shrink-0 text-[12px] text-muted-foreground">
                          综合 {confidenceScore}
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                        <span>命中 {memory.matchCount}</span>
                        <span>反馈 {memory.feedbackScore}</span>
                        <span>来源 {getMemorySource(memory)}</span>
                        <span>
                          创建 {formatTimestamp(memory.createdAt, timeZone)}
                        </span>
                        <span>
                          最近命中 {formatTimestamp(memory.lastMatchedAt, timeZone)}
                        </span>
                      </div>
                      {tags.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {tags.map((tag) => (
                            <span
                              key={`${memory.id}:${tag}`}
                              className="rounded-[var(--radius-shell)] bg-[color:var(--color-control-bg-active)] px-2 py-0.5 text-[11px] text-muted-foreground"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </SettingsBlock>
      </SettingsCard>
    </div>
  );
}
