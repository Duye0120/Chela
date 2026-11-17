import type { ComponentProps } from "react";

export type ControlSize = "small" | "toolbar" | "default" | "large";
type Props = ComponentProps<"button"> & { variant?: "primary" | "secondary" | "ghost"; size?: ControlSize };

export function Button({ type = "button", variant = "secondary", size, className = "", ...props }: Props) {
  return <button {...props} type={type} data-variant={variant} data-size={size} className={`ui-button ${className}`.trimEnd()} />;
}
