import type { RouteObject } from 'react-router';

export const sessionRoutes: RouteObject[] = [
  {
    path: 'sessions/active',
    handle: { crumb: 'Active sessions' },
    lazy: async () => ({
      Component: (await import('./pages/active-sessions-page')).ActiveSessionsPage,
    }),
  },
  {
    path: 'sessions',
    handle: { crumb: 'Session history' },
    lazy: async () => ({
      Component: (await import('./pages/session-history-page')).SessionHistoryPage,
    }),
  },
];
