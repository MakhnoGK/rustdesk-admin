import { XIcon } from 'lucide-react';
import { argbToHex, readableTextOn } from '@/lib/color';

/** A tag with its ARGB color. With `onRemove`, it gets a remove button. */
export function TagChip({
  name,
  color,
  onRemove,
}: {
  name: string;
  /** ARGB integer; `undefined` when the tag is not defined in the book (shown neutral). */
  color: number | undefined;
  onRemove?: () => void;
}) {
  const style =
    color === undefined
      ? undefined
      : { backgroundColor: argbToHex(color), color: readableTextOn(color) };
  return (
    <span
      className="inline-flex max-w-48 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium"
      style={style}
    >
      <span className="truncate">{name}</span>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="-mr-1 rounded-full p-0.5 hover:bg-black/15 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          aria-label={`Remove tag ${name}`}
        >
          <XIcon className="size-3" aria-hidden />
        </button>
      ) : null}
    </span>
  );
}

export function TagColorDot({ color }: { color: number }) {
  return (
    <span
      aria-hidden
      className="inline-block size-3 shrink-0 rounded-full border"
      style={{ backgroundColor: argbToHex(color) }}
    />
  );
}
