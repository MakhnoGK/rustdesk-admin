import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/api/client';
import type { CreateUserBody, TokenListQuery, UpdateUserBody, UserListQuery } from '@/api/types';
import { authKeys } from '@/features/auth/api';

export const userKeys = {
  all: ['users'] as const,
  lists: () => [...userKeys.all, 'list'] as const,
  list: (query: UserListQuery) => [...userKeys.lists(), query] as const,
  details: () => [...userKeys.all, 'detail'] as const,
  detail: (id: string) => [...userKeys.details(), id] as const,
  tokens: (id: string, query: TokenListQuery) => [...userKeys.all, 'tokens', id, query] as const,
  allTokens: (id: string) => [...userKeys.all, 'tokens', id] as const,
};

export function useUsers(query: UserListQuery, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: userKeys.list(query),
    queryFn: ({ signal }) => unwrap(api.GET('/api/admin/users', { params: { query }, signal })),
    placeholderData: keepPreviousData,
    enabled: options?.enabled ?? true,
  });
}

export function useUser(id: string) {
  return useQuery({
    queryKey: userKeys.detail(id),
    queryFn: ({ signal }) =>
      unwrap(api.GET('/api/admin/users/{id}', { params: { path: { id } }, signal })),
  });
}

export function useUserTokens(id: string, query: TokenListQuery) {
  return useQuery({
    queryKey: userKeys.tokens(id, query),
    queryFn: ({ signal }) =>
      unwrap(api.GET('/api/admin/users/{id}/tokens', { params: { path: { id }, query }, signal })),
    placeholderData: keepPreviousData,
  });
}

// Mutations that carry a password are garbage-collected at once (gcTime 0) and reset by their forms
// when they settle, so the password never stays in the TanStack mutation cache.

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateUserBody) => unwrap(api.POST('/api/admin/users', { body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: userKeys.lists() }),
    gcTime: 0,
    meta: { errorsHandledBy: 'form' },
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateUserBody }) =>
      unwrap(api.PATCH('/api/admin/users/{id}', { params: { path: { id } }, body })),
    onSuccess: (user) => {
      queryClient.setQueryData(userKeys.detail(user.id), user);
      void queryClient.invalidateQueries({ queryKey: userKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: authKeys.me() });
    },
    meta: { errorsHandledBy: 'form' },
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      unwrap(
        api.POST('/api/admin/users/{id}/password', {
          params: { path: { id } },
          body: { password },
        }),
      ),
    gcTime: 0,
    meta: { errorsHandledBy: 'form' },
  });
}

export function useDeleteUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(api.DELETE('/api/admin/users/{id}', { params: { path: { id } } })),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: userKeys.detail(id) });
      void queryClient.invalidateQueries({ queryKey: userKeys.lists() });
    },
  });
}

export function useRevokeToken(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (tokenId: string) =>
      unwrap(api.DELETE('/api/admin/tokens/{id}', { params: { path: { id: tokenId } } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: userKeys.allTokens(userId) }),
  });
}
