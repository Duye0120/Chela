import type { ComponentProps } from "react";

type Props = Omit<ComponentProps<"select">, "multiple" | "size">;

export function Select({ className = "", ...props }: Props) {
  return <select {...props} className={`ui-field ui-select ${className}`.trimEnd()} />;
}
