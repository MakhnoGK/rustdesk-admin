import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/api/client';
import type {
  AddressBookListQuery,
  CreateAddressBookBody,
  CreatePeerBody,
  CreateTagBody,
  PeerListQuery,
  ShareInput,
  Tag,
  UpdateAddressBookBody,
  UpdatePeerBody,
  UpdateTagBody,
} from '@/api/types';

export const bookKeys = {
  all: ['address-books'] as const,
  lists: () => [...bookKeys.all, 'list'] as const,
  list: (query: AddressBookListQuery) => [...bookKeys.lists(), query] as const,
  detail: (guid: string) => [...bookKeys.all, 'detail', guid] as const,
  shares: (guid: string) => [...bookKeys.all, 'shares', guid] as const,
  peerLists: (guid: string) => [...bookKeys.all, 'peers', guid] as const,
  peers: (guid: string, query: PeerListQuery) => [...bookKeys.peerLists(guid), query] as const,
  tags: (guid: string) => [...bookKeys.all, 'tags', guid] as const,
};

const path = (guid: string) => ({ path: { guid } });

// ---- Books -------------------------------------------------------------------------------------

export function useAddressBooks(query: AddressBookListQuery) {
  return useQuery({
    queryKey: bookKeys.list(query),
    queryFn: ({ signal }) =>
      unwrap(api.GET('/api/admin/address-books', { params: { query }, signal })),
    placeholderData: keepPreviousData,
  });
}

export function useAddressBook(guid: string) {
  return useQuery({
    queryKey: bookKeys.detail(guid),
    queryFn: ({ signal }) =>
      unwrap(api.GET('/api/admin/address-books/{guid}', { params: path(guid), signal })),
  });
}

export function useCreateBook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateAddressBookBody) =>
      unwrap(api.POST('/api/admin/address-books', { body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: bookKeys.lists() }),
    meta: { errorsHandledBy: 'form' },
  });
}

export function useUpdateBook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ guid, body }: { guid: string; body: UpdateAddressBookBody }) =>
      unwrap(api.PATCH('/api/admin/address-books/{guid}', { params: path(guid), body })),
    onSuccess: (book) => {
      queryClient.setQueryData(bookKeys.detail(book.guid), book);
      void queryClient.invalidateQueries({ queryKey: bookKeys.lists() });
    },
    meta: { errorsHandledBy: 'form' },
  });
}

export function useDeleteBook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (guid: string) =>
      unwrap(api.DELETE('/api/admin/address-books/{guid}', { params: path(guid) })),
    onSuccess: (_data, guid) => {
      queryClient.removeQueries({ queryKey: bookKeys.detail(guid) });
      void queryClient.invalidateQueries({ queryKey: bookKeys.lists() });
    },
  });
}

// ---- Shares ------------------------------------------------------------------------------------

export function useShares(guid: string, enabled = true) {
  return useQuery({
    queryKey: bookKeys.shares(guid),
    queryFn: ({ signal }) =>
      unwrap(api.GET('/api/admin/address-books/{guid}/shares', { params: path(guid), signal })),
    enabled,
  });
}

export function useReplaceShares(guid: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ShareInput[]) =>
      unwrap(api.PUT('/api/admin/address-books/{guid}/shares', { params: path(guid), body })),
    onSuccess: (shares) => {
      queryClient.setQueryData(bookKeys.shares(guid), shares);
      void queryClient.invalidateQueries({ queryKey: bookKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: bookKeys.detail(guid) });
    },
    meta: { errorsHandledBy: 'form' },
  });
}

// ---- Peers -------------------------------------------------------------------------------------

export function usePeers(guid: string, query: PeerListQuery) {
  return useQuery({
    queryKey: bookKeys.peers(guid, query),
    queryFn: ({ signal }) =>
      unwrap(
        api.GET('/api/admin/address-books/{guid}/peers', {
          params: { ...path(guid), query },
          signal,
        }),
      ),
    placeholderData: keepPreviousData,
  });
}

