import type { RouteObject } from 'react-router';

export const addressBookRoutes: RouteObject[] = [
  {
    path: 'address-books',
    handle: { crumb: 'Address books' },
    children: [
      {
        index: true,
        lazy: async () => ({
          Component: (await import('./pages/address-books-page')).AddressBooksPage,
        }),
      },
      {
        path: ':guid',
        handle: { crumb: 'Address book' },
        lazy: async () => ({
          Component: (await import('./pages/address-book-page')).AddressBookPage,
        }),
      },
    ],
  },
];
