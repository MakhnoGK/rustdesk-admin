import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { Disconnect, Session, SessionDetail } from '@/api/types';
import {
  makeAuditEvent,
  makeDisconnect,
  makeSession,
  makeSessionDetail,
  page,
  type Page,
} from '@/test/fixtures';
import { locationOf, renderApp } from '@/test/render';
import { apiUrl, server } from '@/test/server';

const closed = makeSession({
  id: '10000000-0000-4000-8000-0000000000aa',
  status: 'TIMEOUT',
  closeReason: 'TIMEOUT',
  closedAt: '2026-10-03T12:05:12.000Z',
  durationSeconds: 3912,
  durationEstimated: true,
});

/** Records the query string of every list request. */
function historyHandler(sessions: Session[], total = sessions.length) {
  const queries: URLSearchParams[] = [];
  const handler = http.get(apiUrl('/sessions'), ({ request }) => {
    const params = new URL(request.url).searchParams;
    queries.push(params);
    return HttpResponse.json<Page<Session>>(
      page(sessions, {
        total,
        page: Number(params.get('page') ?? 1),
        pageSize: Number(params.get('pageSize') ?? 50),
      }),
    );
  });
  return { handler, queries, last: () => queries[queries.length - 1] };
}

describe('session history', () => {
  it('renders TIMEOUT badges and marks estimated durations with ≈', async () => {
    const h = historyHandler([closed]);
    server.use(h.handler);
    renderApp('/sessions');
    const row = (await screen.findByText('Timeout', { selector: '[data-slot=badge]' })).closest(
      'tr',
    );
    expect(row).not.toBeNull();
    const duration = within(row as HTMLElement).getByRole('button', {
      name: 'About 1h 05m 12s (estimated)',
    });
    expect(duration).toHaveTextContent('≈ 1h 05m 12s');
  });

  it('puts filters in the URL and sends them to the API', async () => {
    const h = historyHandler([closed]);
    server.use(h.handler);
    const { user, router } = renderApp('/sessions');
    await screen.findByText('987654321');

    await user.click(screen.getByLabelText('Status'));
    await user.click(await screen.findByRole('option', { name: 'Timeout' }));
    await waitFor(() => expect(locationOf(router)).toBe('/sessions?status=TIMEOUT'));
    await waitFor(() => expect(h.last()?.get('status')).toBe('TIMEOUT'));

    // Text filters are debounced: one request after typing stops.
    const before = h.queries.length;
    await user.type(screen.getByLabelText('Target device ID'), '987654321');
    await waitFor(() => expect(h.last()?.get('deviceId')).toBe('987654321'));
    expect(h.queries.length - before).toBe(1);
    expect(router.state.location.search).toContain('deviceId=987654321');

    await user.type(screen.getByLabelText('Min. duration, min'), '5');
    await waitFor(() => expect(h.last()?.get('minDurationSeconds')).toBe('300'));
  });

  it('restores filters from a shared link', async () => {
    const h = historyHandler([closed]);
    server.use(h.handler);
    renderApp(
      '/sessions?authenticated=false&initiatorId=111222333&from=2026-10-01&to=2026-10-02&sort=durationSeconds:desc',
    );
    await screen.findByText('987654321');
    const q = h.last();
    expect(q?.get('authenticated')).toBe('false');
    expect(q?.get('initiatorId')).toBe('111222333');
    // Local days (Europe/Berlin) → UTC [from, to).
    expect(q?.get('from')).toBe('2026-09-30T22:00:00.000Z');
    expect(q?.get('to')).toBe('2026-10-02T22:00:00.000Z');
    expect(q?.get('sort')).toBe('durationSeconds:desc');
    expect(screen.getByLabelText('Initiator ID')).toHaveValue('111222333');
  });

  it('paginates on the server', async () => {
    const h = historyHandler([closed], 120);
    server.use(h.handler);
    const { user, router } = renderApp('/sessions');
    expect(await screen.findByText('1–50 of 120')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next page' }));
    await waitFor(() => expect(h.last()?.get('page')).toBe('2'));
    expect(locationOf(router)).toBe('/sessions?page=2');
    expect(await screen.findByText('51–100 of 120')).toBeInTheDocument();
  });

  it('sorts on the server from the column header', async () => {
    const h = historyHandler([closed]);
    server.use(h.handler);
    const { user } = renderApp('/sessions');
    await screen.findByText('987654321');
    await user.click(screen.getByRole('button', { name: /Duration/ }));
    await waitFor(() => expect(h.last()?.get('sort')).toBe('durationSeconds:desc'));
  });

  it('tells "no results for these filters" from "no data yet"', async () => {
    server.use(historyHandler([]).handler);
    const first = renderApp('/sessions');
    expect(await screen.findByText('No sessions yet')).toBeInTheDocument();
    first.unmount();

    renderApp('/sessions?status=CLOSED');
    expect(await screen.findByText('No sessions match these filters')).toBeInTheDocument();
  });

  it('opens a detail sheet with the close reason and the escaped raw events', async () => {
    server.use(
      historyHandler([closed]).handler,
      http.get(apiUrl('/sessions/:id'), () =>
        HttpResponse.json<SessionDetail>(
          makeSessionDetail({ ...closed, events: [makeAuditEvent()] }),
        ),
      ),
      http.get(apiUrl('/sessions/:id/disconnects'), () => HttpResponse.json<Disconnect[]>([])),
    );
    const { user, router } = renderApp('/sessions');
    await user.click(await screen.findByRole('button', { name: /^Details of session/ }));
    const sheet = await screen.findByRole('dialog');
    expect(router.state.location.search).toBe(`?session=${closed.id}`);
    expect(await within(sheet).findByText(/Timed out: no liveness evidence/)).toBeInTheDocument();
    expect(
      await within(sheet).findByText('No remote disconnect was requested.'),
    ).toBeInTheDocument();
    // The payload is text, never HTML.
    const payload = within(sheet).getByRole('region', { name: /Payload of the new event/ });
    expect(payload.textContent).toContain('<script>alert(1)</script>');
    expect(sheet.querySelector('script')).toBeNull();
  });

  it('shows the target hostname and the connection type name', async () => {
    server.use(
      historyHandler([
        closed,
        makeSession({
          id: '10000000-0000-4000-8000-0000000000ab',
          deviceId: '555666777',
          deviceHostname: null,
          connType: 9,
          connTypeName: null,
          status: 'CLOSED',
        }),
      ]).handler,
    );
    renderApp('/sessions');
    const first = (await screen.findByText('987654321')).closest('tr') as HTMLElement;
    expect(within(first).getByText('desk-01')).toBeInTheDocument();
    expect(within(first).getByText('Remote desktop')).toBeInTheDocument();
    const second = screen.getByText('555666777').closest('tr') as HTMLElement;
    expect(within(second).getByText('Unknown (9)')).toBeInTheDocument();
  });

  it('lists every disconnect request of a session, newest first', async () => {
    server.use(
      historyHandler([closed]).handler,
      http.get(apiUrl('/sessions/:id'), () =>
        HttpResponse.json<SessionDetail>(makeSessionDetail({ ...closed, events: [] })),
      ),
      http.get(apiUrl('/sessions/:id/disconnects'), () =>
        HttpResponse.json<Disconnect[]>([
          makeDisconnect({
            id: '20000000-0000-4000-8000-0000000000b2',
            state: 'DELIVERED',
            deliveredAt: '2026-10-03T12:03:00.000Z',
            requestedBy: { id: '00000000-0000-4000-8000-000000000002', username: 'bob' },
          }),
          makeDisconnect({ id: '20000000-0000-4000-8000-0000000000b1', state: 'EXPIRED' }),
        ]),
      ),
    );
    const { user } = renderApp('/sessions');
    await user.click(await screen.findByRole('button', { name: /^Details of session/ }));
    const sheet = await screen.findByRole('dialog');
    const list = await within(sheet).findByRole('list', {
      name: 'Disconnect requests, newest first',
    });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    // The session is closed and the newest request was delivered: it closed the session.
    expect(within(items[0]!).getByText('Session closed')).toBeInTheDocument();
    expect(within(items[0]!).getByText(/by bob/)).toBeInTheDocument();
    expect(within(items[1]!).getByText('Request expired')).toBeInTheDocument();
  });
});
