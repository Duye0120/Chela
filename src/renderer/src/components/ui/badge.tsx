import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@renderer/lib/utils";

const badgeVariants = cva(
  "inline-flex select-none items-center rounded-[var(--radius-control)] px-2.5 py-1 text-[11px] font-medium leading-none whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--color-control-focus-ring)]",
  {
    variants: {
      variant: {
        default:
          "bg-[color:var(--color-accent)] text-[color:var(--chela-text-inverse)]",
        secondary: "bg-[color:var(--color-control-bg)] text-foreground",
        outline:
          "bg-transparent text-[color:var(--color-text-secondary)] ring-1 ring-[color:var(--color-control-border)]",
        success: "bg-[color:var(--chela-status-success-bg)] text-[color:var(--chela-status-success-text)]",
        warning: "bg-[color:var(--chela-status-warning-bg)] text-[color:var(--chela-status-warning-text)]",
        destructive: "bg-[color:var(--chela-status-error-bg)] text-[color:var(--chela-status-error-text)]",
      },
    },
    defaultVariants: {
      variant: "secondary",
    },
  },
);

export interface BadgeProps
  extends
  React.HTMLAttributes<HTMLSpanElement>,
  VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
