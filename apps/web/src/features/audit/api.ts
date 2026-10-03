import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api, unwrap } from '@/api/client';
import type { AuditEventListQuery } from '@/api/types';

export const auditKeys = {
  all: ['audit-events'] as const,
  list: (query: AuditEventListQuery) => [...auditKeys.all, 'list', query] as const,
};

export function useAuditEvents(query: AuditEventListQuery) {
  return useQuery({
    queryKey: auditKeys.list(query),
    queryFn: ({ signal }) =>
      unwrap(api.GET('/api/admin/audit-events', { params: { query }, signal })),
    placeholderData: keepPreviousData,
  });
}
