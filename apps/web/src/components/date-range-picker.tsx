import { CalendarIcon, XIcon } from 'lucide-react';
import { useState } from 'react';
import type { DateRange } from 'react-day-picker';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { startOfDayIn, toDay } from '@/lib/time';
import { cn } from '@/lib/utils';

export interface DayRange {
  /** `yyyy-MM-dd`, inclusive. */
  from: string;
  /** `yyyy-MM-dd`, inclusive. */
  to: string;
}

function label(range: Partial<DayRange>): string {
  if (range.from && range.to)
    return range.from === range.to ? range.from : `${range.from} – ${range.to}`;
  if (range.from) return `From ${range.from}`;
  return 'Any date';
}

/**
 * Picks calendar days. Days are kept as `yyyy-MM-dd`; the caller converts them to a UTC `[from, to)`
 * range in the display zone with `dayRangeToUtc`.
 */
export function DateRangePicker({
  value,
  onChange,
  id,
  className,
}: {
  value: Partial<DayRange>;
  onChange: (value: DayRange | undefined) => void;
  id?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>();

  const selected: DateRange | undefined = value.from
    ? {
        from: startOfDayIn(value.from, undefined),
        to: value.to ? startOfDayIn(value.to, undefined) : undefined,
      }
    : undefined;

  return (
    <div className={cn('flex items-center gap-1', className)}>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          setDraft(next ? selected : undefined);
        }}
      >
        <PopoverTrigger asChild>
          <Button
            id={id}
            variant="outline"
            className={cn('justify-start font-normal', !value.from && 'text-muted-foreground')}
          >
            <CalendarIcon aria-hidden />
            {label(value)}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="range"
            numberOfMonths={1}
            selected={draft}
            onSelect={setDraft}
            disabled={{ after: new Date() }}
          />
          <div className="flex items-center justify-end gap-2 border-t p-2">
            <Button variant="ghost" size="sm" onClick={() => setDraft(undefined)}>
              Reset
            </Button>
            <Button
              size="sm"
              disabled={!draft?.from}
              onClick={() => {
                if (!draft?.from) return;
                // The picker hands out local calendar dates: only their y-m-d is used.
                onChange({
                  from: toDay(draft.from, undefined),
                  to: toDay(draft.to ?? draft.from, undefined),
                });
                setOpen(false);
              }}
            >
              Apply
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      {value.from ? (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Clear date range"
          onClick={() => onChange(undefined)}
        >
          <XIcon aria-hidden />
        </Button>
      ) : null}
    </div>
  );
}