/** After a peer change: its list, the tags' usage counts and the book's peer count. */
function invalidatePeers(queryClient: ReturnType<typeof useQueryClient>, guid: string) {
  void queryClient.invalidateQueries({ queryKey: bookKeys.peerLists(guid) });
  void queryClient.invalidateQueries({ queryKey: bookKeys.tags(guid) });
  void queryClient.invalidateQueries({ queryKey: bookKeys.detail(guid) });
  void queryClient.invalidateQueries({ queryKey: bookKeys.lists() });
}

// A peer body may carry a shared password: these mutations drop their variables once settled.

export function useCreatePeer(guid: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreatePeerBody) =>
      unwrap(api.POST('/api/admin/address-books/{guid}/peers', { params: path(guid), body })),
    onSuccess: () => invalidatePeers(queryClient, guid),
    gcTime: 0,
    meta: { errorsHandledBy: 'form' },
  });
}

export function useUpdatePeer(guid: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ peerId, body }: { peerId: string; body: UpdatePeerBody }) =>
      unwrap(
        api.PATCH('/api/admin/address-books/{guid}/peers/{peerId}', {
          params: { path: { guid, peerId } },
          body,
        }),
      ),
    onSuccess: () => invalidatePeers(queryClient, guid),
    gcTime: 0,
    meta: { errorsHandledBy: 'form' },
  });
}

export function useDeletePeer(guid: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (peerId: string) =>
      unwrap(
        api.DELETE('/api/admin/address-books/{guid}/peers/{peerId}', {
          params: { path: { guid, peerId } },
        }),
      ),
    onSuccess: () => invalidatePeers(queryClient, guid),
  });
}

// ---- Tags --------------------------------------------------------------------------------------

export function useTags(guid: string) {
  return useQuery({
    queryKey: bookKeys.tags(guid),
    queryFn: ({ signal }) =>
      unwrap(api.GET('/api/admin/address-books/{guid}/tags', { params: path(guid), signal })),
  });
}

export function useCreateTag(guid: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateTagBody) =>
      unwrap(api.POST('/api/admin/address-books/{guid}/tags', { params: path(guid), body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: bookKeys.tags(guid) }),
    meta: { errorsHandledBy: 'form' },
  });
}

/**
 * Rename and/or recolor. Optimistic: the tag list is a small local array and rolling back is
 * restoring the snapshot. Renames also change peers, which are refetched afterwards.
 */
export function useUpdateTag(guid: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, body }: { name: string; body: UpdateTagBody }) =>
      unwrap(
        api.PATCH('/api/admin/address-books/{guid}/tags/{name}', {
          params: { path: { guid, name } },
          body,
        }),
      ),
    onMutate: async ({ name, body }) => {
      await queryClient.cancelQueries({ queryKey: bookKeys.tags(guid) });
      const previous = queryClient.getQueryData<Tag[]>(bookKeys.tags(guid));
      queryClient.setQueryData<Tag[]>(bookKeys.tags(guid), (tags) =>
        tags?.map((t) => (t.name === name ? { ...t, ...body } : t)),
      );
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(bookKeys.tags(guid), context.previous);
    },
    onSettled: (_data, _error, { body }) => {
      void queryClient.invalidateQueries({ queryKey: bookKeys.tags(guid) });
      if (body.name !== undefined)
        void queryClient.invalidateQueries({ queryKey: bookKeys.peerLists(guid) });
    },
    meta: { errorsHandledBy: 'form' },
  });
}

export function useDeleteTag(guid: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      unwrap(
        api.DELETE('/api/admin/address-books/{guid}/tags/{name}', {
          params: { path: { guid, name } },
        }),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: bookKeys.tags(guid) });
      void queryClient.invalidateQueries({ queryKey: bookKeys.peerLists(guid) });
    },
  });
}
