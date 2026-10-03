import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { Providers } from '@/app/providers';
import { createQueryClient } from '@/app/query-client';
import { installSessionEndHandler } from '@/app/router';
import { createRoutes } from '@/app/routes';

/** Renders the whole app (real routes, loaders and providers) at `path`, against MSW. */
export function renderApp(path: string, options: { advanceTimers?: (ms: number) => void } = {}) {
  const queryClient = createQueryClient();
  // No retry delays in tests.
  queryClient.setDefaultOptions({
    ...queryClient.getDefaultOptions(),
    queries: { ...queryClient.getDefaultOptions().queries, retry: false },
  });
  const router = createMemoryRouter(createRoutes(queryClient), { initialEntries: [path] });
  installSessionEndHandler(router, queryClient);
  // With fake timers, user-event must advance them while it waits between events.
  const user = userEvent.setup(
    options.advanceTimers ? { advanceTimers: options.advanceTimers } : {},
  );
  const utils = render(
    <Providers queryClient={queryClient}>
      <RouterProvider router={router} />
    </Providers>,
  );
  return { ...utils, user, router, queryClient };
}

/** Current location of the memory router as `pathname?search`. */
export function locationOf(router: ReturnType<typeof createMemoryRouter>): string {
  const { pathname, search } = router.state.location;
  return `${pathname}${search}`;
}
