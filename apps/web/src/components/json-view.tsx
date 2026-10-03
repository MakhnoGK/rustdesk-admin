/** Read-only JSON. Rendered as a text node, so React escapes it: never parsed as HTML. */
export function JsonView({ value, label }: { value: unknown; label: string }) {
  return (
    <pre
      role="region"
      aria-label={label}
      tabIndex={0}
      className="max-h-80 overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-xs leading-relaxed break-all whitespace-pre-wrap"
    >
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}
