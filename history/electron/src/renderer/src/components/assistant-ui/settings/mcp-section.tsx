import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FileTextIcon,
  PlusIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  SaveIcon,
  Trash2Icon,
  UnplugIcon,
} from "lucide-react";
import type { McpServerConfigDraft, McpServerStatus } from "@shared/contracts";
import { Button } from "@renderer/components/assistant-ui/button";
import { Switch } from "@renderer/components/assistant-ui/switch";
import { cn } from "@renderer/lib/utils";
import { FieldInput, SettingsCard, StatusBadge } from "./shared";

type McpDraftState = {
  originalName: string | null;
  name: string;
  type: "stdio" | "streamable-http";
  command: string;
  argsText: string;
  envText: string;
  envPassthroughText: string;
  cwd: string;
  url: string;
  bearerTokenEnvVar: string;
  headersText: string;
  headersFromEnvText: string;
  disabled: boolean;
  envTouched: boolean;
  headersTouched: boolean;
  headersFromEnvTouched: boolean;
};

const EMPTY_DRAFT: McpDraftState = {
  originalName: null,
  name: "",
  type: "stdio",
  command: "",
  argsText: "",
  envText: "",
  envPassthroughText: "",
  cwd: "",
  url: "",
  bearerTokenEnvVar: "",
  headersText: "",
  headersFromEnvText: "",
  disabled: false,
  envTouched: false,
  headersTouched: false,
  headersFromEnvTouched: false,
};

function formatStatus(status: McpServerStatus) {
  if (status.disabled) return "已停用";
  if (status.connected) return "已连接";
  if (status.status === "connecting") return "连接中";
  if (status.status === "failed") return "失败";
  return "未连接";
}

function formatCount(value: number | null, label: string) {
  return typeof value === "number" ? `${value} ${label}` : `未知 ${label}`;
}

function formatTimestamp(value: number | null) {
  if (!value) return "未知";
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date(value));
  } catch {
    return "未知";
  }
}

function sumKnown(values: Array<number | null>) {
  let known = 0;
  let total = 0;
  for (const value of values) {
    if (typeof value === "number") {
      known += 1;
      total += value;
    }
  }
  return known > 0 ? total : null;
}

function createDraftFromStatus(status: McpServerStatus): McpDraftState {
  return {
    originalName: status.name,
    name: status.name,
    type: status.type,
    command: status.command ?? "",
    argsText: status.args.join("\n"),
    envText: "",
    envPassthroughText: "",
    cwd: status.cwd ?? "",
    url: status.url ?? "",
    bearerTokenEnvVar: "",
    headersText: "",
    headersFromEnvText: "",
    disabled: status.disabled,
    envTouched: false,
    headersTouched: false,
    headersFromEnvTouched: false,
  };
}

function parseArgs(value: string) {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseKeyValueText(value: string, message: string): Record<string, string> {
  const trimmed = value.trim();
  if (!trimmed) return {};
  if (trimmed.startsWith("{")) {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`${message} JSON 必须是对象。`);
    }
    return Object.fromEntries(
      Object.entries(parsed).map(([key, nested]) => [key.trim(), String(nested).trim()]),
    );
  }

  const env: Record<string, string> = {};
  for (const line of trimmed.split(/\r?\n/)) {
    const next = line.trim();
    if (!next) continue;
    const separatorIndex = next.indexOf("=");
    if (separatorIndex <= 0) {
      throw new Error(`${message} 请使用 KEY=value 格式。`);
    }
    const key = next.slice(0, separatorIndex).trim();
    const envValue = next.slice(separatorIndex + 1).trim();
    if (!key) {
      throw new Error(`${message} key 不能为空。`);
    }
    env[key] = envValue;
  }
  return env;
}

