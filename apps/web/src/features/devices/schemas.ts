import { z } from 'zod';
import type { DeviceListQuery } from '@/api/types';
import { boolParam, pageParam, pageSizeParam, sortParam, textParam } from '@/lib/url-state';

export const DEVICE_SORT_FIELDS = [
  'rustdeskId',
  'hostname',
  'lastHeartbeatAt',
  'createdAt',
] as const;

export const deviceSearchSchema = z.object({
  page: pageParam,
  pageSize: pageSizeParam(50),
  sort: sortParam(DEVICE_SORT_FIELDS, 'lastHeartbeatAt:desc'),
  q: textParam(100),
  online: boolParam,
});

export type DeviceSearch = z.output<typeof deviceSearchSchema>;

export function toDeviceListQuery(s: DeviceSearch): DeviceListQuery {
  return { page: s.page, pageSize: s.pageSize, sort: s.sort, search: s.q, online: s.online };
}

export const deviceHref = (uuid: string) => `/devices/${encodeURIComponent(uuid)}`;
