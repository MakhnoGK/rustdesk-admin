import type { RouteObject } from 'react-router';

export const deviceRoutes: RouteObject[] = [
  {
    path: 'devices',
    handle: { crumb: 'Devices' },
    children: [
      {
        index: true,
        lazy: async () => ({ Component: (await import('./pages/devices-page')).DevicesPage }),
      },
      {
        path: ':uuid',
        handle: { crumb: 'Device' },
        lazy: async () => ({ Component: (await import('./pages/device-page')).DevicePage }),
      },
    ],
  },
];
