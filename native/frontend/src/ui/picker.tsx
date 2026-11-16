import * as Popover from "@radix-ui/react-popover";
import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "./button";
import "./workspace-controls.css";

type Props = {
  label: string;
  trigger: ReactNode;
  section: "model" | "permission";
  children: ReactNode;
};

export function Picker({ label, trigger, section, children }: Props) {
  return <Popover.Root>
    <Popover.Trigger asChild>
      <Button variant="ghost" className="ui-picker-trigger" aria-label={label}>
        {trigger}<ChevronDown className="ui-picker-chevron" size={14} />
      </Button>
    </Popover.Trigger>
    <Popover.Portal>
      <Popover.Content className={`ui-picker ui-${section}-picker`} side="top" align="end"
        sideOffset={8} collisionPadding={8} aria-label={label}>
        {children}
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>;
}

export const PickerClose = Popover.Close;
