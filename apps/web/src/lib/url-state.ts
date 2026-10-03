import { z } from 'zod';
import { isDay } from './time';

// Building blocks for URL search-param schemas. Every field tolerates garbage (`.catch`), so a
// hand-edited or outdated link degrades to defaults instead of an error page.

export const MAX_PAGE_SIZE = 200;

export const pageParam = z.coerce.number().int().min(1).catch(1);

export const pageSizeParam = (fallback = 50) =>
  z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).catch(fallback);

export const textParam = (max = 100) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined))
    .catch(undefined);

export const enumParam = <const T extends readonly [string, ...string[]]>(values: T) =>
  z.enum(values).optional().catch(undefined);

export const boolParam = z
  .enum(['true', 'false'])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === 'true'))
  .catch(undefined);

export const dayParam = z.string().refine(isDay).optional().catch(undefined);

export const intParam = (min = 0) => z.coerce.number().int().min(min).optional().catch(undefined);

/** `field:asc|desc` restricted to the endpoint's sortable fields. */
export const sortParam = <const T extends readonly [string, ...string[]]>(
  fields: T,
  fallback: `${T[number]}:${'asc' | 'desc'}`,
) =>
  z
    .string()
    .refine((v) => {
      const [field, dir] = v.split(':');
      return fields.includes(field ?? '') && (dir === 'asc' || dir === 'desc');
    })
    .catch(fallback)
    .default(fallback);

export type SortDirection = 'asc' | 'desc';

export function parseSort(
  sort: string | undefined,
): { field: string; direction: SortDirection } | null {
  if (!sort) return null;
  const [field, dir] = sort.split(':');
  if (!field || (dir !== 'asc' && dir !== 'desc')) return null;
  return { field, direction: dir };
}

/** Serializes a state patch into search params; empty values are removed. */
export function applyPatch(
  params: URLSearchParams,
  patch: Record<string, string | number | boolean | null | undefined>,
): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === null || value === '') next.delete(key);
    else next.set(key, String(value));
  }
  return next;
}
