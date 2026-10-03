import type { QueryClient } from '@tanstack/react-query';
import { redirect, type LoaderFunctionArgs } from 'react-router';
import { hasStatus } from '@/api/errors';
import { meQueryOptions } from './api';
import { loginPath, safeRedirect } from './redirect';

/** Protected routes: `auth/me` decides before anything renders (no flash of protected content). */
export function requireAuthLoader(queryClient: QueryClient) {
  return async ({ request }: LoaderFunctionArgs) => {
    try {
      await queryClient.ensureQueryData(meQueryOptions());
      return null;
    } catch (error) {
      // React Router redirects are thrown Responses.
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      if (hasStatus(error, 401)) throw redirect(loginPath(new URL(request.url)));
      throw error;
    }
  };
}

/**
 * The login page: an already signed-in administrator goes straight to the redirect target — except
 * after a session end (`reason=expired`): if one endpoint answered 401 while `auth/me` still
 * succeeds, bouncing back would loop.
 */
export function loginLoader(queryClient: QueryClient) {
  return async ({ request }: LoaderFunctionArgs) => {
    const url = new URL(request.url);
    if (url.searchParams.has('reason')) return null;
    try {
      await queryClient.fetchQuery({ ...meQueryOptions(), retry: false, staleTime: 0 });
    } catch {
      return null;
    }
    return redirect(safeRedirect(url.searchParams.get('redirect')));
  };
}
