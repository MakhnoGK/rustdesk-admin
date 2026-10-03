import type { SessionCloseReason } from '@/api/types';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { closeReasonText } from '@/lib/format';
import { formatDuration } from '@/lib/time';

/**
 * A duration from the API. Estimated ones (closed by reconciliation, timeout or supersede, not by
 * a close event) get `≈` and a tooltip with the reason; the tooltip always gives the raw seconds.
 */
export function DurationText({
  seconds,
  estimated = false,
  closeReason = null,
}: {
  seconds: number | null;
  estimated?: boolean;
  closeReason?: SessionCloseReason | null;
}) {
  if (seconds === null) return <span className="text-muted-foreground">—</span>;
  const text = `${estimated ? '≈ ' : ''}${formatDuration(seconds)}`;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="cursor-help rounded-sm whitespace-nowrap tabular-nums underline decoration-dotted underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          aria-label={
            estimated ? `About ${formatDuration(seconds)} (estimated)` : formatDuration(seconds)
          }
        >
          {text}
        </button>
      </TooltipTrigger>
      <TooltipContent>
        <p>{seconds.toLocaleString('en-US')} s</p>
        {estimated ? (
          <p>
            Estimated: {closeReason ? closeReasonText(closeReason) : 'no close event was reported'}
          </p>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
}
