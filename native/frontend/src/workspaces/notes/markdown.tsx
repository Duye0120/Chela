import { Markdown, MarkdownBlock } from "../../ui/markdown";
import type { WorkNote } from "../../data/work";

type Links = { notes: WorkNote[]; onOpen: (id: string) => void };
const resolve = (notes: WorkNote[]) => (reference: string) => notes.find(note => note.id === reference || note.title === reference);

export function MarkdownNote({ notes, ...props }: { content: string; onDiff?: (path: string) => void } & Links) {
  return <Markdown {...props} resolveLink={resolve(notes)} />;
}

export function BlockView({ notes, ...props }: { value: string; onToggle?: () => void } & Links) {
  return <MarkdownBlock {...props} resolveLink={resolve(notes)} />;
}
