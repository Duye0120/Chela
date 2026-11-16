import * as Menu from "@radix-ui/react-dropdown-menu";
import type { ComponentProps, ReactNode } from "react";
import { Check } from "lucide-react";

export { Root, Trigger, Group, Item, Separator, Sub, SubTrigger, RadioGroup } from "@radix-ui/react-dropdown-menu";

export function Content({ className = "", ...props }: ComponentProps<typeof Menu.Content>) {
  return <Menu.Portal><Menu.Content className={`ui-menu ${className}`.trimEnd()} loop sideOffset={8} collisionPadding={8} {...props} /></Menu.Portal>;
}

export function SubContent({ className = "", ...props }: ComponentProps<typeof Menu.SubContent>) {
  return <Menu.Portal><Menu.SubContent className={`ui-menu ${className}`.trimEnd()} loop sideOffset={4} collisionPadding={8} {...props} /></Menu.Portal>;
}

export function RadioItem({ children, ...props }: ComponentProps<typeof Menu.RadioItem>) {
  return <Menu.RadioItem {...props}>
    <span className="ui-menu-check"><Menu.ItemIndicator><Check /></Menu.ItemIndicator></span>{children}
  </Menu.RadioItem>;
}

type ChoiceProps<T extends string> = {
  label: string;
  options: readonly { value: T; label: ReactNode; disabled?: boolean }[];
  value: T;
  onChange: (value: T) => void;
};

export function Choices<T extends string>({ label, options, value, onChange }: ChoiceProps<T>) {
  return <Menu.RadioGroup aria-label={label} value={value}>
    {options.map(option =>
      <RadioItem key={option.value} value={option.value} disabled={option.disabled}
        onSelect={() => onChange(option.value)}>{option.label}</RadioItem>)}
  </Menu.RadioGroup>;
}
