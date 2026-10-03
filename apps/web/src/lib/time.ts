import { tz, TZDate } from '@date-fns/tz';
import { addDays, differenceInSeconds, format, isValid, parseISO } from 'date-fns';

/** `undefined` = the viewer's local time zone. */
export type DisplayZone = 'UTC' | undefined;

const ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/;

/** Parses an API timestamp (ISO-8601 with an explicit offset, normally `Z`). Throws on anything else. */
export function parseApiDate(iso: string): Date {
  if (!ISO_WITH_ZONE.test(iso)) throw new RangeError(`Not an ISO-8601 UTC timestamp: ${iso}`);
  const date = parseISO(iso);
  if (!isValid(date)) throw new RangeError(`Invalid timestamp: ${iso}`);
  return date;
}

function zoned(date: Date, zone: DisplayZone): Date {
  return zone ? new TZDate(date, zone) : date;
}

/** `2026-10-03 14:05:09` in the display zone; UTC gets an explicit suffix. */
export function formatDateTime(iso: string, zone: DisplayZone): string {
  const text = format(zoned(parseApiDate(iso), zone), 'yyyy-MM-dd HH:mm:ss');
  return zone ? `${text} UTC` : text;
}

export function formatDateShort(iso: string, zone: DisplayZone): string {
  return format(zoned(parseApiDate(iso), zone), 'MMM d, HH:mm');
}

/** Axis label for a time-series bucket. */
export function formatBucket(iso: string, bucket: 'hour' | 'day', zone: DisplayZone): string {
  return format(zoned(parseApiDate(iso), zone), bucket === 'hour' ? 'MMM d HH:mm' : 'MMM d');
}

/** Integer seconds → `1h 05m 12s` (`5m 03s`, `12s`). Hours are not folded into days. */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (hours > 0) return `${hours}h ${pad(minutes)}m ${pad(seconds)}s`;
  if (minutes > 0) return `${minutes}m ${pad(seconds)}s`;
  return `${seconds}s`;
}

/** Duration as shown in tables: `≈ ` marks durations the API estimated. */
export function formatDurationLabel(seconds: number | null, estimated: boolean): string {
  if (seconds === null) return '—';
  return `${estimated ? '≈ ' : ''}${formatDuration(seconds)}`;
}

/** Whole seconds elapsed since `startedIso` (never negative: client clocks can be behind). */
export function elapsedSeconds(startedIso: string, now: Date): number {
  return Math.max(0, differenceInSeconds(now, parseApiDate(startedIso)));
}

export function secondsSince(iso: string, now: Date): number {
  return differenceInSeconds(now, parseApiDate(iso));
}

/** `…Z` UTC ISO-8601 for any Date, including TZDate. */
export function utcIso(date: Date): string {
  return new Date(date.getTime()).toISOString();
}

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A calendar day `yyyy-MM-dd` (as kept in the URL) → its first instant in `zone` (local by default). */
export function startOfDayIn(day: string, zone: DisplayZone): Date {
  const m = DAY.exec(day);
  if (!m) throw new RangeError(`Not a yyyy-MM-dd day: ${day}`);
  const [y, mo, d] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])];
  return zone ? new TZDate(y, mo, d, zone) : new Date(y, mo, d);
}

/**
 * Inclusive day range → `[from, to)` in UTC ISO-8601: `from` is the start of the first day, `to` the
 * start of the day after the last one. Days are calendar days in the display zone, so a range that
 * crosses a DST change keeps whole local days (23 h or 25 h).
 */
export function dayRangeToUtc(
  fromDay: string,
  toDay: string,
  zone: DisplayZone,
): { from: string; to: string } {
  const from = startOfDayIn(fromDay, zone);
  const lastDay = startOfDayIn(toDay, zone);
  const to = addDays(lastDay, 1, zone ? { in: tz(zone) } : undefined);
  // TZDate#toISOString keeps the zone offset (`+00:00`); the API contract uses plain UTC `Z`.
  return { from: utcIso(from), to: utcIso(to) };
}

/** Today (or `date`) as `yyyy-MM-dd` in the display zone. */
export function toDay(date: Date, zone: DisplayZone): string {
  return format(zoned(date, zone), 'yyyy-MM-dd');
}

export function isDay(value: string): boolean {
  if (!DAY.test(value)) return false;
  return isValid(parseISO(value));
}
