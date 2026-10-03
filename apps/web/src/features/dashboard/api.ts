import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api, unwrap } from '@/api/client';
import type { StatsRangeQuery, TimeseriesQuery, TopQuery } from '@/api/types';

export const statsKeys = {
  all: ['stats'] as const,
  summary: (q: StatsRangeQuery) => [...statsKeys.all, 'summary', q] as const,
  timeseries: (q: TimeseriesQuery) => [...statsKeys.all, 'timeseries', q] as const,
  top: (q: TopQuery) => [...statsKeys.all, 'top', q] as const,
};

// All aggregation happens in the database; the panel only renders the results.

export function useStatsSummary(query: StatsRangeQuery) {
  return useQuery({
    queryKey: statsKeys.summary(query),
    queryFn: ({ signal }) =>
      unwrap(api.GET('/api/admin/stats/summary', { params: { query }, signal })),
    placeholderData: keepPreviousData,
  });
}

export function useStatsTimeseries(query: TimeseriesQuery) {
  return useQuery({
    queryKey: statsKeys.timeseries(query),
    queryFn: ({ signal }) =>
      unwrap(api.GET('/api/admin/stats/timeseries', { params: { query }, signal })),
    placeholderData: keepPreviousData,
  });
}

export function useStatsTop(query: TopQuery) {
  return useQuery({
    queryKey: statsKeys.top(query),
    queryFn: ({ signal }) => unwrap(api.GET('/api/admin/stats/top', { params: { query }, signal })),
    placeholderData: keepPreviousData,
  });
}
