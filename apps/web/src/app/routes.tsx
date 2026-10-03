import type { QueryClient } from '@tanstack/react-query';
import type { RouteObject } from 'react-router';
import { addressBookRoutes } from '@/features/address-books/routes';
import { auditRoutes } from '@/features/audit/routes';
import { authRoutes } from '@/features/auth/routes';
import { requireAuthLoader } from '@/features/auth/loaders';
import { dashboardRoutes } from '@/features/dashboard/routes';
import { deviceRoutes } from '@/features/devices/routes';
import { sessionRoutes } from '@/features/sessions/routes';
import { systemRoutes } from '@/features/system/routes';
import { userRoutes } from '@/features/users/routes';
import { NotFoundPage } from './errors/not-found-page';
import { RouteErrorBoundary } from './errors/route-error-boundary';
import { HydrateFallback } from './hydrate-fallback';
import { AppShell } from './layout/app-shell';

/** The route tree, shared by the browser router and the tests' memory router. */
export function createRoutes(queryClient: QueryClient): RouteObject[] {
  return [
    ...authRoutes(queryClient).map((r) => ({
      ...r,
      HydrateFallback,
      errorElement: <RouteErrorBoundary />,
    })),
    {
      id: 'app',
      path: '/',
      loader: requireAuthLoader(queryClient),
      HydrateFallback,
      element: <AppShell />,
      errorElement: <RouteErrorBoundary />,
      children: [
        {
          // Pathless: page errors render inside the shell, keeping the navigation usable.
          errorElement: <RouteErrorBoundary />,
          children: [
            ...dashboardRoutes,
            ...sessionRoutes,
            ...deviceRoutes,
            ...addressBookRoutes,
            ...userRoutes,
            ...auditRoutes,
            ...systemRoutes,
            { path: '*', element: <NotFoundPage />, handle: { crumb: 'Not found' } },
          ],
        },
      ],
    },
  ];
}
