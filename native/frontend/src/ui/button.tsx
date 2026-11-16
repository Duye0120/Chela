import type { ComponentProps } from "react";

type Props = ComponentProps<"button"> & { variant?: "primary" | "secondary" | "ghost" };

export function Button({ type = "button", variant = "secondary", className = "", ...props }: Props) {
  return <button {...props} type={type} data-variant={variant} className={`ui-button ${className}`.trimEnd()} />;
}
