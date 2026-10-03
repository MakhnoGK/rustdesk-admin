import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api, unwrap } from '@/api/client';
import type { DeviceListQuery } from '@/api/types';

export const deviceKeys = {
  all: ['devices'] as const,
  lists: () => [...deviceKeys.all, 'list'] as const,
  list: (query: DeviceListQuery) => [...deviceKeys.lists(), query] as const,
  detail: (uuid: string) => [...deviceKeys.all, 'detail', uuid] as const,
};

export function useDevices(query: DeviceListQuery) {
  return useQuery({
    queryKey: deviceKeys.list(query),
    queryFn: ({ signal }) => unwrap(api.GET('/api/admin/devices', { params: { query }, signal })),
    placeholderData: keepPreviousData,
  });
}

export function useDevice(uuid: string) {
  return useQuery({
    queryKey: deviceKeys.detail(uuid),
    queryFn: ({ signal }) =>
      unwrap(api.GET('/api/admin/devices/{uuid}', { params: { path: { uuid } }, signal })),
  });
}
