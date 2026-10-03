import { addMinutes, startOfMinute, subDays, subHours } from 'date-fns';
import { z } from 'zod';
import { dayParam, enumParam } from '@/lib/url-state';
import { dayRangeToUtc, toDay, type DisplayZone } from '@/lib/time';

export const PERIODS = ['24h', '7d', '30d', 'custom'] as const;
export type Period = (typeof PERIODS)[number];

export const PERIOD_LABELS: Record<Period, string> = {
  '24h': 'Last 24 hours',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  custom: 'Custom range',
};

export const dashboardSearchSchema = z.object({
  period: enumParam(PERIODS).transform((v) => v ?? '24h'),
  from: dayParam,
  to: dayParam,
});

export type DashboardSearch = z.output<typeof dashboardSearchSchema>;

export type Bucket = 'hour' | 'day';

export interface ResolvedRange {
  /** UTC ISO, inclusive. */
  from: string;
  /** UTC ISO, exclusive. */
  to: string;
  bucket: Bucket;
}

const HOUR_BUCKET_MAX_MS = 48 * 3600_000;

/** `hour` buckets for ranges up to 48 h, `day` otherwise. */
export function bucketFor(fromIso: string, toIso: string): Bucket {
  return Date.parse(toIso) - Date.parse(fromIso) <= HOUR_BUCKET_MAX_MS ? 'hour' : 'day';
}

/**
 * The selected period as a UTC `[from, to)` range. "Last 24 hours" ends at the next whole minute
 * (stable query keys within a minute); day periods are whole calendar days in the display zone,
 * today included.
 */
export function resolvePeriod(s: DashboardSearch, zone: DisplayZone, now: Date): ResolvedRange {
  let range: { from: string; to: string };
  if (s.period === 'custom' && s.from) {
    range = dayRangeToUtc(s.from, s.to ?? s.from, zone);
  } else if (s.period === '7d' || s.period === '30d') {
    const days = s.period === '7d' ? 7 : 30;
    range = dayRangeToUtc(toDay(subDays(now, days - 1), zone), toDay(now, zone), zone);
  } else {
    const end = addMinutes(startOfMinute(now), 1);
    range = { from: subHours(end, 24).toISOString(), to: end.toISOString() };
  }
  return { ...range, bucket: bucketFor(range.from, range.to) };
}
