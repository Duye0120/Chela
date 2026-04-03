import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import {
  CheckCircleIcon,
  ExclamationCircleIcon,
} from "@heroicons/react/24/outline";
import type {
  AvailableModel,
  ChatSessionSummary,
  CredentialTestResult,
  CredentialsSafe,
  ModelSelection,
  Settings,
  SoulFilesStatus,
  ThinkingLevel,
} from "@shared/contracts";
import { Button } from "@renderer/components/assistant-ui/button";

export type SettingsSection =
  | "general"
  | "keys"
  | "appearance"
  | "terminal"
  | "workspace"
  | "archived"
  | "about";

export const SETTINGS_SECTIONS: {
  id: SettingsSection;
  label: string;
  description: string;
}[] = [
  {
    id: "general",
    label: "常规",
    description: "默认模型、思考强度和基础体验设置。",
  },
  {
    id: "keys",
    label: "API Keys",
    description: "管理各模型提供商的密钥。",
  },
  {
    id: "appearance",
    label: "外观",
    description: "主题、字号和代码字体。",
  },
  {
    id: "terminal",
    label: "终端",
    description: "Shell、终端字体和滚动历史。",
  },
  {
    id: "workspace",
    label: "工作区",
    description: "查看当前工作目录和 Soul 文件状态。",
  },
  {
    id: "archived",
    label: "已归档",
    description: "统一查看、恢复或删除已归档线程。",
  },
  {
    id: "about",
    label: "关于",
    description: "应用信息与当前技术栈。",
  },
] as const;

type Props = {
  activeSection: SettingsSection;
  settings: Settings | null;
  currentModel: ModelSelection;
  thinkingLevel: ThinkingLevel;
  onModelChange: (model: ModelSelection) => void;
  onThinkingLevelChange: (level: ThinkingLevel) => void;
  onSettingsChange: (partial: Partial<Settings>) => void;
  archivedSummaries: ChatSessionSummary[];
  onOpenArchivedSession: (sessionId: string) => void;
  onUnarchiveSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
};

const PROVIDERS = [
  { id: "anthropic", label: "Anthropic", placeholder: "sk-ant-..." },
  { id: "openai", label: "OpenAI", placeholder: "sk-..." },
  { id: "google", label: "Google", placeholder: "AIza..." },
] as const;

const THINKING_LEVELS: { value: ThinkingLevel; label: string }[] = [
  { value: "off", label: "关闭" },
  { value: "minimal", label: "极低" },
  { value: "low", label: "低" },
  { value: "medium", label: "中" },
  { value: "high", label: "高" },
  { value: "xhigh", label: "极高" },
];

const THEME_OPTIONS: { value: Settings["theme"]; label: string }[] = [
  { value: "light", label: "浅色" },
  { value: "dark", label: "深色" },
  { value: "custom", label: "自定义" },
];

const TERMINAL_SHELL_OPTIONS = [
  { value: "default", label: "系统默认" },
  { value: "powershell", label: "PowerShell" },
  { value: "cmd", label: "Command Prompt" },
  { value: "git-bash", label: "Git Bash" },
] as const;

const SECTION_META = Object.fromEntries(
  SETTINGS_SECTIONS.map((section) => [section.id, section]),
) as Record<SettingsSection, (typeof SETTINGS_SECTIONS)[number]>;

function getModelValue(model: ModelSelection | AvailableModel) {
  return `${model.provider}/${model.model}`;
}

function fallbackModelLabel(model: ModelSelection): string {
  return (model.model.split("/").pop() ?? model.model)
    .replace(/-\d{8}$/, "")
    .replace("claude-", "Claude ")
    .replace("gpt-", "GPT-")
    .replace("sonnet", "Sonnet")
    .replace("opus", "Opus")
    .replace("haiku", "Haiku");
}