function parseLineList(value: string) {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function toConfigDraft(draft: McpDraftState): McpServerConfigDraft {
  return {
    originalName: draft.originalName,
    name: draft.name.trim(),
    type: draft.type,
    command: draft.command.trim(),
    args: parseArgs(draft.argsText),
    env: draft.envTouched ? parseKeyValueText(draft.envText, "环境变量") : null,
    envPassthrough: parseLineList(draft.envPassthroughText),
    cwd: draft.cwd.trim() || null,
    url: draft.url.trim() || null,
    bearerTokenEnvVar: draft.bearerTokenEnvVar.trim() || null,
    headers: draft.headersTouched ? parseKeyValueText(draft.headersText, "Headers") : null,
    headersFromEnv: draft.headersFromEnvTouched
      ? parseKeyValueText(draft.headersFromEnvText, "环境变量 Headers")
      : null,
    disabled: draft.disabled,
  };
}

export function McpSection() {
  const desktopApi = window.desktopApi;
  const [statuses, setStatuses] = useState<McpServerStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionName, setActionName] = useState<string | null>(null);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [draft, setDraft] = useState<McpDraftState>(EMPTY_DRAFT);
  const [error, setError] = useState<string | null>(null);

  const selectedStatus = useMemo(
    () => statuses.find((status) => status.name === selectedName) ?? null,
    [selectedName, statuses],
  );

  const loadStatuses = useCallback(async () => {
    if (!desktopApi?.mcp) return;
    setLoading(true);
    setError(null);
    try {
      const nextStatuses = await desktopApi.mcp.listStatus();
      setStatuses(nextStatuses);
      if (selectedName && !nextStatuses.some((status) => status.name === selectedName)) {
        setSelectedName(null);
        setDraft(EMPTY_DRAFT);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "读取 MCP 状态失败");
    } finally {
      setLoading(false);
    }
  }, [desktopApi, selectedName]);

  const runAction = useCallback(
    async (name: string, action: () => Promise<McpServerStatus[]>) => {
      setActionName(name);
      setError(null);
      try {
        const nextStatuses = await action();
        setStatuses(nextStatuses);
      } catch (err) {
        setError(err instanceof Error ? err.message : "MCP 操作失败");
      } finally {
        setActionName(null);
      }
    },
    [],
  );

  const openConfig = useCallback(async () => {
    if (!desktopApi?.mcp) return;
    setActionName("open-config");
    setError(null);
    try {
      await desktopApi.mcp.openConfig();
    } catch (err) {
      setError(err instanceof Error ? err.message : "打开 MCP 配置失败");
    } finally {
      setActionName(null);
    }
  }, [desktopApi]);

  const handleSelect = useCallback((status: McpServerStatus) => {
    setSelectedName(status.name);
    setDraft(createDraftFromStatus(status));
    setError(null);
  }, []);

  const handleAdd = useCallback(() => {
    setSelectedName(null);
    setDraft(EMPTY_DRAFT);
    setError(null);
  }, []);

  const handleSave = useCallback(async () => {
    if (!desktopApi?.mcp) return;
    setActionName("save");
    setError(null);
    try {
      const payload = toConfigDraft(draft);
      if (!payload.name || (payload.type === "stdio" && !payload.command) || (payload.type === "streamable-http" && !payload.url)) {
        setError(payload.type === "stdio" ? "名称和 command 不能为空。" : "名称和 URL 不能为空。");
        return;
      }
      const nextStatuses = await desktopApi.mcp.saveServer(payload);
      setStatuses(nextStatuses);
      setSelectedName(payload.name);
      const saved = nextStatuses.find((status) => status.name === payload.name);
      setDraft(saved ? createDraftFromStatus(saved) : { ...draft, originalName: payload.name });
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存 MCP server 失败");
    } finally {
      setActionName(null);
    }
  }, [desktopApi, draft]);

  const handleDelete = useCallback(async () => {
    if (!desktopApi?.mcp || !draft.originalName) return;
    setActionName("delete");
    setError(null);
    try {
      const nextStatuses = await desktopApi.mcp.deleteServer(draft.originalName);
      setStatuses(nextStatuses);
      setSelectedName(null);
      setDraft(EMPTY_DRAFT);
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除 MCP server 失败");
    } finally {
      setActionName(null);
    }
  }, [desktopApi, draft.originalName]);

  useEffect(() => {
    void loadStatuses();
  }, [loadStatuses]);

  const summary = useMemo(() => {
    const connectedCount = statuses.filter((status) => status.connected).length;
    const failedCount = statuses.filter((status) => status.status === "failed").length;
    const disabledCount = statuses.filter((status) => status.disabled).length;
    return {
      connectedCount,
      failedCount,
      disabledCount,
      toolTotal: sumKnown(statuses.map((status) => status.toolCount)),
      resourceTotal: sumKnown(statuses.map((status) => status.resourceCount)),
    };
  }, [statuses]);

  const disabled = loading || !!actionName || !desktopApi?.mcp;

  return (
    <SettingsCard
      title="MCP Server"
      description="查看当前 workspace 的 MCP 连接状态，并配置 stdio server。"
      headerAction={
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            title="打开 MCP 配置"
            aria-label="打开 MCP 配置"
            onClick={() => void openConfig()}
            disabled={disabled}
            className="size-8 rounded-[var(--radius-shell)]"
          >
            <FileTextIcon className="size-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void runAction("reload", () => desktopApi.mcp.reloadConfig())}
            disabled={disabled}
            className="h-8 gap-2 rounded-[var(--radius-shell)] px-3 text-[12px]"
          >
            <RefreshCwIcon className="size-3.5" />
            重载配置
          </Button>
        </div>
      }
    >
      <div className="space-y-3 px-6 pb-5">
        {error ? (
          <p className="rounded-[var(--radius-shell)] bg-[color:var(--color-shell-panel-muted)] px-3 py-2 text-[12px] leading-5 text-[color:var(--color-status-error)]">
            {error}
          </p>
        ) : null}

        {statuses.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["Server", `${summary.connectedCount}/${statuses.length} 已连接`],
              ["异常", summary.failedCount > 0 ? `${summary.failedCount} 失败` : "无失败"],
              ["停用", `${summary.disabledCount} 停用`],
              [
                "能力",
                `${formatCount(summary.toolTotal, "tools")} · ${formatCount(summary.resourceTotal, "resources")}`,
              ],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-[var(--radius-shell)] bg-[color:var(--color-shell-panel-muted)] px-3 py-2"
              >
                <p className="text-[11px] leading-4 text-muted-foreground">{label}</p>
                <p className="mt-0.5 text-[12px] font-medium text-foreground">{value}</p>
              </div>
            ))}
          </div>
        ) : null}

        <div className="grid gap-3 xl:grid-cols-[minmax(0,0.95fr)_minmax(360px,1.05fr)]">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[12px] font-medium text-muted-foreground">Server 列表</p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleAdd}
                disabled={disabled}
                className="h-8 gap-2 rounded-[var(--radius-shell)] px-2.5 text-[12px]"
              >
                <PlusIcon className="size-3.5" />
                添加
              </Button>
            </div>

            {statuses.length === 0 ? (
              <button
                type="button"
                onClick={handleAdd}
                disabled={disabled}
                className="w-full rounded-[var(--radius-shell)] bg-[color:var(--color-shell-panel-muted)] px-4 py-4 text-left text-[13px] leading-6 text-muted-foreground transition-colors hover:bg-[color:var(--color-control-bg-hover)] disabled:cursor-default disabled:hover:bg-[color:var(--color-shell-panel-muted)]"
              >
                {loading ? "正在读取 MCP 状态…" : "当前 workspace 未配置 MCP server。"}
              </button>
            ) : (
              statuses.map((status) => {
                const selected = selectedName === status.name;
                return (
                  <button
                    type="button"
                    key={status.name}
                    onClick={() => handleSelect(status)}
                    className={cn(
                      "w-full rounded-[var(--radius-shell)] px-4 py-3 text-left transition-colors",
                      selected
                        ? "bg-[color:var(--color-control-bg-active)]"
                        : "bg-[color:var(--color-shell-panel-muted)] hover:bg-[color:var(--color-control-bg-hover)]",
                    )}
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-[13px] font-semibold text-foreground">
                        {status.name}
                      </span>
                      <StatusBadge ok={status.connected} text={formatStatus(status)} />
                    </span>
                  <span className="mt-1 block truncate text-[12px] leading-5 text-muted-foreground">
                      {status.type === "streamable-http"
                        ? status.url ?? "未配置 URL"
                        : `${status.command ?? "未配置命令"}${status.args.length > 0 ? ` ${status.args.join(" ")}` : ""}`}
                    </span>
                    <span className="mt-1 block text-[12px] leading-5 text-muted-foreground">
                      {status.type === "streamable-http" ? "HTTP" : "STDIO"} · {formatCount(status.toolCount, "tools")} · {formatCount(status.resourceCount, "resources")} · 更新：{formatTimestamp(status.updatedAt)}
                    </span>
                    {status.lastError ? (
                      <span className="mt-1 block break-words text-[12px] leading-5 text-[color:var(--color-status-error)]">
                        {status.lastError}
                      </span>
                    ) : null}
                  </button>
                );
              })
            )}
          </div>

          <div className="rounded-[var(--radius-shell)] bg-[color:var(--color-shell-panel-muted)] px-4 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-foreground">
                  {draft.originalName ? "配置 MCP server" : "添加 MCP server"}
                </p>
                <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
                  支持 stdio 与 Streamable HTTP；保存后会自动重载 MCP。
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {selectedStatus ? (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      title="重启 MCP server"
                      aria-label={`重启 ${selectedStatus.name}`}
                      onClick={() =>
                        void runAction(`restart:${selectedStatus.name}`, () =>
                          desktopApi.mcp.restartServer(selectedStatus.name),
                        )
                      }
                      disabled={disabled || selectedStatus.disabled}
                      className="size-8 rounded-[var(--radius-shell)]"
                    >
                      <RotateCcwIcon className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      title="断开 MCP server"
                      aria-label={`断开 ${selectedStatus.name}`}
                      onClick={() =>
                        void runAction(`disconnect:${selectedStatus.name}`, () =>
                          desktopApi.mcp.disconnectServer(selectedStatus.name),
                        )
                      }
                      disabled={disabled || !selectedStatus.connected}
                      className="size-8 rounded-[var(--radius-shell)]"
                    >
                      <UnplugIcon className="size-4" />
                    </Button>
                  </>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  title="删除 MCP server"
                  aria-label="删除 MCP server"
                  onClick={() => void handleDelete()}
                  disabled={disabled || !draft.originalName}
                  className="size-8 rounded-[var(--radius-shell)] text-[color:var(--color-status-error)]"
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </div>
            </div>

            <div className="mt-4 grid gap-3">
              <label className="grid gap-1.5">
                <span className="text-[12px] font-medium text-muted-foreground">名称</span>
                <FieldInput
                  value={draft.name}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, name: event.target.value }))
                  }
                  placeholder="filesystem"
                  disabled={disabled}
                />
              </label>

              <div className="grid grid-cols-2 overflow-hidden rounded-[var(--radius-shell)] bg-[color:var(--color-control-bg)] p-1 shadow-[var(--color-control-shadow)]">
                {[
                  ["stdio", "STDIO"],
                  ["streamable-http", "Streamable HTTP"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        type: value as McpDraftState["type"],
                      }))
                    }
                    disabled={disabled}
                    className={cn(
                      "h-8 rounded-[var(--radius-shell)] text-[12px] font-medium transition-colors",
                      draft.type === value
                        ? "bg-[color:var(--color-control-bg-active)] text-foreground"
                        : "text-muted-foreground hover:bg-[color:var(--color-control-bg-hover)]",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {draft.type === "stdio" ? (
                <>
                  <label className="grid gap-1.5">
                    <span className="text-[12px] font-medium text-muted-foreground">Command</span>
                    <FieldInput
                      value={draft.command}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, command: event.target.value }))
                      }
                      placeholder="npx"
                      disabled={disabled}
                      mono
                    />
                  </label>

                  <label className="grid gap-1.5">
                    <span className="text-[12px] font-medium text-muted-foreground">
                      Args
                    </span>
                    <textarea
                      value={draft.argsText}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, argsText: event.target.value }))
                      }
                      placeholder={"-y\n@modelcontextprotocol/server-filesystem\nD:\\\\workspace"}
                      disabled={disabled}
                      className="min-h-[92px] w-full resize-y rounded-[var(--radius-shell)] border-none bg-[color:var(--color-control-bg)] px-3 py-2 font-mono text-[12px] leading-5 text-foreground shadow-[var(--color-control-shadow)] ring-1 ring-[color:var(--color-control-border)] outline-none placeholder:text-[color:var(--color-text-tertiary)] hover:bg-[color:var(--color-control-bg-hover)] focus-visible:bg-[color:var(--color-control-bg-active)] focus-visible:ring-2 focus-visible:ring-[color:var(--color-control-focus-ring)] disabled:cursor-not-allowed disabled:opacity-60"
                    />
                  </label>

                  <label className="grid gap-1.5">
                    <span className="text-[12px] font-medium text-muted-foreground">
                      Env
                    </span>
                    <textarea
                      value={draft.envText}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          envText: event.target.value,
                          envTouched: true,
                        }))
                      }
                      placeholder={draft.originalName ? "留空并保存会保留现有 env" : "KEY=value"}
                      disabled={disabled}
                      className="min-h-[76px] w-full resize-y rounded-[var(--radius-shell)] border-none bg-[color:var(--color-control-bg)] px-3 py-2 font-mono text-[12px] leading-5 text-foreground shadow-[var(--color-control-shadow)] ring-1 ring-[color:var(--color-control-border)] outline-none placeholder:text-[color:var(--color-text-tertiary)] hover:bg-[color:var(--color-control-bg-hover)] focus-visible:bg-[color:var(--color-control-bg-active)] focus-visible:ring-2 focus-visible:ring-[color:var(--color-control-focus-ring)] disabled:cursor-not-allowed disabled:opacity-60"
                    />
                  </label>

                  <label className="grid gap-1.5">
                    <span className="text-[12px] font-medium text-muted-foreground">
                      Env passthrough
                    </span>
                    <textarea
                      value={draft.envPassthroughText}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, envPassthroughText: event.target.value }))
                      }
                      placeholder={"PATH\nGITHUB_TOKEN"}
                      disabled={disabled}
                      className="min-h-[64px] w-full resize-y rounded-[var(--radius-shell)] border-none bg-[color:var(--color-control-bg)] px-3 py-2 font-mono text-[12px] leading-5 text-foreground shadow-[var(--color-control-shadow)] ring-1 ring-[color:var(--color-control-border)] outline-none placeholder:text-[color:var(--color-text-tertiary)] hover:bg-[color:var(--color-control-bg-hover)] focus-visible:bg-[color:var(--color-control-bg-active)] focus-visible:ring-2 focus-visible:ring-[color:var(--color-control-focus-ring)] disabled:cursor-not-allowed disabled:opacity-60"
                    />
                  </label>

                  <label className="grid gap-1.5">
                    <span className="text-[12px] font-medium text-muted-foreground">CWD</span>
                    <FieldInput
                      value={draft.cwd}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, cwd: event.target.value }))
                      }
                      placeholder="留空则使用默认工作目录"
                      disabled={disabled}
                      mono
                    />
                  </label>
                </>
              ) : (
                <>
                  <label className="grid gap-1.5">
                    <span className="text-[12px] font-medium text-muted-foreground">URL</span>
                    <FieldInput
                      value={draft.url}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, url: event.target.value }))
                      }
                      placeholder="https://mcp.example.com/mcp"
                      disabled={disabled}
                      mono
                    />
                  </label>

                  <label className="grid gap-1.5">
                    <span className="text-[12px] font-medium text-muted-foreground">
                      Bearer token env var
                    </span>
                    <FieldInput
                      value={draft.bearerTokenEnvVar}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, bearerTokenEnvVar: event.target.value }))
                      }
                      placeholder="MCP_BEARER_TOKEN"
                      disabled={disabled}
                      mono
                    />
                  </label>

                  <label className="grid gap-1.5">
                    <span className="text-[12px] font-medium text-muted-foreground">Headers</span>
                    <textarea
                      value={draft.headersText}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          headersText: event.target.value,
                          headersTouched: true,
                        }))
                      }
                      placeholder={"X-Client=Chela\nX-Feature=mcp"}
                      disabled={disabled}
                      className="min-h-[76px] w-full resize-y rounded-[var(--radius-shell)] border-none bg-[color:var(--color-control-bg)] px-3 py-2 font-mono text-[12px] leading-5 text-foreground shadow-[var(--color-control-shadow)] ring-1 ring-[color:var(--color-control-border)] outline-none placeholder:text-[color:var(--color-text-tertiary)] hover:bg-[color:var(--color-control-bg-hover)] focus-visible:bg-[color:var(--color-control-bg-active)] focus-visible:ring-2 focus-visible:ring-[color:var(--color-control-focus-ring)] disabled:cursor-not-allowed disabled:opacity-60"
                    />
                  </label>

                  <label className="grid gap-1.5">
                    <span className="text-[12px] font-medium text-muted-foreground">
                      Headers from env
                    </span>
                    <textarea
                      value={draft.headersFromEnvText}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          headersFromEnvText: event.target.value,
                          headersFromEnvTouched: true,
                        }))
                      }
                      placeholder={"X-Api-Key=MCP_API_KEY"}
                      disabled={disabled}
                      className="min-h-[76px] w-full resize-y rounded-[var(--radius-shell)] border-none bg-[color:var(--color-control-bg)] px-3 py-2 font-mono text-[12px] leading-5 text-foreground shadow-[var(--color-control-shadow)] ring-1 ring-[color:var(--color-control-border)] outline-none placeholder:text-[color:var(--color-text-tertiary)] hover:bg-[color:var(--color-control-bg-hover)] focus-visible:bg-[color:var(--color-control-bg-active)] focus-visible:ring-2 focus-visible:ring-[color:var(--color-control-focus-ring)] disabled:cursor-not-allowed disabled:opacity-60"
                    />
                  </label>
                </>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <label className="flex items-center gap-3 text-[12px] font-medium text-muted-foreground">
                  <Switch
                    checked={draft.disabled}
                    onCheckedChange={(checked) =>
                      setDraft((current) => ({ ...current, disabled: checked }))
                    }
                    disabled={disabled}
                    aria-label="停用 MCP server"
                  />
                  停用 server
                </label>
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  onClick={() => void handleSave()}
                  disabled={
                    disabled ||
                    !draft.name.trim() ||
                    (draft.type === "stdio" ? !draft.command.trim() : !draft.url.trim())
                  }
                  className="h-8 gap-2 rounded-[var(--radius-shell)] px-3 text-[12px]"
                >
                  <SaveIcon className="size-3.5" />
                  保存并重载
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </SettingsCard>
  );
}
