import type { RouteObject } from 'react-router';

export const dashboardRoutes: RouteObject[] = [
  {
    index: true,
    handle: { crumb: 'Dashboard' },
    lazy: async () => ({ Component: (await import('./pages/dashboard-page')).DashboardPage }),
  },
];
