import { z } from 'zod';
import { dayRangeToUtc, isDay, parseApiDate, type DisplayZone } from './time';

/**
 * A range bound in the URL: a calendar day (`yyyy-MM-dd`, from the date picker) or an exact
 * ISO-8601 instant (links from the dashboard). Days are resolved in the display zone.
 */
export const rangeBoundParam = z
  .string()
  .refine((v) => {
    if (isDay(v)) return true;
    try {
      parseApiDate(v);
      return true;
    } catch {
      return false;
    }
  })
  .optional()
  .catch(undefined);

/** URL `from`/`to` → API `[from, to)` in UTC. A day `to` is inclusive (the API gets the next day). */
export function resolveRange(
  from: string | undefined,
  to: string | undefined,
  zone: DisplayZone,
): { from?: string; to?: string } {
  const out: { from?: string; to?: string } = {};
  if (from) out.from = isDay(from) ? dayRangeToUtc(from, from, zone).from : from;
  if (to) out.to = isDay(to) ? dayRangeToUtc(to, to, zone).to : to;
  return out;
}

/** The day part of a bound, for the date picker. */
export function boundToDay(bound: string | undefined): string | undefined {
  if (!bound) return undefined;
  return isDay(bound) ? bound : bound.slice(0, 10);
}
