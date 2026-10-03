import { useDisplayZone } from '@/hooks/use-display-zone';
import { formatDateTime } from '@/lib/time';

/** An API timestamp in the viewer's zone (or UTC when the toggle is on). */
export function DateTimeText({
  value,
  fallback = '—',
}: {
  value: string | null;
  fallback?: string;
}) {
  const { zone } = useDisplayZone();
  if (!value) return <span className="text-muted-foreground">{fallback}</span>;
  return (
    <time dateTime={value} title={value} className="whitespace-nowrap tabular-nums">
      {formatDateTime(value, zone)}
    </time>
  );
}
