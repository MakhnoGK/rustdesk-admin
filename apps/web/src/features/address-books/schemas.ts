import { z } from 'zod';
import type { AddressBookListQuery, PeerListQuery } from '@/api/types';
import { isHexColor } from '@/lib/color';
import { enumParam, pageParam, pageSizeParam, sortParam, textParam } from '@/lib/url-state';

export const BOOK_SORT_FIELDS = ['name', 'createdAt', 'updatedAt'] as const;

export const bookSearchSchema = z.object({
  page: pageParam,
  pageSize: pageSizeParam(50),
  sort: sortParam(BOOK_SORT_FIELDS, 'name:asc'),
  q: textParam(100),
  kind: enumParam(['PERSONAL', 'SHARED']),
  ownerId: z.uuid().optional().catch(undefined),
  /** Display name of the owner filter (kept with the id so the picker can show it). */
  owner: textParam(64),
});
export type BookSearch = z.output<typeof bookSearchSchema>;

export function toBookListQuery(s: BookSearch): AddressBookListQuery {
  return {
    page: s.page,
    pageSize: s.pageSize,
    sort: s.sort,
    search: s.q,
    kind: s.kind,
    ownerId: s.ownerId,
  };
}

export const bookViewSearchSchema = z.object({
  tab: enumParam(['peers', 'tags']).transform((v) => v ?? 'peers'),
  page: pageParam,
  q: textParam(100),
  tag: textParam(100),
});
export type BookViewSearch = z.output<typeof bookViewSearchSchema>;

export const PEER_PAGE_SIZE = 50;

export function toPeerListQuery(s: BookViewSearch): PeerListQuery {
  return { page: s.page, pageSize: PEER_PAGE_SIZE, search: s.q, tag: s.tag };
}

// ---- Forms (mirroring the OpenAPI schemas) -----------------------------------------------------

export const bookFormSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(100, 'At most 100 characters'),
  note: z.string().trim().max(2000, 'At most 2000 characters'),
});
export type BookFormValues = z.infer<typeof bookFormSchema>;

const max = (n: number) => z.string().trim().max(n, `At most ${n} characters`);

export const peerFormSchema = z.object({
  peerId: z.string().trim().min(1, 'Enter the RustDesk ID').max(64, 'At most 64 characters'),
  alias: max(255),
  hostname: max(255),
  username: max(255),
  platform: max(64),
  note: max(2000),
  tags: z.array(z.string().min(1).max(100)).max(100, 'At most 100 tags'),
  /** Write-only shared password; empty = unchanged. */
  password: z.string().max(1024, 'At most 1024 characters'),
  clearPassword: z.boolean(),
});
export type PeerFormValues = z.infer<typeof peerFormSchema>;

export const tagFormSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(100, 'At most 100 characters'),
  color: z.string().refine(isHexColor, 'Pick a color'),
});
export type TagFormValues = z.infer<typeof tagFormSchema>;

export const shareFormSchema = z.object({
  shares: z.array(
    z.object({
      userId: z.uuid(),
      username: z.string(),
      rule: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    }),
  ),
});
export type ShareFormValues = z.infer<typeof shareFormSchema>;
