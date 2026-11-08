import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@renderer/lib/utils"

const buttonVariants = cva(
  "inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-[var(--radius-control)] text-sm font-medium transition-[background-color,color,box-shadow] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-control-focus-ring)] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-[color:var(--color-accent)] text-[color:var(--chela-text-inverse)] hover:bg-[color:var(--color-accent-hover)]",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "bg-transparent text-foreground ring-1 ring-inset ring-[color:var(--color-control-border)] hover:bg-[color:var(--color-control-bg-hover)]",
        secondary:
          "bg-[color:var(--color-control-bg)] text-foreground hover:bg-[color:var(--color-control-bg-hover)]",
        ghost:
          "text-[color:var(--color-text-secondary)] hover:bg-[color:var(--color-control-bg-hover)] hover:text-foreground aria-pressed:bg-[color:var(--color-selection-bg)] aria-pressed:text-[color:var(--color-selection-fg)]",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-[var(--control-size-md)] px-3",
        sm: "h-[var(--control-size-sm)] px-2.5",
        xs: "h-[var(--control-size-xs)] px-2 text-xs",
        lg: "h-[var(--control-size-lg)] px-4",
        icon: "h-[var(--control-size-md)] w-[var(--control-size-md)]",
        "icon-sm": "h-[var(--control-size-sm)] w-[var(--control-size-sm)]",
        "icon-xs": "h-[var(--control-size-xs)] w-[var(--control-size-xs)]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
  VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
