import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useEffect } from 'react';
import { api, unwrap } from '@/api/client';
import { hasStatus } from '@/api/errors';
import type { Disconnect, SessionListQuery } from '@/api/types';
import { disconnectPhase, type DisconnectPhase } from '@/lib/format';

export type ActiveSessionsQuery = { page: number; pageSize: number };

export const sessionKeys = {
  all: ['sessions'] as const,
  lists: () => [...sessionKeys.all, 'list'] as const,
  list: (query: SessionListQuery) => [...sessionKeys.lists(), query] as const,
  actives: () => [...sessionKeys.all, 'active'] as const,
  active: (query: ActiveSessionsQuery) => [...sessionKeys.actives(), query] as const,
  details: () => [...sessionKeys.all, 'detail'] as const,
  detail: (id: string) => [...sessionKeys.details(), id] as const,
  disconnect: (id: string) => [...sessionKeys.all, 'disconnect', id] as const,
};

export function useSessionHistory(query: SessionListQuery) {
  return useQuery({
    queryKey: sessionKeys.list(query),
    queryFn: ({ signal }) => unwrap(api.GET('/api/admin/sessions', { params: { query }, signal })),
    placeholderData: keepPreviousData,
  });
}

/**
 * Active sessions, polled every `refetchInterval` ms. TanStack Query pauses the interval while the
 * tab is hidden (refetchIntervalInBackground: false) and refetches when it becomes visible again.
 */
export function useActiveSessions(query: ActiveSessionsQuery, refetchInterval: number) {
  return useQuery({
    queryKey: sessionKeys.active(query),
    queryFn: ({ signal }) =>
      unwrap(api.GET('/api/admin/sessions/active', { params: { query }, signal })),
    placeholderData: keepPreviousData,
    refetchInterval,
    refetchIntervalInBackground: false,
    staleTime: 0,
  });
}

export const sessionDetailQueryOptions = (id: string) =>
  queryOptions({
    queryKey: sessionKeys.detail(id),
    queryFn: ({ signal }) =>
      unwrap(api.GET('/api/admin/sessions/{id}', { params: { path: { id } }, signal })),
  });

export function useSession(id: string | undefined) {
  return useQuery({ ...sessionDetailQueryOptions(id ?? ''), enabled: !!id });
}

/** The latest disconnect request of a session; `null` when none was ever made (404). */
export const disconnectStateQueryOptions = (id: string) =>
  queryOptions({
    queryKey: sessionKeys.disconnect(id),
    queryFn: async ({ signal }): Promise<Disconnect | null> => {
      try {
        return await unwrap(
          api.GET('/api/admin/sessions/{id}/disconnect', { params: { path: { id } }, signal }),
        );
      } catch (error) {
        if (hasStatus(error, 404)) return null;
        throw error;
      }
    },
  });

export function useLatestDisconnect(id: string | undefined) {
  return useQuery({ ...disconnectStateQueryOptions(id ?? ''), enabled: !!id });
}

export function useRequestDisconnect() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(api.POST('/api/admin/sessions/{id}/disconnect', { params: { path: { id } } })),
    onSuccess: (disconnect) => {
      queryClient.setQueryData(sessionKeys.disconnect(disconnect.sessionId), disconnect);
    },
    meta: { errorsHandledBy: 'caller' },
  });
}

/** Poll interval while a disconnect is in flight. The device heartbeats every ~3 s. */
export const DISCONNECT_POLL_MS = 2000;

/**
 * Follows a remote disconnect: polls its delivery state until DELIVERED or EXPIRED, and the
 * session until it is no longer ACTIVE. Polling stops in a terminal phase (closed / expired).
 */
export function useDisconnectProgress(sessionId: string): {
  phase: DisconnectPhase;
  disconnect: Disconnect | null | undefined;
} {
  const queryClient = useQueryClient();
  const state = useQuery({
    ...disconnectStateQueryOptions(sessionId),
    refetchInterval: (query) =>
      query.state.data?.state === 'REQUESTED' ? DISCONNECT_POLL_MS : false,
    refetchIntervalInBackground: false,
  });
  const expired = state.data?.state === 'EXPIRED';
  const session = useQuery({
    ...sessionDetailQueryOptions(sessionId),
    refetchInterval: (query) =>
      expired || (query.state.data && query.state.data.status !== 'ACTIVE')
        ? false
        : DISCONNECT_POLL_MS,
    refetchIntervalInBackground: false,
    staleTime: 0,
  });
  const closed = !!session.data && session.data.status !== 'ACTIVE';
  const phase = disconnectPhase(state.data?.state, closed);

  useEffect(() => {
    if (phase === 'closed') {
      void queryClient.invalidateQueries({ queryKey: sessionKeys.actives() });
      void queryClient.invalidateQueries({ queryKey: sessionKeys.lists() });
    }
  }, [phase, queryClient]);

  return { phase, disconnect: state.data };
}
