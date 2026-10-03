import type { QueryClient } from '@tanstack/react-query';
import { createBrowserRouter } from 'react-router';
import { loginPath } from '@/features/auth/redirect';
import { setSessionEndHandler } from '@/features/auth/session-end';
import { createRoutes } from './routes';

type AppRouter = ReturnType<typeof createBrowserRouter>;

/**
 * On a 401 or at cookie expiry: go to the login page (remembering where we were), then drop every
 * cached response so nothing of the old session stays in memory.
 */
export function installSessionEndHandler(router: AppRouter, queryClient: QueryClient): void {
  let ending = false;
  setSessionEndHandler((reason) => {
    const { location } = router.state;
    if (ending || location.pathname === '/login') return;
    ending = true;
    void router.navigate(loginPath(location, reason), { replace: true }).finally(() => {
      queryClient.clear();
      ending = false;
    });
  });
}

export function createAppRouter(queryClient: QueryClient): AppRouter {
  const router = createBrowserRouter(createRoutes(queryClient));
  installSessionEndHandler(router, queryClient);
  return router;
}
