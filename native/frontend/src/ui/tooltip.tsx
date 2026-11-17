import { cloneElement, useEffect, useId, useRef, useState, type ComponentProps, type ReactElement } from "react";
import * as Popover from "@radix-ui/react-popover";

export function Tooltip({ label, children }: { label: string; children: ReactElement<ComponentProps<"button">> }) {
  const [open, setOpen] = useState(false);
  const id = useId(), timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const show = () => { clearTimeout(timer.current); setOpen(true); };
  const hide = () => { clearTimeout(timer.current); timer.current = setTimeout(() => setOpen(false), 120); };
  return <Popover.Root open={open} onOpenChange={setOpen}>
    <Popover.Anchor asChild>{cloneElement(children, {
      title: undefined,
      "aria-describedby": open && label !== children.props["aria-label"] ? id : children.props["aria-describedby"],
      onPointerEnter: event => { children.props.onPointerEnter?.(event); show(); },
      onPointerLeave: event => { children.props.onPointerLeave?.(event); hide(); },
      onFocus: event => { children.props.onFocus?.(event); show(); },
      onBlur: event => { children.props.onBlur?.(event); hide(); },
    })}</Popover.Anchor>
    <Popover.Portal><Popover.Content id={id} role="tooltip" className="ui-tooltip" side="top" sideOffset={8} collisionPadding={8}
      onPointerEnter={show} onPointerLeave={hide} onOpenAutoFocus={event => event.preventDefault()} onCloseAutoFocus={event => event.preventDefault()}>{label}</Popover.Content></Popover.Portal>
  </Popover.Root>;
}
