import { FilterXIcon } from 'lucide-react';
import { useId } from 'react';
import { DateRangePicker } from '@/components/date-range-picker';
import { DebouncedInput } from '@/components/debounced-input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { boundToDay } from '@/lib/range';
import { hasHistoryFilters, SESSION_STATUSES, type HistorySearch } from '../schemas';

type Update = (patch: Record<string, string | number | boolean | undefined>) => void;

const ANY = 'any';

export function SessionHistoryFilters({
  state,
  update,
  onClear,
}: {
  state: HistorySearch;
  update: Update;
  onClear: () => void;
}) {
  const id = useId();
  return (
    <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-status`}>Status</Label>
        <Select
          value={state.status ?? ANY}
          onValueChange={(v) => update({ status: v === ANY ? undefined : v })}
        >
          <SelectTrigger id={`${id}-status`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any status</SelectItem>
            {SESSION_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s.charAt(0) + s.slice(1).toLowerCase()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-device`}>Target device ID</Label>
        <DebouncedInput
          id={`${id}-device`}
          value={state.deviceId}
          onCommit={(deviceId) => update({ deviceId })}
          placeholder="e.g. 123456789"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-initiator`}>Initiator ID</Label>
        <DebouncedInput
          id={`${id}-initiator`}
          value={state.initiatorId}
          onCommit={(initiatorId) => update({ initiatorId })}
          placeholder="e.g. 987654321"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-auth`}>Authenticated</Label>
        <Select
          value={state.authenticated === undefined ? ANY : String(state.authenticated)}
          onValueChange={(v) => update({ authenticated: v === ANY ? undefined : v === 'true' })}
        >
          <SelectTrigger id={`${id}-auth`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any</SelectItem>
            <SelectItem value="true">Authenticated</SelectItem>
            <SelectItem value="false">Not authenticated</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5 lg:col-span-2 xl:col-span-1">
        <Label htmlFor={`${id}-range`}>Started</Label>
        <DateRangePicker
          id={`${id}-range`}
          className="w-full [&>button:first-child]:flex-1"
          value={{ from: boundToDay(state.from), to: boundToDay(state.to) }}
          onChange={(range) => update({ from: range?.from, to: range?.to })}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-min`}>Min. duration, min</Label>
        <DebouncedInput
          id={`${id}-min`}
          inputMode="numeric"
          value={state.minDurationMinutes?.toString()}
          onCommit={(v) => {
            const n = v === undefined ? undefined : Number(v);
            update({
              minDurationMinutes: n !== undefined && Number.isInteger(n) && n >= 0 ? n : undefined,
            });
          }}
          placeholder="0"
        />
      </div>
      <div className="flex items-end">
        <Button variant="ghost" onClick={onClear} disabled={!hasHistoryFilters(state)}>
          <FilterXIcon aria-hidden />
          Clear filters
        </Button>
      </div>
    </div>
  );
}
