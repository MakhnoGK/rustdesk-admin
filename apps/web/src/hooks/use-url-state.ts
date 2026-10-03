import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import type { z } from 'zod';
import { applyPatch } from '@/lib/url-state';

type Patch = Record<string, string | number | boolean | null | undefined>;

/**
 * Filters, sort, page and tabs kept in the URL: shareable, and the back button works.
 * Any change other than `page` itself goes back to page 1.
 */
export function useUrlState<S extends z.ZodType<Record<string, unknown>>>(schema: S) {
  const [params, setParams] = useSearchParams();

  const state = useMemo(() => schema.parse(Object.fromEntries(params)), [params, schema]);

  const update = useCallback(
    (patch: Patch, options?: { replace?: boolean }) => {
      setParams(
        (prev) => {
          const next = applyPatch(prev, patch);
          if (!('page' in patch)) next.delete('page');
          return next;
        },
        { replace: options?.replace ?? false },
      );
    },
    [setParams],
  );

  const reset = useCallback(
    (keep: string[] = []) => {
      setParams((prev) => {
        const next = new URLSearchParams();
        for (const key of keep) {
          const value = prev.get(key);
          if (value !== null) next.set(key, value);
        }
        return next;
      });
    },
    [setParams],
  );

  return { state, update, reset, params };
}
