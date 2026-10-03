import { DateRangePicker } from '@/components/date-range-picker';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { PERIOD_LABELS, type DashboardSearch, type Period } from '../schemas';

const PRESETS: { value: Exclude<Period, 'custom'>; short: string }[] = [
  { value: '24h', short: '24 h' },
  { value: '7d', short: '7 d' },
  { value: '30d', short: '30 d' },
];

export function PeriodSelect({
  state,
  onChange,
}: {
  state: DashboardSearch;
  onChange: (patch: { period: Period; from?: string; to?: string }) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ToggleGroup
        type="single"
        variant="outline"
        value={state.period === 'custom' ? '' : state.period}
        onValueChange={(v) => {
          if (v) onChange({ period: v as Period, from: undefined, to: undefined });
        }}
        aria-label="Period"
      >
        {PRESETS.map((p) => (
          <ToggleGroupItem key={p.value} value={p.value} aria-label={PERIOD_LABELS[p.value]}>
            {p.short}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <DateRangePicker
        value={state.period === 'custom' ? { from: state.from, to: state.to } : {}}
        onChange={(range) =>
          onChange(
            range
              ? { period: 'custom', from: range.from, to: range.to }
              : { period: '24h', from: undefined, to: undefined },
          )
        }
      />
    </div>
  );
}
