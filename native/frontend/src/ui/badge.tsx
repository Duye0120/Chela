import type { ReactNode } from "react";

type Tone = "info" | "success" | "warning" | "error";

export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className="ui-badge" data-tone={tone}>{children}</span>;
}
