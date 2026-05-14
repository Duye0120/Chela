import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@renderer/lib/utils";

const surfaceVariants = cva(
  "rounded-[var(--radius-shell)] transition-[background-color,box-shadow,color]",
  {
    variants: {
      tone: {
        shell: "bg-[color:var(--color-shell-panel)]",
        panel: "bg-[color:var(--color-control-panel-bg)]",
        control: "bg-[color:var(--color-control-bg)]",
        preview: "bg-[color:var(--color-control-bg)]",
        overlay: "bg-[color:var(--color-control-panel-bg)]",
        danger:
          "bg-[color:var(--chela-status-error-bg)] text-[color:var(--chela-status-error-text)]",
      },
      shadow: {
        none: "shadow-none",
        inset: "shadow-[var(--color-control-shadow)]",
        subtle: "shadow-[var(--shadow-subtle)]",
        flyout: "shadow-[var(--shadow-flyout)]",
      },
      padding: {
        none: "p-0",
        xs: "p-2",
        sm: "p-2.5",
        md: "p-4",
        lg: "p-5",
      },
    },
    defaultVariants: {
      tone: "panel",
      shadow: "none",
      padding: "none",
    },
  },
);

type SurfaceProps = React.HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof surfaceVariants>;

type PreviewSurfaceProps = Omit<SurfaceProps, "tone">;

function Surface({
  className,
  tone,
  shadow,
  padding,
  ...props
}: SurfaceProps) {
  return (
    <div
      className={cn(surfaceVariants({ tone, shadow, padding }), className)}
      {...props}
    />
  );
}

function PreviewSurface({
  className,
  shadow,
  padding,
  ...props
}: PreviewSurfaceProps) {
  return (
    <Surface
      tone="preview"
      shadow={shadow}
      padding={padding}
      className={cn("relative min-h-0 overflow-hidden", className)}
      {...props}
    />
  );
}

export { PreviewSurface, Surface, surfaceVariants };
