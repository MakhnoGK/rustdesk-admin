import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import type { z } from 'zod';
import { applyPatch, type PatchValue, searchParamsToObject } from '@/lib/url-state';

type Patch = Record<string, PatchValue>;

/**
 * Filters, sort, page and tabs kept in the URL: shareable, and the back button works.
 * Any change other than `page` itself goes back to page 1.
 */
export function useUrlState<S extends z.ZodType<Record<string, unknown>>>(schema: S) {
  const [params, setParams] = useSearchParams();

  const state = useMemo(() => schema.parse(searchParamsToObject(params)), [params, schema]);

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
          for (const value of prev.getAll(key)) next.append(key, value);
        }
        return next;
      });
    },
    [setParams],
  );

  return { state, update, reset, params };
}
