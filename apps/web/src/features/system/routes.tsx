import type { RouteObject } from 'react-router';

export const systemRoutes: RouteObject[] = [
  {
    path: 'about',
    handle: { crumb: 'About' },
    lazy: async () => ({ Component: (await import('./pages/about-page')).AboutPage }),
  },
];
