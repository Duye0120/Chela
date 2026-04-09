import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@renderer/lib/utils";

const badgeVariants = cva(
  "inline-flex select-none items-center rounded-full px-2.5 py-1 text-[11px] font-medium leading-none whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/35",
  {
    variants: {
      variant: {
        default:
          "bg-foreground text-background shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]",
        secondary: "bg-shell-panel-contrast text-foreground",
        outline:
          "border border-[color:var(--color-border-light)] bg-transparent text-[color:var(--color-text-secondary)]",
        success: "bg-emerald-100 text-emerald-900",
        warning: "bg-amber-100 text-amber-900",
        destructive: "bg-rose-100 text-rose-900",
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
