import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/api/client';
import type { AdminSession } from '@/api/types';

export const authKeys = {
  all: ['auth'] as const,
  me: () => [...authKeys.all, 'me'] as const,
};

/** The signed-in administrator. `authProbe`: a 401 here is an answer, not a mid-session failure. */
export const meQueryOptions = () =>
  queryOptions({
    queryKey: authKeys.me(),
    queryFn: ({ signal }) => unwrap(api.GET('/api/admin/auth/me', { signal })),
    staleTime: 5 * 60_000,
    meta: { authProbe: true },
  });

export interface LoginInput {
  username: string;
  password: string;
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: LoginInput) => unwrap(api.POST('/api/admin/auth/login', { body })),
    onSuccess: (session: AdminSession) => {
      queryClient.setQueryData(authKeys.me(), session);
    },
    // The password is in the mutation variables: the login page resets the mutation once it
    // settles and gcTime 0 removes it right away.
    gcTime: 0,
    meta: { authProbe: true, errorsHandledBy: 'form' },
  });
}

export function useLogout() {
  return useMutation({
    mutationFn: () => unwrap(api.POST('/api/admin/auth/logout')),
    meta: { authProbe: true, errorsHandledBy: 'caller' },
  });
}
