import { Button } from "@renderer/components/assistant-ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from "@renderer/components/assistant-ui/dialog";
import { Switch } from "@renderer/components/assistant-ui/switch";
import { FieldInput } from "./shared";
import {
  CAPABILITY_FIELDS,
  applyDetectedMetadata,
  formatAutoLimit,
  getEntryDisplayName,
  parseOptionalNumber,
  resolveCapabilityChecked,
  toCapabilityOverrideValue,
  type EditableEntry,
  type SourceWorkspace,
} from "./keys-section-model";

type UpdateWorkspace = (
  sourceId: string,
  updater: (workspace: SourceWorkspace) => SourceWorkspace,
) => void;

export function ModelEntryDialog({
  currentEntry,
  currentWorkspace,
  entryDialogDirty,
  updateWorkspace,
  onCancel,
  onSave,
}: {
  currentEntry: EditableEntry | null;
  currentWorkspace: SourceWorkspace;
  entryDialogDirty: boolean;
  updateWorkspace: UpdateWorkspace;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <Dialog
      open={!!currentEntry}
      onOpenChange={(open) => {
        if (!open) {
          onCancel();
        }
      }}
    >
      {currentEntry ? (
        <DialogContent className="flex max-h-[min(84vh,760px)] max-w-[760px] flex-col gap-0 overflow-hidden rounded-[var(--radius-shell)] p-0">
          <div className="shrink-0 border-b border-[color:var(--color-border-light)] px-5 py-4">
            <DialogTitle className="text-[18px] text-foreground">
              {getEntryDisplayName(currentEntry)}
            </DialogTitle>
            <p className="mt-2 text-[12px] text-muted-foreground">
              这里主要保存模型元数据，供聊天和未来任务统一复用。自动值会优先使用内置的主流模型目录。
            </p>
          </div>

          <div className="min-h-0 overflow-y-auto">
            {!currentEntry.builtin ? (
              <div className="border-b border-[color:var(--color-border-light)] px-5 py-4">
                <div className="mb-2 text-[12px] font-medium text-foreground">
                  显示名称（可选）
                </div>
                <FieldInput
                  value={currentEntry.name}
                  onChange={(event) =>
                    updateWorkspace(
                      currentWorkspace.sourceId,
                      (workspace) => ({
                        ...workspace,
                        entries: workspace.entries.map((entry) =>
                          entry.id === currentEntry.id
                            ? { ...entry, name: event.target.value }
                            : entry,
                        ),
                      }),
                    )
                  }
                  placeholder="留空时根据模型 ID 自动生成"
                  className="h-8"
                />
                <p className="mt-2 text-[11px] text-muted-foreground">
                  当前预览：{getEntryDisplayName(currentEntry)}
                </p>
              </div>
            ) : null}

            <div className="px-5 py-4">
              {!currentEntry.builtin ? (
                <div className="mb-4">
                  <div className="mb-2 text-[12px] font-medium text-foreground">
                    模型 ID
                  </div>
                  <FieldInput
                    value={currentEntry.modelId}
                    onChange={(event) =>
                      updateWorkspace(
                        currentWorkspace.sourceId,
                        (workspace) => ({
                          ...workspace,
                          entries: workspace.entries.map((entry) =>
                            entry.id === currentEntry.id
                              ? applyDetectedMetadata(
                                entry,
                                event.target.value,
                              )
                              : entry,
                          ),
                        }),
                      )
                    }
                    placeholder="模型 ID，例如 gpt-4o-mini"
                    className="h-8"
                    mono
                  />
                </div>
              ) : null}
              <div className="grid gap-3 md:grid-cols-2">
                {CAPABILITY_FIELDS.map(({ key, label }) => (
                  <div
                    key={key}
                    className="rounded-[var(--radius-shell)] border border-[color:var(--color-control-border)] bg-[color:var(--color-control-bg)] px-3 py-3 shadow-[var(--color-control-shadow)]"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 text-[12px] font-medium text-foreground">
                        {label}
                      </div>
                      <Switch
                        aria-label={`${label} 开关`}
                        checked={resolveCapabilityChecked(
                          currentEntry,
                          key,
                        )}
                        onCheckedChange={(checked) =>
                          updateWorkspace(
                            currentWorkspace.sourceId,
                            (workspace) => ({
                              ...workspace,
                              entries: workspace.entries.map((entry) =>
                                entry.id === currentEntry.id
                                  ? {
                                    ...entry,
                                    capabilities: {
                                      ...entry.capabilities,
                                      [key]: toCapabilityOverrideValue(
                                        entry.detectedCapabilities[key],
                                        checked === true,
                                      ),
                                    },
                                  }
                                  : entry,
                              ),
                            }),
                          )
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="rounded-[var(--radius-shell)] border border-[color:var(--color-control-border)] bg-[color:var(--color-control-bg)] px-3 py-3 shadow-[var(--color-control-shadow)]">
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="text-[12px] font-medium text-foreground">
                      上下文窗口
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      自动：
                      {formatAutoLimit(
                        currentEntry.detectedLimits.contextWindow,
                      )}
                    </div>
                  </div>
                  <div className="mt-2">
                    <FieldInput
                      value={
                        currentEntry.limits.contextWindow?.toString() ?? ""
                      }
                      onChange={(event) =>
                        updateWorkspace(
                          currentWorkspace.sourceId,
                          (workspace) => ({
                            ...workspace,
                            entries: workspace.entries.map((entry) =>
                              entry.id === currentEntry.id
                                ? {
                                  ...entry,
                                  limits: {
                                    ...entry.limits,
                                    contextWindow: parseOptionalNumber(
                                      event.target.value,
                                    ),
                                  },
                                }
                                : entry,
                            ),
                          }),
                        )
                      }
                      placeholder="留空表示自动"
                      mono
                      className="h-8"
                    />
                  </div>
                </div>

                <div className="rounded-[var(--radius-shell)] border border-[color:var(--color-control-border)] bg-[color:var(--color-control-bg)] px-3 py-3 shadow-[var(--color-control-shadow)]">
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="text-[12px] font-medium text-foreground">
                      最大输出 Tokens
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      自动：
                      {formatAutoLimit(
                        currentEntry.detectedLimits.maxOutputTokens,
                      )}
                    </div>
                  </div>
                  <div className="mt-2">
                    <FieldInput
                      value={
                        currentEntry.limits.maxOutputTokens?.toString() ?? ""
                      }
                      onChange={(event) =>
                        updateWorkspace(
                          currentWorkspace.sourceId,
                          (workspace) => ({
                            ...workspace,
                            entries: workspace.entries.map((entry) =>
                              entry.id === currentEntry.id
                                ? {
                                  ...entry,
                                  limits: {
                                    ...entry.limits,
                                    maxOutputTokens:
                                      parseOptionalNumber(
                                        event.target.value,
                                      ),
                                  },
                                }
                                : entry,
                            ),
                          }),
                        )
                      }
                      placeholder="留空表示自动"
                      mono
                      className="h-8"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-[color:var(--color-border-light)] px-5 py-4">
              <div className="mb-2 text-[12px] font-medium text-foreground">
                额外参数（JSON，可选）
              </div>
              <textarea
                value={currentEntry.providerOptionsText}
                onChange={(event) =>
                  updateWorkspace(
                    currentWorkspace.sourceId,
                    (workspace) => ({
                      ...workspace,
                      entries: workspace.entries.map((entry) =>
                        entry.id === currentEntry.id
                          ? {
                            ...entry,
                            providerOptionsText: event.target.value,
                          }
                          : entry,
                      ),
                    }),
                  )
                }
                className="min-h-[120px] w-full rounded-[var(--radius-shell)] border-none bg-[color:var(--color-control-bg)] px-3 py-2.5 font-mono text-[12px] text-foreground shadow-[var(--color-control-shadow)] ring-1 ring-[color:var(--color-control-border)] outline-none transition-[background-color,color,box-shadow] focus-visible:bg-[color:var(--color-control-bg-active)] focus-visible:ring-2 focus-visible:ring-[color:var(--color-control-focus-ring)]"
                placeholder='例如：{ "compat": { "supportsStore": false } }'
              />
            </div>
          </div>

          <div className="shrink-0 border-t border-[color:var(--color-border-light)] bg-shell-panel px-5 py-3">
            <DialogFooter className="flex-col gap-3 sm:space-x-0 md:flex-row md:items-center md:justify-between">
              <div className="text-[11px] text-muted-foreground">
                这里的保存会先应用到当前页面，仍需点击页面底部“保存修改”才会真正写入配置。
              </div>
              <div className="flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onCancel}
                  className="h-8 rounded-[var(--radius-shell)] px-3 text-[12px]"
                >
                  取消
                </Button>
                <Button
                  type="button"
                  onClick={onSave}
                  disabled={!entryDialogDirty}
                  className="h-8 rounded-[var(--radius-shell)] bg-foreground px-3 text-[12px] text-background hover:bg-foreground/90"
                >
                  保存并关闭
                </Button>
              </div>
            </DialogFooter>
          </div>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