function parseNumericInput(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function formatArchivedTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("zh-CN", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function SettingsCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-[24px] border border-black/6 bg-white shadow-[0_12px_40px_rgba(15,23,42,0.04)]">
      <div className="border-b border-black/6 px-6 py-5">
        <h2 className="text-[15px] font-semibold text-foreground">{title}</h2>
        {description ? (
          <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      <div className="divide-y divide-black/6">{children}</div>
    </section>
  );
}

function SettingsRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 px-6 py-4 md:flex-row md:items-start md:justify-between md:gap-6">
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-foreground">{label}</p>
        {hint ? (
          <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
            {hint}
          </p>
        ) : null}
      </div>
      <div className="w-full md:max-w-[320px]">{children}</div>
    </div>
  );
}

function FieldInput(
  props: InputHTMLAttributes<HTMLInputElement> & {
    mono?: boolean;
  },
) {
  const { className = "", mono = false, ...rest } = props;

  return (
    <input
      {...rest}
      className={`h-10 w-full rounded-xl border border-black/8 bg-[#f8fafc] px-3 text-[13px] text-foreground transition focus:border-[#cbd5e1] ${mono ? "font-mono text-[12px]" : ""} ${className}`}
    />
  );
}

function FieldSelect(
  props: SelectHTMLAttributes<HTMLSelectElement> & {
    options: readonly { value: string; label: string; disabled?: boolean }[];
  },
) {
  const { options, className = "", ...rest } = props;

  return (
    <select
      {...rest}
      className={`h-10 w-full cursor-pointer rounded-xl border border-black/8 bg-[#f8fafc] px-3 text-[13px] text-foreground transition focus:border-[#cbd5e1] ${className}`}
    >
      {options.map((option) => (
        <option
          key={option.value}
          value={option.value}
          disabled={option.disabled}
        >
          {option.label}
        </option>
      ))}
    </select>
  );
}

