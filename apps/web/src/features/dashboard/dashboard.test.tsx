import { screen, waitFor, within } from '@testing-library/react';
import { http } from 'msw';
import { dashboardHandlers } from '@/test/handlers';
import { renderApp } from '@/test/render';
import { apiError, apiUrl, server } from '@/test/server';

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-03T12:00:30.000Z'));
});
afterEach(() => vi.useRealTimers());

describe('dashboard', () => {
  it('shows KPIs linked to the matching session history', async () => {
    const queries: URLSearchParams[] = [];
    server.use(
      http.get(apiUrl('/stats/summary'), ({ request }) => {
        queries.push(new URL(request.url).searchParams);
        return undefined;
      }),
      ...dashboardHandlers,
    );
    renderApp('/');
    const sessions = await screen.findByRole('link', { name: /^Sessions: 128/ });
    expect(sessions).toHaveAttribute(
      'href',
      '/sessions?from=2026-10-02T12%3A01%3A00.000Z&to=2026-10-03T12%3A01%3A00.000Z',
    );
    expect(screen.getByRole('link', { name: /^Total duration: 1h 02m 03s/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^Timed out: 3/ }).getAttribute('href')).toContain(
      'status=TIMEOUT',
    );
    expect(
      screen.getByRole('link', { name: /^Not authenticated: 7/ }).getAttribute('href'),
    ).toContain('authenticated=false');
    expect(queries[0]?.get('from')).toBe('2026-10-02T12:01:00.000Z');
  });

  it('renders the time series (with a table view) and the top lists', async () => {
    server.use(...dashboardHandlers);
    renderApp('/');
    const table = await screen.findByRole('table', {
      name: 'Sessions and connected time per bucket',
    });
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    expect(within(table).getByText('1h 30m 00s')).toBeInTheDocument();

    const initiators = screen.getByRole('table', { name: 'Top initiators' });
    const alice = within(initiators).getByRole('link', { name: /111222333/ });
    expect(alice.getAttribute('href')).toContain('initiatorId=111222333');
    const targets = screen.getByRole('table', { name: 'Top targets' });
    expect(
      within(targets)
        .getByRole('link', { name: /987654321/ })
        .getAttribute('href'),
    ).toContain('deviceId=987654321');
  });

  it('switches to 7 days with daily buckets, kept in the URL', async () => {
    const buckets: (string | null)[] = [];
    server.use(
      http.get(apiUrl('/stats/timeseries'), ({ request }) => {
        buckets.push(new URL(request.url).searchParams.get('bucket'));
        return undefined;
      }),
      ...dashboardHandlers,
    );
    const { user, router } = renderApp('/');
    await screen.findByRole('link', { name: /^Sessions: 128/ });
    await user.click(screen.getByRole('radio', { name: 'Last 7 days' }));
    await waitFor(() => expect(router.state.location.search).toBe('?period=7d'));
    await waitFor(() => expect(buckets).toContain('day'));
  });

  it('shows an inline error with retry when stats fail', async () => {
    server.use(
      http.get(apiUrl('/stats/summary'), () => apiError(500, 'INTERNAL_ERROR', 'boom at db.ts:12')),
      ...dashboardHandlers,
    );
    renderApp('/');
    expect(
      await screen.findByText('The server ran into a problem. Try again in a moment.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/db\.ts/)).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Retry' }).length).toBeGreaterThan(0);
  });
});
