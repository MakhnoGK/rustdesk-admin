import { z } from 'zod';
import type { SessionListQuery } from '@/api/types';
import { resolveRange, rangeBoundParam } from '@/lib/range';
import type { DisplayZone } from '@/lib/time';
import {
  boolParam,
  enumParam,
  intParam,
  pageParam,
  pageSizeParam,
  sortParam,
  textParam,
} from '@/lib/url-state';

export const SESSION_STATUSES = ['ACTIVE', 'CLOSED', 'TIMEOUT', 'UNKNOWN'] as const;
export const SESSION_SORT_FIELDS = [
  'startedAt',
  'closedAt',
  'durationSeconds',
  'lastSeenAt',
] as const;

/** Session history state in the URL. */
export const historySearchSchema = z.object({
  page: pageParam,
  pageSize: pageSizeParam(50),
  sort: sortParam(SESSION_SORT_FIELDS, 'startedAt:desc'),
  status: enumParam(SESSION_STATUSES),
  deviceId: textParam(64),
  initiatorId: textParam(64),
  authenticated: boolParam,
  from: rangeBoundParam,
  to: rangeBoundParam,
  minDurationMinutes: intParam(0),
  /** Open detail sheet. */
  session: z.uuid().optional().catch(undefined),
});

export type HistorySearch = z.output<typeof historySearchSchema>;

/** URL state → the API query (UTC range, seconds). */
export function toSessionListQuery(s: HistorySearch, zone: DisplayZone): SessionListQuery {
  const range = resolveRange(s.from, s.to, zone);
  return {
    page: s.page,
    pageSize: s.pageSize,
    sort: s.sort,
    status: s.status,
    deviceId: s.deviceId,
    initiatorId: s.initiatorId,
    authenticated: s.authenticated,
    from: range.from,
    to: range.to,
    minDurationSeconds: s.minDurationMinutes !== undefined ? s.minDurationMinutes * 60 : undefined,
  };
}

export function hasHistoryFilters(s: HistorySearch): boolean {
  return (
    s.status !== undefined ||
    s.deviceId !== undefined ||
    s.initiatorId !== undefined ||
    s.authenticated !== undefined ||
    s.from !== undefined ||
    s.to !== undefined ||
    s.minDurationMinutes !== undefined
  );
}

/** A link into the session history with filters (used by the dashboard, devices, ...). */
export function historyHref(
  filters: Partial<Record<keyof HistorySearch, string | number | boolean>>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `/sessions?${query}` : '/sessions';
}

export const activeSearchSchema = z.object({
  page: pageParam,
});