function StatusBadge({
  ok,
  text,
}: {
  ok: boolean;
  text: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] ${
        ok
          ? "bg-emerald-50 text-emerald-700"
          : "bg-amber-50 text-amber-700"
      }`}
    >
      {ok ? (
        <CheckCircleIcon className="h-3.5 w-3.5" />
      ) : (
        <ExclamationCircleIcon className="h-3.5 w-3.5" />
      )}
      {text}
    </span>
  );
}

export function SettingsView({
  activeSection,
  settings,
  currentModel,
  thinkingLevel,
  onModelChange,
  onThinkingLevelChange,
  onSettingsChange,
  archivedSummaries,
  onOpenArchivedSession,
  onUnarchiveSession,
  onDeleteSession,
}: Props) {
  const desktopApi = window.desktopApi;
  const [credentials, setCredentials] = useState<CredentialsSafe>({});
  const [availableModels, setAvailableModels] = useState<AvailableModel[]>([]);
  const [soulStatus, setSoulStatus] = useState<SoulFilesStatus | null>(null);
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState("");
  const [testResult, setTestResult] = useState<CredentialTestResult | null>(
    null,
  );
  const [testingProvider, setTestingProvider] = useState<string | null>(null);

  const loadCredentials = useCallback(async () => {
    if (!desktopApi) return;
    const nextCredentials = await desktopApi.credentials.get();
    setCredentials(nextCredentials);
  }, [desktopApi]);

  const loadAvailableModels = useCallback(async () => {
    if (!desktopApi) return;
    const models = await desktopApi.models.listAvailable();
    setAvailableModels(models);
  }, [desktopApi]);

  const loadSoulStatus = useCallback(async () => {
    if (!desktopApi) return;
    const status = await desktopApi.workspace.getSoul();
    setSoulStatus(status);
  }, [desktopApi]);

  useEffect(() => {
    if (activeSection === "keys") {
      void loadCredentials();
      setEditingProvider(null);
      setEditingKey("");
      setTestResult(null);
      setTestingProvider(null);
    }
  }, [activeSection, loadCredentials]);

  useEffect(() => {
    if (activeSection === "general") {
      void loadAvailableModels();
    }
    if (activeSection === "workspace") {
      void loadSoulStatus();
    }
  }, [activeSection, loadAvailableModels, loadSoulStatus]);

  const modelOptions = useMemo(() => {
    const nextOptions = availableModels.map((model) => ({
      value: getModelValue(model),
      label: model.available ? model.label : `${model.label}（需配置 Key）`,
      disabled: !model.available,
    }));

    const currentValue = getModelValue(currentModel);
    if (!nextOptions.some((option) => option.value === currentValue)) {
      nextOptions.unshift({
        value: currentValue,
        label: fallbackModelLabel(currentModel),
        disabled: false,
      });
    }

    return nextOptions;
  }, [availableModels, currentModel]);

  const handleSaveKey = useCallback(
    async (provider: string) => {
      if (!desktopApi || !editingKey.trim()) return;

      setTestingProvider(provider);
      setTestResult(null);

      try {
        const result = await desktopApi.credentials.test(provider, editingKey);
        setTestResult(result);

        if (!result.success) {
          return;
        }

        await desktopApi.credentials.set(provider, editingKey);
        await Promise.all([loadCredentials(), loadAvailableModels()]);
        setEditingProvider(null);
        setEditingKey("");
      } catch {
        setTestResult({ success: false, error: "测试请求失败" });
      } finally {
        setTestingProvider(null);
      }
    },
    [desktopApi, editingKey, loadAvailableModels, loadCredentials],
  );

  const handleDeleteKey = useCallback(
    async (provider: string) => {
      if (!desktopApi) return;
      await desktopApi.credentials.delete(provider);
      await Promise.all([loadCredentials(), loadAvailableModels()]);
    },
    [desktopApi, loadAvailableModels, loadCredentials],
  );

  if (!settings) {
    return (
      <div className="grid h-full place-items-center bg-shell-panel px-6 text-sm text-muted-foreground">
        正在加载设置…
      </div>
    );
  }

  const meta = SECTION_META[activeSection];

  return (
    <div className="flex h-full flex-col bg-shell-panel">
      <div className="flex-1 overflow-y-auto px-8 pb-10 pt-8">
        <div className="mx-auto w-full max-w-4xl">
          <header className="mb-8">
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Settings
            </p>
            <h1 className="mt-2 text-[28px] font-semibold tracking-[-0.02em] text-foreground">
              {meta.label}
            </h1>
            <p className="mt-2 max-w-2xl text-[13px] leading-6 text-muted-foreground">
              {meta.description}
            </p>
          </header>

          <div className="space-y-4">
            {activeSection === "general" ? (
              <>
                <SettingsCard
                  title="模型与推理"
                  description="这些配置会直接影响新消息默认使用的模型和思考强度。"
                >
                  <SettingsRow
                    label="默认模型"
                    hint="新会话和后续发送默认会使用这里选择的模型。"
                  >
                    <FieldSelect
                      value={getModelValue(currentModel)}
                      onChange={(event) => {
                        const [provider, ...modelParts] =
                          event.target.value.split("/");
                        const model = modelParts.join("/");
                        if (!provider || !model) return;
                        onModelChange({ provider, model });
                      }}
                      options={modelOptions.map((option) => ({
                        value: option.value,
                        label: option.label,
                      }))}
                    />
                  </SettingsRow>

                  <SettingsRow
                    label="默认思考强度"
                    hint="越高越偏向深度推理，但响应会更慢。"
                  >
                    <FieldSelect
                      value={thinkingLevel}
                      onChange={(event) =>
                        onThinkingLevelChange(
                          event.target.value as ThinkingLevel,
                        )
                      }
                      options={THINKING_LEVELS.map((level) => ({
                        value: level.value,
                        label: level.label,
                      }))}
                    />
                  </SettingsRow>
                </SettingsCard>

                <SettingsCard
                  title="基础体验"
                  description="这部分是常驻性的全局偏好。"
                >
                  <SettingsRow
                    label="主题"
                    hint="当前先保留浅色为主，深色和自定义会逐步补细节。"
                  >
                    <FieldSelect
                      value={settings.theme}
                      onChange={(event) =>
                        onSettingsChange({
                          theme: event.target.value as Settings["theme"],
                        })
                      }
                      options={THEME_OPTIONS}
                    />
                  </SettingsRow>

                  <SettingsRow
                    label="当前工作区"
                    hint="这里展示当前 Agent 默认工作的目录。"
                  >
                    <FieldInput value={settings.workspace} mono readOnly />
                  </SettingsRow>
                </SettingsCard>
              </>
            ) : null}

            {activeSection === "keys" ? (
              <SettingsCard
                title="API Keys"
                description="密钥会保存在本地，不会直接展示明文。保存前会先做一次轻量验证。"
              >
                <div className="space-y-4 px-6 py-5">
                  {PROVIDERS.map((provider) => {
                    const cred = credentials[provider.id];
                    const isEditing = editingProvider === provider.id;
                    const isTesting = testingProvider === provider.id;
                    const providerResult =
                      testResult && editingProvider === provider.id
                        ? testResult
                        : null;

                    return (
                      <div
                        key={provider.id}
                        className="rounded-[20px] border border-black/6 bg-[#fbfcfe] p-4"
                      >
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-[14px] font-semibold text-foreground">
                                {provider.label}
                              </h3>
                              {cred?.hasKey ? (
                                <StatusBadge ok text="已配置" />
                              ) : (
                                <StatusBadge ok={false} text="未配置" />
                              )}
                            </div>
                            {cred?.hasKey ? (
                              <p className="mt-2 font-mono text-[12px] text-muted-foreground">
                                {cred.masked}
                              </p>
                            ) : (
                              <p className="mt-2 text-[12px] text-muted-foreground">
                                还没有配置 {provider.label} 的 API Key。
                              </p>
                            )}
                          </div>

                          {!isEditing ? (
                            <div className="flex items-center gap-2">
                              {cred?.hasKey ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  onClick={() =>
                                    void handleDeleteKey(provider.id)
                                  }
                                  className="h-9 rounded-xl px-3 text-[12px] text-red-500 hover:bg-red-50"
                                >
                                  删除
                                </Button>
                              ) : null}
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => {
                                  setEditingProvider(provider.id);
                                  setEditingKey("");
                                  setTestResult(null);
                                }}
                                className="h-9 rounded-xl border-black/8 bg-white px-3 text-[12px]"
                              >
                                {cred?.hasKey ? "更换" : "配置"}
                              </Button>
                            </div>
                          ) : null}
                        </div>

                        {isEditing ? (
                          <div className="mt-4 space-y-3">
                            <FieldInput
                              type="password"
                              value={editingKey}
                              onChange={(event) =>
                                setEditingKey(event.target.value)
                              }
                              placeholder={provider.placeholder}
                              mono
                              autoFocus
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  void handleSaveKey(provider.id);
                                }
                                if (event.key === "Escape") {
                                  setEditingProvider(null);
                                  setEditingKey("");
                                  setTestResult(null);
                                }
                              }}
                            />

                            <div className="flex flex-wrap items-center gap-2">
                              <Button
                                type="button"
                                onClick={() => void handleSaveKey(provider.id)}
                                disabled={isTesting || !editingKey.trim()}
                                className="h-9 rounded-xl bg-slate-900 px-4 text-[12px] text-white hover:bg-slate-800"
                              >
                                {isTesting ? "验证中…" : "验证并保存"}
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                onClick={() => {
                                  setEditingProvider(null);
                                  setEditingKey("");
                                  setTestResult(null);
                                }}
                                className="h-9 rounded-xl px-3 text-[12px] text-muted-foreground"
                              >
                                取消
                              </Button>
                              {providerResult && !providerResult.success ? (
                                <span className="inline-flex items-center gap-1 text-[12px] text-red-500">
                                  <ExclamationCircleIcon className="h-4 w-4" />
                                  {providerResult.error ?? "验证失败"}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </SettingsCard>
            ) : null}

            {activeSection === "appearance" ? (
              <SettingsCard
                title="外观"
                description="先把基本可调项接上，颜色系统后面再继续细化。"
              >
                <SettingsRow
                  label="主题"
                  hint="切换应用主题模式。"
                >
                  <FieldSelect
                    value={settings.theme}
                    onChange={(event) =>
                      onSettingsChange({
                        theme: event.target.value as Settings["theme"],
                      })
                    }
                    options={THEME_OPTIONS}
                  />
                </SettingsRow>

                <SettingsRow
                  label="界面字号"
                  hint="控制普通界面文本字号。"
                >
                  <FieldInput
                    type="number"
                    min={12}
                    max={20}
                    value={settings.ui.fontSize}
                    onChange={(event) =>
                      onSettingsChange({
                        ui: {
                          ...settings.ui,
                          fontSize: parseNumericInput(
                            event.target.value,
                            settings.ui.fontSize,
                          ),
                        },
                      })
                    }
                  />
                </SettingsRow>

                <SettingsRow
                  label="代码字号"
                  hint="影响代码块和终端外的代码显示。"
                >
                  <FieldInput
                    type="number"
                    min={11}
                    max={20}
                    value={settings.ui.codeFontSize}
                    onChange={(event) =>
                      onSettingsChange({
                        ui: {
                          ...settings.ui,
                          codeFontSize: parseNumericInput(
                            event.target.value,
                            settings.ui.codeFontSize,
                          ),
                        },
                      })
                    }
                  />
                </SettingsRow>

                <SettingsRow
                  label="代码字体"
                  hint="建议保持等宽字体。"
                >
                  <FieldInput
                    value={settings.ui.codeFontFamily}
                    onChange={(event) =>
                      onSettingsChange({
                        ui: {
                          ...settings.ui,
                          codeFontFamily: event.target.value,
                        },
                      })
                    }
                  />
                </SettingsRow>
              </SettingsCard>
            ) : null}

            {activeSection === "terminal" ? (
              <SettingsCard
                title="终端"
                description="这些配置会影响内置终端的默认外观和行为。"
              >
                <SettingsRow
                  label="Shell"
                  hint="选择内置终端默认使用的 shell。"
                >
                  <FieldSelect
                    value={settings.terminal.shell}
                    onChange={(event) =>
                      onSettingsChange({
                        terminal: {
                          ...settings.terminal,
                          shell: event.target.value,
                        },
                      })
                    }
                    options={TERMINAL_SHELL_OPTIONS}
                  />
                </SettingsRow>

                <SettingsRow
                  label="终端字体"
                  hint="优先使用等宽字体。"
                >
                  <FieldInput
                    value={settings.terminal.fontFamily}
                    onChange={(event) =>
                      onSettingsChange({
                        terminal: {
                          ...settings.terminal,
                          fontFamily: event.target.value,
                        },
                      })
                    }
                  />
                </SettingsRow>

                <SettingsRow
                  label="终端字号"
                  hint="默认字号会在新开终端时生效。"
                >
                  <FieldInput
                    type="number"
                    min={10}
                    max={22}
                    value={settings.terminal.fontSize}
                    onChange={(event) =>
                      onSettingsChange({
                        terminal: {
                          ...settings.terminal,
                          fontSize: parseNumericInput(
                            event.target.value,
                            settings.terminal.fontSize,
                          ),
                        },
                      })
                    }
                  />
                </SettingsRow>

                <SettingsRow
                  label="历史行数"
                  hint="保留更多行会占用更多内存。"
                >
                  <FieldInput
                    type="number"
                    min={500}
                    step={100}
                    value={settings.terminal.scrollback}
                    onChange={(event) =>
                      onSettingsChange({
                        terminal: {
                          ...settings.terminal,
                          scrollback: parseNumericInput(
                            event.target.value,
                            settings.terminal.scrollback,
                          ),
                        },
                      })
                    }
                  />
                </SettingsRow>
              </SettingsCard>
            ) : null}

            {activeSection === "workspace" ? (
              <>
                <SettingsCard
                  title="当前工作区"
                  description="目前这里先展示状态；目录选择器后面再补进来。"
                >
                  <SettingsRow
                    label="路径"
                    hint="Agent 默认在这个目录下执行。"
                  >
                    <FieldInput value={settings.workspace} mono readOnly />
                  </SettingsRow>
                </SettingsCard>

                <SettingsCard
                  title="Soul 文件"
                  description="帮助 Agent 理解项目约束和用户偏好的本地文件状态。"
                >
                  <div className="space-y-3 px-6 py-5">
                    {soulStatus ? (
                      [
                        {
                          label: "SOUL.md",
                          status: soulStatus.soul,
                        },
                        {
                          label: "USER.md",
                          status: soulStatus.user,
                        },
                        {
                          label: "AGENTS.md",
                          status: soulStatus.agents,
                        },
                      ].map((item) => (
                        <div
                          key={item.label}
                          className="flex items-center justify-between rounded-[18px] border border-black/6 bg-[#fbfcfe] px-4 py-3"
                        >
                          <div>
                            <p className="text-[13px] font-medium text-foreground">
                              {item.label}
                            </p>
                            <p className="mt-1 text-[12px] text-muted-foreground">
                              {item.status.exists
                                ? `已加载 · ${item.status.sizeBytes} bytes`
                                : "未找到"}
                            </p>
                          </div>
                          <StatusBadge
                            ok={item.status.exists}
                            text={item.status.exists ? "可用" : "缺失"}
                          />
                        </div>
                      ))
                    ) : (
                      <p className="text-[12px] text-muted-foreground">
                        正在读取 Soul 文件状态…
                      </p>
                    )}
                  </div>
                </SettingsCard>
              </>
            ) : null}

            {activeSection === "archived" ? (
              <SettingsCard
                title="已归档线程"
                description="这里统一管理已经归档的会话，需要时可以直接恢复或者永久删除。"
              >
                <div className="space-y-3 px-6 py-5">
                  {archivedSummaries.length === 0 ? (
                    <div className="rounded-[20px] border border-dashed border-black/8 bg-[#fbfcfe] px-4 py-8 text-center text-[12px] text-muted-foreground">
                      暂时没有已归档线程。
                    </div>
                  ) : (
                    archivedSummaries.map((summary) => (
                      <div
                        key={summary.id}
                        className="flex flex-col gap-3 rounded-[20px] border border-black/6 bg-[#fbfcfe] px-4 py-4 md:flex-row md:items-center md:justify-between"
                      >
                        <button
                          type="button"
                          onClick={() => onOpenArchivedSession(summary.id)}
                          className="min-w-0 cursor-pointer text-left"
                        >
                          <p className="truncate text-[13px] font-medium text-foreground">
                            {summary.title}
                          </p>
                          <p className="mt-1 text-[12px] text-muted-foreground">
                            最后更新于 {formatArchivedTime(summary.updatedAt)}
                          </p>
                        </button>

                        <div className="flex shrink-0 items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => onUnarchiveSession(summary.id)}
                            className="h-9 rounded-xl border-black/8 bg-white px-3 text-[12px]"
                          >
                            恢复
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => onDeleteSession(summary.id)}
                            className="h-9 rounded-xl px-3 text-[12px] text-red-500 hover:bg-red-50"
                          >
                            删除
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </SettingsCard>
            ) : null}

            {activeSection === "about" ? (
              <SettingsCard
                title="关于"
                description="当前桌面壳的基础信息。"
              >
                <SettingsRow label="应用" hint="当前桌面应用版本。">
                  <FieldInput value="Pi Desktop Agent v1.0.0-dev" readOnly />
                </SettingsRow>

                <SettingsRow label="运行时" hint="前后端主要技术栈。">
                  <div className="rounded-[18px] border border-black/6 bg-[#fbfcfe] px-4 py-3 text-[12px] leading-6 text-muted-foreground">
                    <p>Engine: pi-agent-core</p>
                    <p>Runtime: Electron</p>
                    <p>UI: React 19 + Tailwind CSS 4</p>
                  </div>
                </SettingsRow>

                <SettingsRow
                  label="说明"
                  hint="这一版先解决设置视图体验问题。"
                >
                  <div className="rounded-[18px] border border-black/6 bg-[#fbfcfe] px-4 py-3 text-[12px] leading-6 text-muted-foreground">
                    设置已经从弹窗改成了主界面内嵌页面，后续可以继续把更多配置项逐步补齐。
                  </div>
                </SettingsRow>
              </SettingsCard>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
