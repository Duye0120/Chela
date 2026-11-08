import type { InputHTMLAttributes, ReactNode } from "react";
import {
  CheckCircleIcon,
  ExclamationCircleIcon,
} from "@heroicons/react/24/outline";
import { Badge } from "@renderer/components/assistant-ui/badge";
import { Select } from "@renderer/components/assistant-ui/select";
import { surfaceVariants } from "@renderer/components/assistant-ui/surface";
import { cn } from "@renderer/lib/utils";

export function SettingsCard({
  title,
  description,
  children,
  className,
  headerClassName,
  bodyClassName,
  headerAction,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
  headerClassName?: string;
  bodyClassName?: string;
  headerAction?: ReactNode;
}) {
  return (
    <section className={cn(surfaceVariants({ tone: "panel" }), "overflow-hidden bg-shell-panel-muted", className)}>
      {title || description ? (
        <div
          className={cn(
            "flex flex-wrap items-start justify-between gap-3 px-4 py-4 sm:px-5",
            headerClassName,
          )}
        >
          <div className="min-w-0 flex-1">
            {title ? (
              <h2 className="text-lg font-semibold tracking-tight text-foreground">
                {title}
              </h2>
            ) : null}
            {description ? (
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
          {headerAction ? (
            <div className="shrink-0">{headerAction}</div>
          ) : null}
        </div>
      ) : null}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

export function SettingsBlock({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="px-4 py-4 sm:px-5">
      <div className="mb-3">
        <p className="text-[13px] font-semibold tracking-[-0.01em] text-foreground">{label}</p>
        {hint ? (
          <p className="mt-1 text-[12px] leading-5 text-muted-foreground">{hint}</p>
        ) : null}
      </div>
      {children}
    </div>
  );
}

export function SettingsRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-t border-[color:var(--color-control-border)] px-4 py-3.5 first:border-t-0 sm:px-5 md:flex-row md:items-center md:justify-between md:gap-6">
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium tracking-[-0.01em] text-foreground">{label}</p>
        {hint ? (
          <p className="mt-1.5 text-[12px] leading-5 text-muted-foreground">
            {hint}
          </p>
        ) : null}
      </div>
      <div className="w-full md:max-w-[336px]">{children}</div>
    </div>
  );
}

export function FieldInput(
  props: InputHTMLAttributes<HTMLInputElement> & {
    mono?: boolean;
  },
) {
  const { className = "", mono = false, ...rest } = props;

  return (
    <input
      {...rest}
      className={cn("chela-field w-full text-sm placeholder:text-muted-foreground", mono && "font-mono", className)}
    />
  );
}

export function FieldSelect(props: {
  value: string;
  onChange: (value: string) => void;
  options: readonly { value: string; label: string; disabled?: boolean }[];
  className?: string;
  disabled?: boolean;
}) {
  const { options, className = "", value, onChange, disabled = false } = props;

  return (
    <Select
      value={value}
      onValueChange={onChange}
      disabled={disabled}
      options={options.map((option) => ({
        value: option.value,
        label: option.label,
        textValue: option.label,
        disabled: option.disabled,
      }))}
      className={cn("w-full", className)}
    />
  );
}

export function StatusBadge({
  ok,
  text,
}: {
  ok: boolean;
  text: string;
}) {
  return (
    <Badge variant={ok ? "success" : "warning"} className="gap-1">
      {ok ? (
        <CheckCircleIcon className="h-3.5 w-3.5" />
      ) : (
        <ExclamationCircleIcon className="h-3.5 w-3.5" />
      )}
      {text}
    </Badge>
  );
}
