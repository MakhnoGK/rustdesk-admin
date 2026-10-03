import { z } from 'zod';
import type { AuditEventListQuery } from '@/api/types';
import { rangeBoundParam, resolveRange } from '@/lib/range';
import type { DisplayZone } from '@/lib/time';
import { enumParam, pageParam, pageSizeParam, textParam } from '@/lib/url-state';

export const AUDIT_KINDS = ['conn', 'file', 'alarm'] as const;

export const auditSearchSchema = z.object({
  page: pageParam,
  pageSize: pageSizeParam(50),
  sort: enumParam(['receivedAt:asc', 'receivedAt:desc']).transform((v) => v ?? 'receivedAt:desc'),
  kind: enumParam(AUDIT_KINDS),
  deviceId: textParam(64),
  sessionId: z.uuid().optional().catch(undefined),
  from: rangeBoundParam,
  to: rangeBoundParam,
});
export type AuditSearch = z.output<typeof auditSearchSchema>;

export function toAuditQuery(s: AuditSearch, zone: DisplayZone): AuditEventListQuery {
  const range = resolveRange(s.from, s.to, zone);
  return {
    page: s.page,
    pageSize: s.pageSize,
    sort: s.sort,
    kind: s.kind,
    deviceId: s.deviceId,
    sessionId: s.sessionId,
    from: range.from,
    to: range.to,
  };
}

export function hasAuditFilters(s: AuditSearch): boolean {
  return [s.kind, s.deviceId, s.sessionId, s.from, s.to].some((v) => v !== undefined);
}
