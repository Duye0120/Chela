export function HighlightText({ text, query = "" }: { text: string; query?: string }) {
  const value = query.trim();
  const index = value ? text.toLocaleLowerCase().indexOf(value.toLocaleLowerCase()) : -1;
  return index < 0 ? text : <>{text.slice(0, index)}<mark>{text.slice(index, index + value.length)}</mark>{text.slice(index + value.length)}</>;
}
