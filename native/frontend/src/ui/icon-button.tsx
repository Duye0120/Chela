import type { ComponentProps } from "react";
import { Button } from "./button";

type IconButtonProps = ComponentProps<"button"> & { "aria-label": string };

export function IconButton({ className = "", type = "button", ...props }: IconButtonProps) {
  return <Button variant="ghost" type={type} className={`ui-icon-button ${className}`.trimEnd()} {...props} />;
}
