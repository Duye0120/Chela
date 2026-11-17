import type { ComponentProps } from "react";
import type { ControlSize } from "./button";

type Props = Omit<ComponentProps<"select">, "multiple" | "size"> & { size?: ControlSize };

export function Select({ className = "", size, ...props }: Props) {
  return <select {...props} data-size={size} className={`ui-field ui-select ${className}`.trimEnd()} />;
}
