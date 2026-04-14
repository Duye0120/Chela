import type { Settings } from "@shared/contracts";
import { AppearanceSection } from "./appearance-section";
import { TerminalSection } from "./terminal-section";

export function InterfaceSection({
  settings,
  onSettingsChange,
}: {
  settings: Settings;
  onSettingsChange: (partial: Partial<Settings>) => void;
}) {
  return (
    <div className="space-y-4">
      <AppearanceSection
        settings={settings}
        onSettingsChange={onSettingsChange}
      />
      <TerminalSection
        settings={settings}
        onSettingsChange={onSettingsChange}
      />
    </div>
  );
}
