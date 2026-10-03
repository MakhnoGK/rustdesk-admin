import type { RouteObject } from 'react-router';

export const userRoutes: RouteObject[] = [
  {
    path: 'users',
    handle: { crumb: 'Users' },
    children: [
      {
        index: true,
        lazy: async () => ({ Component: (await import('./pages/users-page')).UsersPage }),
      },
      {
        path: ':id',
        handle: { crumb: 'User' },
        lazy: async () => ({ Component: (await import('./pages/user-page')).UserPage }),
      },
    ],
  },
];
