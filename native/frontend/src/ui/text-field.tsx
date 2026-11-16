import type { ComponentProps } from "react";
import { Search } from "lucide-react";

export function Input({ className = "", ...props }: ComponentProps<"input">) {
  return <input {...props} className={`ui-field ${className}`.trimEnd()} />;
}

export function Textarea({ className = "", ...props }: ComponentProps<"textarea">) {
  return <textarea {...props} className={`ui-field ${className}`.trimEnd()} />;
}

export function SearchField(props: Omit<ComponentProps<"input">, "type">) {
  return <div className="ui-search-field">
    <Search aria-hidden="true" />
    <Input {...props} type="search" />
  </div>;
}
