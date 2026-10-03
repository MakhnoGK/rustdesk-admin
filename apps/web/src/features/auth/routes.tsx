import type { QueryClient } from '@tanstack/react-query';
import type { RouteObject } from 'react-router';
import { loginLoader } from './loaders';

export function authRoutes(queryClient: QueryClient): RouteObject[] {
  return [
    {
      path: '/login',
      loader: loginLoader(queryClient),
      lazy: async () => ({ Component: (await import('./pages/login-page')).LoginPage }),
    },
  ];
}
