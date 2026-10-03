import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { errorMessage, hasStatus, isApiError } from '@/api/errors';
import { endSession } from '@/features/auth/session-end';

interface AppQueryMeta extends Record<string, unknown> {
  /** A 401 is an expected answer (auth/me, login), not a mid-session logout. */
  authProbe?: boolean;
}

interface AppMutationMeta extends AppQueryMeta {
  /**
   * Who reports this mutation's errors. Default: a toast from the cache. `form`: the form shows them
   * (field errors, a form alert) — so one error is never shown twice. `caller`: handled in place.
   */
  errorsHandledBy?: 'form' | 'caller';
}

declare module '@tanstack/react-query' {
  interface Register {
    queryMeta: AppQueryMeta;
    mutationMeta: AppMutationMeta;
  }
}

const MAX_RETRIES = 3;

export function createQueryClient(): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        // Query errors are rendered inline by the views; only a 401 has a global effect.
        if (hasStatus(error, 401) && !query.meta?.authProbe) endSession('expired');
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => {
        if (hasStatus(error, 401) && !mutation.meta?.authProbe) {
          endSession('expired');
          return;
        }
        if (mutation.meta?.errorsHandledBy) return;
        toast.error(errorMessage(error));
      },
    }),
    defaultOptions: {
      queries: {
        // No retries on 4xx; a few with exponential backoff on network errors and 5xx.
        retry: (failureCount, error) =>
          isApiError(error) && error.isRetryable && failureCount < MAX_RETRIES,
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 15_000),
        staleTime: 15_000,
      },
      mutations: { retry: false },
    },
  });
}
