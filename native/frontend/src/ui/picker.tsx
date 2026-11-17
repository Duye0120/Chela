import * as Popover from "@radix-ui/react-popover";
import { ChevronDown } from "lucide-react";
import { useRef, type ReactNode } from "react";
import { Button } from "./button";
import "./workspace-controls.css";

type Props = {
  label: string;
  trigger: ReactNode;
  section: "model" | "permission";
  children: ReactNode;
  onEscapeKeyDown?: (event: KeyboardEvent) => void;
  onOpenChange?: (open: boolean) => void;
};

export function Picker({ label, trigger, section, children, onEscapeKeyDown, onOpenChange }: Props) {
  const keyboard = useRef(false), content = useRef<HTMLDivElement>(null);
  return <Popover.Root onOpenChange={onOpenChange}>
    <Popover.Trigger asChild>
      <Button variant="ghost" className="ui-picker-trigger" aria-label={label} onPointerDown={()=>{keyboard.current=false}} onKeyDown={()=>{keyboard.current=true}}>
        {trigger}<ChevronDown className="ui-picker-chevron" size={14} />
      </Button>
    </Popover.Trigger>
    <Popover.Portal>
      <Popover.Content ref={content} className={`ui-picker ui-${section}-picker`} side="top" align="end"
        onOpenAutoFocus={event=>{if(section==="model"){event.preventDefault();if(keyboard.current)content.current?.querySelector<HTMLInputElement>('input[type="search"]')?.focus()}}}
        onEscapeKeyDown={onEscapeKeyDown}
        sideOffset={8} collisionPadding={8} aria-label={label}>
        {children}
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>;
}

export const PickerClose = Popover.Close;
