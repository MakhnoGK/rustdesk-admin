// Time helpers. Everything is UTC; durations are whole seconds, floored.

import { Prisma } from '../../generated/prisma/client';

/** Whole seconds between two instants, never negative. The single source of duration math in TS. */
export function durationSeconds(start: Date, end: Date): number {
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
}

/** The same rule as `durationSeconds`, as a SQL expression for set-based updates. */
export function sqlDurationSeconds(start: Prisma.Sql, end: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`GREATEST(0, FLOOR(EXTRACT(EPOCH FROM ((${end}) - (${start})))))::int`;
}

export function addSeconds(date: Date, seconds: number): Date {
  return new Date(date.getTime() + seconds * 1000);
}

/** ISO-8601 UTC with a trailing `Z`; null stays null. */
export function toIso(date: Date): string;
export function toIso(date: Date | null): string | null;
export function toIso(date: Date | null): string | null {
  return date === null ? null : date.toISOString();
}

const ISO_UTC_OR_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/;

/** Strict ISO-8601 date-time with an explicit zone (`Z` or an offset). */
export function isIsoDateTime(value: string): boolean {
  return ISO_UTC_OR_OFFSET.test(value) && !Number.isNaN(Date.parse(value));
}
