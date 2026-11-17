import { LogsSection } from "./logs-section";
import { AboutSection } from "./about-section";
import { RuntimeDiagnosticsSection } from "./runtime-diagnostics-section";

type SystemSectionProps = {
  timeZone: string;
};

export function SystemSection({
  timeZone,
}: SystemSectionProps) {
  return (
    <div className="space-y-4">
      <RuntimeDiagnosticsSection timeZone={timeZone} />
      <LogsSection timeZone={timeZone} />
      <AboutSection />
    </div>
  );
}
