import type { ComponentProps } from "react";
import { Button, type ControlSize } from "./button";
import { Tooltip } from "./tooltip";

type IconButtonProps = ComponentProps<"button"> & { "aria-label": string; size?: ControlSize; tooltip?: string };

export function IconButton({ className = "", type = "button", tooltip, ...props }: IconButtonProps) {
  const button = <Button variant="ghost" type={type} className={`ui-icon-button ${className}`.trimEnd()} {...props} />;
  return tooltip ? <Tooltip label={tooltip}>{button}</Tooltip> : button;
}
