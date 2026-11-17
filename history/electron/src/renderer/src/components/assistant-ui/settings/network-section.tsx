import type { Settings } from "@shared/contracts";
import { Switch } from "@renderer/components/assistant-ui/switch";
import { FieldInput, SettingsCard, SettingsRow } from "./shared";

export function NetworkSection({
  settings,
  onSettingsChange,
}: {
  settings: Settings;
  onSettingsChange: (partial: Partial<Settings>) => void;
}) {
  return (
    <SettingsCard
      title="网络"
      description="代理和超时单独收口，避免和默认行为混在同一页。"
    >
      <SettingsRow
        label="网络代理"
        hint="开启后会把运行时网络请求切到全局代理。本地地址可通过 noProxy 保持直连。"
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-[var(--radius-shell)] bg-[color:var(--color-control-bg)] px-3 py-2 shadow-[var(--color-control-shadow)] ring-1 ring-[color:var(--color-control-border)]">
            <div className="space-y-0.5">
              <p className="text-[13px] font-medium text-foreground">启用代理</p>
              <p className="text-[12px] leading-5 text-muted-foreground">
                关闭时直接走系统网络。
              </p>
            </div>
            <Switch
              checked={settings.network.proxy.enabled}
              onCheckedChange={(checked) =>
                onSettingsChange({
                  network: {
                    proxy: {
                      enabled: checked === true,
                    },
                  },
                } as Partial<Settings>)
              }
            />
          </div>

          <FieldInput
            value={settings.network.proxy.url}
            onChange={(event) =>
              onSettingsChange({
                network: {
                  proxy: {
                    url: event.target.value,
                  },
                },
              } as Partial<Settings>)
            }
            placeholder="http://127.0.0.1:7890"
            mono
          />

          <FieldInput
            value={settings.network.proxy.noProxy}
            onChange={(event) =>
              onSettingsChange({
                network: {
                  proxy: {
                    noProxy: event.target.value,
                  },
                },
              } as Partial<Settings>)
            }
            placeholder="localhost,127.0.0.1"
            mono
          />
        </div>
      </SettingsRow>

      <SettingsRow
        label="请求超时"
        hint="用于 web_search、web_fetch 和其他运行时网络请求。"
      >
        <FieldInput
          type="number"
          min={1000}
          max={120000}
          step={1000}
          value={String(settings.network.timeoutMs)}
          onChange={(event) =>
            onSettingsChange({
              network: {
                timeoutMs: Number(event.target.value),
              },
            } as Partial<Settings>)
          }
        />
      </SettingsRow>
    </SettingsCard>
  );
}
