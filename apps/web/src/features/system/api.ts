import { queryOptions, useQuery } from '@tanstack/react-query';
import { api, unwrap } from '@/api/client';

export const systemKeys = {
  all: ['system'] as const,
  info: () => [...systemKeys.all, 'info'] as const,
};

/** Server settings the UI depends on (heartbeat grace, disconnect TTL, ...). Rarely changes. */
export const systemInfoQueryOptions = () =>
  queryOptions({
    queryKey: systemKeys.info(),
    queryFn: ({ signal }) => unwrap(api.GET('/api/admin/system/info', { signal })),
    staleTime: 10 * 60_000,
  });

export function useSystemInfo() {
  return useQuery(systemInfoQueryOptions());
}
